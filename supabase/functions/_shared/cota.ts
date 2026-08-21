/**
 * COTA DE USO DE IA — a trava que faz o faturamento ser maior que o custo.
 *
 * ===========================================================================
 * O PROBLEMA QUE ISTO RESOLVE
 * ===========================================================================
 * Assinatura é receita FIXA por mês. Chamada de modelo é custo VARIÁVEL por
 * uso. Sem teto, as duas curvas se cruzam: um corretor que escaneia trezentos
 * documentos, ou um script apontado para a função, consome mais do que paga —
 * e ninguém descobre até a fatura chegar.
 *
 * ===========================================================================
 * COBRAR ANTES, ESTORNAR SE A CULPA FOR NOSSA
 * ===========================================================================
 * A cobrança acontece ANTES da chamada ao modelo. Cobrar depois deixa a porta
 * aberta: quem derruba a conexão no meio nunca é cobrado, e repetir isso em
 * laço é uso ilimitado de graça.
 *
 * O preço disso é cobrar por chamadas que falharam. Daí o `estornar()`: quando
 * a falha é do POUP — a Anthropic devolveu 502, a chave não estava
 * configurada, a função levantou exceção — a cota volta. O corretor não paga
 * pelo nosso erro. Quando a falha é do pedido dele (imagem ilegível, frase que
 * não dava para entender), a cobrança fica: o custo do modelo já aconteceu.
 *
 * ===========================================================================
 * O TETO NÃO VEM DAQUI, VEM DO BANCO
 * ===========================================================================
 * `consumir_ia` recebe apenas o NOME do recurso. Quem descobre o plano da
 * conta e o teto correspondente é o próprio Postgres, com `auth.uid()`, dentro
 * de uma função `security definer` (ver `0028_limite_ia.sql`).
 *
 * Isso não é preciosismo: as Edge Functions do POUP criam o client com a chave
 * de service role mas repassam o `Authorization` do usuário, então as queries
 * rodam como o próprio usuário. Se o teto fosse parâmetro, bastaria chamar a
 * função SQL direto do aparelho passando um teto alto.
 */

/** Cada recurso que gasta API paga. Precisa existir em `public.ai_limits`. */
export type RecursoIA =
  | 'scan'
  | 'lia_escuta'
  | 'lia_fechamento'
  | 'lia_agenda'
  | 'pitch'
  | 'convite';

/** Como o recurso é chamado numa frase para o corretor. */
const ROTULO: Record<RecursoIA, string> = {
  scan: 'leituras de documento',
  lia_escuta: 'trechos ouvidos pela LIA',
  lia_fechamento: 'fechamentos de conversa da LIA',
  lia_agenda: 'agendamentos por voz',
  pitch: 'textos de abordagem',
  convite: 'convites de captação',
};

interface RespostaConsumo {
  permitido?: boolean;
  motivo?: string;
  usados?: number;
  teto?: number;
  teto_minuto?: number;
  plano?: string;
}

/**
 * O mínimo do client Supabase que este módulo usa.
 *
 * Uma interface estreita em vez do tipo real do `createClient` porque isto é a
 * única coisa que a cota precisa saber sobre o client — e porque o tipo real
 * exigiria importar o pacote inteiro aqui só para anotar um parâmetro.
 */
export interface ClienteRpc {
  rpc(
    nome: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface Cobranca {
  /** `true` = pode chamar o modelo. */
  ok: boolean;
  /** Frase pronta para a tela quando `ok` é false. */
  mensagem: string;
  /** Status HTTP adequado ao motivo da recusa. */
  status: number;
  /** Devolve a cota. Idempotente do ponto de vista de quem chama: se não houve
   *  cobrança, não faz nada. Só chame quando a falha for do POUP. */
  estornar: () => Promise<void>;
}

const SEM_ESTORNO = () => Promise.resolve();

/**
 * Cobra um uso e diz se a chamada ao modelo pode acontecer.
 *
 * Falha de infraestrutura (RPC indisponível, migration não aplicada) **recusa**
 * a chamada. É deliberado: um limitador que abre quando quebra não é um
 * limitador. O custo de recusar é um corretor irritado por alguns minutos; o
 * custo de abrir é uma fatura sem teto.
 */
export async function cobrarUso(
  client: ClienteRpc,
  recurso: RecursoIA,
  peso = 1,
): Promise<Cobranca> {
  const { data, error } = await client.rpc('consumir_ia', {
    p_recurso: recurso,
    p_peso: peso,
  });

  if (error) {
    console.error('cota: consumir_ia falhou', recurso, error.message);
    return {
      ok: false,
      mensagem: 'Não foi possível conferir o seu limite de uso agora. Tente de novo em instantes.',
      status: 503,
      estornar: SEM_ESTORNO,
    };
  }

  const r = (data ?? {}) as RespostaConsumo;

  if (r.permitido === true) {
    return {
      ok: true,
      mensagem: '',
      status: 200,
      estornar: async () => {
        const { error: e } = await client.rpc('estornar_ia', {
          p_recurso: recurso,
          p_peso: peso,
        });
        // Estorno que falha não pode derrubar a resposta: o corretor já está
        // recebendo um erro, e um segundo erro em cima não ajuda ninguém. Fica
        // no log para aparecer no painel se virar padrão.
        if (e) console.error('cota: estorno falhou', recurso, e.message);
      },
    };
  }

  return { ...recusa(recurso, r), estornar: SEM_ESTORNO };
}

function recusa(
  recurso: RecursoIA,
  r: RespostaConsumo,
): { ok: false; mensagem: string; status: number } {
  const rotulo = ROTULO[recurso] ?? 'usos';
  const pro = r.plano === 'pro' || r.plano === 'admin';

  switch (r.motivo) {
    case 'teto_mes':
      return {
        ok: false,
        status: 429,
        mensagem:
          `Você já usou ${r.teto ?? 0} ${rotulo} neste mês, que é o limite do seu plano. ` +
          (pro
            ? 'A cota volta no primeiro dia do mês.'
            : 'A cota volta no primeiro dia do mês, e planos maiores incluem mais.'),
      };

    case 'rajada':
      return {
        ok: false,
        status: 429,
        mensagem: 'Muitos pedidos em pouco tempo. Espere um minuto e tente de novo.',
      };

    case 'plano_nao_inclui':
      return {
        ok: false,
        status: 403,
        mensagem: `O seu plano não inclui ${rotulo}.`,
      };

    case 'nao_autenticado':
      return { ok: false, status: 401, mensagem: 'Não autenticado.' };

    case 'sem_limite_cadastrado':
      // Plano sem linha em `ai_limits`. É erro de configuração nossa, não do
      // corretor — mas ainda assim não gastamos API às cegas.
      console.error('cota: sem teto cadastrado', recurso, r.plano);
      return {
        ok: false,
        status: 503,
        mensagem: 'Este recurso está indisponível no momento. Tente de novo mais tarde.',
      };

    default:
      return {
        ok: false,
        status: 429,
        mensagem: 'Limite de uso atingido. Tente de novo mais tarde.',
      };
  }
}
