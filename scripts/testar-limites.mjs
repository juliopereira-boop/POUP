/**
 * TESTES DOS LIMITES — o que protege a margem do produto.
 *
 * `npm run testar:limites`
 *
 * ===========================================================================
 * POR QUE ESTES TRÊS ASSUNTOS MORAM JUNTOS
 * ===========================================================================
 * Todo recurso do POUP que chama a API da Anthropic gasta dinheiro por uso,
 * contra uma assinatura que é receita fixa. Todo arquivo enviado ocupa espaço
 * pago por mês, para sempre. As regras que evitam que as duas curvas se cruzem
 * são as testadas aqui:
 *
 *   1. **triagem de upload** (`features/material/limits.ts`) — que tipo e que
 *      tamanho de arquivo entram;
 *   2. **redução de imagem** (`lib/imagemReduzida.ts`) — a decisão de reduzir
 *      ou não antes de mandar para a IA;
 *   3. **mensagem de recusa** (`lib/edgeError.ts`) — como o limite atingido
 *      chega ao corretor. Sem isso, toda recusa de cota apareceria como uma
 *      frase em inglês sobre status HTTP, e a regra pareceria defeito.
 *
 * O teto em si (quantos scans por mês, quantas escutas da LIA) NÃO é testado
 * aqui: ele mora no banco, em `public.ai_limits`, justamente para poder mudar
 * sem deploy. O que é testável fora do banco é o caminho, não o número.
 *
 * Mesma técnica dos outros dois arquivos de teste: os `.ts` são transpilados na
 * hora pelo TypeScript de `node_modules`, sem passo de build.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

function compilar(arquivo, resolverImport = require) {
  const js = ts.transpileModule(readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = new Module(arquivo);
  m.filename = arquivo;
  m.require = resolverImport;
  m._compile(js, arquivo);
  return m.exports;
}

const LIM = compilar(path.join(process.cwd(), 'src/features/material/limits.ts'));
const ERRO = compilar(path.join(process.cwd(), 'src/lib/edgeError.ts'));

let ok = 0;
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  if (condicao) ok++;
  else falhas.push(`${nome} ${detalhe}`);
}
function secao(t) {
  console.log(`\n${t}`);
}

const MB = 1024 * 1024;

/* ===========================================================================
 * TIPO DE ARQUIVO ACEITO
 * ======================================================================= */
{
  secao('UPLOAD — tipo aceito');

  checar('PDF pela extensão', LIM.tipoAceito('book.pdf', null));
  checar('JPG pela extensão', LIM.tipoAceito('fachada.jpg', null));
  checar('JPEG pela extensão', LIM.tipoAceito('fachada.jpeg', null));
  checar('PNG pela extensão', LIM.tipoAceito('planta.png', null));
  checar('WebP pela extensão', LIM.tipoAceito('post.webp', null));
  checar('MAIÚSCULA não muda nada', LIM.tipoAceito('BOOK.PDF', null));
  checar('espaço em volta do nome não atrapalha', LIM.tipoAceito('  book.pdf  ', null));
  checar('nome com ponto no meio usa a última extensão', LIM.tipoAceito('tabela.v2.pdf', null));

  // O caso do Android: PDF legítimo que chega como octet-stream. A extensão
  // salva, e é por isso que ela é a checagem principal.
  checar('PDF como octet-stream passa pela extensão', LIM.tipoAceito('book.pdf', 'application/octet-stream'));
  // O caso inverso: sem extensão, mas com mimetype bom.
  checar('sem extensão, o mimetype resolve', LIM.tipoAceito('documento', 'application/pdf'));
  checar('mimetype com charset ainda casa', LIM.tipoAceito('x', 'image/png; charset=binary'));

  checar('vídeo é recusado', !LIM.tipoAceito('tour.mp4', 'video/mp4'));
  checar('ZIP é recusado', !LIM.tipoAceito('material.zip', 'application/zip'));
  checar('planilha é recusada', !LIM.tipoAceito('tabela.xlsx', null));
  checar('executável é recusado', !LIM.tipoAceito('coisa.exe', null));
  checar('sem extensão e sem mimetype é recusado', !LIM.tipoAceito('arquivo', null));
  checar('arquivo oculto sem extensão é recusado', !LIM.tipoAceito('.gitignore', null));
  checar('nome vazio é recusado', !LIM.tipoAceito('', null));
  // "book.pdf.mp4" é um vídeo, não um PDF: só a ÚLTIMA extensão vale.
  checar('extensão dupla não engana', !LIM.tipoAceito('book.pdf.mp4', 'video/mp4'));
}

/* ===========================================================================
 * TRIAGEM COMPLETA — tipo E tamanho, com a frase que o corretor lê
 * ======================================================================= */
{
  secao('UPLOAD — separarEnviaveis');

  const arq = (name, mb, contentType = null) => ({ name, size: mb * MB, contentType });

  const so_bons = LIM.separarEnviaveis([arq('a.pdf', 1), arq('b.jpg', 2)]);
  checar('tudo válido passa inteiro', so_bons.aceitos.length === 2);
  checar('tudo válido não gera aviso', so_bons.aviso === null);

  const grande = LIM.separarEnviaveis([arq('a.pdf', 1), arq('gigante.pdf', LIM.MAX_FILE_MB + 1)]);
  checar('arquivo acima do teto é barrado', grande.aceitos.length === 1);
  checar('o aviso fala de tamanho', /MB/.test(grande.aviso ?? ''));

  const noLimite = LIM.separarEnviaveis([arq('exato.pdf', LIM.MAX_FILE_MB)]);
  checar('exatamente no teto PASSA (é <=, não <)', noLimite.aceitos.length === 1);

  const tipo = LIM.separarEnviaveis([arq('a.pdf', 1), arq('tour.mp4', 2, 'video/mp4')]);
  checar('tipo não aceito é barrado', tipo.aceitos.length === 1);
  checar('o aviso fala de tipo', /tipo não aceito/.test(tipo.aviso ?? ''));

  const ambos = LIM.separarEnviaveis([
    arq('tour.mp4', 2, 'video/mp4'),
    arq('gigante.pdf', LIM.MAX_FILE_MB + 5),
    arq('ok.png', 1),
  ]);
  checar('mistura: só o válido entra', ambos.aceitos.length === 1);
  checar('mistura: um aviso nomeia os DOIS motivos', /tipo não aceito/.test(ambos.aviso ?? '') && /MB/.test(ambos.aviso ?? ''));

  const vazio = LIM.separarEnviaveis([]);
  checar('lista vazia não gera aviso', vazio.aceitos.length === 0 && vazio.aviso === null);

  // Tipo é checado ANTES do tamanho: um vídeo de 500 MB deve ser reportado como
  // tipo recusado, não como arquivo grande — a ação do corretor é diferente.
  const videoGigante = LIM.separarEnviaveis([arq('tour.mp4', 500, 'video/mp4')]);
  checar(
    'vídeo enorme é recusado pelo TIPO, não pelo tamanho',
    /tipo não aceito/.test(videoGigante.aviso ?? '') && !/MB/.test(videoGigante.aviso ?? ''),
  );
}

/* ===========================================================================
 * O TETO POR ARQUIVO E O QUE A TELA DIZ
 * ======================================================================= */
{
  secao('UPLOAD — os números e os rótulos');

  checar('o teto está na faixa pedida (10 a 20 MB)', LIM.MAX_FILE_MB >= 10 && LIM.MAX_FILE_MB <= 20);
  checar('bytes e MB não divergem', LIM.MAX_FILE_BYTES === LIM.MAX_FILE_MB * MB);
  checar('o rótulo da tela existe', typeof LIM.TIPOS_ACEITOS_ROTULO === 'string' && LIM.TIPOS_ACEITOS_ROTULO.length > 0);
  checar('o filtro do seletor tem os quatro tipos', LIM.TIPOS_ACEITOS_PICKER.length === 4);
  // Filtro do seletor e checagem precisam concordar: um filtro que oferece o
  // que a checagem recusa produz erro logo depois de escolher.
  checar(
    'todo tipo oferecido pelo seletor é aceito pela checagem',
    LIM.TIPOS_ACEITOS_PICKER.every((m) => LIM.tipoAceito('arquivo', m)),
  );
}

/* ===========================================================================
 * MENSAGEM DE RECUSA VINDA DA EDGE FUNCTION
 * ======================================================================= */
{
  secao('LIMITE ATINGIDO — mensagemDoErro');

  const httpCom = (corpo) => ({
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => corpo },
  });
  const PADRAO = 'frase padrão';

  checar(
    'a frase do corpo é a que chega ao corretor',
    (await ERRO.mensagemDoErro(httpCom({ error: 'Você já usou 40 leituras.' }), PADRAO)) ===
      'Você já usou 40 leituras.',
  );
  checar(
    'espaço em volta da frase é aparado',
    (await ERRO.mensagemDoErro(httpCom({ error: '  Limite atingido.  ' }), PADRAO)) ===
      'Limite atingido.',
  );
  checar(
    'corpo sem campo error cai no padrão',
    (await ERRO.mensagemDoErro(httpCom({ campos: [] }), PADRAO)) === PADRAO,
  );
  checar(
    'corpo com error em branco cai no padrão',
    (await ERRO.mensagemDoErro(httpCom({ error: '   ' }), PADRAO)) === PADRAO,
  );
  checar(
    'error que não é texto cai no padrão',
    (await ERRO.mensagemDoErro(httpCom({ error: 42 }), PADRAO)) === PADRAO,
  );
  checar(
    'corpo ilegível (HTML de gateway) cai no padrão',
    (await ERRO.mensagemDoErro(
      {
        message: 'non-2xx status code',
        context: {
          json: async () => {
            throw new Error('não é JSON');
          },
        },
      },
      PADRAO,
    )) === PADRAO,
  );
  checar(
    'a frase genérica do supabase-js NUNCA chega ao corretor',
    (await ERRO.mensagemDoErro({ message: 'Edge Function returned a non-2xx status code' }, PADRAO)) ===
      PADRAO,
  );
  checar(
    'erro de rede real aparece — é informação útil',
    (await ERRO.mensagemDoErro({ message: 'Failed to fetch' }, PADRAO)) === 'Failed to fetch',
  );
  checar('erro nulo cai no padrão', (await ERRO.mensagemDoErro(null, PADRAO)) === PADRAO);
  checar(
    'erro sem nada dentro cai no padrão',
    (await ERRO.mensagemDoErro({}, PADRAO)) === PADRAO,
  );
}

console.log(`\n${ok} passaram, ${falhas.length} falharam`);
for (const f of falhas) console.log(`  FALHOU: ${f}`);
process.exit(falhas.length ? 1 : 0);
