// Edge Function: escaneia um documento de identidade (CNH ou RG) usando o
// Claude (Anthropic API, com visão) e extrai nome completo e CPF.
//
// Segredo necessário (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   sk-ant-...
//
// Aceita: CNH modelo antigo, CNH modelo novo (Mercosul), RG modelo antigo e
// a nova Carteira de Identidade Nacional (CIN).
//
// O client chama isto via supabase.functions.invoke('scan-document'), que já
// envia o JWT do usuário no header Authorization — só usuários logados podem
// acionar (evita abuso, já que cada chamada tem custo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Cabeçalhos CORS. Duplicado (em vez de um arquivo compartilhado) para que
// esta função seja um único arquivo autocontido — dá pra colar direto no
// editor do Supabase Dashboard, sem CLI.
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
    if (!imageBase64 || !mimeType) {
      return json({ error: 'imageBase64 e mimeType são obrigatórios.' }, 400);
    }
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'Scanner não configurado (ANTHROPIC_API_KEY ausente).' }, 500);
    }

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
      return json({ error: 'Falha ao processar o documento. Tente novamente.' }, 502);
    }

    const data = await response.json();
    const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) return json({ error: 'Não foi possível ler o documento.' }, 502);

    const result = toolUse.input as {
      fullName: string;
      cpf: string;
      documentType: string;
      confidence: string;
    };

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
