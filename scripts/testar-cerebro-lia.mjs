/**
 * O CÉREBRO DA LIA, FRASE POR FRASE.
 *
 * `npm run testar:cerebro-lia`
 *
 * Cada caso é uma frase do jeito que um corretor digita e o que a LIA tem que
 * entender dela. É a régua do algoritmo: um ajuste que conserta uma frase e
 * quebra outra aparece aqui na hora.
 *
 * Hoje é fixo (sábado, 26/09/2026) para as datas relativas não mudarem.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const RAIZ = path.join(process.cwd(), 'src/features/lia/cerebro');
const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  cache.set(arquivo, m.exports);
  m.require = (spec) => (spec.startsWith('./') ? carregar(path.join(path.dirname(arquivo), `${spec.slice(2)}.ts`)) : require(spec));
  m._compile(js, arquivo);
  cache.set(arquivo, m.exports);
  return m.exports;
}
const C = carregar(path.join(RAIZ, 'campos.ts'));
const A = carregar(path.join(RAIZ, 'agenda.ts'));
const N = carregar(path.join(RAIZ, 'numeros.ts'));

const HOJE = '2026-09-26';
const EMPREENDIMENTOS = [
  { id: 'estrelas', nome: 'Village das Estrelas' },
  { id: 'aguas', nome: 'Village das Águas II' },
  { id: 'connect', nome: 'Village Connect I' },
  { id: 'reserva1', nome: 'Village Reserva I' },
  { id: 'reserva2', nome: 'Village Reserva II - Módulo II' },
  { id: 'parque', nome: 'Residencial Parque Sul' },
];
const CORRESPONDENTES = [
  { id: 'credicasa', nome: 'CrediCasa' },
  { id: 'facil', nome: 'Fácil Crédito Imobiliário' },
];
const CLIENTES = [
  { id: 'lead-maria', nome: 'Maria Souza', cpf: '52998224725', telefone: '98999990000', email: 'maria@exemplo.com', renda: 2800 },
  { id: 'lead-joao', nome: 'João Pedro Lima', cpf: '11144477735', telefone: '98988887777', email: null, renda: null },
];

let ok = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

function pensar(texto, extra = {}) {
  return C.pensar({ texto, hoje: HOJE, empreendimentos: EMPREENDIMENTOS, correspondentes: CORRESPONDENTES, clientes: CLIENTES, ...extra });
}
function mapa(r) {
  return Object.fromEntries(r.campos.map((c) => [c.chave, c.valor]));
}
/** Espera exatamente estes valores (e ignora os demais campos). */
function caso(texto, esperado, extra = {}, conferir) {
  const r = pensar(texto, extra);
  const m = mapa(r);
  for (const [k, v] of Object.entries(esperado)) {
    checar(`"${texto}" → ${k}`, m[k] === v, `veio ${JSON.stringify(m[k])}, esperado ${JSON.stringify(v)} | tudo: ${JSON.stringify(m)}`);
  }
  if (conferir) conferir(r, m);
  return r;
}

// ------------------------------------------------------------------ números
{
  const v = (t) => N.acharNumeros(t).map((n) => n.valor);
  checar('números: 210 mil', v('210 mil')[0] === 210000);
  checar('números: duzentos e dez mil', v('duzentos e dez mil')[0] === 210000);
  checar('números: dois e oitocentos', v('dois e oitocentos')[0] === 2800);
  checar('números: 2 e 800', v('2 e 800')[0] === 2800);
  checar('números: tres e meio', v('tres e meio')[0] === 3.5);
  checar('números: 2.800', v('2.800')[0] === 2800);
  checar('números: 245.000,00', v('245.000,00')[0] === 245000);
  checar('números: 3,5 mil', v('3,5 mil')[0] === 3500);
  checar('números: mil e quinhentos', v('mil e quinhentos')[0] === 1500);
  checar('números: cento e oitenta mil', v('cento e oitenta mil')[0] === 180000);
  checar('números: 210k', v('210k')[0] === 210000);
  checar('números: "um apartamento" não é número', v('um apartamento').length === 0);
  checar('números: percentual fica de fora', v('4% de desconto').length === 0);
  checar('números: bloco 2 e 3 são dois', v('bloco 2 e 3').length === 2);
}

// ------------------------------------------------------------ a negociação
caso(
  'Cliente Maria Souza, renda 2.800, quer o estrelas bloco 3 apto 204, entrada de 5 mil dia 10, 36 vezes vencendo todo dia 15',
  {
    clienteNome: 'Maria Souza', clienteRenda: '2800', empreendimento: 'estrelas', bloco: '3', unidade: '204',
    ato: '5000', atoDataVencimento: '2026-10-10', mensaisQuantidade: '36', mensalDiaVencimento: '15',
    clienteCpf: '52998224725', clienteTelefone: '98999990000',
  },
);
caso('ela ganha dois e oitocentos', { clienteRenda: '2800' });
caso('renda três e meio', { clienteRenda: '3500' });
caso('o apartamento custa duzentos e dez mil', { valorUnidade: '210000' });
caso('valor 210', { valorUnidade: '210000' }, {}, (r) => checar('valor 210 é deduzido', r.campos.find((c) => c.chave === 'valorUnidade')?.confianca === 'media'));
caso('aprovou 180 mil, subsídio de 32, fgts 8 mil', { financiamentoAprovado: '180000', subsidio: '32000', fgts: '8000' });
caso('a carta veio 180', { financiamentoAprovado: '180000' });
caso('valor da unidade 245.000,00', { valorUnidade: '245000' });
caso('apartamento 302 de 210 mil', { unidade: '302', valorUnidade: '210000' });
caso('unidade 1203 do bloco 4', { unidade: '1203', bloco: '4' });
caso('bloco B', { bloco: '2' });
caso('sem bloco, casa 14', { bloco: '0', unidade: '14' });
caso('parcela da caixa de 850', { cefParcela: '850' });
caso('4 semestrais de 5 mil e 2 anuais de 10 mil', { semestraisQuantidade: '4', semestralValor: '5000', anuaisQuantidade: '2', anualValor: '10000' });
caso('divide em 48x, vencimento dia 5', { mensaisQuantidade: '48', mensalDiaVencimento: '5' });
caso('entrada amanhã', { atoDataVencimento: '2026-09-27' });
caso('a entrada é 5 mil, paga na sexta', { ato: '5000', atoDataVencimento: '2026-10-02' });
caso('ato de 3 mil no dia 5 de outubro', { ato: '3000', atoDataVencimento: '2026-10-05' });
caso('ganha um salário e meio', { clienteRenda: '2277' });
caso('a taxa da caixa fica com o cliente', { cefTaxaClientePaga: 'sim' });
caso('a construtora paga a taxa', { cefTaxaClientePaga: 'nao' });

// correções
caso('renda 3 mil, na verdade 3.500', { clienteRenda: '3500' });
caso('não é 3 mil, é 3.500 de renda', { clienteRenda: '3500' });
caso('entrada 5 mil. Corrigindo: entrada 7 mil', { ato: '7000' });

// segundo proponente
caso('vai compor renda com a esposa Ana Paula que ganha 2 mil', {
  temSegundoProponente: 'sim', associacao: 'conjuge', segundoNome: 'Ana Paula', segundoRenda: '2000',
});
caso('ele ganha 3 mil e a esposa 2 mil', { clienteRenda: '3000', segundoRenda: '2000', temSegundoProponente: 'sim', associacao: 'conjuge' });
caso('vai comprar com a mãe, renda da mãe 1.800', { temSegundoProponente: 'sim', associacao: 'parente', segundoRenda: '1800' });
caso('esquece o segundo proponente', { temSegundoProponente: 'nao' }, {}, (r) =>
  checar('remove os campos do segundo', ['segundoNome', 'segundoRenda', 'segundoCpf', 'associacao'].every((c) => r.remover.includes(c)), JSON.stringify(r.remover)),
);
caso('sem fgts', {}, {}, (r) => checar('"sem fgts" remove o FGTS', r.remover.includes('fgts'), JSON.stringify(r)));

// documentos e contato
caso('CPF 529.982.247-25', { clienteCpf: '52998224725' });
caso('cpf 111.111.111-11', { clienteCpf: '11111111111' }, {}, (r) => {
  checar('CPF inválido vem com confiança baixa', r.campos.find((c) => c.chave === 'clienteCpf')?.confianca === 'baixa');
  checar('e com aviso', /não confere/.test(r.observacao ?? ''));
});
caso('telefone (98) 99999-0000', { clienteTelefone: '98999990000' });
caso('email maria.souza@gmail.com', { clienteEmail: 'maria.souza@gmail.com' });
caso('cpf da esposa 111.444.777-35', { segundoCpf: '11144477735' });

// cadastro
caso('é no reserva 2', { empreendimento: 'reserva2' });
caso('é no reserva', {}, {}, (r) => {
  checar('"reserva" sozinho não escolhe', !mapa(r).empreendimento);
  checar('e pergunta qual', /Village Reserva I/.test(r.observacao ?? '') && /Village Reserva II/.test(r.observacao ?? ''), r.observacao);
});
caso('quer o connect', { empreendimento: 'connect' });
caso('parque das aguas', { empreendimento: 'aguas' });
caso('correspondente CrediCasa', { correspondente: 'credicasa' });
caso('João Pedro Lima vai comprar', { clienteNome: 'João Pedro Lima', clienteCpf: '11144477735', clienteTelefone: '98988887777' });
caso('cliente carlos silva renda 4 mil', { clienteNome: 'Carlos Silva', clienteRenda: '4000' });

// a pergunta da LIA e a resposta curta
caso('3.500', { clienteRenda: '3500' }, { pendente: 'clienteRenda' });
caso('48', { mensaisQuantidade: '48' }, { pendente: 'mensaisQuantidade' });
caso('dia 12', { atoDataVencimento: '2026-10-12' }, { pendente: 'atoDataVencimento' });
caso('Maria Clara Nunes', { clienteNome: 'Maria Clara Nunes' }, { pendente: 'clienteNome' });
caso('1.200', {}, {}, (r) => checar('número solto vira aviso, não campo', r.campos.length === 0 && /Não identifiquei/.test(r.observacao ?? ''), JSON.stringify(r)));

// não repete o que já está no estado
caso('renda 2.800', {}, { estado: { clienteRenda: '2800' } }, (r) => checar('mesmo valor do estado não volta', !mapa(r).clienteRenda));

// textos longos, do jeito que se escreve depois de um atendimento
caso(
  'Atendi hoje a Juliana Ferreira, ela trabalha de vendedora e ganha 2.450 bruto. Quer o Águas, bloco 12 ap 103. O valor do ap tá 263 mil. A Caixa aprovou 190 mil e deu 38 mil de subsídio. Ela tem 6 mil de FGTS. Entrada de 3 mil pra pagar dia 15, o resto em 60 vezes todo dia 10. Correspondente é a CrediCasa.',
  {
    clienteNome: 'Juliana Ferreira', clienteRenda: '2450', empreendimento: 'aguas', bloco: '12', unidade: '103',
    valorUnidade: '263000', financiamentoAprovado: '190000', subsidio: '38000', fgts: '6000', ato: '3000',
    atoDataVencimento: '2026-10-15', mensaisQuantidade: '60', mensalDiaVencimento: '10', correspondente: 'credicasa',
  },
);
caso(
  'cliente roberto alves cpf 390.533.447-05 tel 98 98123-4567 renda 3200 compoe com a esposa sandra que ganha 1800. imovel connect bloco 5 apto 301 valor 247.400. aprovado 175 mil subsidio 12 mil. ato 5 mil amanha. 36 mensais vencimento dia 20. 2 semestrais de 4 mil. taxa da caixa o cliente paga. parcela da caixa 980',
  {
    clienteNome: 'Roberto Alves', clienteCpf: '39053344705', clienteTelefone: '98981234567', clienteRenda: '3200',
    temSegundoProponente: 'sim', associacao: 'conjuge', segundoNome: 'Sandra', segundoRenda: '1800', empreendimento: 'connect',
    bloco: '5', unidade: '301', valorUnidade: '247400', financiamentoAprovado: '175000', subsidio: '12000', ato: '5000',
    atoDataVencimento: '2026-09-27', mensaisQuantidade: '36', mensalDiaVencimento: '20', semestraisQuantidade: '2',
    semestralValor: '4000', cefTaxaClientePaga: 'sim', cefParcela: '980',
  },
);
caso('o cliente ganha três mil e quinhentos, e a mulher dele dois mil. o apartamento é de duzentos e quarenta e sete mil e quatrocentos. entrada de dez mil em duas vezes',
  { clienteRenda: '3500', segundoRenda: '2000', valorUnidade: '247400', ato: '10000' }, {}, (r, m) => {
    checar('"entrada em duas vezes" não vira mensais', !m.mensaisQuantidade);
    checar('número por extenso não vira nome', !m.segundoNome, m.segundoNome);
  });
caso('correção: a renda é 3.800 e não 3.500. mudou pro bloco 7', { clienteRenda: '3800', bloco: '7' });

// ------------------------------------------------------------------ agenda
function agenda(texto, esperado) {
  const r = A.entenderAgendamento({ texto, hoje: HOJE, empreendimentos: EMPREENDIMENTOS, clientes: CLIENTES });
  if (esperado.motivo) {
    checar(`agenda "${texto}" recusa`, !r.ok && esperado.motivo.test(r.motivo), JSON.stringify(r));
    return;
  }
  checar(`agenda "${texto}" entende`, r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const c = r.compromisso;
  for (const [k, v] of Object.entries(esperado)) {
    const real = k === 'cliente' ? c.cliente?.id ?? c.clienteNomeSolto : k === 'empreendimento' ? c.empreendimento?.id ?? null : c[k];
    checar(`agenda "${texto}" → ${k}`, real === v, `veio ${JSON.stringify(real)}, esperado ${JSON.stringify(v)} | ${JSON.stringify(c)}`);
  }
}
agenda('agenda visita com a Maria Souza sexta às 10 no estrelas', { dataISO: '2026-10-02', hora: '10:00', tipo: 'visita', cliente: 'lead-maria', empreendimento: 'estrelas' });
agenda('marca a assinatura amanhã 15h30', { dataISO: '2026-09-27', hora: '15:30', tipo: 'assinatura' });
agenda('ligar pro João dia 5 às 9', { dataISO: '2026-10-05', hora: '09:00', tipo: 'ligacao', cliente: 'lead-joao' });
agenda('às três da tarde de segunda, apresentar o connect', { dataISO: '2026-09-28', hora: '15:00', tipo: 'visita', empreendimento: 'connect', titulo: 'Apresentar · Village Connect I' });
agenda('entrega de documentos 10/10 às 11h', { dataISO: '2026-10-10', hora: '11:00', tipo: 'documentos' });
agenda('reunião com o Pedro quarta que vem ao meio-dia', { dataISO: '2026-09-30', hora: '12:00', tipo: 'reuniao', cliente: 'Pedro' });
agenda('agenda reunião às 14', { motivo: /faltou o dia/ });
agenda('visita dia 30', { motivo: /faltou o horário/ });
agenda('agenda uma visita', { motivo: /dia nem o horário/ });

// --------------------------------------------------- textos de captação (sem IA)
{
  const T = carregar(path.join(process.cwd(), 'src/lib/textosDeCaptacao.ts'));
  const desc = 'Piscina adulto e infantil\nEspaço gourmet\nPortaria 24h\nPlayground';
  for (let i = 0; i < 12; i++) {
    const sorteio = () => (i + 0.5) / 12;
    const msg = T.escreverAbordagem({ developmentName: 'Village das Estrelas', companyName: 'Canopus', descricao: desc, brokerName: 'Julio Pereira' }, sorteio);
    checar(`abordagem ${i}: até 600 caracteres`, msg.length <= 600, String(msg.length));
    checar(`abordagem ${i}: cita o empreendimento`, msg.includes('Village das Estrelas'));
    checar(`abordagem ${i}: traz os diferenciais da descrição`, msg.includes('Piscina adulto e infantil'));
    checar(`abordagem ${i}: convida para análise de crédito`, /análise de crédito/.test(msg));
    checar(`abordagem ${i}: no máximo 3 emojis`, (msg.match(/\p{Extended_Pictographic}/gu) ?? []).length <= 3);
    const c = T.escreverConvite({ developmentName: 'Village das Estrelas', detalhes: desc, brokerName: 'Julio Pereira', agency: 'Poup Imóveis' }, sorteio);
    checar(`convite ${i}: título até 55`, c.titulo.length <= 55, c.titulo);
    checar(`convite ${i}: 3 benefícios até 45`, c.beneficios.length === 3 && c.beneficios.every((b) => b.length <= 45), JSON.stringify(c.beneficios));
    checar(`convite ${i}: convite até 280`, c.convite.length <= 280);
    checar(`convite ${i}: sem link no convite`, !/https?:/.test(c.convite));
  }
  const semNada = T.escreverAbordagem({});
  checar('abordagem sem cadastro ainda sai inteira', semNada.length > 80 && /análise de crédito/.test(semNada));
  const longa = T.escreverAbordagem({ developmentName: 'X', descricao: Array.from({ length: 30 }, (_, k) => `Diferencial número ${k} do empreendimento`).join('\n') });
  checar('descrição enorme não estoura 600', longa.length <= 600, String(longa.length));
}

console.log(falhas.length ? falhas.map((f) => `  FALHA ${f}`).join('\n') : '');
console.log(`cérebro da LIA: ${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) process.exit(1);
