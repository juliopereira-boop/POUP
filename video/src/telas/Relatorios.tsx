/**
 * C7 — "Relatórios · Simulações concluídas." com filtro por empreendimento, e
 * os papéis do "antes" voltando por 10 quadros para serem varridos.
 */
import { AbsoluteFill, Easing, random, spring, useVideoConfig } from 'remotion';
import { FONTE, FRIO, MARCA } from '../tema';
import { brl, faixa } from '../util';
import { T } from '../roteiro';
import { Toque } from './ui';

const ITENS_EM = T.itens;
const TOQUE_FILTRO = T.filtro;
const PAPEIS_VOLTAM = T.papeisVoltam;
const VARRE = T.varre;

// ---------------------------------------------------------- tela: relatórios
const ITENS = [
  ['Ana Souza', 'Res. Jardins', 958.4, 'Venda realizada'],
  ['Bruno Lima', 'Vila Aurora', 1102.15, 'Dentro do risco'],
  ['Carla Dias', 'Res. Jardins', 874.9, 'Dentro do risco'],
  ['Diego Alves', 'Parque do Sol', 1215, 'Dentro do risco'],
  ['Elisa Rocha', 'Res. Jardins', 990.3, 'Venda realizada'],
  ['Fábio Nunes', 'Vila Aurora', 1048.7, 'Dentro do risco'],
  ['Gabi Torres', 'Parque do Sol', 912.6, 'Dentro do risco'],
] as const;
const FILTRO = 'Res. Jardins';

export const Relatorios: React.FC<{ s: number }> = ({ s }) => {
  const { fps } = useVideoConfig();
  const filtrou = faixa(s, TOQUE_FILTRO, TOQUE_FILTRO + 10);
  const aperto = s >= TOQUE_FILTRO && s < TOQUE_FILTRO + 4;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '120px 32px 0', fontFamily: FONTE }}>
      <Toque s={s} em={TOQUE_FILTRO} x={265} y={268} />
      <div style={{ color: MARCA.tinta, fontSize: 50, fontWeight: 800 }}>Relatórios</div>
      <div style={{ color: MARCA.tintaSuave, fontSize: 28, margin: '6px 0 22px' }}>Simulações concluídas.</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
        {['Todas', FILTRO, 'Vila Aurora'].map((c) => {
          const ativo = c === FILTRO ? filtrou > 0.5 : c === 'Todas' ? filtrou <= 0.5 : false;
          return (
            <div
              key={c}
              style={{
                padding: '14px 24px',
                borderRadius: 40,
                fontSize: 26,
                fontWeight: 700,
                background: ativo ? MARCA.laranja : MARCA.branco,
                color: ativo ? MARCA.branco : MARCA.tinta,
                border: `2px solid ${ativo ? MARCA.laranja : MARCA.borda}`,
                transform: c === FILTRO && aperto ? 'scale(0.92)' : 'none',
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
      {ITENS.map(([nome, emp, parcela, status], k) => {
        const p = spring({ frame: s - ITENS_EM(k), fps, config: { damping: 11, stiffness: 200 } });
        const sai = emp !== FILTRO ? filtrou : 0;
        const vendido = status === 'Venda realizada';
        return (
          <div
            key={nome}
            style={{
              height: 150 * (1 - sai),
              marginBottom: 16 * (1 - sai),
              opacity: Math.min(1, p) * (1 - sai),
              transform: `translateX(${(1 - p) * 200}px) scale(${1 - sai * 0.1})`,
              overflow: 'hidden',
            }}
          >
            <div style={{ height: 150, boxSizing: 'border-box', borderRadius: 24, background: MARCA.branco, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 6px 18px rgba(17,24,39,0.06)' }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, color: MARCA.tinta }}>{nome}</div>
                <div style={{ fontSize: 24, color: MARCA.tintaSuave, marginTop: 4 }}>{emp}</div>
                <div style={{ fontSize: 24, color: MARCA.tinta, marginTop: 6 }}>
                  Parcela mensal <b>{brl(parcela)}</b>
                </div>
              </div>
              <div style={{ padding: '10px 16px', borderRadius: 30, fontSize: 22, fontWeight: 800, background: vendido ? MARCA.laranjaSuave : MARCA.verdeSuave, color: vendido ? MARCA.laranjaEscuro : MARCA.verde }}>
                {vendido ? 'Venda realizada' : '✓ Dentro'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ------------------------------------------- os papéis do "antes", varridos
export const PapeisVoltando: React.FC<{ s: number }> = ({ s }) => {
  if (s < PAPEIS_VOLTAM[0] || s > VARRE[1] + 2) return null;
  const cai = faixa(s, PAPEIS_VOLTAM[0], PAPEIS_VOLTAM[0] + 5, Easing.in(Easing.quad));
  const varre = faixa(s, VARRE[0], VARRE[1], Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 80 + random(`vx${i}`) * 620 + varre * (1500 + i * 120),
            top: 360 + random(`vy${i}`) * 1000 - (1 - cai) * 1200,
            width: 360,
            height: 470,
            background: FRIO.papel,
            filter: 'saturate(0)',
            borderRadius: 6,
            transform: `rotate(${(random(`vr${i}`) - 0.5) * 40 + varre * 70}deg)`,
            boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
            padding: 30,
            boxSizing: 'border-box',
          }}
        >
          {Array.from({ length: 8 }, (_, k) => (
            <div key={k} style={{ height: 12, marginBottom: 22, borderRadius: 6, background: FRIO.papelSombra, width: `${40 + random(`vl${i}-${k}`) * 55}%` }} />
          ))}
        </div>
      ))}
      {/* A vassourada laranja. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 520,
          left: -600 + varre * 2300,
          background: `linear-gradient(90deg, transparent, ${MARCA.laranjaClaro} 40%, ${MARCA.branco} 55%, transparent)`,
          opacity: varre > 0 && varre < 1 ? 0.85 : 0,
          transform: 'skewX(-14deg)',
        }}
      />
    </AbsoluteFill>
  );
};

