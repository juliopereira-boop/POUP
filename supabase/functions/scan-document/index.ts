import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

import { cobrarUso } from '../_shared/cota.ts';

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
