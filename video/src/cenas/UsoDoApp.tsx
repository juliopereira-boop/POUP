/**
 * 4. O USO DO APP (360–1110, 25 s): um celular só, do começo ao fim, com as
 * telas do POUP entrando uma depois da outra — o dia de um corretor. O roteiro
 * (quadros, valores) está em `roteiro.ts`; as telas em `telas/`.
 *
 * Valores ILUSTRATIVOS, sem taxa e sem nome de banco (aviso no rodapé).
 */
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Celular } from '../componentes/Celular';
import { FONTE, MARCA } from '../tema';
import { faixa } from '../util';
import { C, T } from '../roteiro';
import { AgendaComLia, TelaBloqueada } from '../telas/Agenda';
import { ControleComissao, Ranking, RegistrarVenda } from '../telas/Comissao';
import { FormFinanciamento, ResultadoFinanciamento } from '../telas/Financiamento';
import { ConversaCliente, PdfProposta, UnidadeECliente } from '../telas/Proposta';
import { PapeisVoltando, Relatorios } from '../telas/Relatorios';
import { SimuladorVendas } from '../telas/Vendas';

/** As telas, na ordem, com o quadro em que cada uma entra. */
const TELAS: { entra: number; Tela: React.FC<{ s: number }>; efeito?: 'sobe' | 'some' }[] = [
  { entra: 0, Tela: FormFinanciamento },
  { entra: T.simular + 2, Tela: ResultadoFinanciamento, efeito: 'sobe' },
  { entra: T.levarParaVendas + 4, Tela: SimuladorVendas },
  { entra: C.proposta - 10, Tela: UnidadeECliente },
  { entra: T.gerarProposta + 4, Tela: ConversaCliente },
  { entra: C.agenda - 8, Tela: AgendaComLia },
  { entra: T.bloqueia, Tela: TelaBloqueada, efeito: 'some' },
  { entra: C.comissao - 6, Tela: RegistrarVenda, efeito: 'some' },
  { entra: T.registrar + 6, Tela: ControleComissao },
  { entra: C.ranking - 2, Tela: Ranking },
  { entra: C.relatorios, Tela: Relatorios },
];
const TRANSICAO = 8;

const MANCHETES: [number, number, string][] = [
  [64, 108, 'Simulação em segundos.'],
  [112, 176, 'Tabela de preço na mão.'],
  [180, 256, 'A LIA preenche pra você.'],
  [262, 354, 'Proposta no WhatsApp do cliente.'],
  [362, 446, 'A LIA agenda. O celular avisa.'],
  [454, 546, 'Comissão calculada sozinha.'],
  [554, 636, 'E você sobe no ranking.'],
  [642, 696, 'Tudo organizado.'],
  [702, 750, 'Adeus, papel.'],
];

const Manchete: React.FC<{ s: number; de: number; ate: number; texto: string }> = ({ s, de, ate, texto }) => {
  const { fps } = useVideoConfig();
  if (s < de || s >= ate) return null;
  const entra = spring({ frame: s - de, fps, config: { damping: 12, stiffness: 160 } });
  const sai = faixa(s, ate - 6, ate, Easing.in(Easing.cubic));
  return (
    <div
      style={{
        position: 'absolute',
        top: 110,
        left: 50,
        right: 50,
        textAlign: 'center',
        fontFamily: FONTE,
        fontWeight: 900,
        fontSize: texto.length > 20 ? 86 : 98,
        lineHeight: 1,
        letterSpacing: -3,
        color: MARCA.branco,
        textShadow: '0 10px 40px rgba(130,40,0,0.35)',
        opacity: entra * (1 - sai),
        transform: `translateY(${(1 - entra) * 70 - sai * 60}px) scale(${0.92 + entra * 0.08})`,
      }}
    >
      {texto}
    </div>
  );
};

export const FundoMarca: React.FC<{ s: number }> = ({ s }) => (
  <AbsoluteFill style={{ background: `linear-gradient(165deg, #FF8A3D 0%, ${MARCA.laranja} 45%, ${MARCA.laranjaEscuro} 100%)` }}>
    <div style={{ position: 'absolute', width: 1100, height: 1100, borderRadius: '50%', left: -300 + Math.sin(s / 40) * 80, top: 200, background: 'radial-gradient(circle, rgba(255,230,200,0.45), transparent 65%)' }} />
    <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', right: -320, top: 1100 + Math.cos(s / 35) * 60, background: 'radial-gradient(circle, rgba(255,210,160,0.35), transparent 65%)' }} />
  </AbsoluteFill>
);

/** Da tela do celular (684×1444) para a tela do vídeo. */
const naTela = (x: number, y: number) => ({ x: 216 + 16 + x * 0.9, y: 400 + 16 + y * 0.9 });

export const UsoDoApp: React.FC = () => {
  const s = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({ frame: s, fps, config: { damping: 14, stiffness: 120 } });
  const sai = faixa(s, C.fim - 12, C.fim, Easing.in(Easing.cubic));
  const giroY = Math.sin(s / 28) * 7 - 6;
  const giroX = 5 + Math.cos(s / 34) * 2;

  // A proposta voando do botão até o balão da conversa.
  const voo = faixa(s, T.pdfVoa[0], T.pdfVoa[1], Easing.inOut(Easing.cubic));
  const noVoo = s >= T.pdfVoa[0] && s < T.pdfVoa[1];
  const de = naTela(342, 1086);
  const ate = naTela(452, 640);
  const px = interpolate(voo, [0, 1], [de.x, ate.x]);
  const py = interpolate(voo, [0, 1], [de.y, ate.y]) - Math.sin(voo * Math.PI) * 380;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <FundoMarca s={s} />
      {MANCHETES.map(([a, b, t]) => (
        <Manchete key={t} s={s} de={a} ate={b} texto={t} />
      ))}
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: 400,
            transform: `translateY(${(1 - entra) * 1500 + sai * 1600}px) scale(${0.82 + entra * 0.08 - sai * 0.1})`,
            transformOrigin: 'top center',
          }}
        >
          <Celular giroY={giroY} giroX={giroX} brilho={0.6 + 0.4 * Math.sin(s / 10) ** 2}>
            {TELAS.map(({ entra: e, Tela, efeito }, i) => {
              const proxima = TELAS[i + 1]?.entra ?? Infinity;
              if (s < e || s >= proxima + TRANSICAO) return null;
              const chega = i === 0 ? 1 : faixa(s, e, e + TRANSICAO);
              const vai = Number.isFinite(proxima) ? faixa(s, proxima, proxima + TRANSICAO) : 0;
              const efeitoDaProxima = TELAS[i + 1]?.efeito;
              let transform = `translateX(${(1 - chega) * 100}%)`;
              if (efeito === 'sobe') transform = `translateY(${(1 - chega) * 100}%)`;
              if (efeito === 'some') transform = `scale(${1.06 - chega * 0.06})`;
              if (vai > 0) transform += efeitoDaProxima === 'sobe' ? ` translateY(${-vai * 30}%)` : efeitoDaProxima === 'some' ? '' : ` translateX(${-vai * 30}%)`;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    transform,
                    opacity: efeito === 'some' ? chega : 1,
                    filter: vai > 0 ? `brightness(${1 - vai * 0.25})` : 'none',
                    zIndex: i,
                  }}
                >
                  <Tela s={s} />
                </div>
              );
            })}
          </Celular>
        </div>
      </AbsoluteFill>
      {noVoo ? (
        <div
          style={{
            position: 'absolute',
            left: px - 200,
            top: py - 150,
            transform: `rotate(${(1 - voo) * -16}deg) scale(${1.3 - voo * 0.35})`,
            filter: `drop-shadow(0 0 ${34 * (1 - voo)}px rgba(255,255,255,0.9))`,
            zIndex: 60,
          }}
        >
          <PdfProposta largura={400} />
        </div>
      ) : null}
      <PapeisVoltando s={s} />
      <div style={{ position: 'absolute', bottom: 46, left: 0, right: 0, textAlign: 'center', fontFamily: FONTE, fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
        Valores ilustrativos.
      </div>
    </AbsoluteFill>
  );
};
