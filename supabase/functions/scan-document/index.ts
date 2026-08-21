import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* ===========================================================================
 * COTA DE USO DE IA
 * ===========================================================================
 * ESTE BLOCO É DUPLICADO DE PROPÓSITO, e a razão é o deploy.
 *
 * Ele já morou em `_shared/cota.ts`, importado pelas quatro funções que gastam
 * API paga. Não funciona: o deploy pelo Dashboard do Supabase envia UM arquivo,
 * o `index.ts`, e o bundler do lado de lá falha com
 * `Module not found ".../_shared/cota.ts"`. Import relativo para fora da pasta
 * da função só resolve com a CLI (`supabase functions deploy`), que não é como
 * este projeto publica.
 *
 * Então a escolha é entre duplicar trinta linhas ou trocar o processo de
 * publicação inteiro. Duplicar ganha — mas com uma condição: **mexeu aqui,
 * mexa nas quatro.** As cópias vivem em `scan-document`, `lia-extract`,
 * `generate-pitch` e `generate-invite`, e todas são idênticas.
 *
 * ---------------------------------------------------------------------------
 * COBRAR ANTES, ESTORNAR SE A CULPA FOR NOSSA
 * ---------------------------------------------------------------------------
 * A cobrança acontece ANTES da chamada ao modelo. Cobrar depois deixa a porta
 * aberta: quem derruba a conexão no meio nunca é cobrado, e repetir isso em
 * laço é uso ilimitado de graça. O `estornar()` devolve a cota quando a falha é
 * do POUP (502 da Anthropic, chave ausente, exceção). Quando a falha é do
 * pedido — imagem ilegível, frase incompreensível — a cobrança fica: o modelo
 * já foi pago.
 *
 * ---------------------------------------------------------------------------
 * O TETO NÃO VEM DAQUI, VEM DO BANCO
 * ---------------------------------------------------------------------------
 * `consumir_ia` recebe apenas o NOME do recurso. Quem descobre o plano da conta
 * e o teto é o Postgres, com `auth.uid()`, numa função `security definer` (ver
 * `0028_limite_ia.sql`). Isso importa porque esta função cria o client com a
 * chave de service role MAS repassa o `Authorization` do usuário — as queries
 * rodam como ele. Se o teto fosse parâmetro, bastaria chamar a função SQL
 * direto do aparelho passando um número alto.
 *
 * Falha de infraestrutura (RPC fora, migration não aplicada) RECUSA a chamada.
 * Um limitador que abre quando quebra não é um limitador.
 */
type RecursoIA = 'scan' | 'lia_escuta' | 'lia_fechamento' | 'lia_agenda' | 'pitch' | 'convite';

const ROTULO_COTA: Record<RecursoIA, string> = {
  scan: 'leituras de documento',
  lia_escuta: 'trechos ouvidos pela LIA',
  lia_fechamento: 'fechamentos de conversa da LIA',
  lia_agenda: 'agendamentos por voz',
  pitch: 'textos de abordagem',
  convite: 'convites de captação',
};

interface ClienteRpc {
  rpc(
    nome: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface Cobranca {
  ok: boolean;
  mensagem: string;
  status: number;
  estornar: () => Promise<void>;
}

async function cobrarUso(
  client: ClienteRpc,
  recurso: RecursoIA,
  peso = 1,
): Promise<Cobranca> {
  const semEstorno = () => Promise.resolve();
  const { data, error } = await client.rpc('consumir_ia', { p_recurso: recurso, p_peso: peso });

  if (error) {
    console.error('cota: consumir_ia falhou', recurso, error.message);
    return {
      ok: false,
      status: 503,
      mensagem: 'Não foi possível conferir o seu limite de uso agora. Tente de novo em instantes.',
      estornar: semEstorno,
    };
  }

  const r = (data ?? {}) as {
    permitido?: boolean;
    motivo?: string;
    teto?: number;
    plano?: string;
  };

  if (r.permitido === true) {
    return {
      ok: true,
      mensagem: '',
      status: 200,
      estornar: async () => {
        const { error: e } = await client.rpc('estornar_ia', { p_recurso: recurso, p_peso: peso });
        // Estorno que falha não derruba a resposta: o corretor já está recebendo
        // um erro, e um segundo erro em cima não ajuda ninguém.
        if (e) console.error('cota: estorno falhou', recurso, e.message);
      },
    };
  }

  const rotulo = ROTULO_COTA[recurso] ?? 'usos';
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
        estornar: semEstorno,
      };
    case 'rajada':
      return {
        ok: false,
        status: 429,
        mensagem: 'Muitos pedidos em pouco tempo. Espere um minuto e tente de novo.',
        estornar: semEstorno,
      };
    case 'plano_nao_inclui':
      return {
        ok: false,
        status: 403,
        mensagem: `O seu plano não inclui ${rotulo}.`,
        estornar: semEstorno,
      };
    case 'nao_autenticado':
      return { ok: false, status: 401, mensagem: 'Não autenticado.', estornar: semEstorno };
    case 'sem_limite_cadastrado':
      // Plano sem linha em `ai_limits`: erro de configuração nossa, não do
      // corretor — mas ainda assim não gastamos API às cegas.
      console.error('cota: sem teto cadastrado', recurso, r.plano);
      return {
        ok: false,
        status: 503,
        mensagem: 'Este recurso está indisponível no momento. Tente de novo mais tarde.',
        estornar: semEstorno,
      };
    default:
      return {
        ok: false,
        status: 429,
        mensagem: 'Limite de uso atingido. Tente de novo mais tarde.',
        estornar: semEstorno,
      };
  }
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

const EXTRACTION_PROMPT = `Você está vendo a foto de um documento de identidade brasileiro. Pode ser:
1. CNH modelo antigo (Carteira Nacional de Habilitação, layout anterior ao Mercosul)
2. CNH modelo novo (Mercosul, com QR code e faixa azul/verde no topo)
3. RG modelo antigo (Registro Geral, emitido pela SSP, formato de cartão)
4. CIN — a nova Carteira de Identidade Nacional (modelo unificado, lançado a partir de 2022)

Extraia o NOME COMPLETO do titular e o CPF (11 dígitos). O CPF pode aparecer
rotulado como "CPF" isoladamente, ou dentro de um bloco de dados do RG/CNH.
Devolva o CPF apenas com os dígitos, sem pontos ou traço. Se não conseguir
identificar algum dado com segurança, ainda assim retorne sua melhor
estimativa e marque confidence como "baixa". Chame a ferramenta
extract_document_data com o resultado.`;

const TOOL_SCHEMA = {
  name: 'extract_document_data',
  description: 'Registra o nome completo e o CPF extraídos do documento de identidade.',
  input_schema: {
    type: 'object',
    properties: {
      fullName: { type: 'string', description: 'Nome completo exatamente como impresso no documento.' },
      cpf: { type: 'string', description: 'CPF com 11 dígitos, apenas números, sem pontuação.' },
      documentType: {
        type: 'string',
        enum: ['cnh_antiga', 'cnh_mercosul', 'rg_antigo', 'rg_novo_cin', 'desconhecido'],
      },
      confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    },
    required: ['fullName', 'cpf', 'documentType', 'confidence'],
  },
};

/*
 * GIF SAIU DA LISTA. Documento de identidade é foto: JPEG, PNG ou WebP. GIF
 * animado só serviria para empurrar quadros de sobra pelo mesmo pedido, e um
 * documento em GIF não existe no mundo real.
 */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/*
 * Teto de bytes, não de pixels — a API já reduz a imagem a 1568px do lado
 * maior, então uma foto gigante não custa mais TOKEN que uma média. O que ela
 * custa é banda e tempo, no 4G do corretor e na Edge Function. Por isso o
 * aplicativo reduz a imagem antes de enviar (ver `src/features/scan/`), e este
 * teto aqui é a rede de proteção contra quem não passa pelo aplicativo.
 */
const MAX_BASE64_LEN = 6 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const { imageBase64, mimeType } = await req.json();
    if (typeof imageBase64 !== 'string' || typeof mimeType !== 'string') {
      return json({ error: 'imageBase64 e mimeType são obrigatórios.' }, 400);
    }
    if (!imageBase64) {
      return json({ error: 'imageBase64 e mimeType são obrigatórios.' }, 400);
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return json({ error: 'Formato de imagem não suportado.' }, 400);
    }
    if (imageBase64.length > MAX_BASE64_LEN) {
      return json({ error: 'Imagem muito grande. Use uma foto menor.' }, 413);
    }
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'Scanner não configurado (ANTHROPIC_API_KEY ausente).' }, 500);
    }

    /*
     * A COBRANÇA VEM DEPOIS DAS VALIDAÇÕES E ANTES DA API.
     *
     * Depois das validações porque um mimetype errado não gastou modelo nenhum
     * — cobrar por isso seria punir o corretor por um arquivo que nem saiu do
     * aparelho. Antes da API porque é o único ponto em que a cobrança é
     * inescapável: quem cancela a conexão depois da chamada já gastou.
     */
    const cota = await cobrarUso(supabase, 'scan');
    if (!cota.ok) return json({ error: cota.mensagem }, cota.status);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        tools: [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'extract_document_data' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Erro na Anthropic API:', response.status, errBody);
      // Falha nossa: devolve a cota. O corretor não paga pelo nosso 502.
      await cota.estornar();
      return json({ error: 'Falha ao processar o documento. Tente novamente.' }, 502);
    }

    const data = await response.json();
    const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) {
      // Aqui a chamada ACONTECEU e foi paga — a imagem é que não deu para ler.
      // A cota fica cobrada de propósito: senão, mandar borrão em laço seria
      // uso ilimitado.
      return json({ error: 'Não foi possível ler o documento.' }, 502);
    }

    const result = toolUse.input as {
      fullName: string;
      cpf: string;
      documentType: string;
      confidence: string;
    };

    return json(result);
  } catch (e) {
    console.error('Falha no scan de documento:', (e as Error).name);
    return json({ error: 'Não foi possível ler o documento. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
