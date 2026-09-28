/**
 * TESTES DA TELA PLANOS — sempre disponível, com downgrade e cancelamento.
 *
 * `npm run testar:tela-planos`
 *
 * 1. As regras (`src/features/planos/acoes.ts`): a situação da conta, o botão
 *    de cada plano, o que muda ao descer para o Start, o motivo obrigatório.
 * 2. Os caminhos até a tela: o aviso do teste no início, o Perfil, as
 *    Configurações e os bloqueios do Pro levam a `/(app)/planos` — e nada
 *    mais manda quem tem acesso para o paywall "de upgrade".
 * 3. O motivo gravado no app é o mesmo aceito pelo banco.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

const STUBS = {
  './store': { liaDisponivel: true },
  './friendlyError': { friendlyError: (e) => String(e) },
};
const ALIAS = {
  '@/data/types': 'src/data/types.ts',
  '../plans': 'src/features/plans.ts',
};

function carregar(relativo) {
  const arquivo = path.join(process.cwd(), relativo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = (spec) => {
    if (STUBS[spec]) return STUBS[spec];
    if (ALIAS[spec]) return carregar(ALIAS[spec]);
    return require(spec);
  };
  m._compile(js, arquivo);
  return m.exports;
}

const A = carregar('src/features/planos/acoes.ts');
const P = carregar('src/features/plans.ts');
const ler = (f) => readFileSync(path.join(process.cwd(), f), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}

const AGORA = Date.parse('2026-09-28T12:00:00Z');
const DAQUI_5_DIAS = new Date(AGORA + 5 * 86400000).toISOString();
const ONTEM = new Date(AGORA - 86400000).toISOString();
const sub = (extra) => ({
  status: 'active',
  tier: 'pro',
  plan: null,
  storageLimitBytes: 0,
  currentPeriodEnd: DAQUI_5_DIAS,
  cancelAtPeriodEnd: false,
  billingProvider: 'stripe',
  trialStartedAt: null,
  ...extra,
});

// ------------------------------------------------ 1. situação da conta
const teste = A.estadoDaConta(sub({ status: 'trialing', tier: 'start', billingProvider: null }), AGORA);
checar('teste no prazo = teste', teste.situacao === 'teste');
checar('teste vencido = sem plano', A.estadoDaConta(sub({ status: 'trialing', currentPeriodEnd: ONTEM }), AGORA).situacao === 'sem_plano');
checar('sem assinatura = sem plano', A.estadoDaConta(null, AGORA).situacao === 'sem_plano');
checar('cancelada = sem plano', A.estadoDaConta(sub({ status: 'canceled' }), AGORA).situacao === 'sem_plano');
const proPago = A.estadoDaConta(sub({}), AGORA);
checar('Pro pelo Stripe = paga', proPago.situacao === 'paga' && proPago.tier === 'pro');
checar('Pro pela loja = paga', A.estadoDaConta(sub({ billingProvider: 'apple' }), AGORA).situacao === 'paga');
checar('pagamento atrasado continua paga', A.estadoDaConta(sub({ status: 'past_due' }), AGORA).situacao === 'paga');
const concedida = A.estadoDaConta(sub({ billingProvider: null }), AGORA);
checar('ativa sem cobrança = concedida', concedida.situacao === 'concedida');
checar('cancelamento marcado aparece', A.estadoDaConta(sub({ cancelAtPeriodEnd: true }), AGORA).cancelaNoFim === true);

// ------------------------------------------------ o botão de cada plano
const startPago = A.estadoDaConta(sub({ tier: 'start' }), AGORA);
const acao = (plano, estado) => A.acaoDoPlano(plano, estado);
checar('teste: assinar o Start', acao('start', teste).tipo === 'assinar' && acao('start', teste).rotulo === 'Assinar o Start');
checar('teste: assinar o Pro', acao('pro', teste).tipo === 'assinar' && acao('pro', teste).rotulo === 'Assinar o Pro');
checar('sem plano: assinar os dois', ['start', 'pro'].every((p) => acao(p, A.estadoDaConta(null)).tipo === 'assinar'));
checar('Start pago: Start é o atual', acao('start', startPago).tipo === 'atual');
checar('Start pago: upgrade para o Pro', acao('pro', startPago).tipo === 'upgrade' && /upgrade/i.test(acao('pro', startPago).rotulo));
checar('Pro pago: Pro é o atual', acao('pro', proPago).tipo === 'atual' && acao('pro', proPago).rotulo === 'Seu plano atual');
checar('Pro pago: mudar para o Start (downgrade)', acao('start', proPago).tipo === 'downgrade' && acao('start', proPago).rotulo === 'Mudar para o Start');
checar('concedida no Pro: Pro atual, Start para assinar', acao('pro', concedida).tipo === 'atual' && acao('start', concedida).tipo === 'assinar');

// ------------------------------------------------ cabeçalho
checar('teste mostra os dias', /Faltam 5 dias/.test(A.resumoDaConta(teste, 5).detalhe));
checar('teste: último dia', /Último dia/.test(A.resumoDaConta(teste, 1).detalhe));
checar('Pro pago: título', A.resumoDaConta(proPago, null).titulo === 'Plano Pro');
checar('cancelado: diz até quando vale', /fim do período/.test(A.resumoDaConta(A.estadoDaConta(sub({ cancelAtPeriodEnd: true }), AGORA), null).detalhe));
checar('concedida: sem cobrança', /sem cobrança/.test(A.resumoDaConta(concedida, null).detalhe));
checar('sem plano: pede para escolher', A.resumoDaConta(A.estadoDaConta(null), null).titulo === 'Sem plano ativo');

// ------------------------------------------------ o que muda
const soPro = P.PLAN_FEATURES.filter((f) => f.includedIn.includes('pro') && !f.includedIn.includes('start')).map((f) => f.label);
checar('o que sai = os recursos só do Pro', JSON.stringify(A.recursosQueSaem('pro', 'start')) === JSON.stringify(soPro), JSON.stringify(A.recursosQueSaem('pro', 'start')));
checar('o que sai não está vazio', soPro.length > 0);
checar('Vendas e Ranking saem', soPro.some((l) => /Vendas/.test(l)) && soPro.some((l) => /Ranking/.test(l)));
checar('do Start para o Pro não se perde nada', A.recursosQueSaem('start', 'pro').length === 0);
const descer = A.oQueMuda('pro', 'start');
checar('descer: diz que as vendas ficam salvas', descer.fica.some((t) => /vendas/i.test(t) && /salvas/.test(t)));
const cancelar = A.oQueMuda('pro', 'cancelar');
checar('cancelar: acesso vai até o fim do período', cancelar.perde.some((t) => /fim do período/.test(t)));
checar('cancelar: dados ficam salvos', cancelar.fica.some((t) => /salvos/.test(t)));

// ------------------------------------------------ motivo obrigatório
checar('sem motivo não segue', A.erroDoMotivo(null, '') !== null);
checar('motivo da lista segue', A.erroDoMotivo('caro', '') === null);
checar('"Outro" sem explicar não segue', A.erroDoMotivo('outro', '  ') !== null);
checar('"Outro" explicado segue', A.erroDoMotivo('outro', 'Mudei de ramo') === null);
checar('comentário longo não segue', A.erroDoMotivo('caro', 'x'.repeat(501)) !== null);
checar('7 motivos, todos com rótulo', A.MOTIVOS.length === 7 && A.MOTIVOS.every((m) => m.rotulo.length > 5));

// ------------------------------------------------ 3. mesmos motivos do banco
const migration = ler('supabase/migrations/20260928180000_mudancas_de_plano.sql');
const doBanco = /motivo text not null check \(motivo in \(([^)]*)\)/.exec(migration)?.[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1)) ?? [];
checar('motivos do app = motivos do banco', JSON.stringify([...doBanco].sort()) === JSON.stringify(A.MOTIVOS.map((m) => m.chave).sort()), doBanco.join());
checar('banco exige explicação no "outro"', /motivo <> 'outro' or char_length\(btrim/.test(migration));

// ------------------------------------------------ 2. caminhos até a tela
const inicio = ler('app/(app)/index.tsx');
checar('aviso do teste leva a Planos', /router\.push\('\/\(app\)\/planos'/.test(inicio) && /Toque para ver os planos/.test(inicio));
checar('Perfil tem "Meu plano" e leva a Planos', /MEU PLANO/.test(ler('app/(app)/perfil.tsx')) && /\/\(app\)\/planos/.test(ler('app/(app)/perfil.tsx')));
checar('Configurações tem a linha Planos', /label="Planos"/.test(ler('app/(app)/configuracoes.tsx')) && /\/\(app\)\/planos/.test(ler('app/(app)/configuracoes.tsx')));
checar('bloqueio do Pro leva a Planos', /\/\(app\)\/planos/.test(ler('src/components/ProFeatureLock.tsx')));
checar('rota registrada no Stack', /name="planos"/.test(ler('app/(app)/_layout.tsx')));
for (const f of ['app/(app)/index.tsx', 'app/(app)/ranking.tsx', 'app/(app)/relatorios/[id].tsx', 'src/components/ProFeatureLock.tsx', 'app/(app)/configuracoes.tsx', 'app/(app)/perfil.tsx']) {
  checar(`${f} não manda para o paywall de upgrade`, !/paywall\?upgrade=1/.test(ler(f)));
}
const paywall = ler('app/paywall.tsx');
checar('paywall manda quem tem acesso e upgrade=1 para Planos', /upgrade === '1' \? '\/\(app\)\/planos'/.test(paywall));

// ------------------------------------------------ a tela
const tela = ler('app/(app)/planos.tsx');
checar('downgrade abre o fluxo com motivo', /acao\.tipo === 'downgrade'\) return setFluxo\('start'\)/.test(tela));
checar('cancelar abre o fluxo com motivo', /setFluxo\('cancelar'\)/.test(tela));
checar('grava o motivo antes da troca', tela.indexOf('registrarMudancaDePlano') < tela.indexOf("cancelarAssinatura() : mudarDePlano('start')"));
checar('fecha a janela antes de abrir o portal/loja', /depoisDeFecharJanela/.test(tela));
const fluxo = ler('src/components/planos/FluxoDeMudanca.tsx');
checar('fluxo valida o motivo', /erroDoMotivo\(motivo, comentario\)/.test(fluxo));
checar('fluxo oferece ficar no plano nos dois passos', (fluxo.match(/label=\{ficar\}/g) ?? []).length >= 2);

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
