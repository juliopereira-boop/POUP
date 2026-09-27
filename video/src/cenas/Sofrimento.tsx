/**
 * 2. O SOFRIMENTO (75–300): montagem no ritmo da batida — cortes de 30 quadros
 * que viram 15 no fim. Tudo frio e dessaturado, com o tremor crescendo.
 *
 * Os planos são funções de (quadro local do plano, quadro global): o mesmo
 * plano do relógio é reusado CONGELADO na cena do silêncio (Drop.tsx).
 */
import { AbsoluteFill, Easing, interpolate, random, Sequence, useCurrentFrame } from 'remotion';
import { FONTE, FRIO, Q } from '../tema';
import { faixa, tremor } from '../util';

export type Plano = 'mesa' | 'calculadora' | 'planilha' | 'conversa' | 'relogio';

/** Os cortes (quadros globais) e o que entra em cada um. */
export const CORTES: { em: number; plano: Plano; palavra: string | null }[] = [
  { em: 75, plano: 'mesa', palavra: 'Papel.' },
  { em: 105, plano: 'planilha', palavra: 'Planilha.' },
  { em: 135, plano: 'calculadora', palavra: 'Refaz a conta.' },
  { em: 165, plano: 'conversa', palavra: 'Cliente esfria.' },
  { em: 195, plano: 'relogio', palavra: null },
  { em: 225, plano: 'planilha', palavra: 'Trava.' },
  { em: 255, plano: 'calculadora', palavra: 'Refaz.' },
  { em: 270, plano: 'conversa', palavra: 'Esfria.' },
  { em: 285, plano: 'relogio', palavra: null },
];
export const fimDoCorte = (i: number) => CORTES[i + 1]?.em ?? Q.congela;

// -------------------------------------------------------------- cronômetro
/** Segundos "gastos" no quadro global g: de 0 a 2h47min12s, acelerando. */
export function segundosGastos(g: number): number {
  const t = Math.min(1, Math.max(0, (g - Q.sofrimento) / (Q.congela - Q.sofrimento)));
  return Math.round(10032 * t ** 2.4);
}
export const relogioDigital = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');

// ------------------------------------------------------------------ planos
const Papel: React.FC<{ x: number; y: number; rot: number; w?: number; h?: number; semente: string }> = ({
  x,
  y,
  rot,
  w = 520,
  h = 700,
  semente,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      background: FRIO.papel,
      borderRadius: 6,
      transform: `rotate(${rot}deg)`,
      boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
      padding: 38,
      boxSizing: 'border-box',
    }}
  >
    {Array.from({ length: 11 }, (_, i) => (
      <div
        key={i}
        style={{
          height: 14,
          marginBottom: 26,
          borderRadius: 7,
          background: FRIO.papelSombra,
          width: `${45 + random(`${semente}-${i}`) * 50}%`,
        }}
      />
    ))}
    <div style={{ fontFamily: FONTE, fontStyle: 'italic', fontSize: 34, color: '#5d6570', transform: 'rotate(-4deg)' }}>
      210.000 × 0,8 = ?
    </div>
  </div>
);

const Mesa: React.FC<{ f: number; g: number }> = ({ f, g }) => {
  // Mais papel a cada aparição: a pilha nunca diminui.
  const n = 4 + Math.floor((g - Q.sofrimento) / 9);
  const borracha = Math.sin(f * 0.9) * 90;
  return (
    <AbsoluteFill style={{ background: `repeating-linear-gradient(90deg, ${FRIO.meio} 0 140px, #28313d 140px 280px)` }}>
      {Array.from({ length: n }, (_, i) => {
        const novo = i === n - 1;
        const queda = novo ? interpolate(f % 9, [0, 4], [-900, 0], { extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) }) : 0;
        return (
          <Papel
            key={i}
            semente={`p${i}`}
            x={180 + (random(`px${i}`) - 0.5) * 260}
            y={330 + (random(`py${i}`) - 0.5) * 300 + queda}
            rot={(random(`pr${i}`) - 0.5) * 30}
          />
        );
      })}
      <Calculadora f={f} x={600} y={1180} escala={0.85} />
      <div
        style={{
          position: 'absolute',
          left: 330 + borracha,
          top: 980,
          width: 200,
          height: 80,
          borderRadius: 14,
          background: '#8d8f96',
          boxShadow: '0 10px 20px rgba(0,0,0,0.4)',
          transform: 'rotate(-18deg)',
        }}
      />
    </AbsoluteFill>
  );
};

const VISOR = ['2', '21', '210', '2100', '21000', '210000', '×', '0,8', '=', 'ERRO', '0', '3', '32', '320', '3200', 'ERRO'];
const TECLAS = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', ',', '⌫', '='];

export const teclaDoQuadro = (f: number) => Math.floor(f / 3);

const Calculadora: React.FC<{ f: number; x: number; y: number; escala: number }> = ({ f, x, y, escala }) => {
  const passo = teclaDoQuadro(f);
  const visor = VISOR[passo % VISOR.length];
  const apertada = Math.floor(random(`tecla-${passo}`) * TECLAS.length);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 440,
        padding: 30,
        borderRadius: 40,
        background: '#232a33',
        boxShadow: '0 30px 60px rgba(0,0,0,0.55)',
        transform: `scale(${escala}) rotate(6deg)`,
        transformOrigin: 'top left',
      }}
    >
      <div
        style={{
          height: 130,
          borderRadius: 14,
          background: '#8e968f',
          marginBottom: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 24px',
          fontFamily: 'monospace',
          fontSize: 76,
          color: visor === 'ERRO' ? '#5a2e2e' : '#2b312d',
        }}
      >
        {visor}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {TECLAS.map((t, i) => (
          <div
            key={t}
            style={{
              height: 74,
              borderRadius: 16,
              background: i === apertada ? '#59636f' : '#3a434e',
              transform: i === apertada ? 'scale(0.9)' : 'none',
              color: FRIO.texto,
              fontFamily: FONTE,
              fontWeight: 600,
              fontSize: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
};

const CalculadoraGrande: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ background: '#1f262f' }}>
    <Papel semente="cg1" x={-120} y={160} rot={-14} />
    <Papel semente="cg2" x={640} y={1100} rot={22} />
    <Calculadora f={f} x={170} y={420} escala={1.6} />
  </AbsoluteFill>
);

const ERROS = ['#REF!', '#VALOR!', '#DIV/0!', '#REF!', '#N/D', '#VALOR!'];
const LINHAS = ['Renda', 'Imóvel', 'Entrada', 'FGTS', 'Subsídio', 'Financiado', 'Parcela', 'Prazo', 'Taxa', 'Total'];

const Planilha: React.FC<{ f: number; g: number }> = ({ f, g }) => {
  const erros = Math.floor((g - Q.sofrimento) / 6);
  const cursor = { x: 560 + Math.sin(f * 1.7) * 120 + Math.sin(f * 0.6) * 60, y: 1010 + Math.cos(f * 1.3) * 90 };
  const clique = f % 4 < 1;
  return (
    <AbsoluteFill style={{ background: '#161c24', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 980, height: 1360, background: '#e3e6ea', borderRadius: 14, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6)', position: 'relative' }}>
        <div style={{ height: 90, background: '#5d6b7a', color: '#eef1f4', fontFamily: FONTE, fontSize: 30, fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 30px' }}>
          simulacao_FINAL_v7 (2).xlsx — (Não respondendo)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 290px repeat(3, 1fr)', fontFamily: FONTE, fontSize: 30 }}>
          {['', 'A', 'B', 'C', 'D'].map((c) => (
            <div key={c} style={{ height: 56, background: '#c9ced5', borderRight: '1px solid #aeb4bc', borderBottom: '1px solid #aeb4bc', textAlign: 'center', lineHeight: '56px', color: '#4a525c' }}>
              {c}
            </div>
          ))}
          {LINHAS.map((rotulo, r) => (
            <div key={rotulo} style={{ display: 'contents' }}>
              <div style={{ height: 96, background: '#c9ced5', borderRight: '1px solid #aeb4bc', borderBottom: '1px solid #aeb4bc', textAlign: 'center', lineHeight: '96px', color: '#4a525c' }}>
                {r + 1}
              </div>
              <div style={{ height: 96, borderRight: '1px solid #c3c8ce', borderBottom: '1px solid #c3c8ce', lineHeight: '96px', paddingLeft: 16, color: '#39414b' }}>
                {rotulo}
              </div>
              {[0, 1, 2].map((c) => {
                const k = r * 3 + c;
                const erro = k < erros * 2 && random(`e${k}`) > 0.35;
                return (
                  <div key={c} style={{ height: 96, borderRight: '1px solid #c3c8ce', borderBottom: '1px solid #c3c8ce', lineHeight: '96px', textAlign: 'center', fontWeight: erro ? 700 : 400, color: erro ? FRIO.erro : '#39414b' }}>
                    {erro ? ERROS[k % ERROS.length] : c === 0 && r < 4 ? ['3.200', '210.000', '12.000', '10.000'][r] : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* A névoa branca do "Não respondendo" e o círculo girando. */}
        <AbsoluteFill style={{ background: 'rgba(255,255,255,0.42)', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: '50%',
              border: '18px solid rgba(80,95,110,0.25)',
              borderTopColor: '#56697d',
              transform: `rotate(${f * 24}deg)`,
            }}
          />
        </AbsoluteFill>
      </div>
      {/* Cursor nervoso clicando. */}
      <svg style={{ position: 'absolute', left: cursor.x, top: cursor.y }} width={70} height={100} viewBox="0 0 14 20">
        <path d="M0 0 L0 16 L4 12 L7 19 L9.5 18 L6.5 11 L12 11 Z" fill="#fff" stroke="#111" strokeWidth={1} />
      </svg>
      {clique ? (
        <div style={{ position: 'absolute', left: cursor.x - 40, top: cursor.y - 40, width: 80, height: 80, borderRadius: '50%', border: '6px solid rgba(255,255,255,0.7)' }} />
      ) : null}
    </AbsoluteFill>
  );
};

export const MENSAGENS = ['e aí, consigo financiar?', '??', 'oi?', 'vou ver com outro corretor'];
/** Quantas mensagens do cliente já chegaram no quadro global g. */
export const mensagensAte = (g: number) => (g < 165 ? 0 : g < 172 ? 1 : g < 180 ? 2 : g < 270 ? 3 : 4);

const Conversa: React.FC<{ g: number }> = ({ g }) => {
  const n = mensagensAte(g);
  const naoLidas = Math.min(47, 3 + Math.floor((g - 165) / 4));
  return (
    <AbsoluteFill style={{ background: '#141a21', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 760, height: 1540, borderRadius: 90, background: '#07090c', padding: 20, boxShadow: '0 40px 90px rgba(0,0,0,0.7)' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 72, overflow: 'hidden', background: '#2a3139', position: 'relative', fontFamily: FONTE }}>
          <div style={{ height: 210, background: '#3a434d', display: 'flex', alignItems: 'flex-end', padding: '0 34px 30px', gap: 22 }}>
            <div style={{ color: FRIO.texto, fontSize: 44 }}>‹</div>
            <div style={{ minWidth: 64, height: 54, borderRadius: 27, background: '#56606b', color: FRIO.texto, fontSize: 30, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px' }}>
              {naoLidas}
            </div>
            <div style={{ width: 76, height: 76, borderRadius: 38, background: '#5b6570' }} />
            <div>
              <div style={{ color: FRIO.texto, fontSize: 36, fontWeight: 700 }}>Cliente</div>
              <div style={{ color: FRIO.claro, fontSize: 26 }}>online</div>
            </div>
          </div>
          <div style={{ padding: 34, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {MENSAGENS.slice(0, n).map((m, i) => (
              <div
                key={m}
                style={{
                  alignSelf: 'flex-start',
                  maxWidth: '80%',
                  background: '#46505b',
                  color: FRIO.texto,
                  fontSize: 40,
                  padding: '22px 30px',
                  borderRadius: '8px 34px 34px 34px',
                  transform: `scale(${i === n - 1 ? faixa(g, [165, 172, 180, 270][i], [165, 172, 180, 270][i] + 4) : 1})`,
                  transformOrigin: 'left top',
                }}
              >
                {m}
                <span style={{ fontSize: 24, color: FRIO.claro, marginLeft: 18 }}>{['14:02', '14:31', '15:10', '16:47'][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Relogio: React.FC<{ g: number }> = ({ g }) => {
  const giro = (g - Q.sofrimento) * 38;
  return (
    <AbsoluteFill style={{ background: '#161c23', alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 380, width: 760, height: 760, borderRadius: '50%', background: '#d0d4da', border: '30px solid #3a434e', boxShadow: '0 40px 90px rgba(0,0,0,0.6)' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: 12, height: 56, marginLeft: -6, background: '#4b545f', transform: `rotate(${i * 30}deg) translateY(-300px)` }} />
        ))}
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 22, height: 220, marginLeft: -11, marginTop: -210, background: '#2f363f', borderRadius: 11, transformOrigin: '50% 210px', transform: `rotate(${giro / 12}deg)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 14, height: 300, marginLeft: -7, marginTop: -290, background: '#2f363f', borderRadius: 7, transformOrigin: '50% 290px', transform: `rotate(${giro}deg)` }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, margin: -22, borderRadius: 22, background: '#2f363f' }} />
      </div>
      <div style={{ position: 'absolute', top: 1260, fontFamily: FONTE, fontWeight: 800, fontSize: 170, letterSpacing: -4, color: FRIO.erro, fontVariantNumeric: 'tabular-nums' }}>
        {relogioDigital(segundosGastos(g))}
      </div>
    </AbsoluteFill>
  );
};

export const PlanoRender: React.FC<{ plano: Plano; f: number; g: number }> = ({ plano, f, g }) => {
  if (plano === 'mesa') return <Mesa f={f} g={g} />;
  if (plano === 'calculadora') return <CalculadoraGrande f={f} />;
  if (plano === 'planilha') return <Planilha f={f} g={g} />;
  if (plano === 'conversa') return <Conversa g={g} />;
  return <Relogio g={g} />;
};

// ------------------------------------------------------- tratamento "antes"
/** Dessaturado, azul frio e vinheta: o visual do "antes". */
export const GradeFria: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <AbsoluteFill style={{ filter: 'saturate(0.2) contrast(1.05) brightness(0.92)' }}>{children}</AbsoluteFill>
    <AbsoluteFill style={{ background: 'rgba(30, 60, 100, 0.22)', mixBlendMode: 'multiply' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)' }} />
  </AbsoluteFill>
);

/** O cronômetro no topo, contando o tempo que o corretor está perdendo. */
export const Cronometro: React.FC<{ g: number }> = ({ g }) => (
  <div
    style={{
      position: 'absolute',
      top: 110,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 36px', borderRadius: 60, background: 'rgba(10,12,16,0.78)', fontFamily: FONTE, fontWeight: 800, fontSize: 64, color: FRIO.erro, fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: FRIO.erro }} />
      {relogioDigital(segundosGastos(g))}
    </div>
  </div>
);

export const Sofrimento: React.FC = () => {
  const f = useCurrentFrame();
  const g = f + Q.sofrimento;
  const i = Math.max(0, CORTES.findIndex((c, k) => g >= c.em && g < fimDoCorte(k)));
  const corte = CORTES[i];
  // Tremor que cresce com o tempo + um tranco em cada corte.
  const desdeOCorte = g - corte.em;
  const amp = interpolate(g, [Q.sofrimento, Q.congela], [2, 18]) + Math.max(0, 10 - desdeOCorte * 2.5);
  const t = tremor(g, amp);
  return (
    <AbsoluteFill style={{ background: FRIO.fundo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${t.x}px, ${t.y}px) rotate(${t.r}deg) scale(1.06)` }}>
        <GradeFria>
          {CORTES.map((c, k) => (
            <Sequence key={c.em} from={c.em - Q.sofrimento} durationInFrames={fimDoCorte(k) - c.em} layout="none">
              <PlanoRender plano={c.plano} f={g - c.em} g={g} />
            </Sequence>
          ))}
        </GradeFria>
      </AbsoluteFill>
      <Cronometro g={g} />
      {corte.palavra ? (
        <div
          style={{
            position: 'absolute',
            left: 70,
            right: 70,
            bottom: 230,
            fontFamily: FONTE,
            fontWeight: 900,
            fontSize: corte.palavra.length > 10 ? 150 : 190,
            lineHeight: 0.95,
            letterSpacing: -6,
            color: '#eef1f5',
            textShadow: '0 10px 40px rgba(0,0,0,0.8)',
            transform: `scale(${interpolate(desdeOCorte, [0, 5], [1.18, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })})`,
            transformOrigin: 'left bottom',
          }}
        >
          {corte.palavra}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
