/**
 * Peças da interface do POUP dentro do celular (tela de 684 × 1444).
 * Cores e rótulos do app de verdade (src/theme/colors.ts e as telas).
 */
import { interpolate, spring } from 'remotion';
import { FONTE, MARCA } from '../tema';
import { faixa, letras } from '../util';

export const mola = (s: number, em: number, damping = 11, stiffness = 200) =>
  spring({ frame: s - em, fps: 30, config: { damping, stiffness } });

/** O dedo tocando: um círculo que aparece e se abre. É o que mostra o "uso". */
export const Toque: React.FC<{ s: number; em: number; x: number; y: number }> = ({ s, em, x, y }) => {
  const d = s - em;
  if (d < -4 || d > 10) return null;
  const chega = interpolate(d, [-4, 0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const abre = faixa(d, 0, 10);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - 44,
          top: y - 44,
          width: 88,
          height: 88,
          borderRadius: 44,
          background: 'rgba(17,24,39,0.28)',
          border: '4px solid rgba(255,255,255,0.9)',
          transform: `scale(${d < 0 ? 1.3 - chega * 0.3 : 1 - abre * 0.15})`,
          opacity: d < 0 ? chega : 1 - abre,
          zIndex: 50,
        }}
      />
      {d >= 0 ? (
        <div
          style={{
            position: 'absolute',
            left: x - 44 - abre * 50,
            top: y - 44 - abre * 50,
            width: 88 + abre * 100,
            height: 88 + abre * 100,
            borderRadius: '50%',
            border: '3px solid rgba(255,117,31,0.7)',
            opacity: 1 - abre,
            zIndex: 50,
          }}
        />
      ) : null}
    </>
  );
};

export const Voltar: React.FC = () => <div style={{ color: MARCA.laranja, fontSize: 30, fontWeight: 600 }}>‹ Voltar</div>;

export const Titulo: React.FC<{ children: React.ReactNode; sub?: string }> = ({ children, sub }) => (
  <div style={{ margin: '12px 0 24px' }}>
    <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800, letterSpacing: -0.5 }}>{children}</div>
    {sub ? <div style={{ color: MARCA.tintaSuave, fontSize: 27, marginTop: 4 }}>{sub}</div> : null}
  </div>
);

export const Tela: React.FC<{ children: React.ReactNode; fundo?: string; topo?: number }> = ({ children, fundo = MARCA.fundoApp, topo = 118 }) => (
  <div style={{ position: 'absolute', inset: 0, background: fundo, padding: `${topo}px 36px 0`, fontFamily: FONTE, overflow: 'hidden' }}>
    {children}
  </div>
);

/** Campo do formulário. `valor` aparece digitado de `de` a `ate`; `brilho` pisca laranja quando é preenchido sozinho. */
export const Campo: React.FC<{
  rotulo: string;
  valor: string;
  s: number;
  de: number;
  ate: number;
  brilho?: boolean;
  compacto?: boolean;
}> = ({ rotulo, valor, s, de, ate, brilho = false, compacto = false }) => {
  const texto = letras(valor, s, de, valor.length / Math.max(1, ate - de));
  const foco = !brilho && s >= de && s < ate + 2;
  const flash = brilho ? interpolate(s - de, [0, 3, 14], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  return (
    <div style={{ marginBottom: compacto ? 14 : 18 }}>
      <div style={{ color: MARCA.tintaSuave, fontSize: 24, fontWeight: 600, marginBottom: 7 }}>{rotulo}</div>
      <div
        style={{
          height: compacto ? 74 : 84,
          borderRadius: 18,
          background: flash > 0 ? `rgba(255,243,234,${0.4 + flash * 0.6})` : MARCA.branco,
          border: `3px solid ${foco || flash > 0.2 ? MARCA.laranja : MARCA.borda}`,
          boxShadow: foco ? `0 0 0 6px ${MARCA.laranjaSuave}` : flash > 0 ? `0 0 ${24 * flash}px rgba(255,117,31,${0.5 * flash})` : 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          fontSize: 32,
          fontWeight: 600,
          color: MARCA.tinta,
        }}
      >
        {brilho ? (s >= de ? valor : '') : texto}
        {foco ? <span style={{ width: 3, height: 38, background: MARCA.laranja, marginLeft: 3 }} /> : null}
      </div>
    </div>
  );
};

export const Botao: React.FC<{
  children: React.ReactNode;
  s: number;
  toque?: number;
  tipo?: 'cheio' | 'contorno';
  altura?: number;
  estilo?: React.CSSProperties;
}> = ({ children, s, toque, tipo = 'cheio', altura = 96, estilo }) => {
  const aperto = toque != null && s >= toque && s < toque + 5;
  const cheio = tipo === 'cheio';
  return (
    <div
      style={{
        height: altura,
        borderRadius: 24,
        background: cheio ? (aperto ? MARCA.laranjaEscuro : MARCA.laranja) : MARCA.branco,
        border: cheio ? 'none' : `3px solid ${MARCA.laranja}`,
        color: cheio ? MARCA.branco : MARCA.laranja,
        fontSize: 31,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${aperto ? 0.95 : 1})`,
        boxShadow: cheio ? '0 14px 28px rgba(255,117,31,0.32)' : 'none',
        ...estilo,
      }}
    >
      {children}
    </div>
  );
};

/** Folha que sobe de baixo (os seletores e a LIA). `aberta` de 0 a 1. */
export const Folha: React.FC<{ aberta: number; altura: number; children: React.ReactNode; escura?: boolean }> = ({
  aberta,
  altura,
  children,
  escura = false,
}) => {
  if (aberta <= 0.001) return null;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(17,24,39,${0.4 * aberta})`, zIndex: 20 }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: altura,
          transform: `translateY(${(1 - aberta) * altura}px)`,
          background: escura ? '#141821' : MARCA.branco,
          borderRadius: '44px 44px 0 0',
          padding: '22px 36px 0',
          boxSizing: 'border-box',
          fontFamily: FONTE,
          zIndex: 21,
          boxShadow: '0 -20px 50px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ width: 90, height: 10, borderRadius: 5, background: escura ? '#3a4150' : MARCA.borda, margin: '0 auto 24px' }} />
        {children}
      </div>
    </>
  );
};

/** O orbe da LIA (a assistente do POUP — um algoritmo, sem IA generativa). */
export const OrbeLia: React.FC<{ tamanho: number; s: number; ativa?: boolean }> = ({ tamanho, s, ativa = false }) => (
  <div
    style={{
      width: tamanho,
      height: tamanho,
      borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, #FFD2A8, ${MARCA.laranja} 55%, ${MARCA.laranjaEscuro})`,
      boxShadow: `0 0 ${ativa ? 30 + Math.sin(s / 2.5) * 14 : 18}px rgba(255,117,31,0.7)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: MARCA.branco,
      fontWeight: 900,
      fontSize: tamanho * 0.3,
      fontFamily: FONTE,
      letterSpacing: 1,
    }}
  >
    LIA
  </div>
);

export const Selo: React.FC<{ children: React.ReactNode; s: number; em: number; cor?: string; fundo?: string }> = ({
  children,
  s,
  em,
  cor = MARCA.verde,
  fundo = MARCA.verdeSuave,
}) => {
  const p = mola(s, em, 8, 220);
  return (
    <div
      style={{
        display: 'inline-block',
        padding: '10px 18px',
        borderRadius: 40,
        background: fundo,
        color: cor,
        fontSize: 24,
        fontWeight: 800,
        transform: `scale(${p})`,
        transformOrigin: 'left center',
      }}
    >
      {children}
    </div>
  );
};
