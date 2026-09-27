/**
 * C3 — etapa "Unidade e cliente" → "Gerar proposta" → o PDF da proposta vai
 * para o WhatsApp do cliente, que responde.
 */
import { MARCA, FONTE } from '../tema';
import { brl } from '../util';
import { PARCELA_MENSAL, T, V } from '../roteiro';
import { Botao, mola, Tela, Toque } from './ui';

export const UnidadeECliente: React.FC<{ s: number }> = ({ s }) => (
  <Tela>
    <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800, marginBottom: 20 }}>Simulador de vendas</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: MARCA.tintaSuave, letterSpacing: 1, marginBottom: 12 }}>O IMÓVEL</div>
    <div style={{ background: MARCA.branco, borderRadius: 24, padding: '20px 24px', border: `2px solid ${MARCA.borda}`, marginBottom: 22 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: MARCA.tinta }}>{V.empreendimento}</div>
      <div style={{ fontSize: 25, color: MARCA.tintaSuave, marginTop: 4 }}>
        {V.bloco} · Unidade {V.unidade} · {brl(V.valorVenda)}
      </div>
      <div style={{ fontSize: 23, color: MARCA.verde, fontWeight: 700, marginTop: 8 }}>Confere com a tabela de preços.</div>
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, color: MARCA.tintaSuave, letterSpacing: 1, marginBottom: 12 }}>O CLIENTE</div>
    <div style={{ background: MARCA.branco, borderRadius: 24, padding: '20px 24px', border: `2px solid ${MARCA.borda}`, marginBottom: 22 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: MARCA.tinta }}>Ana Souza</div>
      <div style={{ fontSize: 25, color: MARCA.tintaSuave, marginTop: 4 }}>CPF •••.456.789-•• · Renda {brl(V.renda)}</div>
    </div>
    <div style={{ background: MARCA.branco, borderRadius: 24, padding: '20px 24px', border: `2px solid ${MARCA.borda}`, marginBottom: 30 }}>
      <div style={{ fontSize: 25, color: MARCA.tintaSuave }}>Parcela mensal · {V.mensais}×</div>
      <div style={{ fontSize: 54, fontWeight: 900, color: MARCA.verde }}>{brl(PARCELA_MENSAL)}</div>
    </div>
    <Botao s={s} toque={T.gerarProposta}>Gerar proposta</Botao>
    <Toque s={s} em={T.gerarProposta} x={342} y={1086} />
  </Tela>
);

/** A miniatura do PDF da proposta (logo, unidade e o fluxo de pagamento). */
export const PdfProposta: React.FC<{ largura?: number }> = ({ largura = 380 }) => {
  const u = largura / 380;
  return (
    <div style={{ width: largura, borderRadius: 16 * u, background: MARCA.branco, overflow: 'hidden', boxShadow: '0 14px 30px rgba(0,0,0,0.25)', fontFamily: FONTE }}>
      <div style={{ height: 96 * u, background: `linear-gradient(140deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${20 * u}px`, color: MARCA.branco }}>
        <div style={{ fontWeight: 900, fontSize: 30 * u }}>Proposta de compra</div>
        <div style={{ fontWeight: 600, fontSize: 17 * u, opacity: 0.9 }}>
          {V.empreendimento} · {V.bloco} · {V.unidade}
        </div>
      </div>
      <div style={{ padding: `${12 * u}px ${20 * u}px ${8 * u}px`, fontSize: 17 * u, color: MARCA.tinta }}>
        {[
          ['Sinal', brl(V.ato)],
          ['Financiamento', brl(V.financiamentoAprovado + V.subsidio + V.fgts)],
          [`${V.mensais} mensais`, brl(PARCELA_MENSAL)],
        ].map(([a, b]) => (
          <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: `${5 * u}px 0`, borderBottom: `1px solid ${MARCA.borda}` }}>
            <span>{a}</span>
            <b>{b}</b>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u, padding: `${10 * u}px ${20 * u}px ${14 * u}px` }}>
        <div style={{ padding: `${4 * u}px ${9 * u}px`, borderRadius: 7 * u, background: '#E5484D', color: '#fff', fontWeight: 800, fontSize: 19 * u }}>PDF</div>
        <div style={{ color: MARCA.tinta, fontWeight: 700, fontSize: 20 * u }}>Proposta - Ana Souza.pdf</div>
      </div>
    </div>
  );
};

export const ConversaCliente: React.FC<{ s: number }> = ({ s }) => {
  const enviado = s >= T.pdfVoa[1];
  const lido = s >= T.lido;
  const digitando = s >= T.digitando[0] && s < T.digitando[1];
  const resposta = mola(s, T.resposta, 10, 220);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#EFE7DD', fontFamily: FONTE }}>
      <div style={{ height: 210, background: MARCA.branco, display: 'flex', alignItems: 'flex-end', gap: 20, padding: '0 30px 26px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
        <div style={{ color: '#128C7E', fontSize: 44 }}>‹</div>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: 'linear-gradient(140deg,#7bc4a8,#3f9a82)', color: '#fff', fontWeight: 800, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</div>
        <div>
          <div style={{ color: MARCA.tinta, fontSize: 36, fontWeight: 800 }}>Ana Souza</div>
          <div style={{ color: '#128C7E', fontSize: 26 }}>{digitando ? 'digitando…' : 'online'}</div>
        </div>
      </div>
      <div style={{ padding: '36px 30px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ alignSelf: 'flex-start', background: MARCA.branco, borderRadius: '8px 30px 30px 30px', padding: '20px 28px', fontSize: 33, color: MARCA.tinta, maxWidth: '80%' }}>
          Oi! Conseguiu ver o apartamento pra mim?
        </div>
        <div style={{ alignSelf: 'flex-end', background: '#D9FDD3', borderRadius: '30px 8px 30px 30px', padding: 14, opacity: enviado ? 1 : 0 }}>
          <PdfProposta largura={420} />
          <div style={{ textAlign: 'right', fontSize: 24, color: lido ? '#34B7F1' : '#7a8a7a', marginTop: 8, fontWeight: 700 }}>agora ✓✓</div>
        </div>
        {digitando ? (
          <div style={{ alignSelf: 'flex-start', background: MARCA.branco, borderRadius: 30, padding: '22px 30px', display: 'flex', gap: 10 }}>
            {[0, 1, 2].map((k) => (
              <div key={k} style={{ width: 16, height: 16, borderRadius: 8, background: '#9aa3ad', transform: `translateY(${Math.sin((s + k * 3) * 0.7) * 6}px)` }} />
            ))}
          </div>
        ) : null}
        {s >= T.resposta ? (
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
