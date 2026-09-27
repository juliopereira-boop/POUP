import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Inter local (public/fonts): o render não depende de baixar nada.
for (const peso of ['400', '500', '600', '700', '800', '900']) {
  void loadFont({ family: 'Inter', url: staticFile(`fonts/inter-latin-${peso}-normal.woff2`), weight: peso });
}
