import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.8.1';

/* ===========================================================================
 * CONFERIR O COMPROVANTE DE PAGAMENTO DO SINAL E O DOCUMENTO DO CLIENTE
 * ===========================================================================
 * `tipo: 'documento'`: lê o documento do cliente (RG, CNH, CIN, comprovante do
 * CPF) e grava o HASH dos CPFs válidos em `ranking_documentos` — o banco
 * compara com o CPF da venda (migration 20260928150000).
 *
 * O corretor anexa, na venda, o comprovante de pagamento do sinal. Esta função
 * tira do arquivo as DATAS e os VALORES que aparecem nele e grava em
 * `ranking_comprovacoes` — tabela que o corretor não lê nem escreve.
 *
 * QUEM DECIDE NÃO É ESTA FUNÇÃO: é o banco (`ranking_conferencia`, migration
 * 20260928120000), comparando o que foi lido com a data da venda e com o sinal
 * da simulação. Aqui só se lê. E a resposta não devolve o que foi lido: o
 * aplicativo fica sabendo só a situação da venda no ranking.
 *
 * DE ONDE VEM O TEXTO:
 *   - PDF (comprovante baixado do banco): o texto sai do próprio arquivo, aqui
 *     no servidor (unpdf, o pdf.js da Mozilla);
 *   - FOTO / PRINT: o reconhecimento de texto do próprio celular (Apple Vision
 *     no iPhone, ML Kit no Android — sem IA generativa, sem serviço de fora)
 *     manda o texto junto. Sem o texto (foto enviada pelo navegador), nada é
 *     gravado e a venda fica em conferência para a auditoria.
 *
 * O ARQUIVO É LIDO COMO O CORRETOR: o download passa pelas policies do bucket
 * `comprovantes-venda`, e a venda pela RLS de `sales` — ninguém confere o
 * comprovante de outra conta.
 *
 * DEPLOY: arquivo único, sem import relativo — pode ser colado no Dashboard
 * (Edge Functions › Deploy a new function › nome `conferir-comprovante`).
 * =========================================================================== */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKET = 'comprovantes-venda';
const MAX_BYTES = 15 * 1024 * 1024;
/** Comprovante tem uma ou duas páginas; um PDF de 20 não é comprovante. */
const MAX_PAGINAS = 10;
const MAX_TEXTO = 20_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==== LEITURA DO COMPROVANTE (início) ======================================
// Puro: sem Deno, sem rede. Os testes (`scripts/testar-comprovante.mjs`) rodam
// exatamente este trecho.

export interface LeituraDoComprovante {
  /** AAAA-MM-DD, na ordem em que aparecem. */
  datas: string[];
  /** Em reais. */
  valores: number[];
  /** O texto tem cara de comprovante de pagamento. */
  pareceComprovante: boolean;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/** Marcas de comprovante de pagamento (Pix, TED, boleto pago, depósito, recibo). */
const PALAVRAS_DE_PAGAMENTO =
  /comprovante|\bpix\b|transferencia|recibo|\bted\b|\bdoc\b|boleto|autenticacao|transacao|deposito/;
/** Contrato não é comprovante de pagamento, mesmo citando o sinal e a data. */
const PALAVRAS_DE_CONTRATO = /clausula|promitente|contratante|compromissario|instrumento particular/;

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Consertos de leitura de foto, só DENTRO de números: "4.OOO,OO" → "4.000,00",
 * "l5/09/2026" → "15/09/2026", "R5 4.000" / "RS 4.000" → "r$ 4.000". Roda
 * sobre o texto já em minúsculas.
 */
function consertarNumeros(t: string): string {
  let s = t.replace(/[   ]/g, ' ');
  s = s.replace(/\br\s?[s5$]\s?(?=[\doli|])/g, 'r$ ');
  // Um "número" da foto: dígitos (ou o/l/i lidos no lugar deles) e separadores,
  // com espaço só colado num separador ("4.ooo, oo"). Precisa de 1 dígito de verdade.
  s = s.replace(/[\doli|](?:[\doli|.,/\-]| (?=[.,/\-])|(?<=[.,/\-]) )*[\doli|]/g, (m) =>
    /\d/.test(m) && /[\d.,/\-]/.test(m.slice(1)) ? m.replace(/ /g, '').replace(/o/g, '0').replace(/[li|]/g, '1') : m,
  );
  // Espaço que a foto põe em volta do separador: "4. 000 ,00" → "4.000,00".
  s = s.replace(/\d{1,3}(?: *\. *\d{3})+ *, *\d{2}(?!\d)|\d+ *, *\d{2}(?!\d)/g, (m) => m.replace(/ /g, ''));
  return s;
}

function dataValida(d: number, m: number, a: number): string | null {
  if (a < 100) a += 2000;
  if (a < 2000 || a > 2099 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(Date.UTC(a, m - 1, d));
  if (x.getUTCMonth() !== m - 1) return null; // 31/02
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function lerComprovante(textoOriginal: string): LeituraDoComprovante {
  const texto = consertarNumeros(semAcento(textoOriginal ?? '').toLowerCase());
  const achadas: { pos: number; data: string }[] = [];
  const guardarData = (pos: number, d: string | null) => {
    if (d) achadas.push({ pos, data: d });
  };

  // 27/09/2026 · 27-09-2026 · 27.09.26 · 27 / 09 / 2026
  for (const m of texto.matchAll(/(?<![\d.,])(\d{1,2})\s?[/.\-]\s?(\d{1,2})\s?[/.\-]\s?(\d{4}|\d{2})(?!\d)/g)) {
    guardarData(m.index ?? 0, dataValida(+m[1], +m[2], +m[3]));
  }
  // 2026-09-27
  for (const m of texto.matchAll(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g)) {
    guardarData(m.index ?? 0, dataValida(+m[3], +m[2], +m[1]));
  }
  // 27 set 2026 · 27 de setembro de 2026 · 27/set/2026 · 27 set. 2026
  for (const m of texto.matchAll(
    /(?<!\d)(\d{1,2})\s*(?:de\s+|[/.\-]\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+|[/.\-]\s*)?(\d{4})(?!\d)/g,
  )) {
    guardarData(m.index ?? 0, dataValida(+m[1], MESES[m[2]], +m[3]));
  }

  const valores: number[] = [];
  const guardarValor = (v: number) => {
    if (Number.isFinite(v) && v > 0 && v < 100_000_000 && !valores.some((x) => Math.abs(x - v) < 0.005)) {
      valores.push(Math.round(v * 100) / 100);
    }
  };
  // 4.000,00 · 4000,00
  for (const m of texto.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?![\d])/g)) {
    guardarValor(Number(`${m[1].replace(/\./g, '')}.${m[2]}`));
  }
  // R$ 4.000 · R$ 4000 (sem centavos)
  for (const m of texto.matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?![\d,.])/g)) {
    guardarValor(Number(m[1].replace(/\./g, '')));
  }
  // R$ 4,000.00 (formato americano, em alguns apps)
  for (const m of texto.matchAll(/r\$\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g)) {
    guardarValor(Number(`${m[1].replace(/,/g, '')}.${m[2]}`));
  }

  const datas = [...new Set(achadas.sort((a, b) => a.pos - b.pos).map((x) => x.data))].slice(0, 12);
  return {
    datas,
    valores: valores.slice(0, 20),
    pareceComprovante: PALAVRAS_DE_PAGAMENTO.test(texto) && !PALAVRAS_DE_CONTRATO.test(texto),
  };
}

/** O que o arquivo é, pelos primeiros bytes (o tipo declarado no upload não prova nada). */
export function tipoDoArquivo(bytes: Uint8Array): 'pdf' | 'imagem' | null {
  const ini = String.fromCharCode(...bytes.slice(0, 12));
  if (String.fromCharCode(...bytes.slice(0, 1024)).includes('%PDF')) return 'pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'imagem'; // JPEG
  if (bytes[0] === 0x89 && ini.slice(1, 4) === 'PNG') return 'imagem';
  if (ini.slice(0, 4) === 'RIFF' && ini.slice(8, 12) === 'WEBP') return 'imagem';
  if (ini.slice(4, 8) === 'ftyp') return 'imagem'; // HEIC
  return null;
}
// ---------------------------------------------------------------- documento
// O DOCUMENTO DO CLIENTE: os CPFs que aparecem nele. Modelos conhecidos:
//   - RG (carteira de identidade estadual): "CPF 000.000.000-00" no verso,
//     perto de "REGISTRO GERAL", "FILIAÇÃO", "NATURALIDADE";
//   - CNH antiga: campo "CPF" ao lado de "DOC. IDENTIDADE / ÓRG. EMISSOR";
//   - CNH nova (2022): campo "4d CPF";
//   - CIN (Carteira de Identidade Nacional): o número do documento É o CPF,
//     e ele pode aparecer também na faixa MRZ do verso, colado em "<";
//   - Comprovante de inscrição / situação cadastral no CPF (Receita).
// O CPF sai com pontos e traço, com espaços, tudo junto, ou quebrado pela foto.
// Só entra CPF com os DOIS dígitos verificadores certos: número de RG, de
// registro da CNH ou de telefone não passa por CPF.

export interface LeituraDoDocumento {
  /** Os CPFs válidos encontrados, só os 11 dígitos. */
  cpfs: string[];
  /** O texto tem cara de documento de identificação. */
  pareceDocumento: boolean;
}

const PALAVRAS_DE_DOCUMENTO =
  /registro geral|carteira de identidade|cedula de identidade|carteira nacional de habilitacao|habilitacao|permissao para dirigir|\bcnh\b|driver license|cadastro de pessoas fisicas|comprovante de inscricao|situacao cadastral|republica federativa do brasil|secretaria (?:da|de) seguranca|instituto de identificacao|filiacao|data (?:de )?nascimento|naturalidade|orgao (?:expedidor|emissor)/;

/** Os dígitos verificadores do CPF, como a Receita calcula. */
export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function lerDocumento(textoOriginal: string): LeituraDoDocumento {
  const texto = consertarNumeros(semAcento(textoOriginal ?? '').toLowerCase());
  const achados: string[] = [];
  const guardar = (d: string) => {
    if (cpfValido(d) && !achados.includes(d)) achados.push(d);
  };
  // 000.000.000-00 · 000 000 000 00 · 00000000000 · 000.000.000/00 (foto)
  for (const m of texto.matchAll(/(?<!\d)(\d{3})[\s.,·]{0,2}(\d{3})[\s.,·]{0,2}(\d{3})[\s\-–—.,/]{0,2}(\d{2})(?!\d)/g)) {
    guardar(m[1] + m[2] + m[3] + m[4]);
  }
  // Faixa MRZ (CIN): o CPF pode vir colado em outros dígitos — testa as janelas.
  for (const m of texto.matchAll(/\d{12,15}/g)) {
    for (let i = 0; i + 11 <= m[0].length; i++) guardar(m[0].slice(i, i + 11));
  }
  return { cpfs: achados.slice(0, 10), pareceDocumento: PALAVRAS_DE_DOCUMENTO.test(texto) };
}

/** sha256 (hex) dos 11 dígitos — o banco calcula igual (`ranking_hash_cpf`). */
export async function hashCpf(d: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// ==== LEITURA DO COMPROVANTE (fim) =========================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const comoCorretor = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
    } = await comoCorretor.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const corpo = await req.json().catch(() => null);
    const saleId = typeof corpo?.saleId === 'string' ? corpo.saleId : '';
    if (!UUID.test(saleId)) return json({ error: 'Venda inválida.' }, 400);
    // 'comprovante' (padrão): o pagamento do sinal. 'documento': o documento do cliente.
    const tipo = corpo?.tipo === 'documento' ? 'documento' : 'comprovante';
    const coluna = tipo === 'documento' ? 'documento_path' : 'comprovante_path';

    // A RLS só devolve a venda se ela for de quem chamou.
    const { data: venda } = await comoCorretor
      .from('sales')
      .select(`id, ${coluna}`)
      .eq('id', saleId)
      .maybeSingle();
    const path = (venda as Record<string, string | null> | null)?.[coluna];
    if (!path) return json({ error: tipo === 'documento' ? 'Venda sem documento.' : 'Venda sem comprovante.' }, 404);

    const { data: arquivo, error } = await comoCorretor.storage.from(BUCKET).download(path);
    if (error || !arquivo) return json({ error: 'Comprovante não encontrado.' }, 404);
    if (arquivo.size > MAX_BYTES) return json({ error: 'Arquivo grande demais.' }, 413);

    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const origem = tipoDoArquivo(bytes);
    if (!origem) return json({ error: 'Envie o comprovante em PDF ou foto.' }, 415);

    let texto: string | null = null;
    if (origem === 'pdf') {
      try {
        const pdf = await getDocumentProxy(bytes);
        if (pdf.numPages <= MAX_PAGINAS) {
          const r = await extractText(pdf, { mergePages: true });
          texto = Array.isArray(r.text) ? r.text.join('\n') : r.text;
        } else {
          texto = '';
        }
      } catch {
        texto = ''; // protegido ou corrompido: lido como vazio (não confere)
      }
    } else if (typeof corpo?.texto === 'string') {
      texto = corpo.texto;
    }

    // Foto sem o texto do celular: fica em conferência (auditoria).
    if (texto == null) return json({ ok: true });

    const comoSistema = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (tipo === 'documento') {
      const doc = lerDocumento(texto.slice(0, MAX_TEXTO));
      // Só o hash de cada CPF vai para o banco; o número não é guardado.
      const { error: e3 } = await comoSistema.from('ranking_documentos').upsert({
        sale_id: saleId,
        documento_path: path,
        origem,
        parece_documento: doc.pareceDocumento,
        cpfs_hash: await Promise.all(doc.cpfs.map(hashCpf)),
        lido_em: new Date().toISOString(),
      });
      if (e3) {
        console.error('conferir-comprovante: gravação do documento', e3.code);
        return json({ error: 'Não foi possível conferir agora.' }, 500);
      }
      return json({ ok: true });
    }

    const leitura = lerComprovante(texto.slice(0, MAX_TEXTO));
    const { error: e2 } = await comoSistema.from('ranking_comprovacoes').upsert({
      sale_id: saleId,
      comprovante_path: path,
      origem,
      parece_comprovante: leitura.pareceComprovante,
      datas: leitura.datas,
      valores: leitura.valores,
      lido_em: new Date().toISOString(),
    });
    if (e2) {
      console.error('conferir-comprovante: gravação', e2.code);
      return json({ error: 'Não foi possível conferir agora.' }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    console.error('conferir-comprovante: falha', (e as Error).name);
    return json({ error: 'Não foi possível conferir agora.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
