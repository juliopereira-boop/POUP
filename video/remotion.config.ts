import { Config } from '@remotion/cli/config';

// Chromium já instalado no ambiente (o download do Remotion é bloqueado aqui).
// Em outra máquina, apague esta linha: o Remotion baixa o navegador sozinho.
if (process.env.POUP_BROWSER) Config.setBrowserExecutable(process.env.POUP_BROWSER);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setConcurrency(4);
