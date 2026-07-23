// Roda depois de `expo export --platform web`.
//
// A rota app/captar/[brokerId].tsx é dinâmica, então o export estático gera
// um único arquivo com colchetes no nome: dist/captar/[brokerId].html.
// Colchetes em nome de arquivo são um caso especial arriscado nas rewrites
// do Vercel (fica ambíguo se o destino deve vir com "[" "]" literais ou
// percent-encoded). Pra eliminar essa ambiguidade, copiamos o arquivo pra um
// nome comum (sem caracteres especiais) e o vercel.json aponta pra ele.
//
// O conteúdo do HTML é o app estaticamente renderizado, mas os dados reais
// (nome do corretor, textos da campanha) são carregados no cliente via
// useLocalSearchParams — que lê o brokerId de verdade a partir da URL do
// navegador, não do arquivo servido. Por isso é seguro todo mundo cair no
// mesmo HTML.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const source = path.join(distDir, 'captar', '[brokerId].html');
const dest = path.join(distDir, 'captar', 'pagina.html');

if (!fs.existsSync(source)) {
  console.warn(`[postexport] Aviso: ${source} não encontrado — pulando cópia.`);
  process.exit(0);
}

fs.copyFileSync(source, dest);
console.log(`[postexport] Copiado ${source} -> ${dest}`);
