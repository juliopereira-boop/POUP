/**
 * C2 — o Simulador de vendas (app/(app)/simulador): "Usar tabela de preço"
 * (bloco → unidade, com o preço da tabela) e a LIA preenchendo a simulação a
 * partir de uma frase ("Assistente por texto · Simulador de vendas").
 * O cartão do topo é o ResumoPoupanca: parcela mensal, poupança e o risco.
 */
import { interpolate } from 'remotion';
import { MARCA } from '../tema';
import { brl, faixa, letras } from '../util';
import { PARCELA_MENSAL, POUPANCA, RISCO_PCT, T, V } from '../roteiro';
import { Botao, Campo, Folha, mola, OrbeLia, Selo, Tela, Toque } from './ui';

export const FRASE_LIA = 'financiamento 180 mil, subsídio 20 mil, FGTS 10 mil, ato 6 mil em 36 mensais';

const Etapas: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '6px 0 22px', fontSize: 26, fontWeight: 700 }}>
    <div style={{ width: 44, height: 44, borderRadius: 22, background: MARCA.laranja, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</div>
    <span style={{ color: MARCA.tinta }}>Valores</span>
    <div style={{ flex: 1, height: 3, background: MARCA.borda }} />
    <div style={{ width: 44, height: 44, borderRadius: 22, border: `3px solid ${MARCA.borda}`, color: MARCA.tintaSuave, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>2</div>
    <span style={{ color: MARCA.tintaSuave }}>Unidade e cliente</span>
  </div>
);

const Resumo: React.FC<{ s: number }> = ({ s }) => {
  const rola = faixa(s, T.parcelaRola[0], T.parcelaRola[1]);
  const temValores = s >= T.preenche(0);
  const parcela = PARCELA_MENSAL * rola;
  return (
    <div style={{ background: MARCA.branco, borderRadius: 30, border: `2px solid ${MARCA.borda}`, padding: '22px 28px', boxShadow: s >= T.riscoOk ? '0 0 40px rgba(255,117,31,0.25)' : 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
        <span style={{ fontSize: 25, color: MARCA.tintaSuave }}>Parcela mensal{temValores ? ` · ${V.mensais}×` : ''}</span>
        {s >= T.riscoOk ? (
          <Selo s={s} em={T.riscoOk}>
            Dentro do risco ({V.riscoConstrutora}%)
          </Selo>
        ) : null}
      </div>
      <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, color: parcela > 0 ? MARCA.verde : MARCA.tinta, fontVariantNumeric: 'tabular-nums' }}>
        {brl(Math.round(parcela * 100) / 100)}
      </div>
      <div style={{ borderTop: `2px solid ${MARCA.borda}`, paddingTop: 12, marginTop: 6, fontSize: 25, color: MARCA.tintaSuave }}>
        Poupança{' '}
        <b style={{ color: MARCA.laranja, fontSize: 30 }}>{temValores ? brl(POUPANCA) : 'R$ 0,00'}</b>
        {temValores ? `  ·  ${RISCO_PCT.toFixed(1).replace('.', ',')}% do valor de venda` : ''}
      </div>
    </div>
  );
};

const UNIDADES = [4, 3, 2, 1].flatMap((andar) =>
  [1, 2, 3].map((n) => ({ codigo: `${andar}0${n}`, preco: 236_900 + andar * 2_620 + (n === 1 ? 0 : 1_150) })),
);

export const SimuladorVendas: React.FC<{ s: number }> = ({ s }) => {
  const escolheu = s >= T.unidade + 2;
  const tabelaAberta = faixa(s, T.usarTabela + 2, T.usarTabela + 10) * (1 - faixa(s, T.unidade + 2, T.unidade + 10));
  const naUnidade = s >= T.bloco + 2;
  const liaAberta = faixa(s, T.liaAbre + 2, T.liaAbre + 9) * (1 - faixa(s, T.liaFecha, T.liaFecha + 7));
  const fraseDigitada = letras(FRASE_LIA, s, T.liaTexto, FRASE_LIA.length / (T.liaAnalisa - T.liaTexto - 2));
  const analisando = s >= T.liaAnalisa;
  const cartaoUnidade = mola(s, T.unidade + 6, 12, 180);
  return (
    <Tela>
      <div style={{ color: MARCA.tinta, fontSize: 46, fontWeight: 800 }}>Simulador de vendas</div>
      <Etapas />
      <Resumo s={s} />
      {escolheu ? (
        <div
          style={{
            marginTop: 18,
            borderRadius: 24,
            background: MARCA.laranjaSuave,
            border: `2px solid ${MARCA.laranjaClaro}`,
            padding: '16px 22px',
            transform: `scale(${cartaoUnidade})`,
            transformOrigin: 'top left',
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: MARCA.tinta }}>
            {V.empreendimento} · {V.bloco} · {V.unidade}
          </div>
          <div style={{ fontSize: 23, color: MARCA.tintaSuave, marginTop: 4 }}>3º andar · Mais ventilado · Tabela de Setembro</div>
        </div>
      ) : (
        <Botao s={s} toque={T.usarTabela} tipo="contorno" altura={84} estilo={{ marginTop: 18 }}>
          🏷️ Usar tabela de preço
        </Botao>
      )}
      <div style={{ fontSize: 24, fontWeight: 800, color: MARCA.tintaSuave, letterSpacing: 1, margin: '24px 0 12px' }}>O IMÓVEL E O BANCO</div>
      <Campo compacto rotulo="Valor de venda" valor={brl(V.valorVenda)} s={s} de={T.unidade + 4} ate={T.unidade + 4} brilho />
      <Campo compacto rotulo="Financiamento aprovado pelo banco" valor={brl(V.financiamentoAprovado)} s={s} de={T.preenche(0)} ate={T.preenche(0)} brilho />
      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ flex: 1 }}>
          <Campo compacto rotulo="Subsídio" valor={brl(V.subsidio)} s={s} de={T.preenche(1)} ate={T.preenche(1)} brilho />
        </div>
        <div style={{ flex: 1 }}>
          <Campo compacto rotulo="FGTS" valor={brl(V.fgts)} s={s} de={T.preenche(2)} ate={T.preenche(2)} brilho />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        <div style={{ flex: 1 }}>
          <Campo compacto rotulo="Ato" valor={brl(V.ato)} s={s} de={T.preenche(3)} ate={T.preenche(3)} brilho />
        </div>
        <div style={{ flex: 1 }}>
          <Campo compacto rotulo="Parcelas mensais" valor={`${V.mensais}`} s={s} de={T.preenche(4)} ate={T.preenche(4)} brilho />
        </div>
      </div>

      {/* A LIA, sempre à mão no canto. */}
      <div style={{ position: 'absolute', right: 36, bottom: 60, transform: `scale(${1 + (s >= T.liaAbre && s < T.liaAbre + 5 ? -0.08 : 0)})`, zIndex: 10 }}>
        <OrbeLia tamanho={110} s={s} ativa={liaAberta > 0} />
      </div>
      <Toque s={s} em={T.usarTabela} x={342} y={640} />
      <Toque s={s} em={T.liaAbre} x={593} y={1329} />

      {/* Seletor da tabela de preço. */}
      <Folha aberta={tabelaAberta} altura={920}>
        <div style={{ fontSize: 40, fontWeight: 800, color: MARCA.tinta }}>{naUnidade ? 'Escolha a unidade' : 'Escolha o bloco'}</div>
        <div style={{ fontSize: 25, color: MARCA.tintaSuave, margin: '4px 0 24px' }}>
          {V.empreendimento} · {naUnidade ? V.bloco : 'tabela de Setembro'}
        </div>
        {!naUnidade ? (
          ['Bloco 1', 'Bloco 2', 'Bloco 3'].map((b) => (
            <div
              key={b}
              style={{
                height: 110,
                marginBottom: 14,
                borderRadius: 22,
                border: `2px solid ${b === V.bloco && s >= T.bloco ? MARCA.laranja : MARCA.borda}`,
                background: b === V.bloco && s >= T.bloco ? MARCA.laranjaSuave : MARCA.branco,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 28px',
                fontSize: 32,
                fontWeight: 700,
                color: MARCA.tinta,
              }}
            >
              {b}
              <span style={{ fontSize: 24, color: MARCA.tintaSuave, fontWeight: 600 }}>12 unidades ›</span>
            </div>
          ))
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {UNIDADES.map((u, k) => {
              const p = mola(s, T.bloco + 3 + k, 12, 220);
              const esta = u.codigo === V.unidade;
              const marcada = esta && s >= T.unidade;
              return (
                <div
                  key={u.codigo}
                  style={{
                    height: 132,
                    borderRadius: 20,
                    border: `2px solid ${marcada ? MARCA.laranja : MARCA.borda}`,
                    background: marcada ? MARCA.laranja : MARCA.branco,
                    color: marcada ? MARCA.branco : MARCA.tinta,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${p})`,
                  }}
                >
                  <div style={{ fontSize: 34, fontWeight: 800 }}>{u.codigo}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.8 }}>{brl(esta ? V.valorVenda : u.preco).replace(',00', '')}</div>
                </div>
              );
            })}
          </div>
        )}
      </Folha>
      <Toque s={s} em={T.bloco} x={342} y={880} />
      <Toque s={s} em={T.unidade} x={138} y={930} />

      {/* A LIA: assistente por texto. */}
      <Folha aberta={liaAberta} altura={640} escura>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
          <OrbeLia tamanho={70} s={s} ativa />
          <div>
            <div style={{ color: '#fff', fontSize: 32, fontWeight: 800 }}>Assistente por texto</div>
            <div style={{ color: MARCA.laranjaClaro, fontSize: 24, fontWeight: 700 }}>Simulador de vendas</div>
          </div>
        </div>
        <div style={{ color: '#aab2c0', fontSize: 25, marginBottom: 18 }}>Digite os dados da negociação e a LIA preenche a simulação.</div>
        <div style={{ background: '#232937', borderRadius: 24, padding: '22px 24px', color: '#fff', fontSize: 30, lineHeight: 1.35, minHeight: 150 }}>
          {fraseDigitada}
          {!analisando ? <span style={{ display: 'inline-block', width: 3, height: 34, background: MARCA.laranja, marginLeft: 3, verticalAlign: '-6px' }} /> : null}
        </div>
        {analisando ? (
          <div style={{ marginTop: 20, color: MARCA.laranjaClaro, fontSize: 27, fontWeight: 700, opacity: interpolate(Math.sin(s / 1.6), [-1, 1], [0.5, 1]) }}>
            Analisando o texto…
          </div>
        ) : null}
      </Folha>
    </Tela>
  );
};
