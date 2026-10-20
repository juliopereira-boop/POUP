/**
 * O POUP SÓ LÊ O UAU — PROVA AUTOMÁTICA.
 *
 * `npm run testar:uau-leitura`
 *
 * Decisão do dono do POUP: a integração com o UAU (o ERP da Canopus) serve
 * APENAS para sinalizar disponibilidade e mostrar valor. Nenhuma edição, de
 * nenhum tipo. O controlador `Espelho` do UAU tem rotas que alteram o ERP
 * (`AlterarStatusUnidade`, `AtualizarCamposCustomizados`,
 * `AlterarDataEntregaChavesUnidade`) — e a credencial de teste é a do ALPHA,
 * que pode ter permissão de escrita. A garantia, então, está no código das
 * duas Edge Functions, e este teste confere:
 *
 *   1. a lista de rotas permitidas é EXATAMENTE a de consulta;
 *   2. toda chamada ao UAU passa por `uauPost`, com rota fixa no código (nada
 *      vindo do aplicativo vira rota);
 *   3. a segunda camada recusa rota de escrita mesmo se ela entrar na lista;
 *   4. as duas funções têm a mesma trava;
 *   5. o WHERE que vai para o SQL do UAU só leva número e código validado.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

const FUNCOES = ['supabase/functions/uau-disponibilidade-sync/index.ts', 'supabase/functions/uau-disponibilidade/index.ts'];
const LEITURA = ['Autenticador/AutenticarUsuario', 'Espelho/BuscaUnidadesDeAcordoComWhere', 'Espelho/BuscaUnidadesDeAcordoComWhereDetalhado'];
const ESCRITA_DO_UAU = [
  'Espelho/AlterarStatusUnidade',
  'Espelho/AtualizarCamposCustomizados',
  'Espelho/AlterarDataEntregaChavesUnidade',
  'Venda/GravarVenda',
  'Venda/CancelarVenda',
  'Espelho/ReservarUnidade',
  'Pessoas/IncluirPessoa',
  'Espelho/ExcluirReserva',
];

let ok = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}

/** Pega um trecho do arquivo (de `inicio` até o fim do bloco de chaves). */
function trecho(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  if (i < 0) return null;
  let nivel = 0;
  for (let j = fonte.indexOf('{', i); j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  return null;
}

const travas = [];
for (const arquivo of FUNCOES) {
  const fonte = readFileSync(arquivo, 'utf8');
  const nome = path.basename(path.dirname(arquivo));

  // 1. A lista.
  const lista = /const ROTAS_DE_LEITURA = new Set\(\[([\s\S]*?)\]\)/.exec(fonte)?.[1] ?? '';
  const rotas = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  checar(`${nome}: a lista tem só as 3 rotas de consulta`, JSON.stringify(rotas) === JSON.stringify(LEITURA), JSON.stringify(rotas));

  // 2. Toda chamada ao UAU passa por uauPost, com rota literal da lista.
  const chamadas = [...fonte.matchAll(/uauPost\(\s*([^,]+),/g)].map((m) => m[1].trim());
  const usos = chamadas.filter((c) => !c.startsWith('rota:'));
  checar(`${nome}: chama o UAU`, usos.length > 0);
  for (const c of usos) {
    const literal = /^'([^']+)'$/.exec(c)?.[1];
    checar(`${nome}: rota fixa no código (${c})`, Boolean(literal), '— rota não pode vir de variável');
    checar(`${nome}: rota ${c} está na lista`, LEITURA.includes(literal ?? ''));
  }
  // Um fetch só (o de `fetchComPrazo`, usado só por `uauPost`): nenhum caminho por fora.
  checar(`${nome}: um único fetch no arquivo`, (fonte.match(/\bfetch\(/g) ?? []).length === 1);
  checar(`${nome}: fetchComPrazo só dentro de uauPost`, (fonte.match(/fetchComPrazo\(/g) ?? []).length === 2);
  checar(`${nome}: a trava roda antes da conexão`, /async function uauPost[\s\S]{0,120}if \(!rotaPermitida\(rota\)\) throw/.test(fonte));

  // 3. A segunda camada, executada de verdade.
  const codigo = [
    /const ROTA_DE_ESCRITA =[\s\S]*?;\n/.exec(fonte)?.[0],
    trecho(fonte, 'function rotaPermitida'),
  ].join('\n');
  travas.push(codigo);
  const js = ts.transpileModule(`${codigo}\nthis.rotaPermitida = rotaPermitida;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const extra of [[], ESCRITA_DO_UAU]) {
    const ctx = { ROTAS_DE_LEITURA: new Set([...LEITURA, ...extra]) };
    vm.createContext(ctx);
    vm.runInContext(js, ctx);
    const sufixo = extra.length ? ' (mesmo se alguém a puser na lista)' : '';
    for (const r of LEITURA) checar(`${nome}: consulta ${r} permitida${sufixo}`, ctx.rotaPermitida(r) === true);
    for (const r of ESCRITA_DO_UAU) checar(`${nome}: escrita ${r} recusada${sufixo}`, ctx.rotaPermitida(r) === false);
  }

  // 5. O WHERE só leva o que foi validado.
  checar(`${nome}: o código da obra é validado (^[A-Z0-9]{1,10}$)`, fonte.includes('const OBRA = /^[A-Z0-9]{1,10}$/;'));
  const wheres = [...fonte.matchAll(/`WHERE ([^`]*)`/g)].map((m) => m[1]);
  for (const w of wheres) {
    const interpolados = [...w.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1].trim());
    for (const v of interpolados) {
      const seguro =
        /^Number\(/.test(v) || /^o\.(empresa|obra)$/.test(v) || /^(empresa|obra)$/.test(v) || /^codigosFora\.join/.test(v);
      checar(`${nome}: WHERE interpola só valor validado (${v})`, seguro);
    }
  }
}

// 4. As duas funções com a MESMA trava.
checar('as duas funções têm a mesma trava', travas.length === 2 && travas[0] === travas[1]);

// 5b. O WHERE da função do cron, executado: aspas e SQL não passam.
{
  const fonte = readFileSync(FUNCOES[0], 'utf8');
  const codigo = ['const OBRA = /^[A-Z0-9]{1,10}$/;', trecho(fonte, 'function whereDaObra')].join('\n');
  const js = ts.transpileModule(`${codigo}\nthis.whereDaObra = whereDaObra;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  const recusa = (f) => {
    try {
      f();
      return false;
    } catch {
      return true;
    }
  };
  checar('WHERE certo', ctx.whereDaObra(1, '259V', null) === "WHERE Empresa_unid = 1 AND Obra_unid = '259V'");
  checar('WHERE recusa aspas', recusa(() => ctx.whereDaObra(1, "259V' OR 1=1 --", null)));
  checar('WHERE recusa ponto e vírgula', recusa(() => ctx.whereDaObra(1, '259V;UPDATE', null)));
  checar('WHERE recusa empresa não inteira', recusa(() => ctx.whereDaObra('1 OR 1=1', '259V', null)));
  checar('WHERE recusa código de status não numérico', recusa(() => ctx.whereDaObra(1, '259V', ['1); DELETE FROM x; --'])));
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
