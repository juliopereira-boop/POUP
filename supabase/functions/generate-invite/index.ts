// Edge Function: gera, com o Claude, os textos de captação de leads do
// corretor — o título/subtítulo da página pública e o convite pra postar no
// Instagram/WhatsApp. Salva o resultado em `public.lead_campaigns` (um por
// corretor) e devolve pro app.
//
// Segredo necessário (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   sk-ant-...
//
// Chamada pelo app logado via supabase.functions.invoke('generate-invite'),
// que envia o JWT do usuário no header Authorization.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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
      developmentName?: string;
      extra?: string;
    };

    // Dados do corretor para personalizar o texto.
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, agency')
      .eq('id', user.id)
      .maybeSingle();

    const prompt = buildPrompt({
      brokerName: profile?.full_name ?? null,
      agency: profile?.agency ?? null,
      developmentName: body.developmentName?.trim() || null,
      extra: body.extra?.trim() || null,
    });

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

    // Salva a campanha (um registro por corretor).
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
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
