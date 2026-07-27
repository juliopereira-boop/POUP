import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

const TOOL_SCHEMA = {
  name: 'gerar_pitch',
  description: 'Registra a mensagem de WhatsApp pronta para o corretor enviar ao cliente.',
  input_schema: {
    type: 'object',
    properties: {
      mensagem: {
        type: 'string',
        description:
          'Mensagem de WhatsApp curta, calorosa e persuasiva (máximo ~600 caracteres), com quebras de linha para facilitar a leitura. Destaca os diferenciais do imóvel a partir da descrição informada, cria desejo e termina convidando a pessoa a conhecer o imóvel pessoalmente e a fazer uma análise de crédito sem compromisso. No máximo 3 emojis. Sem promessas falsas, sem juridiquês, sem aspas em volta do texto.',
      },
    },
    required: ['mensagem'],
  },
};

const MAX_NAME = 200;
const MAX_DESCRICAO = 2000;

function capped(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.slice(0, max).trim();
  return t ? t : null;
}

function buildPrompt(input: {
  brokerName: string | null;
  developmentName: string | null;
  companyName: string | null;
  descricao: string | null;
}): string {
  const parts: string[] = [
    'Você é um corretor de imóveis brasileiro extremamente experiente e persuasivo. Você escreve mensagens de WhatsApp curtas, calorosas e irresistíveis, do tipo que a pessoa lê inteira e responde na hora.',
    'Escreva UMA mensagem chamando a ferramenta gerar_pitch. Destaque os diferenciais do imóvel a partir da descrição fornecida, crie desejo, e SEMPRE termine convidando a pessoa a (a) conhecer o imóvel pessoalmente e (b) fazer uma análise de crédito sem compromisso.',
    'Tom humano e brasileiro, no máximo 3 emojis, sem promessas falsas, sem juridiquês, sem exageros. Máximo ~600 caracteres, com quebras de linha para facilitar a leitura no WhatsApp.',
  ];
  if (input.brokerName) parts.push(`Você é ${input.brokerName} — pode se apresentar pelo primeiro nome.`);
  if (input.companyName) parts.push(`Construtora/empresa: ${input.companyName}.`);
  if (input.developmentName) parts.push(`Empreendimento: "${input.developmentName}".`);
  if (input.descricao) {
    parts.push(`Descrição do empreendimento (use os diferenciais daqui): ${input.descricao}.`);
  } else {
    parts.push(
      'Sem descrição detalhada — faça uma mensagem acolhedora sobre a oportunidade de conquistar o imóvel próprio.',
    );
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
      companyName?: unknown;
      descricao?: unknown;
      brokerName?: unknown;
    };

    let brokerName = capped(body.brokerName, MAX_NAME);
    if (!brokerName) {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      brokerName = profile?.full_name ?? null;
    }

    const prompt = buildPrompt({
      brokerName,
      developmentName: capped(body.developmentName, MAX_NAME),
      companyName: capped(body.companyName, MAX_NAME),
      descricao: capped(body.descricao, MAX_DESCRICAO),
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
        temperature: 0.9,
        tools: [TOOL_SCHEMA],
        tool_choice: { type: 'tool', name: 'gerar_pitch' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Erro na Anthropic API:', response.status, errBody);
      return json({ error: 'Falha ao gerar a mensagem. Tente novamente.' }, 502);
    }

    const data = await response.json();
    const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) return json({ error: 'Não foi possível gerar a mensagem.' }, 502);

    const result = toolUse.input as { mensagem?: string };
    const mensagem = typeof result.mensagem === 'string' ? result.mensagem.trim() : '';
    if (!mensagem) return json({ error: 'Não foi possível gerar a mensagem.' }, 502);

    return json({ mensagem });
  } catch (e) {
    console.error(e);
    return json({ error: 'Não foi possível gerar a mensagem agora. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
