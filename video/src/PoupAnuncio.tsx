/**
 * O ANÚNCIO DO POUP — 30 s, 1080×1920, 30 fps.
 *
 *   0–75     hook           tela preta, pergunta digitada, relógio
 *   75–300   sofrimento     papel, planilha, conta refeita, cliente esfriando
 *   300–345  silêncio       congela, "E se levasse segundos?", escurece
 *   345      DROP           clarão, explosão, a marca invade, ícone com mola
 *   360–660  solução        simular → PDF no WhatsApp → relatórios
 *   660–780  prova          antes: horas × agora: segundos
 *   780–900  CTA
 *
 * O áudio é todo sintetizado (`npm run audio`), a 120 BPM.
 */
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';
import './fontes';
import { Cta } from './cenas/Cta';
import { Drop } from './cenas/Drop';
import { Hook } from './cenas/Hook';
import { EMPURRA, Prova } from './cenas/Prova';
import {
  CARTOES_EM,
  INICIO_CAMPO,
  ITENS_EM,
  PAPEIS_VOLTAM,
  PDF_VOA,
  RESPOSTA_EM,
  SELO_EM,
  Solucao,
  TOQUE_FILTRO,
  TOQUE_PDF,
  TOQUE_SIMULAR,
  VARRE,
} from './cenas/Solucao';
import { CORTES, fimDoCorte, Sofrimento, teclaDoQuadro } from './cenas/Sofrimento';
import { DURACAO, Q } from './tema';

type Som =
  | 'tick'
  | 'papel'
  | 'tecla'
  | 'notificacao'
  | 'riser'
  | 'reverso'
  | 'impacto'
  | 'impacto-medio'
  | 'impacto-suave'
  | 'whoosh'
  | 'clique-ui'
  | 'pop'
  | 'ding-positivo';

const DURACAO_SOM: Record<Som, number> = {
  tick: 3,
  papel: 10,
  tecla: 3,
  notificacao: 14,
  riser: 45,
  reverso: 27,
  impacto: 72,
  'impacto-medio': 36,
  'impacto-suave': 60,
  whoosh: 17,
  'clique-ui': 3,
  pop: 4,
  'ding-positivo': 27,
};

const Efeito: React.FC<{ som: Som; em: number; volume?: number | ((f: number) => number) }> = ({ som, em, volume = 1 }) => (
  <Sequence from={Math.round(em)} durationInFrames={DURACAO_SOM[som] + 2} layout="none" name={`♪ ${som}`}>
    <Audio src={staticFile(`audio/${som}.wav`)} volume={volume} />
  </Sequence>
);

/** Os efeitos, quadro a quadro. */
type Evento = { som: Som; em: number; volume?: number | ((f: number) => number) };

function efeitos(): Evento[] {
  const lista: Evento[] = [];
  // Relógio: constante e baixo no hook; acelerando na montagem; para no 300.
  for (let q = 0; q < Q.sofrimento; q += 15) lista.push({ som: 'tick', em: q, volume: 0.35 });
  for (let q = Q.sofrimento; q < Q.congela; ) {
    lista.push({ som: 'tick', em: q, volume: interpolate(q, [Q.sofrimento, Q.congela], [0.4, 0.8]) });
    q += Math.max(3, Math.round(interpolate(q, [Q.sofrimento, Q.congela], [15, 3])));
  }
  // Cada plano da montagem com o seu som.
  CORTES.forEach((c, i) => {
    const fim = fimDoCorte(i);
    if (c.plano === 'mesa') {
      for (let q = c.em; q < fim; q += 9) lista.push({ som: 'papel', em: q + 2, volume: 0.7 });
    }
    if (c.plano === 'mesa' || c.plano === 'calculadora') {
      for (let q = c.em; q < fim; q += 3) if (teclaDoQuadro(q - c.em) !== teclaDoQuadro(q - c.em - 1)) lista.push({ som: 'tecla', em: q, volume: 0.45 });
    }
    if (c.plano === 'planilha') {
      for (let q = c.em + 1; q < fim; q += 4) lista.push({ som: 'clique-ui', em: q, volume: 0.55 });
    }
    if (c.plano === 'conversa') {
      for (const m of [165, 172, 180, 270]) if (m >= c.em && m < fim) lista.push({ som: 'notificacao', em: m, volume: 0.7 });
      if (c.em === 270) lista.push({ som: 'notificacao', em: 276, volume: 0.6 });
    }
  });
  // O silêncio e o BUM.
  // O riser sobe até o 330 e cai a quase nada: os 15 quadros antes do drop são
  // (quase) silêncio — é o contraste que faz o impacto do 345 bater.
  lista.push({
    som: 'riser',
    em: Q.congela,
    volume: (f) => interpolate(f + Q.congela, [Q.congela, Q.escuro - 2, Q.escuro + 4, Q.drop], [0.9, 0.9, 0.05, 0.03], { extrapolateRight: 'clamp' }),
  });
  lista.push({ som: 'reverso', em: Q.drop - DURACAO_SOM.reverso, volume: 0.12 });
  lista.push({ som: 'impacto', em: Q.drop, volume: 1 });
  // Solução.
  const S = Q.solucao;
  for (let k = 0; k < 6; k++) for (const d of [0, 3, 6]) lista.push({ som: 'tecla', em: S + INICIO_CAMPO(k) + d, volume: 0.22 });
  lista.push({ som: 'clique-ui', em: S + TOQUE_SIMULAR, volume: 0.9 });
  for (const c of CARTOES_EM) lista.push({ som: 'pop', em: S + c, volume: 0.7 });
  lista.push({ som: 'pop', em: S + SELO_EM, volume: 0.9 });
  lista.push({ som: 'clique-ui', em: S + TOQUE_PDF, volume: 0.9 });
  lista.push({ som: 'whoosh', em: S + PDF_VOA[0], volume: 0.9 });
  lista.push({ som: 'pop', em: S + PDF_VOA[1], volume: 0.6 });
  lista.push({ som: 'ding-positivo', em: S + RESPOSTA_EM, volume: 0.85 });
  for (let k = 0; k < 7; k++) lista.push({ som: 'pop', em: S + ITENS_EM(k), volume: 0.4 });
  lista.push({ som: 'clique-ui', em: S + TOQUE_FILTRO, volume: 0.9 });
  lista.push({ som: 'papel', em: S + PAPEIS_VOLTAM[0], volume: 0.5 });
  lista.push({ som: 'whoosh', em: S + VARRE[0], volume: 1 });
  // Prova.
  lista.push({ som: 'whoosh', em: Q.prova, volume: 0.8 });
  lista.push({ som: 'whoosh', em: Q.prova + EMPURRA[0], volume: 0.9 });
  lista.push({ som: 'impacto-medio', em: Q.prova + EMPURRA[1] - 2, volume: 0.8 });
  // CTA.
  lista.push({ som: 'impacto-suave', em: Q.cta, volume: 0.8 });
  return lista;
}

export const EFEITOS = efeitos();

export const PoupAnuncio: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence from={Q.hook} durationInFrames={Q.sofrimento} name="1 Hook">
      <Hook />
    </Sequence>
    <Sequence from={Q.sofrimento} durationInFrames={Q.congela - Q.sofrimento} name="2 Sofrimento">
      <Sofrimento />
    </Sequence>
    <Sequence from={Q.solucao} durationInFrames={Q.prova - Q.solucao} name="4 Solução">
      <Solucao />
    </Sequence>
    {/* O drop por cima do começo da solução: o ícone sobe e revela o celular. */}
    <Sequence from={Q.congela} durationInFrames={368 - Q.congela} name="3 Silêncio + DROP">
      <Drop />
    </Sequence>
    <Sequence from={Q.prova} durationInFrames={Q.cta - Q.prova} name="5 Prova">
      <Prova />
    </Sequence>
    <Sequence from={Q.cta} durationInFrames={DURACAO - Q.cta} name="6 CTA">
      <Cta />
    </Sequence>

    {/* Trilha tensa: entra com a montagem, corta a zero em 4 quadros no 300. */}
    <Sequence from={Q.sofrimento} durationInFrames={Q.congela + 6 - Q.sofrimento} name="♫ tensa">
      <Audio
        src={staticFile('audio/trilha-tensa.wav')}
        volume={(f) =>
          interpolate(f + Q.sofrimento, [Q.sofrimento, Q.sofrimento + 12, Q.congela, Q.congela + 4], [0, 0.75, 0.75, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </Sequence>
    {/* Trilha energética: volta no drop. */}
    <Sequence from={Q.drop} durationInFrames={DURACAO - Q.drop} name="♫ drop">
      <Audio
        src={staticFile('audio/trilha-drop.wav')}
        volume={(f) => interpolate(f + Q.drop, [Q.drop, 880, DURACAO], [0.7, 0.7, 0.25], { extrapolateRight: 'clamp' })}
      />
    </Sequence>
    {EFEITOS.map((e, i) => (
      <Efeito key={i} som={e.som} em={e.em} volume={e.volume} />
    ))}
  </AbsoluteFill>
);
