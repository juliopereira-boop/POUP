/**
 * TESTES DO RANKING — o que a tela mostra ao corretor.
 *
 * `npm run testar:ranking`
 *
 * As regras de quem pontua são do banco (`scripts/testar-ranking-db.sql`).
 * Aqui: os textos de cada situação, o que falta para participar, a
 * temporada, os formatos — o que decide se o corretor entende o ranking.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

function carregar(relativo) {
  const arquivo = path.join(process.cwd(), relativo);
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = (spec) => (spec === '@/lib/masks' ? carregar('src/lib/masks.ts') : require(spec));
  m._compile(js, arquivo);
  return m.exports;
}

const R = carregar('src/features/ranking/regras.ts');
const M = carregar('src/lib/masks.ts');

let ok = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}

// Situações: toda situação que o banco devolve tem texto, e as pendentes dizem o que fazer.
const DO_BANCO = ['conta', 'distratada', 'futura', 'dados_incompletos', 'sem_comprovante', 'duplicada', 'em_disputa', 'acima_do_teto', 'invalidada'];
for (const s of DO_BANCO) {
  const t = R.textoDaSituacao(s);
  checar(`situação "${s}" tem rótulo`, Boolean(t.rotulo) && t.rotulo !== s);
  if (t.tom === 'pendente') checar(`situação pendente "${s}" diz o que fazer`, Boolean(t.acao));
}
checar('só "conta" é ok', DO_BANCO.filter((s) => R.textoDaSituacao(s).tom === 'ok').join() === 'conta');
checar('situação desconhecida não quebra', R.textoDaSituacao('nova_regra').rotulo === 'nova_regra');
checar('o teto do texto é o do banco (20)', /20/.test(R.textoDaSituacao('acima_do_teto').acao));
const resumo = R.resumoDasSituacoes(['conta', 'sem_comprovante', 'sem_comprovante', 'em_disputa']);
checar('resumo conta por situação', resumo.conta === 1 && resumo.sem_comprovante === 2 && resumo.em_disputa === 1);

// Participar: a mesma exigência do banco.
const completo = { fullName: 'Ana Souza', cpf: '529.982.247-25', creci: '123', cidade: 'São Luís', uf: 'MA' };
checar('perfil completo pode participar', R.faltaParaParticipar(completo, M.isValidCPF).length === 0);
checar('sem CRECI e sem cidade: aponta os dois', R.faltaParaParticipar({ ...completo, creci: ' ', cidade: null }, M.isValidCPF).join() === 'CRECI,Cidade');
checar('CPF inválido conta como falta', R.faltaParaParticipar({ ...completo, cpf: '111.111.111-11' }, M.isValidCPF).includes('CPF'));
checar('sem perfil', R.faltaParaParticipar(null, M.isValidCPF).join() === 'Perfil');

// Temporada.
const dia = (a, m, d) => new Date(a, m - 1, d, 15, 0);
checar('nome da temporada do mês', R.nomeDaTemporada('mes', dia(2026, 9, 25)) === 'Temporada de Setembro');
checar('nome da temporada do ano', R.nomeDaTemporada('ano', dia(2026, 9, 25)) === 'Temporada 2026');
checar('25/09: faltam 6 dias (25 a 30)', R.diasAteOFim('mes', dia(2026, 9, 25)) === 6);
checar('30/09: último dia', R.textoDoPrazo('mes', dia(2026, 9, 30)) === 'Último dia da temporada');
checar('fevereiro de ano bissexto', R.diasAteOFim('mes', dia(2028, 2, 1)) === 29);
checar('o ano até 31/12', R.diasAteOFim('ano', dia(2026, 12, 30)) === 2);

// Formatos.
checar('VGV em milhões', R.vgvCurto(1234567) === 'R$ 1,2 mi');
checar('VGV em mil', R.vgvCurto(750000) === 'R$ 750 mil');
checar('VGV pequeno', R.vgvCurto(900) === 'R$ 900');
checar('iniciais', R.iniciais('Ana Souza') === 'AS' && R.iniciais('Bruno') === 'B' && R.iniciais('  ') === '?');
const paleta = ['a', 'b', 'c'];
checar('cor estável por pessoa', R.corDoParticipante('x-1', paleta) === R.corDoParticipante('x-1', paleta));
checar('rótulo da cidade', R.rotuloDoEscopo('cidade', 'São Luís', 'MA') === 'São Luís/MA' && R.rotuloDoEscopo('brasil', null, null) === 'Brasil');
checar('ordinal', R.ordinal(3) === '3º');

console.log(`${ok} verificações passaram.`);
if (falhas.length) {
  console.error(`${falhas.length} FALHARAM:\n  ✗ ${falhas.join('\n  ✗ ')}`);
  process.exit(1);
}
