/**
 * C1 — "Simular financiamento" e o resultado (app/(app)/financiamento/*).
 * Os seis campos da tela real e os rótulos do resultado. Sem selo de
 * "aprovado": o app não faz análise de crédito — o selo é "Cabe na renda".
 */
import { MARCA } from '../tema';
import { brl, faixa } from '../util';
import { FINANCIADO, T, V } from '../roteiro';
import { Botao, Campo, mola, Selo, Tela, Titulo, Toque, Voltar } from './ui';

const CAMPOS: [string, string][] = [
  ['Valor do imóvel', brl(V.imovel)],
  ['Entrada (opcional)', brl(V.entrada)],
  ['FGTS', brl(V.fgts)],
  ['Renda bruta familiar', brl(V.renda)],
  ['Idade', `${V.idade} anos`],
  ['Prazo', `${V.prazoAnos} anos`],
];

export const FormFinanciamento: React.FC<{ s: number }> = ({ s }) => (
  <Tela>
    <Voltar />
    <Titulo>Simular financiamento</Titulo>
    {CAMPOS.map(([rotulo, valor], k) => (
      <Campo key={rotulo} rotulo={rotulo} valor={valor} s={s} de={T.campo(k)} ate={T.campo(k) + 6} />
    ))}
    <Botao s={s} toque={T.simular} estilo={{ marginTop: 14 }}>
      Ver resultado completo
    </Botao>
    <Toque s={s} em={T.simular} x={342} y={1124} />
  </Tela>
);

const Cartao: React.FC<{ s: number; em: number; icone: string; rotulo: string; valor: number }> = ({ s, em, icone, rotulo, valor }) => {
  const p = mola(s, em, 9, 200);
  const conta = faixa(s, em, em + 14);
  return (
    <div
      style={{
        background: MARCA.branco,
        borderRadius: 26,
        padding: '20px 18px',
        boxShadow: `0 10px 30px rgba(255,117,31,${0.18 * p}), 0 0 0 2px rgba(255,178,107,${0.5 * p})`,
        transform: `scale(${p})`,
        opacity: Math.min(1, p * 1.5),
      }}
    >
      <div style={{ fontSize: 23, color: MARCA.tintaSuave, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {icone} {rotulo}
      </div>
      <div style={{ fontSize: 31, fontWeight: 800, color: MARCA.tinta, marginTop: 8, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {brl(Math.round(valor * conta))}
      </div>
    </div>
  );
};

export const ResultadoFinanciamento: React.FC<{ s: number }> = ({ s }) => {
  const heroi = faixa(s, 66, 80);
  return (
    <Tela>
      <Voltar />
      <Titulo>Resultado</Titulo>
      <div
        style={{
          borderRadius: 32,
          padding: '28px 30px 30px',
          background: `linear-gradient(140deg, ${MARCA.laranja}, ${MARCA.laranjaEscuro})`,
          color: MARCA.branco,
          boxShadow: '0 24px 50px rgba(255,117,31,0.4)',
        }}
      >
        <div style={{ fontSize: 27, fontWeight: 600, opacity: 0.92 }}>Primeira parcela estimada</div>
        <div style={{ fontSize: 86, fontWeight: 900, letterSpacing: -2, fontVariantNumeric: 'tabular-nums' }}>
          {brl(Math.round(V.parcelaFin * heroi * 100) / 100)}
        </div>
        <div style={{ fontSize: 24, opacity: 0.9, marginBottom: 14 }}>
          {V.prazoAnos} anos · renda {brl(V.renda)}
        </div>
        <Selo s={s} em={T.selo} fundo={MARCA.branco}>
          ✓ Cabe na renda
        </Selo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 22 }}>
        <Cartao s={s} em={T.cartoes[0]} icone="🏦" rotulo="O banco financia" valor={FINANCIADO} />
        <Cartao s={s} em={T.cartoes[1]} icone="💰" rotulo="Entrada (poupança)" valor={V.entrada} />
        <Cartao s={s} em={T.cartoes[2]} icone="🤝" rotulo="FGTS + subsídio" valor={V.fgts + V.subsidio} />
        <Cartao s={s} em={T.cartoes[3]} icone="🏠" rotulo="Imóvel" valor={V.imovel} />
      </div>
      <div style={{ opacity: faixa(s, 86, 92), marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Botao s={s} toque={T.levarParaVendas}>Levar para o simulador de vendas</Botao>
        <div style={{ display: 'flex', gap: 16 }}>
          <Botao s={s} tipo="contorno" altura={84} estilo={{ flex: 1 }}>Gerar PDF</Botao>
          <Botao s={s} tipo="contorno" altura={84} estilo={{ flex: 1, fontSize: 27 }}>Resumo p/ cliente</Botao>
        </div>
      </div>
      <Toque s={s} em={T.levarParaVendas} x={342} y={916} />
    </Tela>
  );
};
