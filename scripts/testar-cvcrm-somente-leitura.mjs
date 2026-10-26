/**
 * O POUP SÓ LÊ O CV CRM — PROVA AUTOMÁTICA.
 *
 * `npm run testar:cvcrm-leitura`
 *
 * Decisão do dono do POUP: a integração com o CV serve APENAS para sinalizar
 * disponibilidade. Nenhuma edição, de nenhum tipo. O CV tem rotas que alteram
 * a unidade (`/cadastros/empreendimentos/unidades/bloquear`), cadastram
 * webhook ou reserva — e o token do POUP é de um usuário administrativo. A
 * garantia, então, está no código das duas Edge Functions, e este teste
 * confere:
 *
 *   1. a lista de caminhos permitidos é EXATAMENTE a de leitura (3);
 *   2. só existe um `fetch`, só com `method: 'GET'`, e todo pedido passa por
 *      `cvGet`, com caminho fixo no código;
 *   3. a segunda camada recusa caminho de escrita mesmo se ele entrar na lista;
 *   4. os parâmetros também são lista fechada;
 *   5. o token (o de cada empresa, que vem do Vault) só vai para *.cvcrm.com.br;
 *   6. nome de cliente, documento e motivo de bloqueio nunca são lidos;
 *   7. as duas funções têm o MESMO bloco do CV.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

const FUNCOES = ['supabase/functions/cvcrm-disponibilidade-sync/index.ts', 'supabase/functions/cvcrm-disponibilidade/index.ts'];
const LEITURA = [
  '/api/v1/cadastros/empreendimentos',
  '/api/v1/comercial/mapadisponibilidade/63',
  '/api/v1/cvdw/unidades/situacao',
];
const FORA_DA_LISTA = [
  // O detalhe do empreendimento traz o nome de quem reservou: fora.
  '/api/v1/cadastros/empreendimentos/63',
  '/api/v1/cadastros/empreendimentos/63/unidades/35503',
  '/api/v1/cvdw/unidades/precos',
  '/api/v1/comercial/mapadisponibilidade/abc',
  '/api/v1/comercial/mapadisponibilidade/63/extra',
  '/api/v1/comercial/mapadisponibilidade/63?x=1',
  '/api/v1/cadastros/empreendimentos/',
];
const ESCRITA_DO_CV = [
  '/api/v1/cadastros/empreendimentos/unidades/bloquear',
  '/api/v1/cadastros/empreendimentos/unidades/desbloquear',
  '/api/v1/integracoes/webhooks',
  '/api/v3/auth/token',
  '/api/v1/comercial/reservas/cadastrar',
  '/api/v1/comercial/reservas/alterar',
  '/api/v1/comercial/vendas',
  '/api/v1/cadastros/unidades/excluir',
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

function rodar(codigo, nomes, ctx = {}) {
  const js = ts.transpileModule(`${codigo}\n${nomes.map((n) => `this.${n} = ${n};`).join('\n')}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return ctx;
}

const blocos = [];
for (const arquivo of FUNCOES) {
  const fonte = readFileSync(arquivo, 'utf8');
  const nome = path.basename(path.dirname(arquivo));

  // 1. A lista, como está escrita.
  const lista = /const ROTAS_DE_LEITURA: RegExp\[\] = \[([\s\S]*?)\];/.exec(fonte)?.[1] ?? '';
  const rotas = [...lista.matchAll(/\/(\^[^\n]*?\$)\//g)].map((m) => m[1]);
  checar(`${nome}: a lista tem só os 3 caminhos de leitura`, rotas.length === 3, JSON.stringify(rotas));

  // 2. Um fetch só, GET, dentro de cvGet; nenhum outro verbo no arquivo.
  checar(`${nome}: um único fetch no arquivo`, (fonte.match(/\bfetch\(/g) ?? []).length === 1);
  const cvGet = trecho(fonte, 'async function cvGet') ?? '';
  checar(`${nome}: o fetch está dentro de cvGet`, /\bfetch\(/.test(cvGet));
  checar(`${nome}: o fetch é GET`, /method: 'GET'/.test(cvGet));
  checar(`${nome}: nenhum POST/PUT/PATCH/DELETE`, !/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(fonte));
  checar(`${nome}: a trava roda antes da conexão`, /async function cvGet[\s\S]{0,200}if \(!rotaPermitida\(caminho\)\) throw/.test(fonte));
  // cvGet(cred, '<caminho>', ...): o caminho é o 2º argumento.
  const chamadas = [...fonte.matchAll(/cvGet\(\s*([^,]+),\s*([^,]+),/g)]
    .filter((m) => !m[1].trim().startsWith('cred:'))
    .map((m) => m[2].trim());
  checar(`${nome}: chama o CV`, chamadas.length > 0);
  for (const c of chamadas) {
    const literal = /^['`](\/api\/v1\/[a-z/]+(?:\$\{empreendimento\})?)['`]$/.exec(c);
    checar(`${nome}: caminho fixo no código (${c})`, Boolean(literal), '— caminho não pode vir do pedido');
  }

  // 3. As duas travas, executadas de verdade.
  const codigoDaTrava = [
    /const ROTAS_DE_LEITURA: RegExp\[\] = \[[\s\S]*?\];\n/.exec(fonte)?.[0],
    /const ROTA_DE_ESCRITA =[\s\S]*?;\n/.exec(fonte)?.[0],
    trecho(fonte, 'function rotaPermitida'),
  ].join('\n');
  const t = rodar(codigoDaTrava, ['rotaPermitida', 'ROTAS_DE_LEITURA']);
  for (const r of LEITURA) checar(`${nome}: leitura ${r} permitida`, t.rotaPermitida(r) === true);
  for (const r of FORA_DA_LISTA) checar(`${nome}: fora da lista ${r} recusado`, t.rotaPermitida(r) === false);
  for (const r of ESCRITA_DO_CV) checar(`${nome}: escrita ${r} recusada`, t.rotaPermitida(r) === false);
  // Mesmo se alguém puser "tudo" na lista, a segunda camada barra a escrita.
  t.ROTAS_DE_LEITURA.push(/.*/);
  for (const r of ESCRITA_DO_CV) checar(`${nome}: escrita ${r} recusada (mesmo com a lista aberta)`, t.rotaPermitida(r) === false);

  // 4. Parâmetros: lista fechada.
  const params = /const PARAMETROS = new Set\(\[([\s\S]*?)\]\)/.exec(fonte)?.[1] ?? '';
  const nomes = [...params.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  checar(
    `${nome}: só os parâmetros de leitura`,
    JSON.stringify(nomes) ===
      JSON.stringify(['a_partir_data_referencia', 'idbloco', 'idetapa', 'limitePagina', 'pag', 'pagina', 'registros_por_pagina'].sort()),
    JSON.stringify(nomes),
  );
  checar(`${nome}: parâmetro fora da lista é recusado`, /if \(!PARAMETROS\.has\(k\)\) throw/.test(cvGet));

  // 5. O token só vai para *.cvcrm.com.br — e o fetch usa a URL da credencial por baseDoCv.
  checar(`${nome}: o fetch monta a URL por baseDoCv(cred.url)`, /fetch\(`\$\{baseDoCv\(cred\.url\)\}/.test(cvGet));
  checar(`${nome}: o token vem da credencial da empresa, não de secret da função`, !/CVCRM_(URL|EMAIL|TOKEN)/.test(fonte));
  const base = rodar(trecho(fonte, 'function baseDoCv'), ['baseDoCv']);
  const tenta = (url) => {
    try {
      return base.baseDoCv(url);
    } catch {
      return null;
    }
  };
  checar(`${nome}: aceita o domínio do CV`, tenta('https://canopus.cvcrm.com.br/api/v1/') === 'https://canopus.cvcrm.com.br');
  checar(`${nome}: recusa outro domínio`, tenta('https://exemplo.com') === null);
  checar(`${nome}: recusa domínio que só começa igual`, tenta('https://canopus.cvcrm.com.br.exemplo.com') === null);
  checar(`${nome}: recusa http sem TLS`, tenta('http://canopus.cvcrm.com.br') === null);

  // 6. Dado de pessoa: nunca lido.
  checar(
    `${nome}: não lê documento, motivo de bloqueio, cliente nem quem modificou`,
    !/\.(documento_bloqueio|motivo_bloqueio|data_bloqueio|modificou|cliente|nome_cliente|cpf)\b/.test(fonte),
  );
  const leitura = trecho(fonte, 'function paraLeitura') ?? '';
  const campos = [...leitura.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
  checar(
    `${nome}: a leitura do mapa guarda só identificação e situação`,
    JSON.stringify(campos) === JSON.stringify(['bloco', 'bloco_id', 'etapa', 'etapa_nome', 'nome', 'situacao', 'unidade']),
    JSON.stringify(campos),
  );

  // 7. O bloco do CV (do `env` ao fim de `lerMapa`).
  const i = fonte.indexOf('// CV CRM (o mesmo bloco');
  const fim = trecho(fonte, 'async function lerMapa');
  blocos.push(i >= 0 && fim ? fonte.slice(i, fonte.indexOf(fim) + fim.length) : null);
}

checar('as duas funções têm o mesmo bloco do CV', blocos.length === 2 && blocos[0] !== null && blocos[0] === blocos[1]);

// O cron não chama o detalhe de empreendimento (traz nome de quem reservou).
for (const arquivo of FUNCOES) {
  checar(`${path.basename(path.dirname(arquivo))}: nada de /cadastros/empreendimentos/<id>`, !/cadastros\/empreendimentos\/\$\{/.test(readFileSync(arquivo, 'utf8')));
}

// Nada do CV no ambiente do app.
checar('nada do CV em EXPO_PUBLIC', !/CVCRM/i.test(readFileSync('src/lib/env.ts', 'utf8')));

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
