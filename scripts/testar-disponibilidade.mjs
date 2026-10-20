/**
 * TESTES DO VÍNCULO UNIDADE DO UAU ↔ UNIDADE DO POUP.
 *
 * `npm run testar:disponibilidade`
 *
 * Um vínculo errado não quebra tela nenhuma: ele pinta o apartamento vizinho.
 * Por isso cada regra tem um teste com nome — e os formatos são os que o UAU
 * da Canopus devolve de verdade.
 *
 * Mesma técnica de `testar-tabela-preco.mjs`: o `.ts` é transpilado na hora.
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
    if (spec === '../tabelaPreco/chaves') return carregar('src/features/tabelaPreco/chaves.ts');
    if (spec === './chaveUau') return carregar('src/features/disponibilidade/chaveUau.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}

const K = carregar('src/features/tabelaPreco/chaves.ts');
const D = carregar('src/features/disponibilidade/chaveUau.ts');
const A = carregar('src/features/disponibilidade/aplicar.ts');
const I = carregar('src/features/disponibilidade/importarObra.ts');

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

// ---------------------------------------------------------------------------
secao('1. Ler o identificador do UAU');
// ---------------------------------------------------------------------------
const lidos = [
  ['Bloco 01 Apto 001', { bloco: '01', unidade: '001', tipo: 'apartamento' }],
  ['Bloco 01 Apto. 005', { bloco: '01', unidade: '005', tipo: 'apartamento' }],
  ['Quadra A Casa 01', { bloco: 'A', unidade: '01', tipo: 'casa' }],
  ['BL 02 APTO 101', { bloco: '02', unidade: '101', tipo: 'apartamento' }],
  ['BL02 AP 302', { bloco: '02', unidade: '302', tipo: 'apartamento' }],
  ['Torre B Apartamento 1201', { bloco: 'B', unidade: '1201', tipo: 'apartamento' }],
  ['Lote 05 Quadra 03', { bloco: '03', unidade: '05', tipo: 'lote' }],
  ['QD 3 LT 12', { bloco: '3', unidade: '12', tipo: 'lote' }],
  ['Casa 12', { bloco: null, unidade: '12', tipo: 'casa' }],
  ['  bloco   07   apto  204 ', { bloco: '07', unidade: '204', tipo: 'apartamento' }],
];
for (const [texto, esperado] of lidos) {
  const r = D.lerIdentificador(texto);
  checar(`lê "${texto}"`, JSON.stringify(r) === JSON.stringify(esperado), `→ ${JSON.stringify(r)}`);
}
for (const texto of ['', 'null', null, 'Bloco 01', 'Garagem 12', 'ENTRADA 1', 'Área comum']) {
  checar(`não inventa unidade em "${texto}"`, D.lerIdentificador(texto) === null);
}

// ---------------------------------------------------------------------------
secao('2. A chave do UAU é a mesma chave da tabela de preço');
// ---------------------------------------------------------------------------
const mesma = [
  ['Bloco 01 Apto 001', 'Bloco 1', '001'],
  ['Bloco 01 Apto. 005', 'Bloco 01', '5'],
  ['Bloco 29 Apto 304', 'BL 29', '304'],
  ['Quadra A Casa 01', 'Quadra A', '1'],
  ['Bloco 02 Apto 101', '2', '101'],
];
for (const [ident, bloco, codigo] of mesma) {
  const a = D.chaveDoIdentificador(D.lerIdentificador(ident));
  const b = K.chaveDaUnidadeNoBloco(bloco, codigo);
  checar(`"${ident}" = ${bloco}/${codigo}`, a === b, `(${a} ≠ ${b})`);
}
const diferentes = [
  ['Bloco 02 Apto 101', 'Bloco 2', '11'],
  ['Bloco 02 Apto 101', 'Bloco 2', '1010'],
  ['Bloco 02 Apto 101', 'Bloco 12', '101'],
  ['Bloco 01 Apto 001', 'Bloco 1', '101'],
  ['Quadra A Casa 01', 'Quadra B', '1'],
];
for (const [ident, bloco, codigo] of diferentes) {
  const a = D.chaveDoIdentificador(D.lerIdentificador(ident));
  const b = K.chaveDaUnidadeNoBloco(bloco, codigo);
  checar(`"${ident}" ≠ ${bloco}/${codigo}`, a !== b);
}

// ---------------------------------------------------------------------------
secao('3. CONNECT (1/259V): 29 blocos × 16 unidades casam todas');
// ---------------------------------------------------------------------------
function connect() {
  const uau = [];
  const poup = [];
  let numPer = 0;
  for (let b = 1; b <= 29; b++) {
    for (let andar = 0; andar <= 3; andar++) {
      for (let pos = 1; pos <= 4; pos++) {
        numPer++;
        const codigo = `${andar}${String(pos).padStart(2, '0')}`;
        uau.push({
          empresa: 1, produto: 366, numPer, obra: '259V',
          identificador: `Bloco ${String(b).padStart(2, '0')} Apto ${codigo.padStart(3, '0')}`,
          statusCodigo: 0,
        });
        poup.push({ id: `u-${b}-${codigo}`, bloco: `Bloco ${b}`, codigo: codigo.padStart(3, '0') });
      }
    }
  }
  return { uau, poup };
}
{
  const { uau, poup } = connect();
  const s = D.sugerirVinculos(poup, uau);
  checar('464 casadas', s.casadas.length === 464, `(${s.casadas.length})`);
  checar('nada sobrando', s.soNoPoup.length + s.soNoUau.length + s.conflitos.length + s.naoReconhecidas.length === 0);
  const par = s.casadas.find((p) => p.unitId === 'u-7-204');
  checar('Bloco 7 / 204 casa com "Bloco 07 Apto 204"', par?.uau.identificador === 'Bloco 07 Apto 204', par?.uau.identificador);
  const unicos = new Set(s.casadas.map((p) => D.chaveUau(p.uau)));
  checar('cada unidade do UAU usada uma vez só', unicos.size === 464);
}

// ---------------------------------------------------------------------------
secao('4. A vizinha nunca casa');
// ---------------------------------------------------------------------------
{
  const poup = ['101', '102', '103', '104'].map((c) => ({ id: c, bloco: 'Bloco 1', codigo: c }));
  const uau = ['101', '102', '103', '105'].map((c, i) => ({
    empresa: 1, produto: 1, numPer: i + 1, obra: 'X', identificador: `Bloco 01 Apto ${c}`, statusCodigo: 0,
  }));
  const s = D.sugerirVinculos(poup, uau);
  checar('3 casadas', s.casadas.length === 3);
  checar('104 fica só no POUP', s.soNoPoup.length === 1 && s.soNoPoup[0].codigo === '104');
  checar('105 fica só no UAU', s.soNoUau.length === 1 && s.soNoUau[0].identificador.endsWith('105'));
}

// ---------------------------------------------------------------------------
secao('5. Repetição vira conflito, não palpite');
// ---------------------------------------------------------------------------
{
  const poup = [
    { id: 'a', bloco: 'Bloco 1', codigo: '001' },
    { id: 'b', bloco: 'Bloco 01', codigo: '001' },
  ];
  const uau = [{ empresa: 1, produto: 1, numPer: 1, obra: 'X', identificador: 'Bloco 01 Apto 001', statusCodigo: 0 }];
  const s = D.sugerirVinculos(poup, uau);
  checar('dois blocos que normalizam igual → conflito', s.conflitos.length === 1 && s.casadas.length === 0);
}
{
  const poup = [{ id: 'a', bloco: 'Bloco 1', codigo: '001' }];
  const uau = [
    { empresa: 1, produto: 1, numPer: 1, obra: 'X', identificador: 'Bloco 01 Apto 001', statusCodigo: 0 },
    { empresa: 1, produto: 1, numPer: 2, obra: 'X', identificador: 'BL 1 APTO 1', statusCodigo: 1 },
  ];
  const s = D.sugerirVinculos(poup, uau);
  checar('duas unidades do UAU com a mesma chave → conflito', s.conflitos.length === 1 && s.casadas.length === 0);
}
{
  const poup = [
    { id: 'a', bloco: 'Bloco 1', codigo: '001' },
    { id: 'b', bloco: 'Bloco 01', codigo: '001' },
  ];
  const s = D.sugerirVinculos(poup, []);
  checar('repetida só no POUP → conflito, não "só no POUP"', s.conflitos.length === 1 && s.soNoPoup.length === 0);
}

// ---------------------------------------------------------------------------
secao('6. O que já está gravado');
// ---------------------------------------------------------------------------
{
  const poup = [
    { id: 'a', bloco: 'Bloco 1', codigo: '001' },
    { id: 'b', bloco: 'Bloco 1', codigo: '002' },
  ];
  const uau = [
    { empresa: 1, produto: 9, numPer: 1, obra: 'X', identificador: 'Bloco 01 Apto 001', statusCodigo: 0 },
    { empresa: 1, produto: 9, numPer: 2, obra: 'X', identificador: 'Bloco 01 Apto 002', statusCodigo: 0 },
  ];
  const existentes = new Map([
    ['a', '1/9/1'],
    ['b', '1/9/7'],
  ]);
  const s = D.sugerirVinculos(poup, uau, existentes);
  checar('vínculo igual → já vinculada', s.jaVinculadas.length === 1 && s.jaVinculadas[0].unitId === 'a');
  checar('vínculo diferente → divergente (não troca sozinho)', s.divergentes.length === 1 && s.divergentes[0].unitId === 'b');
  checar('nenhuma casada nova', s.casadas.length === 0);
}

// ---------------------------------------------------------------------------
secao('7. Sem bloco no UAU');
// ---------------------------------------------------------------------------
{
  const uau = [{ empresa: 1, produto: 1, numPer: 1, obra: 'X', identificador: 'Casa 12', statusCodigo: 0 }];
  const um = D.sugerirVinculos([{ id: 'a', bloco: 'Quadra A', codigo: '12' }], uau);
  checar('empreendimento de um bloco: casa', um.casadas.length === 1);
  const dois = D.sugerirVinculos(
    [
      { id: 'a', bloco: 'Quadra A', codigo: '12' },
      { id: 'b', bloco: 'Quadra B', codigo: '12' },
    ],
    uau,
  );
  checar('dois blocos: não adivinha', dois.casadas.length === 0 && dois.naoReconhecidas.length === 1);
}
{
  const uau = [{ empresa: 1, produto: 1, numPer: 1, obra: 'X', identificador: 'Garagem 12', statusCodigo: 0 }];
  const s = D.sugerirVinculos([{ id: 'a', bloco: 'Bloco 1', codigo: '12' }], uau);
  checar('identificador desconhecido → não reconhecida', s.naoReconhecidas.length === 1 && s.casadas.length === 0);
}

// ---------------------------------------------------------------------------
secao('8. Criar os blocos a partir do UAU');
// ---------------------------------------------------------------------------
{
  const { uau } = connect();
  const { blocos, recusadas } = D.blocosDoUau(uau);
  checar('29 blocos', blocos.length === 29, `(${blocos.length})`);
  checar('nenhuma recusada', recusadas.length === 0);
  const b1 = blocos.find((b) => b.nome === 'Bloco 01');
  checar('Bloco 01 com 16 unidades', b1?.unidades.length === 16);
  const pav = Object.fromEntries((b1?.unidades ?? []).map((u) => [u.codigo, u.pavimento]));
  checar('001 é térreo (pavimento 1)', pav['001'] === 1);
  checar('101 é pavimento 2', pav['101'] === 2);
  checar('304 é pavimento 4', pav['304'] === 4);
  // Ida e volta: o que foi criado a partir do UAU casa 100% com o UAU.
  const poup = blocos.flatMap((b) => b.unidades.map((u) => ({ id: `${b.nome}/${u.codigo}`, bloco: b.nome, codigo: u.codigo })));
  const s = D.sugerirVinculos(poup, uau);
  checar('criado do UAU casa 464 de 464', s.casadas.length === 464);
}
{
  const uau = ['Quadra A Casa 01', 'Quadra A Casa 02', 'Quadra B Casa 01'].map((identificador, i) => ({
    empresa: 3, produto: 352, numPer: i + 1, obra: '236V', identificador, statusCodigo: 0,
  }));
  const { blocos } = D.blocosDoUau(uau);
  checar('quadras viram "Quadra A" e "Quadra B"', blocos.map((b) => b.nome).join(',') === 'Quadra A,Quadra B');
  checar('casa é térreo', blocos.every((b) => b.unidades.every((u) => u.pavimento === 1)));
}

// ---------------------------------------------------------------------------
secao('9. Renumeração no UAU');
// ---------------------------------------------------------------------------
checar('mesmo texto com espaço/caixa diferente não é mudança', !D.identificadorMudou('Bloco 01 Apto 001', ' bloco 01  apto 001'));
checar('outro número é mudança', D.identificadorMudou('Bloco 01 Apto 001', 'Bloco 01 Apto 002'));
checar('sumiu é mudança', D.identificadorMudou('Bloco 01 Apto 001', null));

// ---------------------------------------------------------------------------
secao('10. Completar o cadastro com o UAU: nunca apaga, nunca renomeia');
// ---------------------------------------------------------------------------
{
  const existentes = [
    { id: 'b1', nome: 'Bloco 1', unidades: [{ codigo: '001', pavimento: 1, ordem: 0 }, { codigo: 'LOJA', pavimento: 1, ordem: 1 }] },
    { id: 'b9', nome: 'Bloco 9 (antigo)', unidades: [{ codigo: '001', pavimento: 1, ordem: 0 }] },
  ];
  const doUau = [
    { nome: 'Bloco 01', unidades: [{ codigo: '001', pavimento: 1 }, { codigo: '002', pavimento: 1 }] },
    { nome: 'Bloco 02', unidades: [{ codigo: '001', pavimento: 1 }] },
  ];
  const m = D.mesclarBlocos(existentes, doUau);
  checar('mantém os blocos existentes com o id', m.blocos[0].id === 'b1' && m.blocos[1].id === 'b9');
  checar('mantém o nome do POUP ("Bloco 1", não "Bloco 01")', m.blocos[0].nome === 'Bloco 1');
  checar('mantém unidade que o UAU não tem (LOJA)', m.blocos[0].unidades.some((u) => u.codigo === 'LOJA'));
  checar('mantém bloco que o UAU não tem', m.blocos.some((b) => b.nome === 'Bloco 9 (antigo)'));
  checar('acrescenta a 002 no Bloco 1', m.blocos[0].unidades.some((u) => u.codigo === '002'));
  checar('"001" do UAU não duplica a "001" do POUP', m.blocos[0].unidades.filter((u) => u.codigo === '001').length === 1);
  checar('cria o Bloco 02', m.blocos.some((b) => b.id === null && b.nome === 'Bloco 02'));
  checar('contas: 1 bloco e 2 unidades novos', m.blocosNovos === 1 && m.unidadesNovas === 2, JSON.stringify([m.blocosNovos, m.unidadesNovas]));
  const igual = D.mesclarBlocos(m.blocos.map((b, i) => ({ ...b, id: b.id ?? `n${i}` })), doUau);
  checar('rodar de novo não acrescenta nada', igual.unidadesNovas === 0 && igual.blocosNovos === 0);
  checar('não manda ventilação (a RPC mantém a de cada bloco)', m.blocos.every((b) => !('ventilacaoMais' in b)));
}

// ---------------------------------------------------------------------------
secao('11. A disponibilidade e o preço na unidade');
// ---------------------------------------------------------------------------
{
  const unidade = (id, venda) => ({
    id,
    vaga: 'carro',
    ventilacao: 'mais',
    valorDeVenda: venda,
    preco: venda
      ? { ok: true, venda, avaliacao: 230000, areaM2: 41.81, vaga: 'carro', ventilacao: 'mais', regra: null, origem: 'unidade' }
      : { ok: false, motivo: 'sem_tabela', mensagem: 'sem tabela' },
  });
  const disp = (fontePreco, extra = {}) => ({
    temUau: true,
    atualizadoEm: new Date().toISOString(),
    fontePreco,
    unidades: new Map([
      ['u1', { unitId: 'u1', situacao: 'disponivel', statusDescricao: 'Disponível', mudouEm: '', valorUau: 250000 }],
      ['u2', { unitId: 'u2', situacao: 'vendida', statusDescricao: 'Vendida', mudouEm: '', valorUau: 255000 }],
      ['u3', { unitId: 'u3', situacao: 'negociacao', statusDescricao: 'Proposta', mudouEm: '', valorUau: null }],
      ...Object.entries(extra),
    ]),
  });

  const semUau = A.aplicarNaUnidade(unidade('u1', 240000), null, true);
  checar('sem UAU: nada muda', semUau.situacao === null && semUau.valorDeVenda === 240000);

  const auto1 = A.aplicarNaUnidade(unidade('u1', 240000), disp('automatico'), true);
  checar('automático COM tabela: vale a tabela', auto1.valorDeVenda === 240000 && auto1.preco.origem === 'unidade');
  checar('…e a cor do UAU vem junto', auto1.situacao === 'disponivel');

  const auto2 = A.aplicarNaUnidade(unidade('u1', null), disp('automatico'), false);
  checar('automático SEM tabela: vale o UAU', auto2.valorDeVenda === 250000 && auto2.preco.ok && auto2.preco.origem === 'uau');

  const so = A.aplicarNaUnidade(unidade('u1', 240000), disp('uau'), true);
  checar('fonte UAU: vale o UAU mesmo com tabela', so.valorDeVenda === 250000);
  checar('…mas avaliação e área continuam da tabela', so.preco.avaliacao === 230000 && so.preco.areaM2 === 41.81);

  const tab = A.aplicarNaUnidade(unidade('u1', 240000), disp('tabela'), true);
  checar('fonte tabela: o UAU não mexe no preço', tab.valorDeVenda === 240000);
  const tabSem = A.aplicarNaUnidade(unidade('u1', null), disp('tabela'), false);
  checar('fonte tabela sem tabela: sem preço (não cai no UAU)', tabSem.valorDeVenda === null);

  const semValor = A.aplicarNaUnidade(unidade('u3', 240000), disp('uau'), true);
  checar('fonte UAU sem valor no UAU: sem preço (não herda a tabela)', semValor.valorDeVenda === null && !semValor.preco.ok);

  const fora = A.aplicarNaUnidade(unidade('u9', 240000), disp('uau'), true);
  checar('unidade sem vínculo: sem cor e sem preço do UAU', fora.situacao === null && fora.valorDeVenda === null);

  const desv = A.aplicarNaUnidade(unidade('u4', 240000), disp('automatico', { u4: { unitId: 'u4', situacao: 'sem_vinculo', statusDescricao: null, mudouEm: '', valorUau: 999 } }), true);
  checar('sem_vinculo não pinta nem dá preço', desv.situacao === null && desv.valorDeVenda === 240000);

  const blocos = A.aplicarNosBlocos([{ nome: 'B1', unidades: [unidade('u1', 1), unidade('u2', 1)] }], disp('automatico'), true);
  checar('nos blocos: cada unidade com a sua cor', blocos[0].unidades.map((u) => u.situacao).join() === 'disponivel,vendida');
}

// ---------------------------------------------------------------------------
secao('12. Quem pode ser escolhido, e o texto de cada situação');
// ---------------------------------------------------------------------------
checar('disponível pode', A.podeEscolher('disponivel'));
checar('em negociação pode (com aviso)', A.podeEscolher('negociacao'));
checar('sem informação pode (como antes)', A.podeEscolher(null));
checar('VENDIDA NÃO PODE', !A.podeEscolher('vendida'));
checar('FORA DE VENDA NÃO PODE', !A.podeEscolher('indisponivel'));
checar('rótulo: disponível', A.rotuloDaSituacao('disponivel') === 'disponível');
checar('rótulo: o nome do UAU na negociação', A.rotuloDaSituacao('negociacao', 'Reservado') === 'reservado');
checar('rótulo: vendida', A.rotuloDaSituacao('vendida') === 'vendida');
checar('rótulo: fora de venda', A.rotuloDaSituacao('indisponivel') === 'fora de venda');
checar('rótulo: sem vínculo não diz nada', A.rotuloDaSituacao('sem_vinculo') === null);
{
  const agora = Date.parse('2026-10-20T12:00:00Z');
  checar('fresca não avisa', !A.estaDesatualizada({ temUau: true, atualizadoEm: '2026-10-20T11:59:00Z' }, agora));
  checar('velha (> 3 min) avisa', A.estaDesatualizada({ temUau: true, atualizadoEm: '2026-10-20T11:50:00Z' }, agora));
  checar('nunca lida avisa', A.estaDesatualizada({ temUau: true, atualizadoEm: null }, agora));
  checar('sem UAU não avisa', !A.estaDesatualizada({ temUau: false, atualizadoEm: null }, agora));
  checar('"há 5 min"', A.haQuanto('2026-10-20T11:55:00Z', agora) === 'há 5 min');
}

// ---------------------------------------------------------------------------
secao('13. Importar a obra: empreendimento, blocos, vínculos e preço');
// ---------------------------------------------------------------------------
{
  // Um banco de mentira, com a mesma regra das RPCs que importam aqui.
  function bancoFalso(blocosIniciais = []) {
    const chamadas = [];
    const st = { blocos: blocosIniciais.map((b) => ({ ...b })), vinculos: [], fonte: 'automatico' };
    let seq = 0;
    const deps = {
      async criarEmpreendimento(userId, dados) {
        chamadas.push(['criar', dados]);
        return { ok: true, data: { id: 'dev-novo', ...dados } };
      },
      async salvarObra(dev, empresa, obra) {
        chamadas.push(['obra', dev, empresa, obra]);
        return { ok: true, data: undefined };
      },
      async listarBlocos() {
        return { ok: true, data: st.blocos };
      },
      async salvarBlocos(dev, blocos) {
        chamadas.push(['blocos', blocos.length]);
        st.blocos = blocos.map((b) => ({
          id: b.id ?? `bl-${++seq}`,
          nome: b.nome,
          unidades: b.unidades.map((u) => ({ ...u, id: u.id ?? `${b.nome}/${u.codigo}` })),
        }));
        return { ok: true, data: st.blocos };
      },
      async conferencia() {
        return {
          ok: true,
          data: {
            obras: [],
            poup: st.blocos.flatMap((b) => b.unidades.map((u) => ({ id: u.id ?? `${b.nome}/${u.codigo}`, bloco: b.nome, codigo: u.codigo, pavimento: u.pavimento }))),
            uau: previa.lista.map((u) => ({ empresa: 1, produto: u.produto, numPer: u.numPer, obra: '259V', identificador: u.identificador, statusCodigo: u.status, statusDescricao: null, ausente: false })),
            vinculos: st.vinculos.map((v) => ({ unitId: v.unitId, chave: `${v.empresa}/${v.produto}/${v.numPer}` })),
          },
        };
      },
      async salvarVinculos(dev, vinculos) {
        chamadas.push(['vinculos', vinculos.length, vinculos[0]?.origem]);
        st.vinculos.push(...vinculos);
        return { ok: true, data: { gravados: vinculos.length } };
      },
      async definirFontePreco(dev, fonte) {
        chamadas.push(['fonte', fonte]);
        st.fonte = fonte;
        return { ok: true, data: undefined };
      },
    };
    return { deps, chamadas, st };
  }
  const { uau } = connect();
  const previa = {
    empresa: 1, obra: '259V', unidades: 464, porStatus: {}, exemplos: [], valorMin: 231500, valorMax: 250000,
    entregaChaves: '2028-09-28',
    lista: uau.map((u) => ({ produto: u.produto, numPer: u.numPer, identificador: u.identificador, status: 0, descricao: 'Disponível', valor: 231500 })),
  };

  const a = bancoFalso();
  const passos = [];
  const r = await I.importarObra(
    { userId: 'admin', previa, destino: { tipo: 'novo', companyId: 'canopus', nome: 'Village Connect I', uf: 'MA' }, fonte: 'uau' },
    a.deps,
    (p) => passos.push(p),
  );
  checar('importação nova deu certo', r.ok, r.ok ? '' : r.error);
  const criar = a.chamadas.find((c) => c[0] === 'criar')?.[1];
  checar('cria o empreendimento na construtora certa', criar?.companyId === 'canopus' && criar?.name === 'Village Connect I' && criar?.uf === 'MA');
  checar('entrega das chaves vira mês/ano', criar?.deliveryDate === '2028-09-01');
  checar('"valor a partir de" = o menor valor do UAU', criar?.unitValueFrom === 231500);
  checar('vincula a obra 1/259V ao empreendimento novo', a.chamadas.some((c) => c[0] === 'obra' && c[1] === 'dev-novo' && c[2] === 1 && c[3] === '259V'));
  checar('cria 29 blocos', a.st.blocos.length === 29);
  checar('464 vinculadas, origem "criado_do_uau"', r.ok && r.data.vinculadas === 464 && a.chamadas.find((c) => c[0] === 'vinculos')?.[2] === 'criado_do_uau');
  checar('fonte do preço gravada', a.st.fonte === 'uau');
  checar('nada pendente', r.ok && Object.values(r.data.pendentes).every((l) => l.length === 0));
  checar('a ordem: criar → obra → blocos → vínculos → fonte', a.chamadas.map((c) => c[0]).join('>') === 'criar>obra>blocos>vinculos>fonte');
  checar('mostra o andamento', passos.length >= 4);

  // O piloto de verdade: o Village Connect I já existe, com os 29 blocos.
  const existentes = connect().poup.reduce((m, u) => {
    const b = m.get(u.bloco) ?? { id: `id-${u.bloco}`, nome: u.bloco, unidades: [] };
    b.unidades.push({ id: u.id, codigo: u.codigo, pavimento: Number(u.codigo[0]) + 1, ordem: b.unidades.length });
    m.set(u.bloco, b);
    return m;
  }, new Map());
  const b = bancoFalso([...existentes.values()]);
  const r2 = await I.importarObra({ userId: 'admin', previa, destino: { tipo: 'existente', developmentId: 'connect' }, fonte: 'automatico' }, b.deps);
  checar('existente completo: não cria empreendimento', !b.chamadas.some((c) => c[0] === 'criar'));
  checar('existente completo: não regrava os blocos', !b.chamadas.some((c) => c[0] === 'blocos'));
  checar('existente completo: 464 vinculadas, origem "automatico"', r2.ok && r2.data.vinculadas === 464 && b.chamadas.find((c) => c[0] === 'vinculos')?.[2] === 'automatico');
  checar('automático: não grava fonte (já é o padrão)', !b.chamadas.some((c) => c[0] === 'fonte'));

  // Rodar de novo: nada a fazer, nada regravado.
  const r3 = await I.importarObra({ userId: 'admin', previa, destino: { tipo: 'existente', developmentId: 'connect' }, fonte: 'automatico' }, b.deps);
  checar('importar de novo: 0 novas, 464 já vinculadas', r3.ok && r3.data.vinculadas === 0 && r3.data.jaVinculadas === 464);

  // Erro no meio para tudo, e diz o porquê.
  const c = bancoFalso();
  c.deps.salvarObra = async () => ({ ok: false, error: 'Esta obra do UAU já está vinculada a outro empreendimento.' });
  const r4 = await I.importarObra({ userId: 'admin', previa, destino: { tipo: 'novo', companyId: 'x', nome: 'Y', uf: null }, fonte: 'automatico' }, c.deps);
  checar('obra de outro empreendimento: para e explica', !r4.ok && /outro empreendimento/.test(r4.error));
  checar('…sem gravar vínculo nenhum', !c.chamadas.some((x) => x[0] === 'vinculos'));

  const vazia = await I.importarObra({ userId: 'admin', previa: { ...previa, lista: [] }, destino: { tipo: 'existente', developmentId: 'd' }, fonte: 'automatico' }, bancoFalso().deps);
  checar('prévia vazia não importa nada', !vazia.ok);
}

// ---------------------------------------------------------------------------
secao('14. As ligações no aplicativo');
// ---------------------------------------------------------------------------
{
  const ler = (f) => readFileSync(path.join(RAIZ, f), 'utf8');
  const grade = ler('src/components/tabelaPreco/GradeDeUnidades.tsx');
  checar('bolinha de ventilação é AZUL (colors.info), não verde', /bolinha: \{[\s\S]*?backgroundColor: colors\.info/.test(grade) && !/bolinha: \{[\s\S]*?backgroundColor: colors\.success/.test(grade));
  checar('a grade só deixa tocar o que pode ser escolhido', /podeTocar = Boolean\(onEscolher\) && temPreco && livre/.test(grade) && /const livre = podeEscolher\(u\.situacao\)/.test(grade));
  checar('a situação vai por escrito e no leitor de tela', /accessibilityLabel=\{`Unidade \$\{u\.codigo\}\$\{situacao/.test(grade));
  const dados = ler('app/(app)/simulador/dados.tsx');
  checar('simulador confere no UAU ANTES de gerar a proposta', dados.indexOf('await unidadeLiberadaNoUau()') > -1 && dados.indexOf('await unidadeLiberadaNoUau()') < dados.indexOf('const e = await gerar()'));
  checar('vendida/fora de venda bloqueia a proposta', /situacao === 'vendida' \|\| situacao === 'indisponivel'\) \{\s*setErro/.test(dados));
  checar('lista de unidades sem vendida/fora de venda', /\.filter\(\(u\) => podeEscolher\(u\.situacao\) \|\| u\.id === sim\.unitId\)/.test(dados));
  const escolher = ler('src/components/simulador/EscolherUnidadeDaTabela.tsx');
  checar('"Usar tabela" recusa vendida e avisa negociação', /if \(!podeEscolher\(u\.situacao\)\) return;/.test(escolher) && /u\.situacao === 'negociacao'/.test(escolher));
  checar('"Usar tabela" lista empreendimento com valor do UAU', /db\.disponibilidade\.empreendimentosComPreco\(\)/.test(escolher));
  const repo = ler('src/data/supabase/SupabaseDisponibilidadeRepository.ts');
  checar('o app nunca fala com o UAU direto (só RPC e a Edge Function)', !/uauapi|canopusconstrucoes|UAU_/.test(repo + dados + escolher));
  checar('Realtime recarrega a foto ao (re)conectar', /if \(status === 'SUBSCRIBED'\) aoReconectar\(\)/.test(repo));
  const layout = ler('app/(app)/_layout.tsx');
  checar('telas do admin registradas', /name="admin\/uau"/.test(layout) && /name="admin\/uau-obra"/.test(layout));
  checar('menu do admin leva ao UAU', /router\.push\('\/\(app\)\/admin\/uau'\)/.test(ler('app/(app)/configuracoes.tsx')));
  const env = ler('src/lib/env.ts');
  checar('nada do UAU no ambiente do app (EXPO_PUBLIC)', !/UAU/i.test(env));
}

console.log(`\n${ok} verificações ok, ${falhas.length} falha(s).`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
