/**
 * A TELA DE SIMULAÇÃO.
 *
 * ===========================================================================
 * SEIS CAMPOS NA TELA. O RESTO ESTÁ NO CADASTRO.
 * ===========================================================================
 * A versão anterior desta tela pedia trinta coisas: tipo de operação, tipo de
 * imóvel, UF, empresa, empreendimento, bloco, unidade, linha de financiamento,
 * sistema de amortização, regime da taxa, quota, comprometimento de renda.
 * Tudo isso é verdade — e quase nada disso o corretor deveria digitar.
 *
 * Escolhido o banco na tela anterior, **as regras dele entram por trás**: taxa,
 * quota máxima, prazo máximo, teto de renda, comprometimento, indexador e
 * sistema saem do cadastro de regras versionado e nem aparecem aqui.
 *
 * O que fica na tela é só o que o cadastro não tem como saber:
 *
 *     1. quanto custa o imóvel
 *     2. quanto o cliente tem de entrada
 *     3. quanto ele tem de FGTS
 *     4. quanto a família ganha
 *     5. a idade do proponente
 *     6. em quantos anos
 *
 * ===========================================================================
 * A ÚNICA EXCEÇÃO: BANCO SEM TABELA CADASTRADA
 * ===========================================================================
 * Para um banco cuja tabela não está cadastrada, taxa e quota **precisam** ser
 * digitadas — não existe simulação sem elas, e a §74 proíbe inventá-las. Nesse
 * caso os campos aparecem, com o aviso de que quem manda é a condição que o
 * correspondente aprovou, e não a tabela do site.
 *
 * ===========================================================================
 * O RESTO CONTINUA EXISTINDO, DOBRADO
 * ===========================================================================
 * Cliente, empreendimento, unidade, subsídio, segundo proponente, avaliação,
 * carência, cenário de indexador: nada foi removido. Tudo isso mora atrás de
 * "Mais detalhes" — presente para quem precisa, fora do caminho de quem só
 * quer a parcela.
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BancoMarca } from '@/components/BancoMarca';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { NumberPickerField } from '@/components/NumberPickerField';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { formatCurrencyBRL } from '@/lib/masks';
import { opcoesDeProduto, useFinanciamento } from '@/features/financiamento/FinanciamentoProvider';
import { BANCOS } from '@/features/financiamento/bancos';
import { formatarBRL, formatarPct } from '@/features/financiamento/dinheiro';
import { PRAZOS_COMUNS, REGIMES_TAXA } from '@/features/financiamento/formulario';
import { CENARIOS_INDEXADOR } from '@/features/financiamento/indexador';
import { SISTEMA_ROTULO, type SistemaAmortizacao } from '@/features/financiamento/amortizacao';
import {
  IMOVEL_ROTULO,
  OPERACAO_ROTULO,
  type TipoImovel,
  type TipoOperacao,
} from '@/features/financiamento/regras';
import type { RegimeTaxa } from '@/features/financiamento/dinheiro';
import { UF_OPTIONS } from '@/features/uf';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function SimularFinanciamento() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const {
    form,
    set,
    limpar,
    regras,
    banco,
    escolherBanco,
    clientes,
    empresas,
    empreendimentos,
    resultado,
    erro,
    exigeCondicaoInformada,
    podeConfigurar,
    faixaDaRenda,
    escolherCliente,
    escolherEmpreendimento,
    adicionarProponente,
    removerProponente,
    atualizarProponente,
    rendaFamiliarBruta,
  } = useFinanciamento();

  const [detalhes, setDetalhes] = useState(false);

  const produtos = useMemo(
    () => opcoesDeProduto(regras, form.bancoId),
    [regras, form.bancoId],
  );
  const produtoAtual = regras.produtos.find((p) => p.id === form.produtoId) ?? null;
  const indexadorAtual = regras.indexadores.find((i) => i.id === produtoAtual?.indexadorId) ?? null;
  const principal = form.proponentes[0] ?? null;

  const empreendimentosDaEmpresa = useMemo(
    () =>
      empreendimentos
        .filter((d) => !form.companyId || d.companyId === form.companyId)
        .map((d) => ({ value: d.id, label: d.name })),
    [empreendimentos, form.companyId],
  );

  /*
   * Sem banco escolhido não há simulação: a tela mostra a lista curta em vez de
   * redirecionar. Redirecionar aqui daria pau de corrida — o rascunho é
   * hidratado por I/O assíncrono, e o corretor que voltasse de um resultado
   * seria chutado para trás antes de o banco dele carregar.
   */
  if (!banco) {
    return (
      <Screen>
        <Text style={styles.secaoTitulo}>Escolha o banco</Text>
        <Text style={styles.secaoNota}>
          As condições daquele banco entram sozinhas — você preenche só o essencial.
        </Text>
        <View style={styles.bancoLista}>
          {[...BANCOS]
            .sort((a, b) => a.ordem - b.ordem)
            .map((b) => (
              <Pressable
                key={b.id}
                onPress={() => escolherBanco(b.id)}
                accessibilityRole="button"
                accessibilityLabel={b.nome}
                style={({ pressed }) => [styles.bancoItem, pressed && styles.pressionado]}
              >
                <BancoMarca banco={b} tamanho={40} />
                <Text style={styles.bancoNome}>{b.nome}</Text>
              </Pressable>
            ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* ------------------------------------------------------- o banco */}
      <View style={styles.faixaBanco}>
        <BancoMarca banco={banco} tamanho={40} />
        <View style={styles.faixaTexto}>
          <Text style={styles.faixaNome}>{banco.nome}</Text>
          <Text style={styles.faixaLinha}>
            {produtoAtual && !produtoAtual.parametrosManuais
              ? `${produtoAtual.nome} · ${formatarPct(produtoAtual.taxaAnualPct.valor ?? 0)} ao ano ${produtoAtual.regimeTaxa}`
              : 'Condição informada por você'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.replace('/(app)/financiamento')}
          accessibilityRole="button"
          accessibilityLabel="Trocar de banco"
        >
          <Text style={styles.trocar}>Trocar</Text>
        </Pressable>
      </View>

      {/* ---------------------------------------------------- resultado vivo */}
      <View style={styles.painel}>
        {resultado ? (
          <>
            <View style={styles.painelLinha}>
              <Text style={styles.painelRotulo}>1ª prestação estimada</Text>
              <Text style={styles.painelValor}>
                {formatarBRL(resultado.primeira?.prestacaoTotal ?? (0 as never))}
              </Text>
              {resultado.primeira?.parcial ? (
                <Text style={styles.painelNota}>
                  Encargo principal apenas — seguros e tarifa não estão cadastrados.
                </Text>
              ) : null}
            </View>
            <View style={styles.painelGrade}>
              <Mini rotulo="Financiado" valor={formatarBRL(resultado.valorFinanciado)} />
              <Mini rotulo="Entrada total" valor={formatarBRL(resultado.entradaTotal)} />
              <Mini
                rotulo="Última prestação"
                valor={formatarBRL(resultado.ultima?.prestacaoTotal ?? (0 as never))}
              />
              <Mini
                rotulo="Renda mínima"
                valor={
                  resultado.rendaMinimaEstimada
                    ? formatarBRL(resultado.rendaMinimaEstimada)
                    : 'não calculada'
                }
              />
            </View>
            <View
              style={[
                styles.selo,
                resultado.elegibilidade.elegivel ? styles.seloOk : styles.seloRuim,
              ]}
            >
              <Text
                style={[
                  styles.seloTexto,
                  { color: resultado.elegibilidade.elegivel ? colors.success : colors.danger },
                ]}
              >
                {resultado.elegibilidade.elegivel
                  ? 'Enquadramento estimado: apto'
                  : `Não enquadra: ${resultado.elegibilidade.reprovacoes[0]?.rotulo ?? ''}`}
              </Text>
            </View>
            <Button
              label="Ver resultado completo"
              onPress={() => router.push('/(app)/financiamento/resultado')}
              style={styles.painelBotao}
            />
          </>
        ) : (
          <Text style={styles.painelVazio}>
            {erro ?? 'Preencha o valor do imóvel e o prazo para ver a simulação aqui.'}
          </Text>
        )}
      </View>

      {/* ======================================================== o essencial */}

      <Input
        label="Valor do imóvel"
        value={form.valorImovel}
        onChangeText={(t) => set('valorImovel', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />

      <View style={styles.linha}>
        <View style={styles.col}>
          <Input
            label="Entrada"
            value={form.entradaPropria}
            onChangeText={(t) => set('entradaPropria', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <Input
            label="FGTS"
            value={form.fgtsDisponivel}
            onChangeText={(t) => set('fgtsDisponivel', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      </View>

      {principal ? (
        <View style={styles.linha}>
          <View style={styles.col}>
            <Input
              label="Renda bruta familiar"
              value={principal.rendaBruta}
              onChangeText={(t) =>
                atualizarProponente(principal.id, { rendaBruta: formatCurrencyBRL(t) })
              }
              placeholder="R$ 0,00"
              keyboardType="numeric"
            />
            {/*
              A faixa aparece no instante em que a renda é digitada, embaixo do
              próprio campo. É a informação que o corretor mais quer nessa hora
              — e ele não deveria precisar cruzar tabela na cabeça para saber a
              que o cliente tem direito.
            */}
            {faixaDaRenda ? (
              <View style={styles.faixaChip}>
                <Text style={styles.faixaChipTexto}>{faixaDaRenda.nome}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.col}>
            <Input
              label="Idade"
              value={principal.idade}
              onChangeText={(t) =>
                atualizarProponente(principal.id, { idade: t.replace(/\D/g, '').slice(0, 3) })
              }
              placeholder="anos"
              keyboardType="numeric"
            />
          </View>
        </View>
      ) : null}

      <Select
        label="Prazo"
        value={form.prazoMeses}
        options={PRAZOS_COMUNS}
        onChange={(v) => set('prazoMeses', v)}
      />

      {/*
       * Banco sem tabela cadastrada: taxa e quota são obrigatórias, porque sem
       * elas não existe conta a fazer — e chutá-las é exatamente o que a §74
       * proíbe.
       */}
      {exigeCondicaoInformada && !podeConfigurar ? (
        /*
         * Banco sem tabela e corretor sem permissão de configurar: não há
         * simulação possível, e dizer isso é melhor que mostrar campos que ele
         * não pode preencher. O caminho é "Outro banco", onde informar a
         * condição é o comportamento previsto.
         */
        <View style={styles.alerta}>
          <Text style={styles.alertaTitulo}>Condições ainda não cadastradas</Text>
          <Text style={styles.alertaTexto}>
            As taxas e limites deste banco são cadastrados pelo administrador do POUP e ainda não
            estão disponíveis. Para simular com a condição que o correspondente aprovou, volte e
            escolha <Text style={styles.forte}>Outro banco</Text>.
          </Text>
        </View>
      ) : null}

      {exigeCondicaoInformada && podeConfigurar ? (
        <>
          <View style={styles.destaque}>
            <Text style={styles.destaqueTexto}>
              Informe a condição que o correspondente bancário aprovou para este cliente — é ela que
              vale, e não a tabela genérica do site.
            </Text>
          </View>
          <View style={styles.linha}>
            <View style={styles.col}>
              <Input
                label="Taxa ao ano (%)"
                value={form.taxaAnual}
                onChangeText={(t) => set('taxaAnual', t.replace(/[^\d,.]/g, '').slice(0, 6))}
                placeholder="Ex.: 9,5"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Quota financiada (%)"
                value={form.quotaMax}
                onChangeText={(t) => set('quotaMax', t.replace(/[^\d,.]/g, '').slice(0, 5))}
                placeholder="Ex.: 80"
                keyboardType="numeric"
              />
            </View>
          </View>
          <Select
            label="A taxa informada é"
            value={form.regimeTaxa}
            options={REGIMES_TAXA}
            onChange={(v) => set('regimeTaxa', v as RegimeTaxa)}
          />
          <Text style={styles.ajuda}>
            Não é detalhe: 10% <Text style={styles.forte}>nominais</Text> viram 0,8333% ao mês e
            10,47% efetivos ao ano; 10% <Text style={styles.forte}>efetivos</Text> viram 0,7974% ao
            mês. Em 35 anos a diferença passa de vinte mil reais.
            {resultado
              ? ` Com o que está informado: ${formatarPct(resultado.taxaAnualEfetivaPct)} efetivos ao ano.`
              : ''}
          </Text>
        </>
      ) : null}

      <Button
        label="Ver resultado completo"
        onPress={() => router.push('/(app)/financiamento/resultado')}
        disabled={!resultado}
        style={styles.cta}
      />

      {/* ====================================================== mais detalhes */}
      <Pressable
        onPress={() => setDetalhes((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: detalhes }}
        style={styles.expandir}
      >
        <Text style={styles.expandirTexto}>
          {detalhes ? '− Esconder detalhes' : '+ Mais detalhes'} (cliente, unidade, subsídio, 2º
          proponente, avaliação, carência)
        </Text>
      </Pressable>

      {detalhes ? (
        <>
          {/* ------------------------------------------------------ cliente */}
          <Secao
            titulo="O cliente"
            nota="Ligar a simulação ao cliente é o que faz o simulador de poupança já abrir com esses números."
          />

          <Select
            label="Cliente cadastrado"
            placeholder="Selecionar um lead"
            value={form.leadId}
            options={clientes.map((c) => ({ value: c.id, label: c.name }))}
            onChange={escolherCliente}
            emptyHint="Nenhum lead cadastrado ainda."
            searchable
          />

          {principal ? (
            <Input
              label="Nome do proponente"
              value={principal.nome}
              onChangeText={(t) => atualizarProponente(principal.id, { nome: t })}
              placeholder="Nome completo"
            />
          ) : null}

          {/* --------------------------------------------------- o imóvel */}
          <Secao titulo="O imóvel" />

          <Select
            label="Empresa"
            placeholder="Vincular a uma construtora"
            value={form.companyId}
            options={empresas.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(v) => set('companyId', v)}
            emptyHint="Cadastre uma empresa em Cadastros."
          />

          <Select
            label="Empreendimento"
            placeholder="Vincular a um empreendimento"
            value={form.developmentId}
            options={empreendimentosDaEmpresa}
            onChange={escolherEmpreendimento}
            emptyHint="Nenhum empreendimento para esta empresa."
          />

          <View style={styles.linha}>
            <View style={styles.col}>
              <NumberPickerField
                label="Bloco / Quadra"
                min={0}
                max={100}
                value={form.block}
                onChange={(n) => set('block', n)}
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Unidade"
                value={form.unit}
                onChangeText={(t) => set('unit', t)}
                placeholder="Ex.: 304"
                keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
              />
            </View>
          </View>

          <View style={styles.linha}>
            <View style={styles.col}>
              <Select
                label="Tipo de operação"
                value={form.operacao}
                options={(Object.keys(OPERACAO_ROTULO) as TipoOperacao[]).map((k) => ({
                  value: k,
                  label: OPERACAO_ROTULO[k],
                }))}
                onChange={(v) => set('operacao', v as TipoOperacao)}
              />
            </View>
            <View style={styles.col}>
              <Select
                label="Tipo de imóvel"
                value={form.tipoImovel}
                options={(Object.keys(IMOVEL_ROTULO) as TipoImovel[]).map((k) => ({
                  value: k,
                  label: IMOVEL_ROTULO[k],
                }))}
                onChange={(v) => set('tipoImovel', v as TipoImovel)}
              />
            </View>
          </View>

          <Select
            label="UF"
            placeholder="Estado"
            value={form.uf}
            options={UF_OPTIONS}
            onChange={(v) => set('uf', v)}
            searchable
          />

          <Input
            label="Valor de avaliação do imóvel"
            value={form.valorAvaliacao}
            onChangeText={(t) => set('valorAvaliacao', formatCurrencyBRL(t))}
            placeholder="em branco = usar o preço de venda"
            keyboardType="numeric"
          />
          <Text style={styles.ajuda}>
            O banco financia sobre o MENOR entre o preço de venda e a avaliação — e a avaliação
            costuma vir abaixo do negociado. O seguro do imóvel (DFI) também incide sobre ela.
          </Text>

          {/* ------------------------------------------------- os recursos */}
          <Secao
            titulo="Recursos"
            nota="A entrada, o FGTS e o subsídio somam. O que sobra é o valor financiado."
          />

          <Input
            label="Subsídio / desconto"
            value={form.subsidio}
            onChangeText={(t) => set('subsidio', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />

          <Input
            label="FGTS a utilizar"
            value={form.fgtsUsado}
            onChangeText={(t) => set('fgtsUsado', formatCurrencyBRL(t))}
            placeholder="em branco = usar o saldo inteiro"
            keyboardType="numeric"
          />
          <Text style={styles.ajuda}>
            O saldo informado é somado por inteiro à entrada, salvo se você limitar aqui. O direito
            de usar o FGTS depende de análise do banco.
          </Text>

          {/* ----------------------------------------------- proponentes */}
          <Secao
            titulo="Quem mais compõe renda"
            nota="A idade de cada um entra no cálculo do seguro e no limite de idade mais prazo."
          />

          {form.proponentes.slice(1).map((p, i) => (
            <View key={p.id} style={styles.proponente}>
              <View style={styles.proponenteTopo}>
                <Text style={styles.proponenteTitulo}>{i + 2}º proponente</Text>
                <Pressable onPress={() => removerProponente(p.id)} accessibilityRole="button">
                  <Text style={styles.remover}>Remover</Text>
                </Pressable>
              </View>
              <Input
                label="Nome"
                value={p.nome}
                onChangeText={(t) => atualizarProponente(p.id, { nome: t })}
                placeholder="Nome completo"
              />
              <View style={styles.linha}>
                <View style={styles.col}>
                  <Input
                    label="Renda bruta"
                    value={p.rendaBruta}
                    onChangeText={(t) =>
                      atualizarProponente(p.id, { rendaBruta: formatCurrencyBRL(t) })
                    }
                    placeholder="R$ 0,00"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Idade"
                    value={p.idade}
                    onChangeText={(t) =>
                      atualizarProponente(p.id, { idade: t.replace(/\D/g, '').slice(0, 3) })
                    }
                    placeholder="anos"
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Input
                label="Pactuação de renda (%)"
                value={p.participacao}
                onChangeText={(t) =>
                  atualizarProponente(p.id, { participacao: t.replace(/[^\d,.]/g, '').slice(0, 6) })
                }
                placeholder="em branco = proporcional à renda"
                keyboardType="numeric"
              />
            </View>
          ))}

          {form.proponentes.length < 4 ? (
            <Pressable
              onPress={adicionarProponente}
              accessibilityRole="button"
              style={styles.adicionar}
            >
              <Text style={styles.adicionarTexto}>+ Compor renda com outra pessoa</Text>
            </Pressable>
          ) : null}

          <Text style={styles.rendaTotal}>
            Renda familiar bruta: <Text style={styles.forte}>{formatarBRL(rendaFamiliarBruta)}</Text>
          </Text>

          {/* ------------------------------------------------- a condição */}
          <Secao
            titulo="Sistema de amortização"
            nota="A escolha entre parcela decrescente e parcela fixa é do cliente, não do banco."
          />

          <View style={styles.segmentado}>
            {(['SAC', 'PRICE'] as SistemaAmortizacao[]).map((s) => {
              const ativo = form.sistema === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => set('sistema', s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  style={[styles.segmento, ativo && styles.segmentoAtivo]}
                >
                  <Text style={[styles.segmentoTexto, ativo && styles.segmentoTextoAtivo]}>
                    {SISTEMA_ROTULO[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/*
            A CONDIÇÃO DO BANCO É CADASTRO, NÃO FORMULÁRIO.
            
            Linha, comprometimento, carência e cenário de indexador saem da
            versão de regras publicada pelo administrador, com fonte e
            auditoria. Deixá-los editáveis aqui permitiria ao corretor
            apresentar como condição do banco um número que ele mesmo digitou —
            que é exatamente o que a versão de regras existe para impedir.
            
            Quem vê estes campos: o administrador, em qualquer banco, e o
            corretor quando escolheu "Outro banco", onde não há tabela para
            contrariar.
          */}
          {!podeConfigurar && produtoAtual && !produtoAtual.parametrosManuais ? (
            <View style={styles.destaque}>
              <Text style={styles.destaqueTexto}>
                {`${produtoAtual.nome}: taxa ${formatarPct(produtoAtual.taxaAnualPct.valor ?? 0)} ao ano ${produtoAtual.regimeTaxa}`}
                {resultado ? ` (${formatarPct(resultado.taxaAnualEfetivaPct)} efetivos)` : ''}
                {`, quota máxima ${formatarPct(produtoAtual.quotaMaxPct.valor ?? 0)}. Fonte: ${produtoAtual.fonte ?? 'não informada'}.`}
              </Text>
            </View>
          ) : null}

          {podeConfigurar ? (
            <Secao
              titulo="Condição do banco"
              nota="Cadastro do administrador. Mexa só se este cliente tiver uma condição diferente."
            />
          ) : null}

          {podeConfigurar && produtos.length > 1 ? (
            <>
              <Select
                label="Linha de financiamento"
                value={form.produtoId}
                options={produtos.map((p) => ({ value: p.value, label: p.label }))}
                onChange={(v) => {
                  const escolhido = produtos.find((p) => p.value === v);
                  // Linha sem parâmetro cadastrado não é escolhível: deixar
                  // escolher levaria a uma tela de erro em vez de a um
                  // resultado, e o corretor não saberia que o problema não é
                  // dele.
                  if (escolhido && !escolhido.disponivel) return;
                  set('produtoId', v);
                }}
              />
              <Text style={styles.ajuda}>
                {produtos.find((p) => p.value === form.produtoId)?.descricao ?? ''}
              </Text>
            </>
          ) : null}

          {podeConfigurar && exigeCondicaoInformada ? (
            <Input
              label="Comprometimento máximo de renda (%)"
              value={form.comprometimento}
              onChangeText={(t) => set('comprometimento', t.replace(/[^\d,.]/g, '').slice(0, 5))}
              placeholder="Ex.: 30"
              keyboardType="numeric"
            />
          ) : null}

          {podeConfigurar ? (
            <>
              <Input
                label="Carência (meses)"
                value={form.carenciaMeses}
                onChangeText={(t) => set('carenciaMeses', t.replace(/\D/g, '').slice(0, 3))}
                placeholder="0"
                keyboardType="numeric"
              />
              <Text style={styles.ajuda}>
                Durante a carência não há amortização: os juros e a correção entram no saldo
                devedor, que por isso <Text style={styles.forte}>sobe</Text> no período. A
                amortização começa depois, sobre um saldo maior.
              </Text>
            </>
          ) : null}

          {podeConfigurar && indexadorAtual && indexadorAtual.tipo !== 'nenhum' ? (
            <>
              <Select
                label={`Cenário para ${indexadorAtual.nome}`}
                value={form.cenarioIndexador || '0'}
                options={CENARIOS_INDEXADOR}
                onChange={(v) => set('cenarioIndexador', v === '0' ? '' : v)}
              />
              <Text style={styles.ajuda}>
                {indexadorAtual.nome} é divulgado por fonte externa e ninguém sabe o valor futuro.
                Escolher um cenário aqui marca o resultado inteiro como{' '}
                <Text style={styles.forte}>projeção</Text> — inclusive no PDF.
              </Text>
            </>
          ) : null}
        </>
      ) : null}

      <Pressable onPress={limpar} accessibilityRole="button" style={styles.limpar}>
        <Text style={styles.limparTexto}>Limpar e começar outra</Text>
      </Pressable>
    </Screen>
  );
}

function Secao({ titulo, nota }: { titulo: string; nota?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.secao}>
      <Text style={styles.secaoTitulo}>{titulo}</Text>
      {nota ? <Text style={styles.secaoNota}>{nota}</Text> : null}
    </View>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.mini}>
      <Text style={styles.miniRotulo}>{rotulo}</Text>
      <Text style={styles.miniValor}>{valor}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    faixaBanco: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    faixaTexto: { flex: 1, gap: 1 },
    faixaNome: { ...typography.label, color: colors.ink, fontWeight: '700' },
    faixaLinha: { ...typography.caption, color: colors.inkMuted, fontSize: 11.5 },
    trocar: { ...typography.caption, color: colors.primary, fontWeight: '700' },

    faixaChip: {
      alignSelf: 'flex-start',
      backgroundColor: colors.successSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      marginTop: -spacing.md,
      marginBottom: spacing.md,
    },
    faixaChipTexto: {
      ...typography.caption,
      color: colors.success,
      fontSize: 11.5,
      fontWeight: '700',
    },

    alerta: {
      backgroundColor: colors.warningSoft,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    alertaTitulo: { ...typography.label, color: colors.warning, fontWeight: '700' },
    alertaTexto: { ...typography.caption, color: colors.ink, lineHeight: 19 },

    bancoLista: { gap: spacing.md, marginTop: spacing.lg },
    bancoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bancoNome: { ...typography.label, color: colors.ink, flex: 1 },
    pressionado: { opacity: 0.85 },

    painel: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.md,
    },
    painelLinha: { gap: 2 },
    painelRotulo: { ...typography.caption, color: colors.inkMuted },
    painelValor: { ...typography.title, color: colors.primary, fontSize: 30 },
    painelNota: { ...typography.caption, color: colors.warning, fontSize: 11.5 },
    painelGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    painelBotao: { marginTop: spacing.xs },
    painelVazio: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
    mini: { minWidth: 130, flexGrow: 1, gap: 1 },
    miniRotulo: { ...typography.caption, color: colors.inkSubtle, fontSize: 11.5 },
    miniValor: { ...typography.label, color: colors.ink, fontWeight: '700' },
    selo: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
    seloOk: { backgroundColor: colors.successSoft },
    seloRuim: { backgroundColor: colors.dangerSoft },
    seloTexto: { ...typography.caption, fontWeight: '700' },

    secao: { marginTop: spacing.lg, marginBottom: spacing.md, gap: 3 },
    secaoTitulo: { ...typography.heading, color: colors.ink },
    secaoNota: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    linha: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    col: { flex: 1 },

    proponente: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      backgroundColor: colors.surface,
    },
    proponenteTopo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    proponenteTitulo: { ...typography.label, color: colors.primary, fontWeight: '700' },
    remover: { ...typography.caption, color: colors.danger },
    adicionar: { paddingVertical: spacing.sm, marginBottom: spacing.md },
    adicionarTexto: { ...typography.label, color: colors.primary },
    rendaTotal: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md },

    rotulo: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    segmentado: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    segmento: {
      flex: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    segmentoAtivo: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    segmentoTexto: { ...typography.caption, color: colors.inkMuted, textAlign: 'center' },
    segmentoTextoAtivo: { color: colors.primary, fontWeight: '700' },

    ajuda: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
      lineHeight: 18,
    },
    forte: { fontWeight: '700', color: colors.ink },
    destaque: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    destaqueTexto: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    expandir: { paddingVertical: spacing.md },
    expandirTexto: { ...typography.label, color: colors.primary },

    cta: { marginTop: spacing.md },
    limpar: { alignItems: 'center', paddingVertical: spacing.md },
    limparTexto: { ...typography.caption, color: colors.inkMuted },
  });
