/**
 * 5. PROVA (660–780): tela dividida. À esquerda o "antes" (cinza, relógio
 * lento): "horas". À direita o POUP (laranja, relógio zapeando): "segundos".
 * Depois a direita empurra a esquerda para fora.
 *
 * Sem número inventado: o briefing não trouxe o dado real, então a prova é
 * "de horas para segundos".
 */
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONTE, FRIO, MARCA } from '../tema';
import { faixa } from '../util';

export const EMPURRA = [70, 84] as const; // quadros locais (730–744)

const Mostrador: React.FC<{ giro: number; cor: string; fundo: string; ponteiro: string }> = ({ giro, cor, fundo, ponteiro }) => (
  <div style={{ width: 300, height: 300, borderRadius: '50%', background: fundo, border: `18px solid ${cor}`, position: 'relative', boxSizing: 'border-box' }}>
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 12, height: 110, marginLeft: -6, marginTop: -104, background: ponteiro, borderRadius: 6, transformOrigin: '50% 104px', transform: `rotate(${giro}deg)` }} />
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 30, height: 30, margin: -15, borderRadius: 15, background: ponteiro }} />
  </div>
);

const Lado: React.FC<{ rotulo: string; valor: string; antes: boolean; giro: number }> = ({ rotulo, valor, antes, giro }) => (
  <AbsoluteFill
    style={{
      background: antes ? `linear-gradient(180deg, ${FRIO.meio}, ${FRIO.fundo})` : `linear-gradient(165deg, #FF8A3D, ${MARCA.laranja} 50%, ${MARCA.laranjaEscuro})`,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 60,
      filter: antes ? 'saturate(0.2)' : 'none',
    }}
  >
    <Mostrador
      giro={giro}
      cor={antes ? FRIO.borda : MARCA.branco}
      fundo={antes ? '#c9ced5' : MARCA.laranjaSuave}
      ponteiro={antes ? '#3a434e' : MARCA.laranjaEscuro}
    />
    <div style={{ textAlign: 'center', fontFamily: FONTE }}>
      <div style={{ fontSize: 56, fontWeight: 700, color: antes ? FRIO.claro : 'rgba(255,255,255,0.9)' }}>{rotulo}</div>
      <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -3, color: antes ? FRIO.texto : MARCA.branco }}>{valor}</div>
    </div>
  </AbsoluteFill>
);

export const Prova: React.FC = () => {
  const f = useCurrentFrame();
  const entra = faixa(f, 0, 12, Easing.out(Easing.cubic));
  const empurra = faixa(f, EMPURRA[0], EMPURRA[1], Easing.inOut(Easing.cubic));
  const metade = 540;
  // A direita cresce de metade para a tela inteira; a esquerda é empurrada.
  const larguraDireita = metade + empurra * metade;
  const frase = faixa(f, EMPURRA[1] + 2, EMPURRA[1] + 12);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: -metade * empurra - (1 - entra) * metade, width: metade, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: 1080, left: -270 }}>
          <Lado rotulo="Antes" valor="horas" antes giro={f * 1.5} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: -(1 - entra) * metade, width: larguraDireita, overflow: 'hidden', boxShadow: '-30px 0 60px rgba(0,0,0,0.35)' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1080, left: -270 * (1 - empurra) }}>
          <Lado rotulo="Agora" valor="segundos" antes={false} giro={f * 47} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 300,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontFamily: FONTE,
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.02,
          letterSpacing: -3,
          color: MARCA.branco,
          opacity: frase,
          transform: `translateY(${(1 - frase) * 50}px)`,
        }}
      >
        De horas para segundos.
      </div>
      {/* Divisória no começo. */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: metade - 4 + interpolate(empurra, [0, 1], [0, -metade]), width: 8, background: 'rgba(255,255,255,0.8)', opacity: entra * (1 - empurra) }} />
    </AbsoluteFill>
  );
};
