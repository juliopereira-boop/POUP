/**
 * O ANÚNCIO DO POUP — 45 s, 1080×1920, 30 fps.
 *
 *   0–75     hook           tela preta, pergunta digitada, relógio
 *   75–300   sofrimento     papel, planilha, conta refeita, cliente esfriando
 *   300–345  silêncio       congela, "E se levasse segundos?", escurece
 *   345      DROP           clarão, explosão, a marca invade, ícone com mola
 *   360–1110 uso do app     financiamento → simulador de vendas + tabela +
 *                           LIA → proposta no WhatsApp → LIA agenda +
 *                           notificação → venda e comissão → ranking →
 *                           relatórios (ver roteiro.ts)
 *   1110–1230 prova         antes: horas × agora: segundos
 *   1230–1350 CTA
 *
 * O áudio é todo sintetizado (`npm run audio`), a 120 BPM.
 */
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';
import './fontes';
import { Cta } from './cenas/Cta';
import { Drop } from './cenas/Drop';
import { Hook } from './cenas/Hook';
import { EMPURRA, Prova } from './cenas/Prova';
import { UsoDoApp } from './cenas/UsoDoApp';
import { C, T } from './roteiro';
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
  // O uso do app: cada toque, cada campo preenchido, cada aviso.
  const S = Q.solucao;
  const em = (q: number) => S + q;
  for (let k = 0; k < 6; k++) for (const d of [0, 3]) lista.push({ som: 'tecla', em: em(T.campo(k) + d), volume: 0.2 });
  const toques = [T.simular, T.levarParaVendas, T.usarTabela, T.bloco, T.unidade, T.liaAbre, T.gerarProposta, T.liaAgenda, T.registrar, T.filtro];
  for (const q of toques) lista.push({ som: 'clique-ui', em: em(q), volume: 0.9 });
  for (const q of T.cartoes) lista.push({ som: 'pop', em: em(q), volume: 0.65 });
  lista.push({ som: 'pop', em: em(T.selo), volume: 0.9 });
  lista.push({ som: 'whoosh', em: em(T.usarTabela + 2), volume: 0.35 });
  for (let k = 0; k < 12; k += 3) lista.push({ som: 'pop', em: em(T.bloco + 3 + k), volume: 0.3 });
  lista.push({ som: 'pop', em: em(T.unidade + 4), volume: 0.8 });
  for (let q = T.liaTexto; q < T.liaAnalisa - 2; q += 3) lista.push({ som: 'tecla', em: em(q), volume: 0.16 });
  for (let k = 0; k < 5; k++) lista.push({ som: 'pop', em: em(T.preenche(k)), volume: 0.55 });
  lista.push({ som: 'ding-positivo', em: em(T.riscoOk), volume: 0.6 });
  lista.push({ som: 'whoosh', em: em(T.pdfVoa[0]), volume: 0.9 });
  lista.push({ som: 'pop', em: em(T.pdfVoa[1]), volume: 0.6 });
  lista.push({ som: 'ding-positivo', em: em(T.resposta), volume: 0.85 });
  for (let q = T.agendaTexto; q < T.agendado - 4; q += 3) lista.push({ som: 'tecla', em: em(q), volume: 0.16 });
  lista.push({ som: 'pop', em: em(T.agendado), volume: 0.8 });
  lista.push({ som: 'notificacao', em: em(T.notificacao), volume: 0.9 });
  lista.push({ som: 'pop', em: em(T.comissaoCalc[0]), volume: 0.7 });
  for (let q = T.totalRola[0]; q < T.totalRola[1]; q += 4) lista.push({ som: 'tecla', em: em(q), volume: 0.18 });
  lista.push({ som: 'ding-positivo', em: em(T.totalRola[1]), volume: 0.7 });
  lista.push({ som: 'whoosh', em: em(T.sobe[0]), volume: 0.8 });
  lista.push({ som: 'impacto-medio', em: em(T.sobe[1]), volume: 0.55 });
  for (let k = 0; k < 7; k++) lista.push({ som: 'pop', em: em(T.itens(k)), volume: 0.4 });
  lista.push({ som: 'papel', em: em(T.papeisVoltam[0]), volume: 0.5 });
  lista.push({ som: 'whoosh', em: em(T.varre[0]), volume: 1 });
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
    <Sequence from={Q.solucao} durationInFrames={C.fim} name="4 Uso do app">
      <UsoDoApp />
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
        volume={(f) => interpolate(f + Q.drop, [Q.drop, DURACAO - 20, DURACAO], [0.7, 0.7, 0.25], { extrapolateRight: 'clamp' })}
      />
    </Sequence>
    {EFEITOS.map((e, i) => (
      <Efeito key={i} som={e.som} em={e.em} volume={e.volume} />
    ))}
  </AbsoluteFill>
);
