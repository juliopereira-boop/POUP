/**
 * O COMPROVANTE DE PAGAMENTO DO SINAL — a leitura e o que o app mostra.
 *
 * `npm run testar:comprovante`
 *
 *   1. a leitura (o trecho puro da Edge Function `conferir-comprovante`,
 *      rodado exatamente como está lá): datas e valores de comprovantes de
 *      vários bancos, de foto com erro de leitura, de boleto e de recibo; e o
 *      que NÃO é comprovante (contrato), CPF, CNPJ e hora que não viram data;
 *   2. a regra não vai para o aplicativo: nenhuma tela carrega a leitura, e
 *      nenhum texto diz ao corretor que o arquivo é lido;
 *   3. o anexo oferece a galeria de fotos e manda o texto da foto para a
 *      conferência.
 *
 * A DECISÃO (data do pagamento × data da venda, valor × sinal) é do banco e é
 * testada em `scripts/testar-comprovante-db.sql`.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
let passou = 0;
function teste(nome, fn) {
  fn();
  passou++;
  console.log(`ok ${nome}`);
}

const FUNCAO = 'supabase/functions/conferir-comprovante/index.ts';
const fonte = readFileSync(FUNCAO, 'utf8');
const trecho = fonte
  .split(/^\/\/ ==== LEITURA DO COMPROVANTE \(início\).*$/m)[1]
  .split(/^\/\/ ==== LEITURA DO COMPROVANTE \(fim\).*$/m)[0];
const js = ts.transpileModule(trecho, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const L = {};
new Function('exports', js)(L);

const ler = (t) => L.lerComprovante(t);
const tem = (r, data, valor) => r.datas.includes(data) && r.valores.some((v) => Math.abs(v - valor) < 0.005);

// ------------------------------------------------------------ 1. a leitura
teste('Pix do Nubank (data por extenso, R$ com centavos)', () => {
  const r = ler(`Comprovante de transferência
27 SET 2026 - 14:32:10
Valor R$ 4.000,00
Tipo de transferência Pix
Destino
Nome CANOPUS CONSTRUCOES LTDA
CNPJ 12.345.678/0001-90
Origem
Nome MARIA DA SILVA
CPF •••.456.789-••
ID da transação: E18236120202609271432s0a1b2c3`);
  assert.ok(tem(r, '2026-09-27', 4000), JSON.stringify(r));
  assert.equal(r.pareceComprovante, true);
  assert.deepEqual(r.datas, ['2026-09-27'], 'CNPJ, CPF e hora não viram data');
});
teste('Pix do Itaú ("data e hora da transferência: 27/09/2026 às 14:32")', () => {
  const r = ler('Comprovante de pagamento Pix\nvalor: R$ 4.000,00\ndata e hora da transferência: 27/09/2026 às 14:32:10\nchave: 12345678000190');
  assert.ok(tem(r, '2026-09-27', 4000), JSON.stringify(r));
});
teste('Banco do Brasil (maiúsculas, valor sem R$)', () => {
  const r = ler('COMPROVANTE DE TRANSFERENCIA\nPIX ENVIADO\nDATA: 27/09/2026\nVALOR: 4.000,00\nDOCUMENTO: 092701\nAUTENTICACAO SISBB: 1.A2B.3C4D.5E6F');
  assert.ok(tem(r, '2026-09-27', 4000) && r.pareceComprovante, JSON.stringify(r));
});
teste('Caixa ("Data/Hora 27/09/2026 - 14:32:10")', () => {
  const r = ler('Comprovante de Pix\nData/Hora 27/09/2026 - 14:32:10\nValor R$ 4.000,00\nTarifa R$ 0,00');
  assert.ok(tem(r, '2026-09-27', 4000), JSON.stringify(r));
});
teste('foto com erro de leitura ("27/O9/2O26", "RS 4.OOO, OO")', () => {
  const r = ler('Comprovante de transferência\n27/O9/2O26 - 14:32\nRS 4.OOO, OO\nPix');
  assert.ok(tem(r, '2026-09-27', 4000), JSON.stringify(r));
});
teste('boleto pago: as duas datas e os dois valores', () => {
  const r = ler('Comprovante de pagamento de boleto\nData do pagamento 26/09/2026\nData de vencimento 30/09/2026\nValor do documento 4.000,00\nValor cobrado R$ 4.000,00\nJuros R$ 0,00');
  assert.deepEqual(r.datas, ['2026-09-26', '2026-09-30']);
  assert.deepEqual(r.valores, [4000]);
});
teste('recibo à mão: "27 de setembro de 2026", "R$ 4.000,00"', () => {
  const r = ler('RECIBO\nRecebi de Maria da Silva a importância de R$ 4.000,00 (quatro mil reais) referente ao sinal da unidade 101.\nSão Luís, 27 de setembro de 2026.');
  assert.ok(tem(r, '2026-09-27', 4000) && r.pareceComprovante, JSON.stringify(r));
});
teste('outros formatos: 27.09.26, 2026-09-27, 27/set/2026, R$ 4000, R$ 4,000.00', () => {
  assert.deepEqual(ler('comprovante 27.09.26').datas, ['2026-09-27']);
  assert.deepEqual(ler('Pix em 2026-09-27T14:32').datas, ['2026-09-27']);
  assert.deepEqual(ler('pago 27/set/2026').datas, ['2026-09-27']);
  assert.deepEqual(ler('Pix valor R$ 4000 enviado').valores, [4000]);
  assert.deepEqual(ler('Pix amount R$ 4,000.00').valores, [4000]);
});
teste('não inventa data: 31/02, 45/09, 12/13 e anos fora da faixa', () => {
  assert.deepEqual(ler('comprovante 31/02/2026 45/09/2026 12/13/2026 10/10/1999').datas, []);
});
teste('hora ou número colado não vira valor errado ("14:32 500,00")', () => {
  assert.deepEqual(ler('Pix 27/09/2026 14:32 500,00').valores, [500]);
});
teste('contrato não é comprovante de pagamento, mesmo com o sinal e a data', () => {
  const r = ler('INSTRUMENTO PARTICULAR DE PROMESSA DE COMPRA E VENDA\nCLÁUSULA TERCEIRA - DO PAGAMENTO: sinal de R$ 4.000,00 pago nesta data, 27/09/2026, por transferência.');
  assert.ok(tem(r, '2026-09-27', 4000));
  assert.equal(r.pareceComprovante, false);
});
teste('foto qualquer (sem cara de comprovante) e texto vazio', () => {
  assert.equal(ler('Village das Estrelas — decorado — 27/09/2026 — R$ 4.000,00').pareceComprovante, false);
  assert.deepEqual(ler(''), { datas: [], valores: [], pareceComprovante: false });
});
teste('o tipo do arquivo é o dos bytes, não o nome', () => {
  const b = (...xs) => new Uint8Array(xs);
  assert.equal(L.tipoDoArquivo(new TextEncoder().encode('%PDF-1.7 ...')), 'pdf');
  assert.equal(L.tipoDoArquivo(b(0xff, 0xd8, 0xff, 0xe0)), 'imagem');
  assert.equal(L.tipoDoArquivo(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), 'imagem');
  assert.equal(L.tipoDoArquivo(new TextEncoder().encode('\0\0\0\x18ftypheic')), 'imagem');
  assert.equal(L.tipoDoArquivo(new TextEncoder().encode('MZ executável')), null);
});

// ------------------------------------------- 1b. a função, de ponta a ponta
// O arquivo inteiro da Edge Function, com o Supabase e o pdf.js simulados.
async function chamarFuncao({ venda, arquivo, corpo, pdfTexto = '' }) {
  const gravado = [];
  const cliente = (chave) => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (tabela) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: venda }) }) }),
      upsert: async (linha) => {
        gravado.push({ chave, tabela, linha });
        return { error: null };
      },
    }),
    storage: { from: () => ({ download: async () => (arquivo ? { data: new Blob([arquivo]), error: null } : { data: null, error: {} }) }) },
  });
  let handler;
  globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => k } };
  const jsFn = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mods = {
    'https://esm.sh/@supabase/supabase-js@2.45.4': { createClient: (_url, chave) => cliente(chave) },
    'npm:unpdf@1.8.1': { getDocumentProxy: async () => ({ numPages: 1 }), extractText: async () => ({ totalPages: 1, text: pdfTexto }) },
  };
  new Function('exports', 'require', jsFn)({}, (m) => mods[m]);
  const res = await handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(corpo) }));
  return { status: res.status, corpo: await res.json(), gravado };
}
const VENDA = '11111111-1111-4111-8111-111111111111';
const PIX = 'Comprovante de transferência Pix\n27/09/2026 14:32\nValor R$ 4.000,00';
{
  const pdf = await chamarFuncao({
    venda: { id: VENDA, comprovante_path: 'u1/v/1-pix.pdf' },
    arquivo: new TextEncoder().encode('%PDF-1.7 conteúdo'),
    corpo: { saleId: VENDA, texto: 'texto falso mandado pelo app: 01/01/2026 R$ 9,99' },
    pdfTexto: PIX,
  });
  teste('PDF: o texto sai do arquivo, no servidor (o texto mandado pelo app é ignorado)', () => {
    assert.equal(pdf.status, 200);
    assert.equal(pdf.gravado.length, 1);
    const { chave, tabela, linha } = pdf.gravado[0];
    assert.equal(chave, 'SUPABASE_SERVICE_ROLE_KEY', 'grava como sistema, não como corretor');
    assert.equal(tabela, 'ranking_comprovacoes');
    assert.deepEqual([linha.origem, linha.datas, linha.valores, linha.parece_comprovante, linha.comprovante_path],
      ['pdf', ['2026-09-27'], [4000], true, 'u1/v/1-pix.pdf']);
  });
  teste('a resposta não conta o que foi lido', () => {
    assert.deepEqual(pdf.corpo, { ok: true });
  });

  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const foto = await chamarFuncao({ venda: { id: VENDA, comprovante_path: 'u1/v/1-pix.jpg' }, arquivo: jpg, corpo: { saleId: VENDA, texto: PIX } });
  teste('foto: usa o texto que o celular tirou dela', () => {
    assert.deepEqual([foto.gravado[0].linha.origem, foto.gravado[0].linha.valores], ['imagem', [4000]]);
  });
  const semTexto = await chamarFuncao({ venda: { id: VENDA, comprovante_path: 'u1/v/1-pix.jpg' }, arquivo: jpg, corpo: { saleId: VENDA } });
  teste('foto sem o texto (navegador): nada gravado, fica em conferência', () => {
    assert.equal(semTexto.status, 200);
    assert.equal(semTexto.gravado.length, 0);
  });
  const deOutro = await chamarFuncao({ venda: null, arquivo: jpg, corpo: { saleId: VENDA, texto: PIX } });
  teste('venda de outra conta (a RLS não devolve): recusa, nada gravado', () => {
    assert.equal(deOutro.status, 404);
    assert.equal(deOutro.gravado.length, 0);
  });
  const exe = await chamarFuncao({ venda: { id: VENDA, comprovante_path: 'u1/v/1-pix.jpg' }, arquivo: new TextEncoder().encode('MZ...'), corpo: { saleId: VENDA, texto: PIX } });
  teste('arquivo que não é PDF nem imagem: recusa', () => {
    assert.equal(exe.status, 415);
    assert.equal(exe.gravado.length, 0);
  });
}

// ------------------------------------------- 2. a regra não vai para o app
function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const APP = [...arquivos('app'), ...arquivos('src')];

teste('nenhuma tela carrega a leitura do comprovante', () => {
  for (const f of APP) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /lerComprovante|PALAVRAS_DE_PAGAMENTO|ranking_tolerancia/, f);
  }
});
teste('nenhum texto diz ao corretor que o arquivo é lido', () => {
  const telas = ['src/components/ranking/RankingDaVenda.tsx', 'src/features/ranking/regras.ts', 'app/(app)/ranking.tsx', 'app/privacidade.tsx', 'app/(app)/relatorios/[id].tsx'];
  for (const f of telas) {
    // Só o que vira texto na tela: strings e JSX, sem comentários.
    const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.doesNotMatch(s, /(?:app|sistema|algoritmo|POUP)\s+(?:lê|le|analisa|reconhece|identifica)\b|leitura autom|reconhecimento de texto|\bOCR\b|não lê o conteúdo/i, f);
  }
});
teste('a regra está clara para o corretor: comprovante de pagamento do sinal, data do pagamento e valor do sinal', () => {
  const s = readFileSync('src/features/ranking/regras.ts', 'utf8');
  assert.match(s, /comprovante de pagamento do sinal/i);
  assert.match(s, /data do pagamento/i);
  assert.match(s, /valor do sinal/i);
  assert.match(s, /comprovante_nao_confere/);
  assert.match(s, /comprovante_em_analise/);
});

// ---------------------------------------------- 3. galeria e texto da foto
teste('anexar oferece galeria de fotos e arquivos, e manda o texto da foto', () => {
  const s = readFileSync('src/components/ranking/RankingDaVenda.tsx', 'utf8');
  assert.match(s, /Galeria de fotos/);
  assert.match(s, /textoDaFoto\(/);
  assert.match(s, /conferirComprovante\(/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['expo-text-extractor'], 'reconhecimento de texto do aparelho instalado');
});

console.log(`\n${passou} verificações do comprovante passaram.`);
