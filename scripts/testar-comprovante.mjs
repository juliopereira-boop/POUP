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
  const fim = () => {
    passou++;
    console.log(`ok ${nome}`);
  };
  const r = fn();
  return r && typeof r.then === 'function' ? r.then(fim) : fim();
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

// ------------------------------------------------ 1a. o documento do cliente
const CPF = '57117777427'; // o CPF do cliente cadastrado na venda (fictício, dígitos válidos)
const HASH_CPF = '44961411458b988c648750acaaf17a12db4135b40480c8beaef753b30e5aedb7'; // o mesmo do teste SQL
const doc = (t) => L.lerDocumento(t);

teste('RG (verso): acha o CPF e ignora o número do RG', () => {
  const r = doc(`REPÚBLICA FEDERATIVA DO BRASIL
SECRETARIA DE SEGURANÇA PÚBLICA — INSTITUTO DE IDENTIFICAÇÃO
REGISTRO GERAL 12.345.678-9   DATA DE EXPEDIÇÃO 10/05/2015
NOME ANA SOUZA
FILIAÇÃO JOÃO SOUZA / MARIA SOUZA
NATURALIDADE SÃO LUÍS-MA   DATA DE NASCIMENTO 14/03/1992
CPF 571.177.774-27`);
  assert.deepEqual(r.cpfs, [CPF]);
  assert.equal(r.pareceDocumento, true);
});
teste('CNH modelo antigo: campo "CPF" (o nº de registro não vira CPF)', () => {
  const r = doc(`REPÚBLICA FEDERATIVA DO BRASIL MINISTÉRIO DAS CIDADES
CARTEIRA NACIONAL DE HABILITAÇÃO
NOME ANA SOUZA
DOC. IDENTIDADE / ÓRG. EMISSOR / UF 123456789 SSP MA
CPF 571.177.774-27   DATA NASCIMENTO 14/03/1992
PERMISSÃO   ACC   CAT. HAB. B
Nº REGISTRO 04837261590   VALIDADE 10/05/2031`);
  assert.ok(r.cpfs.includes(CPF) && r.pareceDocumento, JSON.stringify(r));
  assert.ok(!r.cpfs.includes('04837261590'), 'registro da CNH (dígitos que não fecham como CPF) não entra');
});
teste('CNH modelo novo (2022): campo "4d"', () => {
  const r = doc(`CARTEIRA NACIONAL DE HABILITAÇÃO / DRIVER LICENSE
1 SOUZA
2 ANA
3 14/03/1992, SÃO LUÍS, MA
4a 10/05/2023  4b 10/05/2033  4c DETRAN MA
4d 571.177.774-27
5 04837261590
9 B`);
  assert.ok(r.cpfs.includes(CPF) && r.pareceDocumento, JSON.stringify(r));
});
teste('CIN (Carteira de Identidade Nacional): o número é o CPF', () => {
  const r = doc(`REPÚBLICA FEDERATIVA DO BRASIL
CARTEIRA DE IDENTIDADE
Nome ANA SOUZA
Registro Geral - CPF 571.177.774-27
Data de Nascimento 14/03/1992`);
  assert.deepEqual(r.cpfs, [CPF]);
});
teste('CIN: só a faixa MRZ do verso, com o CPF colado em outros dígitos', () => {
  const r = doc(`CARTEIRA DE IDENTIDADE
IDBRA571177774275<<<<<<<<<<<<<<
9203142F3305104BRA<<<<<<<<<<<6
SOUZA<<ANA<<<<<<<<<<<<<<<<<<<<`);
  assert.ok(r.cpfs.includes(CPF), JSON.stringify(r));
});
teste('Comprovante de situação cadastral no CPF (Receita)', () => {
  const r = doc('Ministério da Fazenda — Receita Federal\nComprovante de Situação Cadastral no CPF\nNº do CPF: 571.177.774-27\nNome: ANA SOUZA\nData de Nascimento: 14/03/1992\nSituação Cadastral: REGULAR');
  assert.deepEqual(r.cpfs, [CPF]);
  assert.equal(r.pareceDocumento, true);
});
teste('foto: CPF com espaços, tudo junto, ou com "I" no lugar de "1"', () => {
  assert.deepEqual(doc('CARTEIRA DE IDENTIDADE  CPF: 571 177 774 27').cpfs, [CPF]);
  assert.deepEqual(doc('CARTEIRA DE IDENTIDADE  CPF 57117777427').cpfs, [CPF]);
  assert.deepEqual(doc('REGISTRO GERAL  CPF 57I.177.774-27').cpfs, [CPF]);
});
teste('não é CPF: dígito verificador errado, RG, telefone, sequência repetida', () => {
  const r = doc('REGISTRO GERAL 12.345.678-9  CPF 571.177.774-28  FONE (98) 98888-7777  111.111.111-11');
  assert.deepEqual(r.cpfs, []);
});
teste('comprovante de Pix (CPF mascarado) não passa por documento', () => {
  const r = doc('Comprovante de transferência Pix\n27/09/2026\nValor R$ 4.000,00\nPagador ANA SOUZA\nCPF •••.177.774-••');
  assert.deepEqual(r.cpfs, []);
  assert.equal(r.pareceDocumento, false);
});
await teste('o hash da função é o mesmo do banco (sha256 dos 11 dígitos)', async () => {
  assert.equal(await L.hashCpf(CPF), HASH_CPF);
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
  const rg = await chamarFuncao({
    venda: { id: VENDA, documento_path: 'u1/v/1-rg.pdf', comprovante_path: 'u1/v/1-pix.pdf' },
    arquivo: new TextEncoder().encode('%PDF-1.7 rg'),
    corpo: { saleId: VENDA, tipo: 'documento' },
    pdfTexto: 'REGISTRO GERAL 12.345.678-9\nFILIAÇÃO ...\nCPF 571.177.774-27',
  });
  teste('documento: grava só o hash dos CPFs, na tabela do documento', () => {
    assert.equal(rg.status, 200);
    assert.equal(rg.gravado.length, 1);
    const { tabela, linha } = rg.gravado[0];
    assert.equal(tabela, 'ranking_documentos');
    assert.deepEqual([linha.documento_path, linha.parece_documento, linha.cpfs_hash], ['u1/v/1-rg.pdf', true, [HASH_CPF]]);
    assert.ok(!JSON.stringify(linha).includes('57117777427') && !JSON.stringify(linha).includes('571.177.774-27'), 'o CPF em si não é gravado');
    assert.deepEqual(rg.corpo, { ok: true }, 'a resposta não conta o que foi lido');
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
teste('anexar oferece câmera, galeria e arquivos — no comprovante e no documento', () => {
  const pick = readFileSync('src/features/files/pick.ts', 'utf8');
  assert.match(pick, /'Câmera', 'Galeria de fotos', 'Arquivos \(PDF\)', 'Cancelar'/, 'iPhone: folha de ações com as três origens');
  assert.match(pick, /text: 'Câmera'[\s\S]*text: 'Galeria de fotos'[\s\S]*text: 'Arquivos \(PDF\)'/, 'Android: três botões (o limite do Alert)');
  assert.match(pick, /requestCameraPermissionsAsync/);
  const cartao = readFileSync('src/components/ranking/RankingDaVenda.tsx', 'utf8');
  assert.match(cartao, /pickAnexo\(ANEXO\[tipo\]\.titulo/);
  assert.match(cartao, /blocoDoAnexo\('comprovante'/);
  assert.match(cartao, /blocoDoAnexo\('documento'/);
  assert.match(cartao, /textoDaFoto\(/);
  assert.match(cartao, /conferirComprovante\(saleId, texto, tipo\)/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['expo-text-extractor'], 'reconhecimento de texto do aparelho instalado');
  const plugins = JSON.parse(readFileSync('app.json', 'utf8')).expo.plugins;
  const picker = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
  assert.match(String(picker?.[1]?.cameraPermission), /comprovante de pagamento e o documento do cliente/, 'permissão da câmera explica o uso');
});
teste('a foto é endireitada antes de ler (câmera vem "deitada" no EXIF)', () => {
  const f = readFileSync('src/features/ranking/textoDaFoto.ts', 'utf8');
  assert.match(f, /manipulateAsync\(uri, \[\]/);
  assert.match(f, /for \(const graus of \[90, -90\]\)/);
});
teste('a regra do documento está clara: RG, CNH ou CIN, e o CPF da venda', () => {
  const s = readFileSync('src/features/ranking/regras.ts', 'utf8');
  assert.match(s, /RG, CNH \(física ou digital\), CIN/);
  assert.match(s, /O CPF do documento precisa ser o mesmo cadastrado na venda/);
  for (const sit of ['sem_documento', 'documento_em_analise', 'documento_nao_confere']) assert.match(s, new RegExp(sit));
});

console.log(`\n${passou} verificações do comprovante passaram.`);
