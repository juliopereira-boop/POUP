/**
 * TESTES DO VÍNCULO UNIDADE DO CV ↔ UNIDADE DO POUP.
 *
 * `npm run testar:disponibilidade`
 *
 * Um vínculo errado não quebra tela nenhuma: ele pinta o apartamento vizinho.
 * Por isso cada regra tem um teste com nome — e os formatos são os que o CV
 * CRM da Canopus devolve de verdade (26/10/2026).
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
    if (spec === './vinculo') return carregar('src/features/disponibilidade/vinculo.ts');
    return require(spec);
  };
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}

const K = carregar('src/features/tabelaPreco/chaves.ts');
const D = carregar('src/features/disponibilidade/vinculo.ts');
const A = carregar('src/features/disponibilidade/aplicar.ts');
const I = carregar('src/features/disponibilidade/importarDoCv.ts');

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
secao('1. Ler o identificador do CV');
// ---------------------------------------------------------------------------
const lidos = [
  ['Bloco 29 Apto 304', { bloco: '29', unidade: '304', tipo: 'apartamento' }],
  ['BLOCO 46 UNIDADE 304', { bloco: '46', unidade: '304', tipo: 'unidade' }],
  ['BLOCO 27 UNIDADE 1', { bloco: '27', unidade: '1', tipo: 'unidade' }],
  ['Torre 09 Apto 702', { bloco: '09', unidade: '702', tipo: 'apartamento' }],
  ['Quadra F Casa 19', { bloco: 'F', unidade: '19', tipo: 'casa' }],
  ['QUADRA A CASA 01', { bloco: 'A', unidade: '01', tipo: 'casa' }],
  ['Bloco 03 Apto. 003', { bloco: '03', unidade: '003', tipo: 'apartamento' }],
  ['BL02 AP 302', { bloco: '02', unidade: '302', tipo: 'apartamento' }],
  ['Lote 05 Quadra 03', { bloco: '03', unidade: '05', tipo: 'lote' }],
  ['Casa 12', { bloco: null, unidade: '12', tipo: 'casa' }],
  ['  bloco   07   apto  204 ', { bloco: '07', unidade: '204', tipo: 'apartamento' }],
];
for (const [texto, esperado] of lidos) {
  const r = D.lerIdentificador(texto);
  checar(`lê "${texto}"`, JSON.stringify(r) === JSON.stringify(esperado), `→ ${JSON.stringify(r)}`);
}
for (const texto of ['', 'null', null, 'Bloco 01', 'BLOCO 01 null', 'Garagem 12', 'ENTRADA 1', 'Área comum']) {
  checar(`não inventa unidade em "${texto}"`, D.lerIdentificador(texto) === null);
}

// ---------------------------------------------------------------------------
secao('2. A chave do CV é a mesma chave da tabela de preço');
// ---------------------------------------------------------------------------
const mesma = [
  ['Bloco 01 Apto 001', 'Bloco 1', '001'],
  ['Bloco 29 Apto 304', 'BL 29', '304'],
  // Reserva II: o CV escreve o térreo sem zeros.
  ['BLOCO 27 UNIDADE 1', 'Bloco 27', '001'],
  ['BLOCO 27 UNIDADE 101', 'Bloco 27', '101'],
  // Prime Calhau IV: "Torre" no CV, "Bloco" no POUP.
  ['Torre 09 Apto 702', 'Bloco 9', '702'],
  ['Quadra F Casa 19', 'Quadra F', '19'],
  ['QUADRA A CASA 01', 'Quadra A', '001'],
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
  ['BLOCO 27 UNIDADE 1', 'Bloco 27', '101'],
  ['Quadra A Casa 01', 'Quadra B', '1'],
];
for (const [ident, bloco, codigo] of diferentes) {
  const a = D.chaveDoIdentificador(D.lerIdentificador(ident));
  const b = K.chaveDaUnidadeNoBloco(bloco, codigo);
  checar(`"${ident}" ≠ ${bloco}/${codigo}`, a !== b);
}

// ---------------------------------------------------------------------------
secao('3. CONNECT I (CV 63): 29 blocos × 16 unidades casam todas');
// ---------------------------------------------------------------------------
function connect() {
  const cv = [];
  const poup = [];
  let id = 35040;
  for (let b = 1; b <= 29; b++) {
    for (let andar = 0; andar <= 3; andar++) {
      for (let pos = 1; pos <= 4; pos++) {
        const codigo = `${andar}${String(pos).padStart(2, '0')}`;
        cv.push({ cvUnidade: ++id, identificador: `Bloco ${String(b).padStart(2, '0')} Apto ${codigo.padStart(3, '0')}`, situacao: 'Disponível' });
        poup.push({ id: `u-${b}-${codigo}`, bloco: `Bloco ${b}`, codigo: codigo.padStart(3, '0') });
      }
    }
  }
  return { cv, poup };
}
{
  const { cv, poup } = connect();
  const s = D.sugerirVinculos(poup, cv);
  checar('464 casadas', s.casadas.length === 464, `(${s.casadas.length})`);
  checar('nada sobrando', s.soNoPoup.length + s.soNoCv.length + s.conflitos.length + s.naoReconhecidas.length === 0);
  const par = s.casadas.find((p) => p.unitId === 'u-7-204');
  checar('Bloco 7 / 204 casa com "Bloco 07 Apto 204"', par?.cv.identificador === 'Bloco 07 Apto 204', par?.cv.identificador);
  checar('cada unidade do CV usada uma vez só', new Set(s.casadas.map((p) => p.cv.cvUnidade)).size === 464);
}
{
  // Reserva II Mod II: "UNIDADE 1..4" no térreo, "UNIDADE 101..304" nos andares.
  const nomes = ['1', '2', '3', '4', '101', '102', '103', '104', '201', '202', '203', '204', '301', '302', '303', '304'];
  const cv = nomes.map((n, i) => ({ cvUnidade: 29000 + i, identificador: `BLOCO 27 UNIDADE ${n}` }));
  const poup = nomes.map((n) => ({ id: `r-${n}`, bloco: 'Bloco 27', codigo: n.padStart(3, '0') }));
  const s = D.sugerirVinculos(poup, cv);
  checar('Reserva II: 16 de 16', s.casadas.length === 16);
  checar('Reserva II: "UNIDADE 1" é a 001 (não a 101)', s.casadas.find((p) => p.cv.identificador === 'BLOCO 27 UNIDADE 1')?.unitId === 'r-1');
}

// ---------------------------------------------------------------------------
secao('4. A vizinha nunca casa');
// ---------------------------------------------------------------------------
{
  const poup = ['101', '102', '103', '104'].map((c) => ({ id: c, bloco: 'Bloco 1', codigo: c }));
  const cv = ['101', '102', '103', '105'].map((c, i) => ({ cvUnidade: i + 1, identificador: `Bloco 01 Apto ${c}` }));
  const s = D.sugerirVinculos(poup, cv);
  checar('3 casadas', s.casadas.length === 3);
  checar('104 fica só no POUP', s.soNoPoup.length === 1 && s.soNoPoup[0].codigo === '104');
  checar('105 fica só no CV', s.soNoCv.length === 1 && s.soNoCv[0].identificador.endsWith('105'));
}

// ---------------------------------------------------------------------------
secao('5. Repetição vira conflito, não palpite');
// ---------------------------------------------------------------------------
{
  const poup = [
    { id: 'a', bloco: 'Bloco 1', codigo: '001' },
    { id: 'b', bloco: 'Bloco 01', codigo: '001' },
  ];
  const s = D.sugerirVinculos(poup, [{ cvUnidade: 1, identificador: 'Bloco 01 Apto 001' }]);
  checar('dois blocos que normalizam igual → conflito', s.conflitos.length === 1 && s.casadas.length === 0);
}
{
  const poup = [{ id: 'a', bloco: 'Bloco 1', codigo: '001' }];
  const cv = [
    { cvUnidade: 1, identificador: 'Bloco 01 Apto 001' },
    { cvUnidade: 2, identificador: 'BLOCO 1 UNIDADE 1' },
  ];
  const s = D.sugerirVinculos(poup, cv);
  checar('duas unidades do CV com a mesma chave → conflito', s.conflitos.length === 1 && s.casadas.length === 0);
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
  const cv = [
    { cvUnidade: 91, identificador: 'Bloco 01 Apto 001' },
    { cvUnidade: 92, identificador: 'Bloco 01 Apto 002' },
  ];
  const existentes = new Map([
    ['a', 91],
    ['b', 97],
  ]);
  const s = D.sugerirVinculos(poup, cv, existentes);
  checar('vínculo igual → já vinculada', s.jaVinculadas.length === 1 && s.jaVinculadas[0].unitId === 'a');
  checar('vínculo diferente → divergente (não troca sozinho)', s.divergentes.length === 1 && s.divergentes[0].unitId === 'b');
  checar('nenhuma casada nova', s.casadas.length === 0);
}

// ---------------------------------------------------------------------------
secao('7. Sem bloco no CV');
// ---------------------------------------------------------------------------
{
  const cv = [{ cvUnidade: 1, identificador: 'Casa 12' }];
  const um = D.sugerirVinculos([{ id: 'a', bloco: 'Quadra A', codigo: '12' }], cv);
  checar('empreendimento de um bloco: casa', um.casadas.length === 1);
  const dois = D.sugerirVinculos(
    [
      { id: 'a', bloco: 'Quadra A', codigo: '12' },
      { id: 'b', bloco: 'Quadra B', codigo: '12' },
    ],
    cv,
  );
  checar('dois blocos: não adivinha', dois.casadas.length === 0 && dois.naoReconhecidas.length === 1);
}
{
  // O mapa do Reserva II tem uma unidade sem nome ("BLOCO 01" + null).
  const s = D.sugerirVinculos([{ id: 'a', bloco: 'Bloco 1', codigo: '12' }], [{ cvUnidade: 33307, identificador: null }]);
  checar('unidade do CV sem nome → não reconhecida', s.naoReconhecidas.length === 1 && s.casadas.length === 0);
}

// ---------------------------------------------------------------------------
secao('8. Criar os blocos a partir do CV');
// ---------------------------------------------------------------------------
{
  const { cv } = connect();
  const { blocos, recusadas } = D.blocosDoCv(cv);
  checar('29 blocos', blocos.length === 29, `(${blocos.length})`);
  checar('nenhuma recusada', recusadas.length === 0);
  const b1 = blocos.find((b) => b.nome === 'Bloco 01');
  checar('Bloco 01 com 16 unidades', b1?.unidades.length === 16);
  const pav = Object.fromEntries((b1?.unidades ?? []).map((u) => [u.codigo, u.pavimento]));
  checar('001 é térreo (pavimento 1)', pav['001'] === 1);
  checar('101 é pavimento 2', pav['101'] === 2);
  checar('304 é pavimento 4', pav['304'] === 4);
  checar('ordem do térreo para cima', b1?.unidades[0].codigo === '001' && b1?.unidades[15].codigo === '304');
  // Ida e volta: o que foi criado a partir do CV casa 100% com o CV.
  const poup = blocos.flatMap((b) => b.unidades.map((u) => ({ id: `${b.nome}/${u.codigo}`, bloco: b.nome, codigo: u.codigo })));
  checar('criado do CV casa 464 de 464', D.sugerirVinculos(poup, cv).casadas.length === 464);
}
{
  const cv = ['1', '2', '101', '304'].map((n, i) => ({ cvUnidade: i + 1, identificador: `BLOCO 27 UNIDADE ${n}` }));
  const { blocos } = D.blocosDoCv(cv);
  const cod = blocos[0]?.unidades.map((u) => `${u.codigo}@${u.pavimento}`).join(',');
  checar('"UNIDADE 1" vira 001 no térreo, como o gerador do POUP', cod === '001@1,002@1,101@2,304@4', cod);
}
{
  const cv = ['Quadra A Casa 01', 'Quadra A Casa 02', 'Quadra B Casa 01'].map((identificador, i) => ({ cvUnidade: i + 1, identificador }));
  const { blocos } = D.blocosDoCv(cv);
  checar('quadras viram "Quadra A" e "Quadra B"', blocos.map((b) => b.nome).join(',') === 'Quadra A,Quadra B');
  checar('casa é térreo', blocos.every((b) => b.unidades.every((u) => u.pavimento === 1)));
}

// ---------------------------------------------------------------------------
secao('9. Renomeação no CV');
// ---------------------------------------------------------------------------
checar('mesmo texto com espaço/caixa diferente não é mudança', !D.identificadorMudou('Bloco 01 Apto 001', ' bloco 01  apto 001'));
checar('outro número é mudança', D.identificadorMudou('Bloco 01 Apto 001', 'Bloco 01 Apto 002'));
checar('sumiu é mudança', D.identificadorMudou('Bloco 01 Apto 001', null));

// ---------------------------------------------------------------------------
secao('10. Completar o cadastro com o CV: nunca apaga, nunca renomeia');
// ---------------------------------------------------------------------------
{
  const existentes = [
    { id: 'b1', nome: 'Bloco 1', unidades: [{ codigo: '001', pavimento: 1, ordem: 0 }, { codigo: 'LOJA', pavimento: 1, ordem: 1 }] },
    { id: 'b9', nome: 'Bloco 9 (antigo)', unidades: [{ codigo: '001', pavimento: 1, ordem: 0 }] },
  ];
  const doCv = [
    { nome: 'Bloco 01', unidades: [{ codigo: '001', pavimento: 1 }, { codigo: '002', pavimento: 1 }] },
    { nome: 'Bloco 02', unidades: [{ codigo: '001', pavimento: 1 }] },
  ];
  const m = D.mesclarBlocos(existentes, doCv);
  checar('mantém os blocos existentes com o id', m.blocos[0].id === 'b1' && m.blocos[1].id === 'b9');
  checar('mantém o nome do POUP ("Bloco 1", não "Bloco 01")', m.blocos[0].nome === 'Bloco 1');
  checar('mantém unidade que o CV não tem (LOJA)', m.blocos[0].unidades.some((u) => u.codigo === 'LOJA'));
  checar('mantém bloco que o CV não tem', m.blocos.some((b) => b.nome === 'Bloco 9 (antigo)'));
  checar('acrescenta a 002 no Bloco 1', m.blocos[0].unidades.some((u) => u.codigo === '002'));
  checar('"001" do CV não duplica a "001" do POUP', m.blocos[0].unidades.filter((u) => u.codigo === '001').length === 1);
  checar('cria o Bloco 02', m.blocos.some((b) => b.id === null && b.nome === 'Bloco 02'));
  checar('contas: 1 bloco e 2 unidades novos', m.blocosNovos === 1 && m.unidadesNovas === 2, JSON.stringify([m.blocosNovos, m.unidadesNovas]));
  const igual = D.mesclarBlocos(m.blocos.map((b, i) => ({ ...b, id: b.id ?? `n${i}` })), doCv);
  checar('rodar de novo não acrescenta nada', igual.unidadesNovas === 0 && igual.blocosNovos === 0);
  checar('não manda ventilação (a RPC mantém a de cada bloco)', m.blocos.every((b) => !('ventilacaoMais' in b)));
}

// ---------------------------------------------------------------------------
secao('11. A disponibilidade na unidade (o preço não muda)');
// ---------------------------------------------------------------------------
{
  const unidade = (id, venda) => ({
    id,
    vaga: 'carro',
    valorDeVenda: venda,
    preco: venda
      ? { ok: true, venda, avaliacao: 230000, areaM2: 41.81, vaga: 'carro', ventilacao: 'mais', regra: null, origem: 'unidade' }
      : { ok: false, motivo: 'sem_tabela', mensagem: 'sem tabela' },
  });
  const disp = (extra = {}) => ({
    ativa: true,
    atualizadoEm: new Date().toISOString(),
    unidades: new Map([
      ['u1', { unitId: 'u1', situacao: 'disponivel', statusDescricao: 'Disponível', mudouEm: '' }],
      ['u2', { unitId: 'u2', situacao: 'vendida', statusDescricao: 'Vendida', mudouEm: '' }],
      ['u3', { unitId: 'u3', situacao: 'negociacao', statusDescricao: 'Reservada', mudouEm: '' }],
      ...Object.entries(extra),
    ]),
  });

  const semCv = A.aplicarNaUnidade(unidade('u1', 240000), null);
  checar('sem CV: nada muda', semCv.situacao === null && semCv.valorDeVenda === 240000);
  const com = A.aplicarNaUnidade(unidade('u1', 240000), disp());
  checar('com CV: a cor vem, o preço da tabela fica', com.situacao === 'disponivel' && com.valorDeVenda === 240000 && com.preco.origem === 'unidade');
  const semPreco = A.aplicarNaUnidade(unidade('u1', null), disp());
  checar('sem tabela: continua sem preço (o CV não tem valor)', semPreco.valorDeVenda === null && !semPreco.preco.ok);
  const fora = A.aplicarNaUnidade(unidade('u9', 240000), disp());
  checar('unidade sem vínculo: sem cor', fora.situacao === null);
  const desv = A.aplicarNaUnidade(unidade('u4', 240000), disp({ u4: { unitId: 'u4', situacao: 'sem_vinculo', statusDescricao: null, mudouEm: '' } }));
  checar('sem_vinculo não pinta', desv.situacao === null && desv.statusDescricao === null);
  const pausado = A.aplicarNaUnidade(unidade('u2', 240000), { ...disp(), ativa: false });
  checar('CV desvinculado (ativa: false): nada pinta', pausado.situacao === null);
  const blocos = A.aplicarNosBlocos([{ nome: 'B1', unidades: [unidade('u1', 1), unidade('u2', 1)] }], disp());
  checar('nos blocos: cada unidade com a sua cor', blocos[0].unidades.map((u) => u.situacao).join() === 'disponivel,vendida');
}

// ---------------------------------------------------------------------------
secao('12. Quem pode ser escolhido, e o texto de cada situação');
// ---------------------------------------------------------------------------
checar('disponível pode', A.podeEscolher('disponivel'));
checar('em negociação pode (com aviso)', A.podeEscolher('negociacao'));
checar('sem informação pode (como antes)', A.podeEscolher(null));
checar('VENDIDA NÃO PODE', !A.podeEscolher('vendida'));
checar('FORA DE VENDA (bloqueada) NÃO PODE', !A.podeEscolher('indisponivel'));
checar('rótulo: disponível', A.rotuloDaSituacao('disponivel') === 'disponível');
checar('rótulo: o nome do CV na negociação', A.rotuloDaSituacao('negociacao', 'Reservada') === 'reservada');
checar('rótulo: vendida', A.rotuloDaSituacao('vendida') === 'vendida');
checar('rótulo: fora de venda', A.rotuloDaSituacao('indisponivel', 'Bloqueada') === 'fora de venda');
checar('rótulo: sem vínculo não diz nada', A.rotuloDaSituacao('sem_vinculo') === null);
{
  const agora = Date.parse('2026-10-26T12:00:00Z');
  checar('fresca não avisa', !A.estaDesatualizada({ ativa: true, atualizadoEm: '2026-10-26T11:59:00Z' }, agora));
  checar('velha (> 3 min) avisa', A.estaDesatualizada({ ativa: true, atualizadoEm: '2026-10-26T11:50:00Z' }, agora));
  checar('nunca lida avisa', A.estaDesatualizada({ ativa: true, atualizadoEm: null }, agora));
  checar('sem CV não avisa', !A.estaDesatualizada({ ativa: false, atualizadoEm: null }, agora));
  checar('"há 5 min"', A.haQuanto('2026-10-26T11:55:00Z', agora) === 'há 5 min');
}

// ---------------------------------------------------------------------------
secao('13. Importar do CV: empreendimento, etapa, blocos e vínculos');
// ---------------------------------------------------------------------------
{
  // Um banco de mentira, com a mesma regra das RPCs que importam aqui.
  function bancoFalso(previa, blocosIniciais = []) {
    const chamadas = [];
    const st = { blocos: blocosIniciais.map((b) => ({ ...b })), vinculos: [], cv: null };
    let seq = 0;
    const deps = {
      async criarEmpreendimento(userId, dados) {
        chamadas.push(['criar', dados]);
        return { ok: true, data: { id: 'dev-novo', ...dados } };
      },
      async salvarEmpreendimento(dev, cv) {
        chamadas.push(['cv', dev, cv]);
        st.cv = cv;
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
        // Como o banco: só as unidades da etapa vinculada.
        const daEtapa = previa.lista.filter((u) => st.cv?.etapa == null || u.etapa === st.cv.etapa);
        return {
          ok: true,
          data: {
            empreendimentos: [],
            poup: st.blocos.flatMap((b) => b.unidades.map((u) => ({ id: u.id ?? `${b.nome}/${u.codigo}`, bloco: b.nome, codigo: u.codigo, pavimento: u.pavimento }))),
            cv: daEtapa.map((u) => ({ ...u, empreendimento: previa.cvEmpreendimento, ausente: false })),
            vinculos: st.vinculos.map((v) => ({ unitId: v.unitId, cvUnidade: v.cvUnidade })),
          },
        };
      },
      async salvarVinculos(dev, vinculos) {
        chamadas.push(['vinculos', vinculos.length, vinculos[0]?.origem]);
        st.vinculos.push(...vinculos);
        return { ok: true, data: { gravados: vinculos.length } };
      },
    };
    return { deps, chamadas, st };
  }
  const { cv } = connect();
  const previa = {
    cvEmpreendimento: 63, nome: 'VILLAGE CONNECT I', unidades: 464, etapas: [{ id: 2274, nome: 'VILLAGE CONNECT I', unidades: 464 }], porSituacao: {},
    lista: cv.map((u) => ({ ...u, etapa: 2274, bloco: null, nome: null })),
  };

  const a = bancoFalso(previa);
  const passos = [];
  const r = await I.importarDoCv(
    { userId: 'admin', previa, etapa: null, dataEntrega: '2028-09-28', destino: { tipo: 'novo', companyId: 'canopus', nome: 'Village Connect I', uf: 'MA' } },
    a.deps,
    (p) => passos.push(p),
  );
  checar('importação nova deu certo', r.ok, r.ok ? '' : r.error);
  const criar = a.chamadas.find((c) => c[0] === 'criar')?.[1];
  checar('cria o empreendimento na construtora certa', criar?.companyId === 'canopus' && criar?.name === 'Village Connect I' && criar?.uf === 'MA');
  checar('entrega do CV vira mês/ano', criar?.deliveryDate === '2028-09-01');
  checar('sem "valor a partir de" (o CV não tem preço)', criar?.unitValueFrom === null);
  const vinc = a.chamadas.find((c) => c[0] === 'cv');
  checar('vincula o CV 63 ao empreendimento novo', vinc?.[1] === 'dev-novo' && vinc?.[2].empreendimento === 63 && vinc?.[2].etapa === null);
  checar('cria 29 blocos', a.st.blocos.length === 29);
  checar('464 vinculadas, origem "criado_do_cv"', r.ok && r.data.vinculadas === 464 && a.chamadas.find((c) => c[0] === 'vinculos')?.[2] === 'criado_do_cv');
  checar('nada pendente', r.ok && Object.values(r.data.pendentes).every((l) => l.length === 0));
  checar('a ordem: criar → cv → blocos → vínculos', a.chamadas.map((c) => c[0]).join('>') === 'criar>cv>blocos>vinculos');
  checar('mostra o andamento', passos.length >= 4);

  // O piloto de verdade: o Village Connect I já existe, com os 29 blocos.
  const existentes = connect().poup.reduce((m, u) => {
    const b = m.get(u.bloco) ?? { id: `id-${u.bloco}`, nome: u.bloco, unidades: [] };
    b.unidades.push({ id: u.id, codigo: u.codigo, pavimento: Number(u.codigo[0]) + 1, ordem: b.unidades.length });
    m.set(u.bloco, b);
    return m;
  }, new Map());
  const b = bancoFalso(previa, [...existentes.values()]);
  const r2 = await I.importarDoCv({ userId: 'admin', previa, etapa: null, destino: { tipo: 'existente', developmentId: 'connect' } }, b.deps);
  checar('existente completo: não cria empreendimento', !b.chamadas.some((c) => c[0] === 'criar'));
  checar('existente completo: não regrava os blocos', !b.chamadas.some((c) => c[0] === 'blocos'));
  checar('existente completo: 464 vinculadas, origem "automatico"', r2.ok && r2.data.vinculadas === 464 && b.chamadas.find((c) => c[0] === 'vinculos')?.[2] === 'automatico');

  // Rodar de novo: nada a fazer, nada regravado.
  const r3 = await I.importarDoCv({ userId: 'admin', previa, etapa: null, destino: { tipo: 'existente', developmentId: 'connect' } }, b.deps);
  checar('importar de novo: 0 novas, 464 já vinculadas', r3.ok && r3.data.vinculadas === 0 && r3.data.jaVinculadas === 464);

  // Etapa: o Reserva II do CV tem o Módulo I e o Módulo II.
  const modulos = {
    cvEmpreendimento: 55, nome: 'VILLAGE RESERVA II', unidades: 4,
    etapas: [{ id: 2263, nome: 'MODULO I', unidades: 2 }, { id: 2264, nome: 'MODULO II', unidades: 2 }], porSituacao: {},
    lista: [
      { cvUnidade: 1, etapa: 2263, identificador: 'BLOCO 15 UNIDADE 1' },
      { cvUnidade: 2, etapa: 2263, identificador: 'BLOCO 15 UNIDADE 2' },
      { cvUnidade: 3, etapa: 2264, identificador: 'BLOCO 27 UNIDADE 1' },
      { cvUnidade: 4, etapa: 2264, identificador: 'BLOCO 27 UNIDADE 2' },
    ],
  };
  const e = bancoFalso(modulos);
  const r5 = await I.importarDoCv({ userId: 'admin', previa: modulos, etapa: 2264, destino: { tipo: 'novo', companyId: 'c', nome: 'Village Reserva II - Mod II', uf: 'MA' } }, e.deps);
  checar('etapa: só o Módulo II vira cadastro', r5.ok && e.st.blocos.length === 1 && e.st.blocos[0].nome === 'Bloco 27');
  checar('etapa: o vínculo leva a etapa e o nome dela', e.st.cv?.etapa === 2264 && e.st.cv?.etapaNome === 'MODULO II');
  checar('etapa: 2 vinculadas, nada do Módulo I pendente', r5.ok && r5.data.vinculadas === 2 && r5.data.pendentes.soNoCv.length === 0);

  // Erro no meio para tudo, e diz o porquê.
  const c = bancoFalso(previa);
  c.deps.salvarEmpreendimento = async () => ({ ok: false, error: 'Este empreendimento (ou etapa) do CV já está vinculado a outro empreendimento do POUP.' });
  const r4 = await I.importarDoCv({ userId: 'admin', previa, etapa: null, destino: { tipo: 'novo', companyId: 'x', nome: 'Y', uf: null } }, c.deps);
  checar('CV de outro empreendimento: para e explica', !r4.ok && /outro empreendimento/.test(r4.error));
  checar('…sem gravar vínculo nenhum', !c.chamadas.some((x) => x[0] === 'vinculos'));

  const vazia = await I.importarDoCv({ userId: 'admin', previa: { ...previa, lista: [] }, etapa: null, destino: { tipo: 'existente', developmentId: 'd' } }, bancoFalso(previa).deps);
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
  checar('simulador confere no CV ANTES de gerar a proposta', dados.indexOf('await unidadeLiberadaNoCv()') > -1 && dados.indexOf('await unidadeLiberadaNoCv()') < dados.indexOf('const e = await gerar()'));
  checar('vendida/fora de venda bloqueia a proposta', /situacao === 'vendida' \|\| situacao === 'indisponivel'\) \{\s*setErro/.test(dados));
  checar('lista de unidades sem vendida/fora de venda', /\.filter\(\(u\) => podeEscolher\(u\.situacao\) \|\| u\.id === sim\.unitId\)/.test(dados));
  const escolher = ler('src/components/simulador/EscolherUnidadeDaTabela.tsx');
  checar('"Usar tabela" recusa vendida e avisa negociação', /if \(!podeEscolher\(u\.situacao\)\) return;/.test(escolher) && /u\.situacao === 'negociacao'/.test(escolher));
  checar('"Usar tabela" lista só empreendimento com tabela (o CV não tem preço)', /\.filter\(\(d\) => refs\.has\(d\.id\)\)/.test(escolher));
  const repo = ler('src/data/supabase/SupabaseDisponibilidadeRepository.ts');
  checar('o app nunca fala com o CV direto (só RPC e a Edge Function)', !/cvcrm\.com\.br|CVCRM_/.test(repo + dados + escolher));
  checar('o app chama a função do CV, não a do UAU', /functions\.invoke\('cvcrm-disponibilidade'/.test(repo) && !/uau/i.test(repo));
  checar('Realtime recarrega a foto ao (re)conectar', /if \(status === 'SUBSCRIBED'\) aoReconectar\(\)/.test(repo));
  const layout = ler('app/(app)/_layout.tsx');
  checar('telas do admin registradas', /name="admin\/cvcrm"/.test(layout) && /name="admin\/cvcrm-empreendimento"/.test(layout));
  checar('telas do UAU fora do app', !/admin\/uau/.test(layout));
  checar('menu do admin leva ao CV', /router\.push\('\/\(app\)\/admin\/cvcrm'\)/.test(ler('app/(app)/configuracoes.tsx')));
  const env = ler('src/lib/env.ts');
  checar('nada do CV nem do UAU no ambiente do app (EXPO_PUBLIC)', !/CVCRM|UAU/i.test(env));

  // Cada construtora com a SUA conta do CV ("Integrar CV", só o admin).
  const catalogo = ler('app/(app)/admin/catalogo.tsx');
  checar('"Integrar CV" no cadastro da construtora, só depois de ela existir', /\{editingId \? \(\s*<IntegracaoCv companyId=\{editingId\}/.test(catalogo));
  checar('o catálogo continua só do admin', /if \(!isAdmin\) \{/.test(catalogo));
  const integrar = ler('src/components/cvcrm/IntegracaoCv.tsx');
  checar('o token é digitado escondido', /label="Token"[\s\S]{0,400}secureTextEntry/.test(integrar));
  checar('o token nunca é mostrado (só "token guardado")', !/integracao\??\.token\b/.test(integrar) && /token guardado no servidor/.test(integrar));
  checar('desligar pede confirmação', /await confirmar\(\s*'Desligar o CV'/.test(integrar));
  // Fora de `corpoDaConta` (o que o admin digitou, indo para a função), nenhum `.token`.
  const repoSemOCorpo = repo.replace(/function corpoDaConta[\s\S]*?\n}\n/, '');
  checar('o repositório não lê token de volta', repoSemOCorpo !== repo && !/\.token\b/.test(repoSemOCorpo));
  checar('a prévia e a lista usam a conta da construtora', /acao: 'previa', companyId/.test(repo) && /acao: 'empreendimentos', companyId/.test(repo));
  const importar = ler('src/components/cvcrm/ImportarDoCv.tsx');
  checar('importar: prévia da conta da construtora', /previa\(companyId, empreendimento\.id\)/.test(importar));
  checar('importar: só empreendimentos da construtora dona da conta', /listDevelopments\(companyId\)/.test(importar) && !/listCompanies/.test(importar));
  checar('importar: nada de construtora adivinhada pelo nome', !/canopus/i.test(importar));
  const painelCv = ler('app/(app)/admin/cvcrm.tsx');
  checar('painel: o número do CV só vale dentro da conta', /if \(e\.companyId !== empresaId\) continue;/.test(painelCv));
  checar('painel: importa só de conta conectada', /empreendimentosDoCv\(empresaId\)/.test(painelCv));

  // "Habilitar reserva" e "Tabela de preço do CV" (só o admin, na integração).
  checar('integração: botão "Habilitar reserva"', /label="Habilitar reserva"/.test(integrar) && /mudarRecurso\('reserva', v\)/.test(integrar));
  checar('integração: botão "Tabela de preço do CV" com confirmação', /label="Tabela de preço do CV"/.test(integrar) && /await confirmar\(\s*ligar \? 'Tabela de preço do CV'/.test(integrar));
  const reservar = ler('src/components/cvcrm/ReservarNoCv.tsx');
  const relatorio = ler('app/(app)/relatorios/[id].tsx');
  checar('relatório: "Reservar no CV" na simulação', /<ReservarNoCv simulationId=\{sim\.id\}/.test(relatorio));
  checar('reserva: só aparece com a reserva ligada', /if \(!estado\?\.habilitada\) return null;/.test(reservar));
  checar('reserva: confere antes (preparar) e pede confirmação para reservar', /prepararReserva\(simulationId\)/.test(reservar) && /await confirmar\(\s*'Reservar no CV'/.test(reservar));
  checar('reserva: "Reservar" só com tudo pronto e o envio liberado', /disabled=\{!pronto \|\| !preparo\.envioLiberado/.test(reservar));
  const telaTabela = ler('app/(app)/cadastros/tabela-preco.tsx');
  checar('tabela do CV: ninguém troca à mão', /const doCv = salva\?\.fonte === 'cv';/.test(telaTabela) && /&& !doCv;/.test(telaTabela));
}

console.log(`\n${ok} verificações ok, ${falhas.length} falha(s).`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
