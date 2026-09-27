/**
 * C4 — a LIA agenda a visita ("Agendar compromisso") e, na hora certa, o
 * celular avisa: a notificação usa o mesmo texto dos lembretes do app
 * ("Em 1 hora: …" / "Às 15:00 · cliente · empreendimento").
 */
import { interpolate } from 'remotion';
import { FONTE, MARCA } from '../tema';
import { faixa, letras } from '../util';
import { T, V } from '../roteiro';
import { Folha, mola, OrbeLia, Tela, Toque } from './ui';

export const FRASE_AGENDA = 'visita ao decorado com a Ana amanhã às 15h';

const Compromisso: React.FC<{ hora: string; titulo: string; sub: string; destaque?: number }> = ({ hora, titulo, sub, destaque = 0 }) => (
  <div
    style={{
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      background: MARCA.branco,
      borderRadius: 24,
      padding: '20px 22px',
      marginBottom: 16,
      border: `2px solid ${destaque > 0 ? MARCA.laranja : MARCA.borda}`,
      boxShadow: destaque > 0 ? `0 0 ${36 * destaque}px rgba(255,117,31,0.35)` : 'none',
      transform: `scale(${0.9 + destaque * 0.1})`,
      opacity: destaque === 0 ? 1 : Math.min(1, destaque * 1.4),
    }}
  >
    <div style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: MARCA.laranja }} />
    <div style={{ fontSize: 30, fontWeight: 800, color: MARCA.tinta, width: 96 }}>{hora}</div>
    <div>
      <div style={{ fontSize: 29, fontWeight: 800, color: MARCA.tinta }}>{titulo}</div>
      <div style={{ fontSize: 23, color: MARCA.tintaSuave, marginTop: 4 }}>{sub}</div>
    </div>
  </div>
);

export const AgendaComLia: React.FC<{ s: number }> = ({ s }) => {
  const aberta = faixa(s, T.liaAgenda + 2, T.liaAgenda + 9) * (1 - faixa(s, T.agendado + 8, T.agendado + 14));
  const texto = letras(FRASE_AGENDA, s, T.agendaTexto, FRASE_AGENDA.length / (T.agendado - T.agendaTexto - 4));
  const confirmado = mola(s, T.agendado, 10, 200);
  const novo = s >= T.agendado + 12 ? mola(s, T.agendado + 12, 10, 180) : 0;
  return (
    <Tela>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800 }}>Calendário</div>
      <div style={{ color: MARCA.tintaSuave, fontSize: 27, margin: '4px 0 26px' }}>Amanhã · quarta-feira</div>
      <Compromisso hora="09:30" titulo="Ligação · Bruno Lima" sub="Retorno da simulação" />
      {novo > 0 ? <Compromisso hora="15:00" titulo="Visita ao decorado" sub={`Ana Souza · ${V.empreendimento} · lembrete 1 h antes`} destaque={novo} /> : null}
      <Compromisso hora="17:00" titulo="Assinatura · Carla Dias" sub="Vila Aurora" />
      <div style={{ position: 'absolute', right: 36, bottom: 60, zIndex: 10 }}>
        <OrbeLia tamanho={110} s={s} ativa={aberta > 0} />
      </div>
      <Toque s={s} em={T.liaAgenda} x={593} y={1329} />
      <Folha aberta={aberta} altura={660} escura>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <OrbeLia tamanho={70} s={s} ativa />
          <div>
            <div style={{ color: '#fff', fontSize: 32, fontWeight: 800 }}>Assistente por texto</div>
            <div style={{ color: MARCA.laranjaClaro, fontSize: 24, fontWeight: 700 }}>Agendar compromisso</div>
          </div>
        </div>
        <div style={{ color: '#aab2c0', fontSize: 25, marginBottom: 18 }}>Digite o dia, a hora e o compromisso. A LIA marca no calendário.</div>
        <div style={{ background: '#232937', borderRadius: 24, padding: '22px 24px', color: '#fff', fontSize: 31, lineHeight: 1.35, minHeight: 100 }}>{texto}</div>
        {s >= T.agendado ? (
          <div
            style={{
              marginTop: 20,
              background: 'rgba(22,163,74,0.16)',
              border: '2px solid rgba(22,163,74,0.6)',
              borderRadius: 22,
              padding: '18px 22px',
              color: '#b9f5cf',
              fontSize: 27,
              fontWeight: 700,
              transform: `scale(${confirmado})`,
              transformOrigin: 'left top',
            }}
          >
            ✓ Agendado: Visita ao decorado · amanhã, 15:00
          </div>
        ) : null}
      </Folha>
    </Tela>
  );
};

/** A tela bloqueada, no dia seguinte, com o lembrete chegando. */
export const TelaBloqueada: React.FC<{ s: number }> = ({ s }) => {
  const chega = mola(s, T.notificacao, 12, 170);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        fontFamily: FONTE,
        background: 'radial-gradient(circle at 30% 20%, #ffb26b, #ff751f 40%, #7a2e06 100%)',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{ marginTop: 150, fontSize: 30, fontWeight: 600, opacity: 0.9 }}>quarta-feira, 30 de setembro</div>
      <div style={{ fontSize: 170, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05 }}>14:00</div>
      <div
        style={{
          position: 'absolute',
          left: 26,
          right: 26,
          top: 470,
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px)',
          borderRadius: 40,
          padding: '24px 26px',
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
          textAlign: 'left',
          color: MARCA.tinta,
          transform: `translateY(${(1 - chega) * -420}px) scale(${0.9 + chega * 0.1})`,
          opacity: interpolate(chega, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ width: 76, height: 76, borderRadius: 20, background: '#fff', border: `2px solid ${MARCA.borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 40, color: MARCA.tinta, flexShrink: 0 }}>
          P<span style={{ color: MARCA.laranja }}>.</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 23, color: MARCA.tintaSuave, fontWeight: 700 }}>
            <span>POUP GESTÃO</span>
            <span>agora</span>
          </div>
          <div style={{ fontSize: 31, fontWeight: 800, marginTop: 4 }}>Em 1 hora: Visita ao decorado</div>
          <div style={{ fontSize: 26, color: '#374151', marginTop: 4 }}>Às 15:00 · Ana Souza · {V.empreendimento}</div>
        </div>
      </div>
    </div>
  );
};
