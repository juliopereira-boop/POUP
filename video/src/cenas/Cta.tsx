/**
 * 6. CTA (780–900): fundo na cor da marca, ícone, "Simule rápido. Venda mais.",
 * botão pulsando na batida e o endereço. Os últimos 15 quadros ficam parados.
 */
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { IconeApp } from '../componentes/Logo';
import { BATIDA, FONTE, MARCA, Q } from '../tema';
import { faixa } from '../util';

/** O CTA (o briefing não trouxe: confirme o texto e o endereço). */
export const CTA = { botao: 'Teste grátis', endereco: 'poupgestao.com' };
/** Último pulso na batida do acorde final (quadro 870); de 885 a 900, parado. */
export const ULTIMO_PULSO = 870;

export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = f + Q.cta;
  const icone = spring({ frame: f - 2, fps, config: { damping: 9, stiffness: 160 } });
  const titulo = spring({ frame: f - 10, fps, config: { damping: 13, stiffness: 140 } });
  const botao = spring({ frame: f - 22, fps, config: { damping: 10, stiffness: 180 } });
  const url = faixa(f, 32, 42);
  // Pulso: em cada batida (contada do drop) até o último acorde.
  const desdeBatida = g <= ULTIMO_PULSO ? (g - Q.drop) % BATIDA : 99;
  const pulso = g >= Q.cta + 28 ? interpolate(desdeBatida, [0, 2, 10], [1, 1.08, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) }) : 1;
  return (
    <AbsoluteFill style={{ background: MARCA.laranja, alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 38%, rgba(255,220,180,0.55), transparent 60%)' }} />
      <div style={{ transform: `scale(${icone})`, marginBottom: 70 }}>
        <IconeApp tamanho={300} />
      </div>
      <div
        style={{
          fontFamily: FONTE,
          fontWeight: 900,
          fontSize: 128,
          lineHeight: 1,
          letterSpacing: -4,
          color: MARCA.branco,
          textAlign: 'center',
          padding: '0 60px',
          opacity: titulo,
          transform: `translateY(${(1 - titulo) * 60}px)`,
          textShadow: '0 10px 40px rgba(130,40,0,0.3)',
        }}
      >
        Simule rápido.
        <br />
        Venda mais.
      </div>
      <div
        style={{
          marginTop: 90,
          padding: '40px 90px',
          borderRadius: 80,
          background: MARCA.branco,
          color: MARCA.laranjaEscuro,
          fontFamily: FONTE,
          fontWeight: 900,
          fontSize: 76,
          transform: `scale(${botao * pulso})`,
          boxShadow: `0 20px 50px rgba(120,40,0,0.35), 0 0 0 ${(pulso - 1) * 300}px rgba(255,255,255,0.25)`,
        }}
      >
        {CTA.botao}
      </div>
      <div style={{ marginTop: 50, fontFamily: FONTE, fontWeight: 700, fontSize: 58, color: MARCA.branco, opacity: url, letterSpacing: 1 }}>
        {CTA.endereco}
      </div>
    </AbsoluteFill>
  );
};
