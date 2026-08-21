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

const TOOL_SCHEMA = {
  name: 'gerar_landing',
  description: 'Registra os textos da landing page de captação de leads do corretor.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: {
        type: 'string',
        description:
          'Chamada principal (headline) da landing page. Curta (até ~55 caracteres), impactante e desejável, focada no sonho de conquistar o imóvel. Sem aspas.',
      },
      subtitulo: {
        type: 'string',
        description:
          'Uma frase (até ~130 caracteres) logo abaixo do título, reforçando o benefício de deixar o contato agora.',
      },
      descricao: {
        type: 'string',
        description:
          'Um parágrafo curto (2 a 4 frases) apresentando o empreendimento/oportunidade de forma atraente, usando os detalhes informados pelo corretor. Se não houver detalhes, faça uma apresentação geral e acolhedora sobre realizar o sonho da casa própria.',
      },
      beneficios: {
        type: 'array',
        description:
          'Exatamente 3 benefícios/destaques curtos (até ~45 caracteres cada), sem emoji, que fazem a pessoa querer deixar o contato (ex.: "Simulação de financiamento na hora").',
        items: { type: 'string' },
      },
      convite: {
        type: 'string',
        description:
          'Texto pronto para o corretor postar no Instagram/WhatsApp convidando a pessoa a clicar no link e deixar o contato. Até ~280 caracteres, com 1-3 emojis, tom humano e brasileiro. NÃO inclua o link (ele é adicionado depois). No máximo 2 hashtags.',
      },
    },
    required: ['titulo', 'subtitulo', 'descricao', 'beneficios', 'convite'],
  },
};

const MAX_NAME = 200;
const MAX_EXTRA = 2000;

function capped(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.slice(0, max).trim();
  return t ? t : null;
}

function buildPrompt(input: {
  brokerName: string | null;
  agency: string | null;
  developmentName: string | null;
  extra: string | null;
}): string {
  const parts: string[] = [
    'Você é um especialista em marketing imobiliário e copywriting no Brasil. Um corretor de imóveis quer uma landing page bonita e persuasiva para captar leads (interessados em comprar imóvel), onde a pessoa deixa nome e telefone.',
    'Gere os textos chamando a ferramenta gerar_landing. Fale a língua do brasileiro comum, tom acolhedor, confiável e sofisticado, sem juridiquês e sem promessas exageradas ou falsas. Foque no desejo de conquistar o imóvel e na facilidade de simular/financiar.',
  ];
  if (input.brokerName) parts.push(`Corretor(a): ${input.brokerName}.`);
  if (input.agency) parts.push(`Imobiliária: ${input.agency}.`);
  if (input.developmentName) {
    parts.push(`Empreendimento em foco: "${input.developmentName}".`);
  }
  if (input.extra) {
    parts.push(`Detalhes do empreendimento informados pelo corretor (use-os): ${input.extra}.`);
  } else {
    parts.push('Sem detalhes específicos — faça uma campanha geral e acolhedora.');
  }
  return parts.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await admin.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'IA não configurada (ANTHROPIC_API_KEY ausente).' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as {
      developmentName?: unknown;
      extra?: unknown;
    };

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, agency')
      .eq('id', user.id)
      .maybeSingle();

    const prompt = buildPrompt({
      brokerName: profile?.full_name ?? null,
      agency: profile?.agency ?? null,
      developmentName: capped(body.developmentName, MAX_NAME),
      extra: capped(body.extra, MAX_EXTRA),
    });

    // Cobra depois de montar o pedido e antes de gastar o modelo.
    const cota = await cobrarUso(admin, 'convite');
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
        temperature: 0.8,
        tools: [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'gerar_landing' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Erro na Anthropic API:', response.status, errBody);
      await cota.estornar();
      return json({ error: 'Falha ao gerar os textos. Tente novamente.' }, 502);
    }

    const data = await response.json();
    const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) return json({ error: 'Não foi possível gerar os textos.' }, 502);

    const result = toolUse.input as {
      titulo: string;
      subtitulo: string;
      descricao: string;
      beneficios: string[];
      convite: string;
    };
    const beneficios = Array.isArray(result.beneficios)
      ? result.beneficios.filter((b) => typeof b === 'string' && b.trim()).slice(0, 5)
      : [];

    const { error: saveError } = await admin.from('lead_campaigns').upsert(
      {
        user_id: user.id,
        titulo: result.titulo,
        subtitulo: result.subtitulo,
        descricao: result.descricao ?? '',
        beneficios,
        convite: result.convite,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (saveError) console.error('Erro ao salvar campanha:', saveError.message);

    return json({ ...result, beneficios });
  } catch (e) {
    console.error('Falha ao gerar convite:', (e as Error).name);
    return json({ error: 'Não foi possível gerar os textos agora. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
