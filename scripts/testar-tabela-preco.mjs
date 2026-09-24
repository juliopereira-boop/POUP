/**
 * TESTES DA TABELA DE PREÇO — com a tabela de verdade.
 *
 * `npm run testar:tabela-preco`
 *
 * O preço que o simulador preenche sai daqui. Um erro nesta conta não quebra
 * tela nenhuma: ele faz o corretor mandar ao cliente uma proposta com o preço
 * de outro apartamento. Por isso os testes usam o texto REAL da tabela do
 * Village Connect I (setembro), exatamente como a Edge Function
 * `ler-tabela-preco` o extrai do PDF (`scripts/fixtures/`), e conferem preço a
 * preço contra o PDF.
 *
 * Mesma técnica de `testar-simulador.mjs`: o `.ts` é transpilado na hora pelo
 * TypeScript de `node_modules`, sem passo de build.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = process.cwd();

const cache = new Map();
function carregar(relativo) {
  const arquivo = path.join(RAIZ, relativo);
  if (cache.has(arquivo)) return cache.get(arquivo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => {
    if (spec === '../unidades/gerador') return carregar('src/features/unidades/gerador.ts');
    if (spec === './chaves') return carregar('src/features/tabelaPreco/chaves.ts');
    if (spec === './preco') return carregar('src/features/tabelaPreco/preco.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}

const P = carregar('src/features/tabelaPreco/preco.ts');
const I = carregar('src/features/tabelaPreco/importar.ts');
const K = carregar('src/features/tabelaPreco/chaves.ts');
const G = carregar('src/features/unidades/gerador.ts');

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

const TEXTO_DO_PDF = readFileSync(
  path.join(RAIZ, 'scripts/fixtures/tabela-village-connect-i-setembro.txt'),
  'utf8',
);

/** O cadastro que o corretor vai fazer: 29 blocos, térreo + 3 andares, 4 por andar. */
function cadastroDoConnect({ blocos = 29, ventilacao = [1, 3] } = {}) {
  const lista = [];
  for (let b = 1; b <= blocos; b++) {
    const g = G.gerarUnidades(G.repetirAte([{ numero: 1, unidades: 4 }], 4));
    lista.push({
      id: `b${b}`,
      nome: `Bloco ${b}`,
      terminacoesMaisVentiladas: ventilacao,
      unidades: g.unidades.map((u) => ({ id: `b${b}-${u.codigo}`, codigo: u.codigo, pavimento: u.pavimento })),
    });
  }
  return lista;
}

function tabelaDe(leitura) {
  return { referencia: leitura.referencia ?? '', atualizadoEm: null, regras: leitura.regras, vagas: leitura.vagas, arquivo: null };
}

function unidade(blocos, nomeBloco, codigo) {
  return blocos.find((b) => b.nome === nomeBloco)?.unidades.find((u) => u.codigo === codigo);
}

/* ======================================================================== */
secao('LEITURA DO PDF — as 13 linhas, valor a valor');
const leitura = I.lerTextoDaTabela(TEXTO_DO_PDF);
{
  checar('lê as 13 linhas da tabela', leitura.regras.length === 13, `(leu ${leitura.regras.length})`);
  checar('nenhum aviso de linha ruim', leitura.avisos.length === 0, JSON.stringify(leitura.avisos));
  checar('referência "Setembro"', leitura.referencia === 'Setembro', `(${leitura.referencia})`);

  // Transcrito à mão do PDF, na ordem dele: [pavimento, ventilação, vaga, avaliação, venda].
  const esperado = [
    [1, 'mais', 'moto', 231900, 244780],
    [1, 'menos', 'moto', 226900, 240780],
    [1, 'mais', 'carro', 236900, 254280],
    [1, 'menos', 'carro', 231900, 250280],
    [2, 'menos', 'moto', 231900, 244780],
    [2, 'mais', 'carro', 241900, 261280],
    [2, 'menos', 'carro', 236900, 256280],
    [3, 'mais', 'carro', 241900, 261280],
    [3, 'menos', 'carro', 236900, 256280],
    [4, 'mais', 'moto', 231900, 244780],
    [4, 'menos', 'moto', 226900, 240780],
    [4, 'mais', 'carro', 236900, 254280],
    // O valor que parece fora do padrão fica como a construtora mandou.
    [4, 'menos', 'carro', 231900, 249280],
  ];
  esperado.forEach(([pav, vent, vaga, aval, venda], i) => {
    const r = leitura.regras[i];
    checar(
      `linha ${i + 1}: ${G.rotuloDoPavimento(pav)} · ${vent} · ${vaga} = ${venda}`,
      r && r.pavimento === pav && r.ventilacao === vent && r.vaga === vaga && r.avaliacao === aval && r.venda === venda && r.areaM2 === 40.94,
      JSON.stringify(r),
    );
  });

  checar('a lista de vagas é de moto', leitura.vagas?.vagaDaLista === 'moto');
  checar('quem não está na lista fica com carro', leitura.vagas?.vagaDasDemais === 'carro');
  checar('139 unidades com vaga de moto', leitura.vagas?.unidades.length === 139, `(${leitura.vagas?.unidades.length})`);
  const primeira = leitura.unidadesLidas[0];
  checar('primeira da lista: BL 01 APTO 001', primeira?.texto === 'BL 01 APTO 001' && primeira.bloco === '01' && primeira.unidade === '001');
  const ultima = leitura.unidadesLidas.at(-1);
  checar('última da lista: BL 29 APTO 304', ultima?.bloco === '29' && ultima.unidade === '304');
  checar('o cabeçalho repetido nas páginas não vira unidade', !leitura.unidadesLidas.some((u) => /UNIDADE/.test(u.texto)));
}

/* ======================================================================== */
secao('LEITURA — outros jeitos de o texto chegar');
{
  // Uma célula por linha: é como o texto sai quando se copia do leitor de PDF.
  const celulas = 'ANDAR\nPOSIÇÃO\nVAGA\nM2\nAVALIAÇÃO\nVENDA\nTÉRREO\nMAIS VENTILADO\nMoto\n40,94\nR$ 231.900,00\nR$ 244.780,00\n1º ANDAR\nMENOS VENTILADO\nCarro\n40,94\nR$ 236.900,00\nR$ 256.280,00\n';
  const r = I.lerTabelaColada(celulas);
  checar('uma célula por linha: 2 linhas lidas', r.regras.length === 2);
  checar('uma célula por linha: 1º andar é o pavimento 2', r.regras[1]?.pavimento === 2 && r.regras[1].venda === 256280);

  const tab = 'TÉRREO\tMAIS VENTILADO\tMoto\t40,94\tR$ 231.900,00\tR$ 244.780,00';
  checar('separado por tabulação', I.lerTabelaColada(tab).regras[0]?.venda === 244780);

  const grau = '10° ANDAR MAIS VENTILADO Carro 40,94 R$ 300.000,00 R$ 320.000,00';
  checar('"10° andar" (símbolo de grau) é o pavimento 11', I.lerTabelaColada(grau).regras[0]?.pavimento === 11);

  const soVenda = 'TÉRREO MAIS VENTILADO Moto R$ 244.780,00';
  const sv = I.lerTabelaColada(soVenda).regras[0];
  checar('com um valor só, ele é a venda', sv?.venda === 244780 && sv.avaliacao === null && sv.areaM2 === null);

  const invertida = 'ANDAR POSIÇÃO VAGA VENDA AVALIAÇÃO\nTÉRREO MAIS VENTILADO Moto R$ 244.780,00 R$ 231.900,00';
  const inv = I.lerTabelaColada(invertida).regras[0];
  checar('cabeçalho com VENDA antes de AVALIAÇÃO inverte a leitura', inv?.venda === 244780 && inv.avaliacao === 231900);

  const semPosicao = 'TÉRREO Carro R$ 250.000,00\n1º ANDAR Carro R$ 255.000,00';
  const sp = I.lerTabelaColada(semPosicao).regras;
  checar('tabela sem ventilação: a linha vale para as duas', sp.length === 2 && sp[0].ventilacao === null);

  const repetida = 'TÉRREO MAIS VENTILADO Moto R$ 1,00 R$ 2,00\nTÉRREO MAIS VENTILADO Moto R$ 3,00 R$ 4,00';
  const rep = I.lerTabelaColada(repetida);
  checar('linha repetida: fica a primeira e avisa', rep.regras.length === 1 && rep.regras[0].venda === 2 && rep.avisos.length === 1);

  checar('"3º andar" solto no texto não vira linha', I.lerTabelaColada('Vista do 3º andar para a piscina').regras.length === 0);
  checar('texto sem tabela: nada lido', I.lerTextoDaTabela('Olá, segue a planta.').regras.length === 0);
  checar('texto sem lista: sem vagas', I.lerTextoDaTabela(tab).vagas === null);
}

/* ======================================================================== */
secao('CHAVES — "BL 02" e "Bloco 2" são o mesmo bloco');
{
  checar('BL 02 → 2', K.chaveDoBloco('BL 02') === '2');
  checar('Bloco 2 → 2', K.chaveDoBloco('Bloco 2') === '2');
  checar('BLOCO 02 → 2', K.chaveDoBloco('BLOCO 02') === '2');
  checar('Quadra 03 → 3', K.chaveDoBloco('Quadra 03') === '3');
  checar('Torre A → A', K.chaveDoBloco('Torre A') === 'A');
  checar('só "7" → 7', K.chaveDoBloco('7') === '7');
  checar('unidade 001 → 1', K.chaveDaUnidade('001') === '1');
  checar('unidade 1001 ≠ 101', K.chaveDaUnidade('1001') !== K.chaveDaUnidade('101'));
  checar('unidade com letra precisa ser igual', K.chaveDaUnidade('A101') === 'A101');
}

/* ======================================================================== */
secao('VENTILAÇÃO — pela terminação');
{
  checar('301 termina em 1', P.terminacaoDoCodigo('301') === 1);
  checar('1004 termina em 4', P.terminacaoDoCodigo('1004') === 4);
  checar('A12 termina em 12', P.terminacaoDoCodigo('A12') === 12);
  checar('sem número, sem terminação', P.terminacaoDoCodigo('Loja') === null);
  checar('finais 1 e 3: 301 é mais ventilado', P.ventilacaoDaUnidade('301', [1, 3]) === 'mais');
  checar('finais 1 e 3: 302 é menos ventilado', P.ventilacaoDaUnidade('302', [1, 3]) === 'menos');
  checar('sem regra, sem ventilação', P.ventilacaoDaUnidade('301', null) === null);
  checar(
    'resumo da regra',
    P.resumoDaVentilacao([3, 1], [1, 2, 3, 4]) === 'Mais ventilado: finais 1 e 3 · Menos: 2 e 4',
    P.resumoDaVentilacao([3, 1], [1, 2, 3, 4]),
  );
}

/* ======================================================================== */
secao('PREÇO — o Connect inteiro, com a regra 1 e 3');
const tabela = tabelaDe(leitura);
const blocos = P.precificarBlocos(cadastroDoConnect(), tabela);
{
  const preco = (b, c) => unidade(blocos, b, c)?.valorDeVenda;
  checar('Bloco 2 · 301: 3º andar, mais ventilado, moto = 244.780', preco('Bloco 2', '301') === 244780);
  checar('Bloco 2 · 302: 3º andar, menos ventilado, moto = 240.780', preco('Bloco 2', '302') === 240780);
  checar('Bloco 6 · 001: fora da lista → carro, mais ventilado = 254.280', preco('Bloco 6', '001') === 254280);
  checar('Bloco 6 · 002: carro, menos ventilado = 250.280', preco('Bloco 6', '002') === 250280);
  checar('Bloco 6 · 101: 1º andar, carro, mais = 261.280', preco('Bloco 6', '101') === 261280);
  checar('Bloco 6 · 204: 2º andar, carro, menos = 256.280', preco('Bloco 6', '204') === 256280);
  checar('Bloco 6 · 304: 3º andar, carro, menos = 249.280 (como a construtora mandou)', preco('Bloco 6', '304') === 249280);
  checar('Bloco 16 · 104: 1º andar, moto, menos = 244.780', preco('Bloco 16', '104') === 244780);
  checar('Bloco 1 · 002: a lista só cita o 001 → carro', unidade(blocos, 'Bloco 1', '002')?.vaga === 'carro');

  const u = unidade(blocos, 'Bloco 2', '301');
  checar('a unidade traz vaga, ventilação, área e avaliação', u.vaga === 'moto' && u.ventilacao === 'mais' && u.preco.areaM2 === 40.94 && u.preco.avaliacao === 231900);

  // A tabela não tem "1º andar · mais ventilado · moto". Com a regra 1 e 3 em
  // todos os blocos, o 101 e o 103 do Bloco 17 caem aí — e ficam SEM preço, em
  // vez de ganhar o preço de outra linha.
  const b17 = unidade(blocos, 'Bloco 17', '101');
  checar('Bloco 17 · 101 (moto, mais, 1º andar): sem linha na tabela', b17.valorDeVenda === null && b17.preco.motivo === 'sem_linha');
  checar('a mensagem diz a combinação que falta', /1º andar · mais ventilado · moto/.test(b17.preco.mensagem), b17.preco.mensagem);

  const cob = P.coberturaDaTabela(blocos);
  checar('464 unidades no cadastro', cob.total === 464);
  const semLinha = cob.faltas.find((f) => f.motivo === 'sem_linha');
  checar('6 unidades sem linha (101/103 dos blocos 17, 20 e 23)', semLinha?.quantidade === 6 && semLinha.blocos.join(',') === 'Bloco 17,Bloco 20,Bloco 23', JSON.stringify(semLinha));
  checar('as outras 458 têm preço', cob.comPreco === 458);

  // Nesses três blocos a posição é espelhada: invertendo a regra, tudo fecha.
  const espelhados = cadastroDoConnect().map((b) =>
    ['Bloco 17', 'Bloco 20', 'Bloco 23'].includes(b.nome) ? { ...b, terminacoesMaisVentiladas: [2, 4] } : b,
  );
  checar('com a regra espelhada nos blocos 17, 20 e 23, todas têm preço', P.coberturaDaTabela(P.precificarBlocos(espelhados, tabela)).comPreco === 464);

  const faixa = P.faixaDoBloco(unidade(blocos, 'Bloco 6', '001') ? blocos.find((b) => b.nome === 'Bloco 6') : null);
  checar('faixa do Bloco 6: 249.280 a 261.280', faixa?.min === 249280 && faixa.max === 261280, JSON.stringify(faixa));
}

/* ======================================================================== */
secao('PREÇO — o que falta aparece com o motivo certo');
{
  const semRegra = P.precificarBlocos(cadastroDoConnect({ blocos: 1, ventilacao: null }), tabela);
  checar('bloco sem regra de ventilação: sem_ventilacao', semRegra[0].unidades[0].preco.motivo === 'sem_ventilacao');

  const semLista = P.precificarBlocos(cadastroDoConnect({ blocos: 1 }), { ...tabela, vagas: null });
  checar('sem lista de vagas: sem_vaga', semLista[0].unidades[0].preco.motivo === 'sem_vaga');

  const semTabela = P.precificarBlocos(cadastroDoConnect({ blocos: 1 }), null);
  checar('sem tabela: sem_tabela e sem valor', semTabela[0].unidades[0].preco.motivo === 'sem_tabela' && semTabela[0].unidades[0].valorDeVenda === null);

  const legado = P.precificarBlocos(
    [{ nome: 'Bloco 1', terminacoesMaisVentiladas: null, unidades: [{ codigo: '001', pavimento: 1, valor: 199000 }] }],
    null,
  );
  checar('sem tabela, vale o valor gravado na unidade', legado[0].unidades[0].valorDeVenda === 199000);

  const t = (regras) => ({ referencia: '', atualizadoEm: null, regras, vagas: null, arquivo: null });
  const r = (pavimento, ventilacao, vaga, venda) => ({ pavimento, ventilacao, vaga, venda, avaliacao: null, areaM2: null });
  const un = { codigo: '101', pavimento: 2, vaga: null };
  const bl = { terminacoesMaisVentiladas: null };

  checar('linha "qualquer" vale para todos', P.precoDaUnidade(un, bl, t([r(null, null, null, 100)])).venda === 100);
  checar('a linha do andar vence a "qualquer"', P.precoDaUnidade(un, bl, t([r(null, null, null, 100), r(2, null, null, 150)])).venda === 150);
  const empate = P.precoDaUnidade(
    { ...un, vaga: 'moto' },
    { terminacoesMaisVentiladas: [1] },
    t([r(2, 'mais', null, 150), r(2, null, 'moto', 160)]),
  );
  checar('duas linhas igualmente específicas com preços diferentes: sem preço', !empate.ok && empate.motivo === 'ambigua');
  const empateIgual = P.precoDaUnidade(
    { ...un, vaga: 'moto' },
    { terminacoesMaisVentiladas: [1] },
    t([r(2, 'mais', null, 150), r(2, null, 'moto', 150)]),
  );
  checar('empate com o mesmo preço não é conflito', empateIgual.ok && empateIgual.venda === 150);
}

/* ======================================================================== */
secao('DE-PARA — a lista contra o cadastro');
{
  const completo = I.conferirListaDeVagas(cadastroDoConnect(), leitura.vagas);
  checar('as 139 da lista existem no cadastro', completo.naLista === 139 && completo.naoEncontradas.length === 0);
  checar('as outras 325 ficam com carro', completo.foraDaLista === 325);

  const parcial = I.conferirListaDeVagas(cadastroDoConnect({ blocos: 25 }), leitura.vagas);
  const faltam = parcial.naoEncontradas.filter((n) => n.motivo === 'bloco não cadastrado');
  checar('com 25 blocos, as dos blocos 28 e 29 aparecem como não encontradas', faltam.length === 16 && faltam.every((n) => ['28', '29'].includes(n.item.bloco)));

  const baixo = cadastroDoConnect({ blocos: 2 }).map((b) => ({ ...b, unidades: b.unidades.filter((u) => u.pavimento <= 2) }));
  const semAndar = I.conferirListaDeVagas(baixo, leitura.vagas);
  checar('unidade citada que o bloco não tem: "não existe no Bloco 2"', semAndar.naoEncontradas.some((n) => n.item.unidade === '301' && n.motivo === 'não existe no Bloco 2'));

  // O cadastro feito DEPOIS da tabela já nasce com a vaga certa.
  const depois = P.precificarBlocos(cadastroDoConnect({ blocos: 29 }), tabela);
  checar('bloco cadastrado depois da tabela: vaga pela lista', unidade(depois, 'Bloco 29', '304')?.vaga === 'moto');
}

/* ======================================================================== */
secao('VALIDAÇÃO — antes de mandar ao banco');
{
  checar('a tabela do Connect é válida', P.validarRegras(leitura.regras).ok);
  const dup = P.validarRegras([leitura.regras[0], leitura.regras[0]]);
  checar('combinação repetida é recusada', !dup.ok && /duas vezes/.test(dup.erro));
  const zero = P.validarRegras([{ ...leitura.regras[0], venda: 0 }]);
  checar('venda zero é recusada', !zero.ok && /valor de venda/.test(zero.erro));
  checar('descrição de linha', P.descreverRegra({ pavimento: 1, ventilacao: 'mais', vaga: 'moto' }) === 'Térreo · mais ventilado · moto');
}

/* ======================================================================== */
console.log(`\n${ok} verificações passaram.`);
if (falhas.length > 0) {
  console.error(`\n${falhas.length} FALHARAM:`);
  for (const f of falhas) console.error(`  ✗ ${f}`);
  process.exit(1);
}
