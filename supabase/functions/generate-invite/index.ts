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
  name: 'gerar_convite',
  description: 'Registra os textos de captação de leads gerados para o corretor.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: {
        type: 'string',
        description:
          'Chamada principal da página de captação. Curta (até ~60 caracteres), calorosa e direta, que faça a pessoa querer deixar o contato.',
      },
      subtitulo: {
        type: 'string',
        description:
          'Uma frase (até ~140 caracteres) logo abaixo do título, reforçando o benefício de deixar nome e telefone.',
      },
      convite: {
        type: 'string',
        description:
          'Texto pronto para o corretor postar no Instagram/WhatsApp convidando a pessoa a clicar no link e deixar o contato. Até ~280 caracteres, com 1-3 emojis, tom humano e brasileiro. NÃO inclua o link (ele é adicionado depois). NÃO use hashtags em excesso (no máximo 2).',
      },
    },
    required: ['titulo', 'subtitulo', 'convite'],
  },
};

function buildPrompt(input: {
  brokerName: string | null;
  agency: string | null;
  developmentName: string | null;
  extra: string | null;
}): string {
  const parts: string[] = [
    'Você é um especialista em marketing imobiliário no Brasil. Um corretor de imóveis quer captar leads (interessados em comprar imóvel) por meio de uma página simples onde a pessoa deixa nome e telefone.',
    'Gere os textos de captação chamando a ferramenta gerar_convite. Fale a língua do brasileiro comum, tom acolhedor e confiável, sem juridiquês e sem promessas exageradas. Foque no sonho da casa própria e na facilidade de simular/financiar.',
  ];
  if (input.brokerName) parts.push(`Nome do corretor: ${input.brokerName}.`);
  if (input.agency) parts.push(`Imobiliária: ${input.agency}.`);
  if (input.developmentName) {
    parts.push(
      `A campanha é para o empreendimento "${input.developmentName}". Mencione-o de forma atraente.`,
    );
  } else {
    parts.push('A campanha é geral (qualquer imóvel/empreendimento).');
  }
  if (input.extra) parts.push(`Observações do corretor: ${input.extra}.`);
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
        tool_choice: { type: 'tool', name: 'gerar_convite' },
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

    const result = toolUse.input as { titulo: string; subtitulo: string; convite: string };

    // Salva a campanha (um registro por corretor).
    const { error: saveError } = await admin.from('lead_campaigns').upsert(
      {
        user_id: user.id,
        titulo: result.titulo,
        subtitulo: result.subtitulo,
        convite: result.convite,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (saveError) console.error('Erro ao salvar campanha:', saveError.message);

    return json(result);
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
