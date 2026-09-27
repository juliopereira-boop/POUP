import { Composition } from 'remotion';
import { PoupAnuncio } from './PoupAnuncio';
import { ALTURA, DURACAO, FPS, LARGURA } from './tema';

export const Root: React.FC = () => (
  <Composition
    id="PoupAnuncio"
    component={PoupAnuncio}
    durationInFrames={DURACAO}
    fps={FPS}
    width={LARGURA}
    height={ALTURA}
  />
);
