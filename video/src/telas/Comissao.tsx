/**
 * C5 — "Registrar venda": a comissão já vem calculada pela regra da
 * construtora (House/Imob), e o "Controle de Comissão" soma no TOTAL A RECEBER.
 * C6 — o ranking da cidade: o corretor sobe de posição.
 */
import { interpolate } from 'remotion';
import { MARCA } from '../tema';
import { brl, faixa } from '../util';
import { COMISSAO, T, V } from '../roteiro';
import { Botao, Folha, mola, Tela, Toque } from './ui';

const Linha: React.FC<{ rotulo: string; valor: string; destaque?: number }> = ({ rotulo, valor, destaque = 0 }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ color: MARCA.tintaSuave, fontSize: 24, fontWeight: 600, marginBottom: 7 }}>{rotulo}</div>
    <div
      style={{
        height: 78,
        borderRadius: 18,
        background: destaque > 0 ? `rgba(255,243,234,${0.5 + destaque * 0.5})` : MARCA.branco,
        border: `3px solid ${destaque > 0.1 ? MARCA.laranja : MARCA.borda}`,
        boxShadow: destaque > 0 ? `0 0 ${24 * destaque}px rgba(255,117,31,${0.45 * destaque})` : 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        fontSize: 32,
        fontWeight: 700,
        color: MARCA.tinta,
      }}
    >
      {valor}
    </div>
  </div>
);

export const RegistrarVenda: React.FC<{ s: number }> = ({ s }) => {
  const aberta = faixa(s, T.registrarAbre, T.registrarAbre + 8);
  const calc = faixa(s, T.comissaoCalc[0], T.comissaoCalc[1]);
  const pisca = interpolate(s, [T.comissaoCalc[0], T.comissaoCalc[0] + 4, T.comissaoCalc[1] + 8], [0, 1, 0.25], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <Tela>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800 }}>Relatório</div>
      <div style={{ color: MARCA.tintaSuave, fontSize: 27, margin: '4px 0 22px' }}>Ana Souza · {V.empreendimento}</div>
      <div style={{ background: MARCA.branco, borderRadius: 24, height: 300, border: `2px solid ${MARCA.borda}` }} />
      <Folha aberta={aberta} altura={1120}>
        <div style={{ fontSize: 40, fontWeight: 800, color: MARCA.tinta, marginBottom: 6 }}>Registrar venda</div>
        <div style={{ fontSize: 24, color: MARCA.tintaSuave, marginBottom: 22 }}>
          Cliente, empreendimento e composição do pagamento vêm da simulação.
        </div>
        <Linha rotulo="Data da venda" valor="29/09/2026" />
        <Linha rotulo="Valor da venda" valor={brl(V.valorVenda)} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Linha rotulo="Comissão (%)" valor={calc > 0 ? '4,00%' : ''} destaque={pisca} />
          </div>
          <div style={{ flex: 1.4 }}>
            <Linha rotulo="Comissão (R$)" valor={calc > 0 ? brl(Math.round(COMISSAO * calc * 100) / 100) : ''} destaque={pisca} />
          </div>
        </div>
        <div style={{ fontSize: 23, color: MARCA.laranjaEscuro, fontWeight: 700, marginBottom: 22, opacity: calc }}>
          Calculado pela regra da construtora para corretor House: {V.comissaoPct}%
        </div>
        <Botao s={s} toque={T.registrar}>Registrar venda</Botao>
      </Folha>
      <Toque s={s} em={T.registrar} x={342} y={1170} />
    </Tela>
  );
};

const PARCELAS = [
  ['Ana Souza', V.empreendimento, COMISSAO, 'A receber', true],
  ['Bruno Lima', 'Vila Aurora', 4_320, 'A receber', false],
  ['Carla Dias', 'Parque do Sol', 4_320, 'Recebido', false],
] as const;

export const ControleComissao: React.FC<{ s: number }> = ({ s }) => {
  const rola = faixa(s, T.totalRola[0], T.totalRola[1]);
  const total = V.totalAReceberAntes + COMISSAO * rola;
  return (
    <Tela>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800, marginBottom: 22 }}>Controle de Comissão</div>
      <div
        style={{
          borderRadius: 32,
          padding: '28px 30px',
          background: `linear-gradient(140deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})`,
          color: MARCA.branco,
          boxShadow: `0 24px ${50 + rola * 30}px rgba(255,117,31,${0.35 + rola * 0.2})`,
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: 1, opacity: 0.9 }}>TOTAL A RECEBER</div>
        <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -2, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
          {brl(Math.round(total * 100) / 100)}
        </div>
        <div style={{ fontSize: 23, fontWeight: 700, opacity: 0.9, marginTop: 6 }}>PRÓXIMO VENCIMENTO · 10/10/2026</div>
      </div>
      <div style={{ marginTop: 24 }}>
        {PARCELAS.map(([nome, emp, valor, situacao, nova], k) => {
          const p = nova ? mola(s, T.totalRola[0], 10, 200) : 1;
          return (
            <div
              key={nome}
              style={{
                background: MARCA.branco,
                borderRadius: 24,
                padding: '20px 24px',
                marginBottom: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: `2px solid ${nova ? MARCA.laranjaClaro : MARCA.borda}`,
                transform: `scale(${p})`,
                opacity: Math.min(1, p * 1.4),
              }}
            >
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: MARCA.tinta }}>{nome}</div>
                <div style={{ fontSize: 23, color: MARCA.tintaSuave, marginTop: 4 }}>{emp}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 29, fontWeight: 800, color: MARCA.tinta }}>{brl(valor)}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: situacao === 'Recebido' ? MARCA.verde : MARCA.laranjaEscuro, marginTop: 4 }}>
                  {situacao}
                  {k === 0 ? ' · nova' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Tela>
  );
};

// ---------------------------------------------------------------- ranking
const PESSOAS = [
  { id: 'r1', nome: 'Rafael M.', vendas: 9, vgv: '2,1 mi' },
  { id: 'eu', nome: 'Você', vendas: 7, vgv: '1,7 mi' },
  { id: 'r2', nome: 'Juliana P.', vendas: 7, vgv: '1,6 mi' },
  { id: 'r3', nome: 'Marcos T.', vendas: 6, vgv: '1,4 mi' },
  { id: 'r4', nome: 'Paula S.', vendas: 6, vgv: '1,3 mi' },
  { id: 'r5', nome: 'Diego A.', vendas: 5, vgv: '1,1 mi' },
];
/** Antes da venda "Você" estava em 5º (6 vendas); depois, 2º. */
const ANTES = ['r1', 'r2', 'r3', 'r4', 'eu', 'r5'];

export const Ranking: React.FC<{ s: number }> = ({ s }) => {
  const sobe = faixa(s, T.sobe[0], T.sobe[1]);
  const pulo = s >= T.sobe[1] ? mola(s, T.sobe[1], 7, 220) : 1;
  const ALTURA = 136;
  return (
    <Tela>
      <div style={{ color: MARCA.laranja, fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>RANKING POUP</div>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800, marginTop: 4 }}>Temporada de Setembro</div>
      <div style={{ color: MARCA.tintaSuave, fontSize: 26, margin: '4px 0 22px' }}>Faltam 2 dias</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {['Cidade', 'Estado', 'Brasil'].map((c, i) => (
          <div key={c} style={{ padding: '14px 28px', borderRadius: 40, fontSize: 26, fontWeight: 700, background: i === 0 ? MARCA.laranja : MARCA.branco, color: i === 0 ? '#fff' : MARCA.tinta, border: `2px solid ${i === 0 ? MARCA.laranja : MARCA.borda}` }}>
            {c}
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: ALTURA * 6 }}>
        {PESSOAS.map((p) => {
          const de = ANTES.indexOf(p.id);
          const para = PESSOAS.indexOf(p);
          const pos = interpolate(sobe, [0, 1], [de, para]);
          const eu = p.id === 'eu';
          const vendas = eu && sobe > 0.5 ? p.vendas : eu ? p.vendas - 1 : p.vendas;
          return (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: pos * ALTURA,
                height: ALTURA - 16,
                borderRadius: 26,
                background: eu ? `linear-gradient(120deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})` : MARCA.branco,
                color: eu ? '#fff' : MARCA.tinta,
                border: eu ? 'none' : `2px solid ${MARCA.borda}`,
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: '0 26px',
                zIndex: eu ? 5 : 1,
                transform: eu ? `scale(${1 + Math.sin(sobe * Math.PI) * 0.06 + (pulo - 1) * 0.3})` : 'none',
                boxShadow: eu ? '0 16px 40px rgba(255,117,31,0.45)' : 'none',
              }}
            >
              <div style={{ width: 70, fontSize: 38, fontWeight: 900 }}>{Math.round(pos) + 1}º</div>
              <div style={{ width: 74, height: 74, borderRadius: 37, background: eu ? 'rgba(255,255,255,0.25)' : MARCA.laranjaSuave, color: eu ? '#fff' : MARCA.laranjaEscuro, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 28 }}>
                {eu ? 'EU' : p.nome.split(' ').map((x) => x[0]).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 31, fontWeight: 800 }}>{p.nome}</div>
                <div style={{ fontSize: 23, opacity: 0.8, marginTop: 2 }}>
                  {vendas} vendas · R$ {p.vgv}
                </div>
              </div>
              {eu && s >= T.sobe[1] ? (
                <div style={{ padding: '8px 16px', borderRadius: 30, background: '#fff', color: MARCA.laranjaEscuro, fontSize: 24, fontWeight: 900, transform: `scale(${pulo})` }}>▲ 3</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Tela>
  );
};
