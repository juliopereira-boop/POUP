import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1';

/* ===========================================================================
 * LER O TEXTO DO PDF DA TABELA DE PREÇO
 * ===========================================================================
 * O corretor envia o PDF da construtora no cadastro do empreendimento. O
 * arquivo vai para o bucket `tabelas-de-preco` e esta função devolve o TEXTO
 * dele. Quem entende o texto — linhas de preço, lista de vagas — é o
 * aplicativo (`src/features/tabelaPreco/importar.ts`), que é testado com a
 * tabela de verdade. Aqui só se tira o texto; nenhuma regra de negócio mora
 * nesta função.
 *
 * POR QUE NO SERVIDOR: ler PDF no celular exigiria levar uma biblioteca
 * pesada para dentro do aplicativo, e o navegador e o app nativo precisariam
 * de caminhos diferentes. Aqui é um lugar só, para as três plataformas.
 *
 * O ARQUIVO É LIDO COMO O CORRETOR. O client repassa o `Authorization` de
 * quem chamou, então o download passa pelas policies do bucket: quem não pode
 * ler o empreendimento não consegue o texto do PDF dele, nem adivinhando o
 * caminho.
 *
 * SEM IA E SEM COTA: o texto sai do próprio PDF (unpdf, o pdf.js da Mozilla
 * empacotado para servidor). PDF que é só imagem — tabela escaneada — não tem
 * texto, e a função diz isso em vez de inventar números.
 *
 * DEPLOY: arquivo único, sem import relativo — pode ser colado no Dashboard
 * (Edge Functions › Deploy a new function › nome `ler-tabela-preco`).
 * =========================================================================== */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'tabelas-de-preco';
/** O mesmo teto do bucket (migration 20260924180000). */
const MAX_BYTES = 15 * 1024 * 1024;
/** Uma tabela de preço tem poucas páginas; um livro de 500 não é tabela. */
const MAX_PAGINAS = 60;
/** Texto devolvido. A tabela do Connect inteira tem 6 mil caracteres. */
const MAX_CARACTERES = 400_000;
const CAMINHO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]{1,250}\.pdf$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const corpo = await req.json().catch(() => null);
    const path = typeof corpo?.path === 'string' ? corpo.path : '';
    if (!CAMINHO.test(path)) return json({ error: 'Caminho de arquivo inválido.' }, 400);

    const { data: arquivo, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !arquivo) {
      // Não existe OU não é seu: a resposta é a mesma, de propósito.
      return json({ error: 'Arquivo não encontrado.' }, 404);
    }
    if (arquivo.size > MAX_BYTES) return json({ error: 'PDF grande demais (máximo 15 MB).' }, 413);

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // "%PDF" nos primeiros bytes: o tipo declarado no upload não prova nada.
    const cabecalho = new TextDecoder().decode(bytes.slice(0, 1024));
    if (!cabecalho.includes('%PDF')) return json({ error: 'O arquivo não é um PDF.' }, 415);

    let paginas: number;
    let texto: string;
    try {
      const pdf = await getDocumentProxy(bytes);
      if (pdf.numPages > MAX_PAGINAS) {
        return json({ error: `PDF com páginas demais (máximo ${MAX_PAGINAS}).` }, 413);
      }
      const r = await extractText(pdf, { mergePages: false });
      paginas = r.totalPages;
      texto = (Array.isArray(r.text) ? r.text : [r.text]).join('\n\f\n');
    } catch (e) {
      console.error('ler-tabela-preco: PDF ilegível', (e as Error).name);
      return json({ error: 'Não foi possível abrir este PDF. Ele pode estar protegido ou corrompido.' }, 422);
    }

    if (texto.replace(/\s/g, '').length === 0) {
      return json(
        {
          error:
            'Este PDF é só imagem (tabela escaneada), sem texto para ler. Peça à construtora o PDF original ou cole os valores à mão.',
        },
        422,
      );
    }

    return json({ texto: texto.slice(0, MAX_CARACTERES), paginas });
  } catch (e) {
    console.error('ler-tabela-preco: falha', (e as Error).name);
    return json({ error: 'Não foi possível ler a tabela. Tente de novo.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
