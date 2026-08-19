/**
 * QUANTO A LIA CUSTA — e se cabe na mensalidade.
 *
 * `npm run custo:lia`
 *
 * ===========================================================================
 * POR QUE ISTO VIVE NO REPOSITÓRIO
 * ===========================================================================
 * Porque o custo de LLM não é um número, é uma CONSEQUÊNCIA do desenho — e o
 * desenho muda. Acrescentar um campo engorda o bloco global; mexer no intervalo
 * mínimo muda o número de chamadas; trocar de modelo muda tudo. Deixar a conta
 * numa conversa antiga significa descobrir o estrago na fatura.
 *
 * As constantes abaixo são MEDIDAS, não chutadas: os blocos vêm do tamanho real
 * dos textos que a Edge Function monta. Depois de mexer no prompt, rode de novo.
 *
 * ===========================================================================
 * O QUE ESTE MODELO NÃO SABE
 * ===========================================================================
 * A contagem de tokens é estimada por caracteres (~3,3 por token em português
 * acentuado), não medida pela API. E `taxaGatilho` — quanto do que é falado
 * realmente contém dado — é a premissa mais frágil daqui: veio de uma conversa
 * de exemplo, não de uso real. Subiu de 0,40 para 0,45 quando o gatilho passou
 * a reconhecer também os NOMES do catálogo do corretor: ele aprova mais
 * janelas de propósito, porque estava descartando "é o connect" — a frase que
 * identifica o empreendimento, o campo que puxa empresa, gerente e comissão.
 *
 * A Edge Function já devolve o `uso` real de cada chamada (inclusive quanto foi
 * lido da cache). Quando houver uso de verdade, troque a estimativa pelo
 * medido: é o mesmo cálculo, com números melhores.
 */
const CHARS_TOKEN = 3.3;                 // portugues acentuado

// medidos rodando as funcoes do repositorio
const BLOCO_GLOBAL   = Math.round(9900 / CHARS_TOKEN);   // instrucoes + 28 campos
const BLOCO_CORRETOR = Math.round(1300 / CHARS_TOKEN);   // catalogo + data
const FERRAMENTA     = 350;                              // schema da tool
const ESTADO_CHEIO   = 14 * 16;                          // chave:valor dos essenciais
const FALA_MIN       = 220;                              // tokens de transcricao por minuto falado
/*
 * JANELA DE CONTEXTO — o bloco ANTES que vai junto em cada rodada parcial.
 *
 * 1.200 caracteres, o valor de `JANELA_CONTEXTO_CHARS` no LiaProvider. Ele
 * existe porque a versão sem contexto nenhum simplesmente NAO CAPTURAVA: o
 * modelo recebia "duzentos e dez mil" solto e obedecia a regra de nao inventar
 * campo para numero sem dono. Este e o custo de a LIA funcionar, e ele aparece
 * aqui embaixo, na linha "agora".
 */
const CONTEXTO       = Math.round(1200 / CHARS_TOKEN);

const PRECO = {
  'claude-haiku-4-5': { in: 1.00, out:  5.00 },
  'claude-sonnet-5':  { in: 3.00, out: 15.00 },
};
const W = 1.25, R = 0.10;   // cache: escrita 1,25x, leitura 0,1x

function custo(tokIn, tokOut, modelo) {
  const p = PRECO[modelo];
  return (tokIn / 1e6) * p.in + (tokOut / 1e6) * p.out;
}

function sessao({ minutos, intervaloS, taxaGatilho, globalJaQuente }) {
  const janelas = Math.round((minutos * 60) / intervaloS);
  const parciais = Math.round(janelas * taxaGatilho);   // o gatilho corta o resto
  const trechoPorChamada = (minutos * FALA_MIN) / Math.max(parciais, 1);

  // --- rodadas parciais (Haiku) ---
  // bloco global: em escala ele ja esta quente (outro corretor pagou a escrita)
  const globalTok = globalJaQuente
    ? BLOCO_GLOBAL * R * parciais
    : BLOCO_GLOBAL * W + BLOCO_GLOBAL * R * (parciais - 1);
  // bloco do corretor + ferramenta: escritos uma vez na sessao, lidos depois
  const corretorTok = (BLOCO_CORRETOR + FERRAMENTA) * W + (BLOCO_CORRETOR + FERRAMENTA) * R * (parciais - 1);
  // mensagem: estado (cresce ate os 14) + contexto ANTES + trecho novo AGORA.
  // Media do estado = metade. O contexto so nao existe na primeira rodada.
  const msgTok = (ESTADO_CHEIO / 2 + CONTEXTO + trechoPorChamada + 60) * parciais;
  // saida: 0 a 2 campos por rodada, ~55 tokens cada + envelope
  const saidaParcial = 100 * parciais;

  const parcialUsd = custo(globalTok + corretorTok + msgTok, saidaParcial, 'claude-haiku-4-5');

  // --- fecho (Sonnet, conversa inteira, sem filtro) ---
  const fechoIn = BLOCO_GLOBAL * W + (BLOCO_CORRETOR + FERRAMENTA) * W
                + ESTADO_CHEIO + minutos * FALA_MIN + 60;
  const fechoUsd = custo(fechoIn, 800, 'claude-sonnet-5');

  return { janelas, parciais, usd: parcialUsd + fechoUsd, parcialUsd, fechoUsd };
}

const MIN = 8;   // minutos EFETIVAMENTE falados numa negociacao de ~10 min

console.log('blocos medidos: global ~' + BLOCO_GLOBAL + ' tok | corretor ~' + BLOCO_CORRETOR + ' tok\n');
console.log('POR SIMULACAO (' + MIN + ' min de fala)\n');
// intervaloS: 3,5 s no código (src/features/lia/LiaProvider.tsx). Foi para 12s
// numa primeira passada de corte de custo e voltou: refeita a conta depois de
// cache + gatilho + Haiku, o intervalo custava só R$ 0,21/simulação a mais em
// troca de manter a sensação de "ao vivo" — não valia a troca.
const antes = 2.134;   // medido no desenho anterior (sem cache/gatilho/Haiku)
const cenarios = [
  ['antes (desenho anterior)', null],
  ['agora, 1o corretor do dia (cache fria)', { minutos:MIN, intervaloS:3.5, taxaGatilho:0.45, globalJaQuente:false }],
  ['agora, cache global quente (o normal)',  { minutos:MIN, intervaloS:3.5, taxaGatilho:0.45, globalJaQuente:true }],
];
const base = {};
for (const [nome, cfg] of cenarios) {
  if (!cfg) { console.log(nome.padEnd(40) + ('$'+antes.toFixed(3)).padStart(9)); base[nome]=antes; continue; }
  const r = sessao(cfg);
  base[nome] = r.usd;
  console.log(nome.padEnd(40) + ('$'+r.usd.toFixed(3)).padStart(9) +
    `   (${r.parciais} parciais de ${r.janelas} janelas + 1 fecho | parciais $${r.parcialUsd.toFixed(3)}, fecho $${r.fechoUsd.toFixed(3)})`);
}
const agora = base['agora, cache global quente (o normal)'];
console.log(`\nreducao: ${(antes/agora).toFixed(0)}x mais barato\n`);

// ---------------------------------------------------------------- mensalidade
const BRL_USD = 5.40;                 // AJUSTE se o cambio estiver outro
/*
 * A LIA e exclusiva do PRO, entao a conta e contra a mensalidade do PRO — e nao
 * contra a media dos planos. Quem paga Start ou Intermed nao gera custo de LLM
 * nenhum: o botao da LIA nem existe para eles (`Lia.tsx`).
 */
const MENSALIDADE = 89.90;
const STRIPE = MENSALIDADE * 0.0399 + 0.39;
const INFRA_FIXA_USD = 45;            // Supabase Pro 25 + Vercel 20

console.log('MARGEM NO PRO, R$ ' + MENSALIDADE.toFixed(2).replace('.', ',') +
            ' (cambio R$ ' + BRL_USD.toFixed(2) + '/US$)\n');
console.log('usuarios | sims/mes | LIA R$ | Stripe R$ | infra R$ | custo R$ | LUCRO R$ | margem');
console.log('---------|----------|--------|-----------|----------|----------|----------|-------');
for (const u of [10, 30, 80, 200, 400]) {
  for (const sims of [15, 30]) {
    const lia = agora * sims * BRL_USD;
    const infra = (INFRA_FIXA_USD / u) * BRL_USD;
    const total = lia + STRIPE + infra;
    const lucro = MENSALIDADE - total;
    console.log(
      String(u).padStart(8) + ' | ' + String(sims).padStart(8) + ' | ' +
      lia.toFixed(2).padStart(6) + ' | ' + STRIPE.toFixed(2).padStart(9) + ' | ' +
      infra.toFixed(2).padStart(8) + ' | ' + total.toFixed(2).padStart(8) + ' | ' +
      lucro.toFixed(2).padStart(8) + ' | ' + (100*lucro/MENSALIDADE).toFixed(0).padStart(4) + '%');
  }
}
