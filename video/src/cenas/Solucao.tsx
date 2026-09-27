/**
 * 4. A SOLUÇÃO (360–660): o celular 3D no centro, com as telas do POUP.
 *
 * Readequado ao app de verdade:
 *   - o formulário é o do "Simular financiamento" do POUP: valor do imóvel,
 *     entrada, FGTS, renda bruta familiar, idade e prazo → "Ver resultado
 *     completo";
 *   - o resultado mostra o que o app mostra: "Primeira parcela estimada" e os
 *     cartões "O banco financia", "Entrada (poupança)", "FGTS + subsídio";
 *   - NADA de selo "Aprovável": o próprio POUP avisa que não faz análise de
 *     crédito. O selo é "Cabe na renda" (a parcela dentro de 30% da renda);
 *   - "Gerar PDF" vai para o WhatsApp do cliente;
 *   - as simulações ficam em "Relatórios", com filtro.
 * Valores ILUSTRATIVOS, sem taxa e sem nome de banco.
 */
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Celular, TELA } from '../componentes/Celular';
import { FONTE, FRIO, MARCA, Q } from '../tema';
import { brl, faixa, letras } from '../util';

// --------------------------------------------------------------- valores
export const VALORES = {
  imovel: 210_000,
  entrada: 12_000,
  fgts: 10_000,
  subsidio: 20_000,
  renda: 3_200,
  idade: 29,
  prazoAnos: 35,
  parcela: 958.4,
};
export const FINANCIADO = VALORES.imovel - VALORES.entrada - VALORES.fgts - VALORES.subsidio; // 168.000

const CAMPOS: [string, string][] = [
  ['Valor do imóvel', brl(VALORES.imovel)],
  ['Entrada (opcional)', brl(VALORES.entrada)],
  ['FGTS', brl(VALORES.fgts)],
  ['Renda bruta familiar', brl(VALORES.renda)],
  ['Idade', `${VALORES.idade} anos`],
  ['Prazo', `${VALORES.prazoAnos} anos`],
];
/** Quando cada campo começa a ser digitado (quadro local da solução). */
export const INICIO_CAMPO = (k: number) => 12 + k * 8;
export const TOQUE_SIMULAR = 62;
export const CARTOES_EM = [70, 73, 76, 79];
export const SELO_EM = 84;
export const TOQUE_PDF = 106;
export const PDF_VOA = [110, 130] as const;
export const RESPOSTA_EM = 156;
export const ITENS_EM = (k: number) => 206 + k * 3;
export const TOQUE_FILTRO = 232;
export const PAPEIS_VOLTAM = [248, 258] as const;
export const VARRE = [258, 272] as const;

// ------------------------------------------------------------- manchete
const Manchete: React.FC<{ s: number; de: number; ate: number; texto: string }> = ({ s, de, ate, texto }) => {
  const { fps } = useVideoConfig();
  if (s < de || s >= ate) return null;
  const entra = spring({ frame: s - de, fps, config: { damping: 12, stiffness: 160 } });
  const sai = faixa(s, ate - 6, ate, Easing.in(Easing.cubic));
  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: 60,
        right: 60,
        textAlign: 'center',
        fontFamily: FONTE,
        fontWeight: 900,
        fontSize: 98,
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

// --------------------------------------------------------- tela: formulário
const Formulario: React.FC<{ s: number }> = ({ s }) => {
  const aperto = s >= TOQUE_SIMULAR && s < TOQUE_SIMULAR + 5;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '120px 40px 0', fontFamily: FONTE }}>
      <div style={{ color: MARCA.laranja, fontSize: 30, fontWeight: 600 }}>‹ Voltar</div>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800, margin: '14px 0 30px' }}>Simular financiamento</div>
      {CAMPOS.map(([rotulo, valor], k) => {
        const ini = INICIO_CAMPO(k);
        const texto = letras(valor, s, ini, valor.length / 6);
        const foco = s >= ini && s < ini + 8;
        return (
          <div key={rotulo} style={{ marginBottom: 20 }}>
            <div style={{ color: MARCA.tintaSuave, fontSize: 25, fontWeight: 600, marginBottom: 8 }}>{rotulo}</div>
            <div
              style={{
                height: 86,
                borderRadius: 18,
                background: MARCA.branco,
                border: `3px solid ${foco ? MARCA.laranja : MARCA.borda}`,
                boxShadow: foco ? `0 0 0 6px ${MARCA.laranjaSuave}` : 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '0 26px',
                fontSize: 34,
                fontWeight: 600,
                color: MARCA.tinta,
              }}
            >
              {texto}
              {foco ? <span style={{ width: 3, height: 40, background: MARCA.laranja, marginLeft: 3 }} /> : null}
            </div>
          </div>
        );
      })}
      <div
        style={{
          marginTop: 16,
          height: 100,
          borderRadius: 24,
          background: aperto ? MARCA.laranjaEscuro : MARCA.laranja,
          transform: `scale(${aperto ? 0.95 : 1})`,
          color: MARCA.branco,
          fontSize: 34,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 16px 30px rgba(255,117,31,0.35)',
        }}
      >
        Ver resultado completo
      </div>
    </div>
  );
};

// ----------------------------------------------------------- tela: resultado
const Cartao: React.FC<{ s: number; em: number; icone: string; rotulo: string; valor: number }> = ({ s, em, icone, rotulo, valor }) => {
  const { fps } = useVideoConfig();
  const p = spring({ frame: s - em, fps, config: { damping: 9, stiffness: 200 } });
  const conta = faixa(s, em, em + 14);
  return (
    <div
      style={{
        background: MARCA.branco,
        borderRadius: 26,
        padding: '22px 18px',
        boxShadow: `0 10px 30px rgba(255,117,31,${0.18 * p}), 0 0 0 2px rgba(255,178,107,${0.5 * p})`,
        transform: `scale(${p})`,
        opacity: Math.min(1, p * 1.5),
      }}
    >
      <div style={{ fontSize: 23, color: MARCA.tintaSuave, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {icone} {rotulo}
      </div>
      <div style={{ fontSize: 31, fontWeight: 800, color: MARCA.tinta, marginTop: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {brl(Math.round(valor * conta))}
      </div>
    </div>
  );
};

const Resultado: React.FC<{ s: number }> = ({ s }) => {
  const { fps } = useVideoConfig();
  const heroi = faixa(s, 66, 80);
  const selo = spring({ frame: s - SELO_EM, fps, config: { damping: 8, stiffness: 220 } });
  const apertoPdf = s >= TOQUE_PDF && s < TOQUE_PDF + 5;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '120px 34px 0', fontFamily: FONTE }}>
      <div style={{ color: MARCA.laranja, fontSize: 30, fontWeight: 600 }}>‹ Voltar</div>
      <div style={{ color: MARCA.tinta, fontSize: 44, fontWeight: 800, margin: '12px 0 22px' }}>Resultado</div>
      <div
        style={{
          borderRadius: 32,
          padding: '30px 30px 34px',
          background: `linear-gradient(140deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})`,
          color: MARCA.branco,
          boxShadow: '0 24px 50px rgba(255,117,31,0.4)',
        }}
      >
        <div style={{ fontSize: 27, fontWeight: 600, opacity: 0.92 }}>Primeira parcela estimada</div>
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -2, fontVariantNumeric: 'tabular-nums' }}>
          {brl(Math.round(VALORES.parcela * heroi * 100) / 100)}
        </div>
        <div style={{ fontSize: 24, opacity: 0.9 }}>{VALORES.prazoAnos} anos · renda {brl(VALORES.renda)}</div>
        <div
          style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 18px',
            borderRadius: 40,
            background: MARCA.branco,
            color: MARCA.verde,
            fontSize: 24,
            fontWeight: 800,
            transform: `scale(${selo})`,
            transformOrigin: 'left center',
          }}
        >
          ✓ Cabe na renda
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 22 }}>
        <Cartao s={s} em={CARTOES_EM[0]} icone="🏦" rotulo="O banco financia" valor={FINANCIADO} />
        <Cartao s={s} em={CARTOES_EM[1]} icone="💰" rotulo="Entrada (poupança)" valor={VALORES.entrada} />
        <Cartao s={s} em={CARTOES_EM[2]} icone="🤝" rotulo="FGTS + subsídio" valor={VALORES.fgts + VALORES.subsidio} />
        <Cartao s={s} em={CARTOES_EM[3]} icone="🏠" rotulo="Imóvel" valor={VALORES.imovel} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 30, opacity: faixa(s, 86, 94) }}>
        <div
          style={{
            flex: 1,
            height: 96,
            borderRadius: 24,
            background: apertoPdf ? MARCA.laranjaEscuro : MARCA.laranja,
            transform: `scale(${apertoPdf ? 0.94 : 1})`,
            color: MARCA.branco,
            fontSize: 32,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: s >= TOQUE_PDF - 8 && s < TOQUE_PDF ? `0 0 0 8px ${MARCA.laranjaSuave}` : 'none',
          }}
        >
          Gerar PDF
        </div>
        <div style={{ flex: 1, height: 96, borderRadius: 24, border: `3px solid ${MARCA.laranja}`, color: MARCA.laranja, fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', background: MARCA.branco }}>
          Resumo p/ cliente
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------ tela: conversa
export const ArquivoPdf: React.FC<{ largura?: number }> = ({ largura = 380 }) => (
  <div style={{ width: largura, borderRadius: 18, background: MARCA.branco, overflow: 'hidden', boxShadow: '0 14px 30px rgba(0,0,0,0.25)', fontFamily: FONTE }}>
    <div style={{ height: largura * 0.36, background: `linear-gradient(140deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})`, display: 'flex', alignItems: 'center', padding: '0 22px', color: MARCA.branco, fontWeight: 900, fontSize: largura * 0.09 }}>
      POUP · Simulação
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
      <div style={{ padding: '6px 10px', borderRadius: 8, background: '#E5484D', color: '#fff', fontWeight: 800, fontSize: largura * 0.055 }}>PDF</div>
      <div style={{ color: MARCA.tinta, fontWeight: 700, fontSize: largura * 0.06 }}>Simulação - Ana.pdf</div>
    </div>
  </div>
);

const Conversa: React.FC<{ s: number }> = ({ s }) => {
  const enviado = s >= PDF_VOA[1];
  const lido = s >= PDF_VOA[1] + 6;
  const digitando = s >= 138 && s < RESPOSTA_EM;
  const resposta = spring({ frame: s - RESPOSTA_EM, fps: 30, config: { damping: 10, stiffness: 220 } });
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#EFE7DD', fontFamily: FONTE }}>
      <div style={{ height: 210, background: MARCA.branco, display: 'flex', alignItems: 'flex-end', gap: 20, padding: '0 30px 26px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <div style={{ color: '#128C7E', fontSize: 44 }}>‹</div>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: 'linear-gradient(140deg,#7bc4a8,#3f9a82)', color: '#fff', fontWeight: 800, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</div>
        <div>
          <div style={{ color: MARCA.tinta, fontSize: 36, fontWeight: 800 }}>Ana (cliente)</div>
          <div style={{ color: '#128C7E', fontSize: 26 }}>{digitando ? 'digitando…' : 'online'}</div>
        </div>
      </div>
      <div style={{ padding: '40px 30px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ alignSelf: 'flex-start', background: MARCA.branco, borderRadius: '8px 30px 30px 30px', padding: '20px 28px', fontSize: 34, color: MARCA.tinta, maxWidth: '78%' }}>
          Oi! Conseguiu ver a minha simulação?
        </div>
        <div style={{ alignSelf: 'flex-end', background: '#D9FDD3', borderRadius: '30px 8px 30px 30px', padding: 14, opacity: enviado ? 1 : 0 }}>
          <ArquivoPdf largura={400} />
          <div style={{ textAlign: 'right', fontSize: 24, color: lido ? '#34B7F1' : '#7a8a7a', marginTop: 8, fontWeight: 700 }}>
            agora ✓✓
          </div>
        </div>
        {digitando ? (
          <div style={{ alignSelf: 'flex-start', background: MARCA.branco, borderRadius: 30, padding: '22px 30px', display: 'flex', gap: 10 }}>
            {[0, 1, 2].map((k) => (
              <div key={k} style={{ width: 16, height: 16, borderRadius: 8, background: '#9aa3ad', transform: `translateY(${Math.sin((s + k * 3) * 0.7) * 6}px)` }} />
            ))}
          </div>
        ) : null}
        {s >= RESPOSTA_EM ? (
          <div
            style={{
              alignSelf: 'flex-start',
              background: MARCA.branco,
              borderRadius: '8px 30px 30px 30px',
              padding: '22px 30px',
              fontSize: 40,
              fontWeight: 700,
              color: MARCA.tinta,
              transform: `scale(${resposta})`,
              transformOrigin: 'left top',
              boxShadow: `0 0 ${40 * resposta}px rgba(22,163,74,0.25)`,
            }}
          >
            Perfeito! Vamos fechar 🙌
          </div>
        ) : null}
      </div>
    </div>
  );
};

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

const Relatorios: React.FC<{ s: number }> = ({ s }) => {
  const { fps } = useVideoConfig();
  const filtrou = faixa(s, TOQUE_FILTRO, TOQUE_FILTRO + 10);
  const aperto = s >= TOQUE_FILTRO && s < TOQUE_FILTRO + 4;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '120px 32px 0', fontFamily: FONTE }}>
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
const PapeisVoltando: React.FC<{ s: number }> = ({ s }) => {
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

// ------------------------------------------------------------------- cena
export const FundoMarca: React.FC<{ s: number }> = ({ s }) => (
  <AbsoluteFill style={{ background: `linear-gradient(165deg, #FF8A3D 0%, ${MARCA.laranja} 45%, ${MARCA.laranjaEscuro} 100%)` }}>
    <div style={{ position: 'absolute', width: 1100, height: 1100, borderRadius: '50%', left: -300 + Math.sin(s / 40) * 80, top: 200, background: 'radial-gradient(circle, rgba(255,230,200,0.45), transparent 65%)' }} />
    <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', right: -320, top: 1100 + Math.cos(s / 35) * 60, background: 'radial-gradient(circle, rgba(255,210,160,0.35), transparent 65%)' }} />
  </AbsoluteFill>
);

export const Solucao: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = f; // quadro local (0 = quadro 360)
  const entra = spring({ frame: s, fps, config: { damping: 14, stiffness: 120 } });
  const sai = faixa(s, 288, 300, Easing.in(Easing.cubic));
  const giroY = Math.sin(s / 28) * 7 - 6;
  const giroX = 5 + Math.cos(s / 34) * 2;

  // Qual tela está no celular (com deslize entre elas).
  const paraResultado = faixa(s, TOQUE_SIMULAR + 2, TOQUE_SIMULAR + 10);
  const paraConversa = faixa(s, TOQUE_PDF + 2, TOQUE_PDF + 10);
  const paraRelatorios = faixa(s, 200, 208);
  const L = TELA.largura;

  // O PDF voando do botão até o balão da conversa (em coordenadas da tela).
  const voo = faixa(s, PDF_VOA[0], PDF_VOA[1], Easing.inOut(Easing.cubic));
  const noVoo = s >= PDF_VOA[0] && s < PDF_VOA[1];
  const origem = { x: 300, y: 1760 };
  const destino = { x: 700, y: 900 };
  const px = interpolate(voo, [0, 1], [origem.x, destino.x]);
  const py = interpolate(voo, [0, 1], [origem.y, destino.y]) - Math.sin(voo * Math.PI) * 420;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <FundoMarca s={s} />
      <Manchete s={s} de={64} ate={100} texto="Simulação em segundos." />
      <Manchete s={s} de={104} ate={200} texto="Direto no WhatsApp do cliente." />
      <Manchete s={s} de={202} ate={256} texto="Tudo organizado." />
      <Manchete s={s} de={262} ate={300} texto="Adeus, papel." />
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
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-paraResultado * 100}%)`, opacity: 1 - paraResultado }}>
              <Formulario s={s} />
            </div>
            <div style={{ position: 'absolute', inset: 0, transform: `translate(${-paraConversa * L}px, ${(1 - paraResultado) * 100}%)` }}>
              <Resultado s={s} />
            </div>
            <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - paraConversa) * L - paraRelatorios * L}px)` }}>
              <Conversa s={s} />
            </div>
            <div style={{ position: 'absolute', inset: 0, background: MARCA.fundoApp, transform: `translateX(${(1 - paraRelatorios) * L}px)` }}>
              <Relatorios s={s} />
            </div>
          </Celular>
        </div>
      </AbsoluteFill>
      {noVoo ? (
        <div style={{ position: 'absolute', left: px - 190, top: py - 120, transform: `rotate(${(1 - voo) * -18}deg) scale(${1.25 - voo * 0.25})`, filter: `drop-shadow(0 0 ${30 * (1 - voo)}px rgba(255,255,255,0.9))` }}>
          <ArquivoPdf largura={380} />
        </div>
      ) : null}
      <PapeisVoltando s={s} />
      <div style={{ position: 'absolute', bottom: 46, left: 0, right: 0, textAlign: 'center', fontFamily: FONTE, fontSize: 28, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
        Valores ilustrativos.
      </div>
    </AbsoluteFill>
  );
};

export const SOLUCAO_DURACAO = Q.prova - Q.solucao;
