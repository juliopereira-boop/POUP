/**
 * TESTES DO GERADOR DE UNIDADES.
 *
 * `npm run testar:unidades`
 *
 * O gerador decide o código de cada apartamento, e a atualização da tabela de
 * preço vai casar a unidade da tabela com a unidade do cadastro por esse
 * código. Um código errado aqui não quebra tela nenhuma: ele faz o preço de um
 * apartamento cair em outro, em silêncio. Por isso cada regra da numeração tem
 * um teste com nome.
 *
 * Mesma técnica de `testar-lia.mjs`: o `.ts` é transpilado na hora pelo
 * TypeScript de `node_modules`, sem passo de build.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

function compilar(arquivo) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = require;
  m._compile(js, arquivo);
  return m.exports;
}

const G = compilar(path.join(process.cwd(), 'src/features/unidades/gerador.ts'));

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}
const codigos = (r) => (r.ok ? r.unidades.map((u) => u.codigo) : []);

/* ======================================================================== */
secao('NUMERAÇÃO — o exemplo que definiu a regra');
{
  // "Primeiro pavimento, que é o térreo, 4 unidades: 001, 002, 003 e 004."
  const terreo = G.gerarUnidades([{ numero: 1, unidades: 4 }]);
  checar('térreo com 4 unidades gera 001 a 004', codigos(terreo).join(' ') === '001 002 003 004');

  const doisAndares = G.gerarUnidades([
    { numero: 1, unidades: 4 },
    { numero: 2, unidades: 4 },
  ]);
  checar(
    'o pavimento 2 é o 1º andar: 101 a 104',
    codigos(doisAndares).slice(4).join(' ') === '101 102 103 104',
  );

  const dezAndar = G.gerarUnidades([{ numero: 11, unidades: 2 }]);
  checar('o pavimento 11 é o 10º andar: 1001 e 1002', codigos(dezAndar).join(' ') === '1001 1002');

  const doze = G.gerarUnidades([{ numero: 1, unidades: 12 }]);
  checar('posição com dois dígitos até 12', codigos(doze).at(-1) === '012');
  checar('e começa em 001', codigos(doze)[0] === '001');
}

/* ======================================================================== */
secao('ORDEM — a lista não depende da ordem em que o corretor pensou');
{
  const foraDeOrdem = G.gerarUnidades([
    { numero: 3, unidades: 1 },
    { numero: 1, unidades: 1 },
    { numero: 2, unidades: 1 },
  ]);
  checar('pavimentos fora de ordem saem do térreo para cima', codigos(foraDeOrdem).join(' ') === '001 101 201');
  checar(
    'a ordem é sequencial e começa em zero',
    foraDeOrdem.ok && foraDeOrdem.unidades.map((u) => u.ordem).join(',') === '0,1,2',
  );
  checar(
    'cada unidade sabe o seu pavimento',
    foraDeOrdem.ok && foraDeOrdem.unidades.map((u) => u.pavimento).join(',') === '1,2,3',
  );
}

/* ======================================================================== */
secao('UNICIDADE — dois apartamentos nunca com o mesmo código');
{
  // O caso que a regra dos 99 existe para impedir.
  const pavimentos = Array.from({ length: 20 }, (_, i) => ({ numero: i + 1, unidades: 99 }));
  const r = G.gerarUnidades(pavimentos);
  checar('20 pavimentos de 99 unidades: todos os códigos distintos', r.ok && new Set(codigos(r)).size === 1980);
}

/* ======================================================================== */
secao('VALIDAÇÃO — o que é recusado, e com que frase');
{
  const vazio = G.gerarUnidades([]);
  checar('sem pavimento é recusado', !vazio.ok && /pelo menos um pavimento/.test(vazio.erro));

  const repetido = G.gerarUnidades([
    { numero: 2, unidades: 4 },
    { numero: 2, unidades: 3 },
  ]);
  checar('pavimento repetido é recusado e nomeado', !repetido.ok && /pavimento 2 aparece duas vezes/.test(repetido.erro));

  checar('pavimento zero é recusado (o térreo é o 1)', !G.gerarUnidades([{ numero: 0, unidades: 2 }]).ok);
  checar('pavimento quebrado é recusado', !G.gerarUnidades([{ numero: 1.5, unidades: 2 }]).ok);
  checar('pavimento sem unidade é recusado', !G.gerarUnidades([{ numero: 1, unidades: 0 }]).ok);
  checar('100 unidades num pavimento é recusado', !G.gerarUnidades([{ numero: 1, unidades: 100 }]).ok);
  checar('99 unidades num pavimento passa', G.gerarUnidades([{ numero: 1, unidades: 99 }]).ok);
  checar('pavimento 201 é recusado', !G.gerarUnidades([{ numero: 201, unidades: 1 }]).ok);

  const demais = Array.from({ length: 21 }, (_, i) => ({ numero: i + 1, unidades: 99 }));
  const r = G.gerarUnidades(demais);
  checar('mais de 2.000 unidades num bloco é recusado', !r.ok && /2\.000/.test(r.erro));
}

/* ======================================================================== */
secao('ATALHOS — o que torna o cadastro rápido');
{
  checar(
    'bloco novo começa pelo térreo com 4 unidades',
    JSON.stringify(G.proximoPavimento([])) === JSON.stringify({ numero: 1, unidades: 4 }),
  );

  const seguinte = G.proximoPavimento([{ numero: 1, unidades: 6 }]);
  checar('o próximo pavimento soma um ao número', seguinte.numero === 2);
  checar('e copia a quantidade do último', seguinte.unidades === 6);

  const saltado = G.proximoPavimento([
    { numero: 5, unidades: 2 },
    { numero: 1, unidades: 8 },
  ]);
  checar('parte do MAIOR pavimento, não do último da lista', saltado.numero === 6 && saltado.unidades === 2);

  const predio = G.repetirAte([{ numero: 1, unidades: 4 }], 15);
  checar('"repetir até o 15" monta 15 pavimentos', predio.length === 15);
  checar('todos com a quantidade do térreo', predio.every((p) => p.unidades === 4));
  checar('o último é o 15', predio.at(-1).numero === 15);
  checar('e o prédio inteiro vira 60 unidades', codigos(G.gerarUnidades(predio)).length === 60);

  const base = [{ numero: 1, unidades: 4 }, { numero: 2, unidades: 4 }];
  checar('repetir até um número que já passou não muda nada', G.repetirAte(base, 1).length === 2);
  checar('repetir até um número inválido não muda nada', G.repetirAte(base, 999).length === 2);
  checar('repetir não altera a lista original', base.length === 2);
}

/* ======================================================================== */
secao('VOLTA — das unidades salvas para a forma do bloco');
{
  const forma = [
    { numero: 1, unidades: 2 },
    { numero: 2, unidades: 4 },
    { numero: 3, unidades: 4 },
  ];
  const ida = G.gerarUnidades(forma);
  const volta = G.pavimentosDasUnidades(ida.ok ? ida.unidades : []);
  checar('gerar e reconstruir devolve a mesma forma', JSON.stringify(volta) === JSON.stringify(forma));

  const embaralhadas = [{ pavimento: 3 }, { pavimento: 1 }, { pavimento: 3 }];
  checar(
    'a reconstrução sai em ordem, contando por pavimento',
    JSON.stringify(G.pavimentosDasUnidades(embaralhadas)) ===
      JSON.stringify([{ numero: 1, unidades: 1 }, { numero: 3, unidades: 2 }]),
  );
  checar('bloco sem unidade vira forma vazia', G.pavimentosDasUnidades([]).length === 0);
}

/* ======================================================================== */
secao('NOMES E RÓTULOS');
{
  checar('primeiro bloco se chama Bloco 1', G.proximoNomeDeBloco([]) === 'Bloco 1');
  checar('o seguinte, Bloco 2', G.proximoNomeDeBloco(['Bloco 1']) === 'Bloco 2');
  checar('pula nome já usado', G.proximoNomeDeBloco(['Torre A', 'Bloco 2']) === 'Bloco 3');
  checar('ignora maiúscula e espaço ao comparar', G.proximoNomeDeBloco([' bloco 2 ', 'x']) === 'Bloco 3');

  checar('pavimento 1 se chama Térreo', G.rotuloDoPavimento(1) === 'Térreo');
  checar('pavimento 2 se chama 1º andar', G.rotuloDoPavimento(2) === '1º andar');

  const r = G.resumoDoPavimento({ numero: 2, unidades: 8 });
  checar('o resumo mostra primeira e última unidade', r.primeiro === '101' && r.ultimo === '108');
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
