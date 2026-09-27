/**
 * 3. O SILÊNCIO E O BUM (300–368).
 *
 *   300–330  tudo congela no relógio, zoom lento, "E se levasse segundos?"
 *   330–345  a tela escurece (15 quadros de quase silêncio)
 *   345      DROP: clarão branco, onda de choque, o "antes" explode em
 *            pedaços para fora da tela, o laranja da marca invade do centro e
 *            o ícone do POUP entra com mola de overshoot forte.
 *   358–368  o ícone sobe e some; o celular da solução entra por baixo.
 *
 * O quadro 345 é o mais importante do vídeo: nele o clarão está no máximo, o
 * núcleo laranja já aparece e os pedaços cinza estão soltando — é impossível
 * não perceber a virada.
 */
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { IconeApp } from '../componentes/Logo';
import { FONTE, FRIO, MARCA, Q } from '../tema';
import { faixa, tremor } from '../util';
import { Cronometro, GradeFria, Relogio } from './Sofrimento';

const CENTRO = { x: 540, y: 880 };

/** Os pedaços do "antes": papel, célula com erro, tecla. Posições fixas por semente. */
const PEDACOS = Array.from({ length: 64 }, (_, i) => {
  const tipo = i % 3 === 0 ? 'celula' : i % 3 === 1 ? 'papel' : 'tecla';
  const ang = random(`ang${i}`) * Math.PI * 2;
  const raio0 = 360 + random(`r0${i}`) * 380;
  return {
    tipo,
    x0: CENTRO.x + Math.cos(ang) * raio0,
    y0: CENTRO.y + Math.sin(ang) * raio0 * 1.3,
    dx: Math.cos(ang),
    dy: Math.sin(ang),
    vel: 1300 + random(`v${i}`) * 1400,
    rot: (random(`rot${i}`) - 0.5) * 900,
    w: tipo === 'papel' ? 150 + random(`w${i}`) * 140 : tipo === 'celula' ? 200 : 90,
    h: tipo === 'papel' ? 190 + random(`h${i}`) * 160 : tipo === 'celula' ? 80 : 90,
    texto: tipo === 'celula' ? ['#REF!', '#VALOR!', '#DIV/0!'][i % 3] : tipo === 'tecla' ? ['7', '×', '=', 'C', '0'][i % 5] : '',
  };
});

const Pedaco: React.FC<{ p: (typeof PEDACOS)[number]; d: number }> = ({ p, d }) => {
  const t = interpolate(d, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const x = p.x0 + p.dx * p.vel * t;
  const y = p.y0 + p.dy * p.vel * t + 300 * t * t;
  const estilo: React.CSSProperties =
    p.tipo === 'papel'
      ? { background: FRIO.apagado, borderRadius: 4 }
      : p.tipo === 'celula'
        ? { background: '#aab2bd', border: '3px solid #6b7888', color: '#6e2a2a', fontWeight: 700, fontSize: 34 }
        : { background: '#3a434e', borderRadius: 16, color: FRIO.texto, fontWeight: 600, fontSize: 40 };
  return (
    <div
      style={{
        position: 'absolute',
        left: x - p.w / 2,
        top: y - p.h / 2,
        width: p.w,
        height: p.h,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONTE,
        transform: `rotate(${p.rot * t}deg) scale(${1 + t * 0.5})`,
        opacity: interpolate(d, [14, 24], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        ...estilo,
      }}
    >
      {p.texto}
    </div>
  );
};

export const Drop: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = f + Q.congela;
  const d = g - Q.drop; // quadros desde o drop (negativo antes dele)

  // ------------------------------------------------ antes do drop: congelado
  const zoom = interpolate(g, [Q.congela, Q.drop], [1, 1.75], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const escuro = interpolate(g, [Q.escuro, Q.drop - 1], [0, 0.93], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pergunta = faixa(g, Q.congela + 4, Q.congela + 14) * interpolate(g, [Q.escuro + 6, Q.drop - 2], [1, 0.25], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // -------------------------------------------------------------- o drop
  const raio = interpolate(d, [0, 8], [400, 2400], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });
  const clarao = interpolate(d, [0, 2, 4, 7, 10], [1, 0.9, 0.55, 0.15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const onda = faixa(d, 0, 11);
  const mola = spring({ frame: d - 1, fps, config: { damping: 7, stiffness: 190, mass: 0.7 } });
  const saida = faixa(g, 355, 362, Easing.in(Easing.cubic));
  const soco = interpolate(d, [0, 9], [1.14, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const t = tremor(g, d >= 0 ? interpolate(d, [0, 10], [34, 0], { extrapolateRight: 'clamp' }) : 0);
  const raios = d >= 0 ? interpolate(d, [0, 4, 20], [0, 0.55, 0.25], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={{ background: d < 0 ? '#000' : 'transparent', overflow: 'hidden' }}>
      {d < 0 ? (
        <>
          {/* O relógio congelado no último quadro da montagem, com zoom lento. */}
          <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: '540px 760px' }}>
            <GradeFria>
              <Relogio g={Q.congela - 1} />
            </GradeFria>
            <Cronometro g={Q.congela - 1} />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: `rgba(0,0,0,${0.35 + escuro * 0.65})` }} />
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div
              style={{
                fontFamily: FONTE,
                fontWeight: 800,
                fontSize: 132,
                lineHeight: 1.02,
                letterSpacing: -4,
                color: '#f1f3f6',
                textAlign: 'center',
                opacity: pergunta,
                transform: `translateY(${(1 - faixa(g, Q.congela + 4, Q.congela + 14)) * 40}px)`,
              }}
            >
              E se levasse segundos?
            </div>
          </AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${soco})` }}>
          {/* Fundo, clarão, núcleo laranja e raios somem JUNTOS (sem escurecer). */}
          <AbsoluteFill style={{ opacity: 1 - saida }}>
          {/* O fundo escuro que sobra fora do círculo nos primeiros quadros. */}
            <AbsoluteFill style={{ background: '#050608', }} />
            {/* O clarão: branco total no 345, com o núcleo laranja já por cima. */}
            <AbsoluteFill style={{ background: '#fff', opacity: clarao }} />
            {/* A marca invadindo do centro (e se desfazendo no fundo da solução). */}
            <div
              style={{
                position: 'absolute',
                left: CENTRO.x - raio,
                top: CENTRO.y - raio,
                width: raio * 2,
                height: raio * 2,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${MARCA.laranjaClaro} 0%, ${MARCA.laranja} 38%, ${MARCA.laranjaEscuro} 100%)`,
              }}
            />
            <AbsoluteFill
              style={{
                background: `repeating-conic-gradient(from ${d * 2}deg at ${CENTRO.x}px ${CENTRO.y}px, rgba(255,255,255,0.28) 0deg 6deg, transparent 6deg 22deg)`,
                opacity: raios,
              }}
            />
          </AbsoluteFill>
          {/* O "antes" explodindo para fora. */}
          {PEDACOS.map((p, i) => (
            <Pedaco key={i} p={p} d={d} />
          ))}
          {/* Onda de choque. */}
          <div
            style={{
              position: 'absolute',
              left: CENTRO.x - (400 + onda * 1100),
              top: CENTRO.y - (400 + onda * 1100),
              width: (400 + onda * 1100) * 2,
              height: (400 + onda * 1100) * 2,
              borderRadius: '50%',
              border: `${interpolate(onda, [0, 1], [60, 6])}px solid rgba(255,255,255,${1 - onda})`,
              boxShadow: `0 0 80px rgba(255,160,80,${0.8 * (1 - onda)})`,
              boxSizing: 'border-box',
            }}
          />
          {/* O ícone do POUP, com mola de overshoot. */}
          <AbsoluteFill style={{ alignItems: 'center', opacity: 1 - saida }}>
            <div
              style={{
                position: 'absolute',
                top: CENTRO.y - 210 - saida * 260,
                transform: `scale(${mola * (1 - saida * 0.4)}) rotate(${(1 - mola) * -16}deg)`,
              }}
            >
              <IconeApp tamanho={420} />
            </div>
            <div
              style={{
                position: 'absolute',
                top: CENTRO.y + 270 - saida * 260,
                fontFamily: FONTE,
                fontWeight: 900,
                fontSize: 150,
                letterSpacing: 10,
                color: MARCA.branco,
                opacity: faixa(d, 4, 9),
                transform: `translateY(${(1 - faixa(d, 4, 10)) * 60}px)`,
                textShadow: '0 8px 30px rgba(120,40,0,0.35)',
              }}
            >
              POUP
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
