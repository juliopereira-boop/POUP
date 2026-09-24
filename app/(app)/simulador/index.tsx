/**
 * SIMULADOR DE POUPANÇA — BLOCO 1: OS VALORES.
 *
 * ===========================================================================
 * POR QUE OS VALORES VÊM PRIMEIRO
 * ===========================================================================
 * O cliente está na mesa. O corretor abre o aplicativo e a pergunta é "quanto
 * fica por mês?" — não "qual é o CPF dele". O simulador antigo começava pela
 * construtora, passava pelo perfil do corretor e pelo cadastro do cliente, e
 * só na quinta tela mostrava a parcela. Agora a parcela aparece na primeira,
 * enquanto ele digita.
 *
 * Tudo o que é número está aqui: valor de venda, o que o banco aprovou, e como
 * a poupança se paga. Construtora, unidade e cliente ficam para o bloco 2 —
 * são dados da proposta, e nenhum deles muda a conta.
 *
 * ===========================================================================
 * NADA TRAVA O "CONTINUAR"
 * ===========================================================================
 * O bloco 2 pode preencher o valor de venda pela tabela de preços, quando a
 * unidade escolhida tem preço cadastrado. Exigir o valor aqui obrigaria o
 * corretor a digitar um número que o sistema já sabe. As regras são conferidas
 * todas juntas no "Gerar proposta" (`pendencias.ts`), que leva de volta ao
 * bloco certo.
 */
import { useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { DateField } from '@/components/DateField';
import { Input } from '@/components/Input';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { ToggleField } from '@/components/ToggleField';
import { CascoSimulador } from '@/components/simulador/CascoSimulador';
import { EtapasSimulador } from '@/components/simulador/EtapasSimulador';
import { ResumoPoupanca } from '@/components/simulador/ResumoPoupanca';
import { buildFlow, formatDateBR } from '@/features/simulador/calc';
import { INITIAL_SIMULADOR_STATE, useSimulador } from '@/features/simulador/SimuladorProvider';
import { currencyToNumber, formatCurrencyBRL } from '@/lib/masks';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function clampCount(text: string, max: number | null): string {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return '';
  const n = Number.parseInt(digits, 10);
  if (max != null && n > max) return String(max);
  return String(n);
}

export default function SimuladorValores() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const sim = useSimulador();
  const flow = useMemo(() => buildFlow(sim), [sim]);

  const [avisoCupom, setAvisoCupom] = useState(false);
  const [cupomAberto, setCupomAberto] = useState(false);
  const [maisAberto, setMaisAberto] = useState(
    () => sim.couponType != null || Boolean(sim.cefParcela) || !sim.cefClientPays || sim.cefInstallment,
  );

  // Rascunho de outra simulação ainda aberto: o corretor pode estar com um
  // cliente novo na mesa e precisa começar limpo sem caçar campo por campo.
  const temRascunho =
    !sim.editId && JSON.stringify(sim.snapshot) !== JSON.stringify(INITIAL_SIMULADOR_STATE);

  function comecarDoZero() {
    const limpar = () => sim.reset();
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm('Apagar os valores desta simulação e começar do zero?')) limpar();
      return;
    }
    Alert.alert('Começar do zero', 'Apagar os valores desta simulação?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: limpar },
    ]);
  }

  function tocarCupom() {
    if (!sim.couponWarningSeen) {
      setAvisoCupom(true);
      return;
    }
    setCupomAberto((v) => !v);
  }

  function fecharAvisoCupom() {
    sim.setField('couponWarningSeen', true);
    setAvisoCupom(false);
    setCupomAberto(true);
  }

  function tipoCupom(tipo: 'R$' | '%') {
    sim.setField('couponType', tipo);
    sim.setField('couponValue', '');
  }

  function limparCupom() {
    sim.setField('couponType', null);
    sim.setField('couponValue', '');
    setCupomAberto(false);
  }

  const continuar = () => router.push('/(app)/simulador/dados');

  const topo = (
    <>
      <EtapasSimulador atual={1} onIrPara={(e) => e === 2 && continuar()} />
      <ResumoPoupanca />
    </>
  );

  return (
    <CascoSimulador topo={topo}>
      {/* ------------------------------------------------ o imóvel e o banco */}
      <View style={styles.secaoLinha}>
        <Text style={styles.secaoSemMargem}>O imóvel e o banco</Text>
        {temRascunho ? (
          <Pressable onPress={comecarDoZero} hitSlop={8} accessibilityRole="button">
            <Text style={styles.limpar}>Começar do zero</Text>
          </Pressable>
        ) : null}
      </View>
      <Input
        label="Valor de venda"
        value={sim.unitValue}
        onChangeText={(t) => sim.setField('unitValue', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />
      {/*
       * "APROVADO PELO BANCO", E NÃO SÓ "APROVADO".
       *
       * Estes campos são digitados a partir da carta de crédito que a
       * instituição já emitiu — o POUP não analisa nada aqui, só recebe o
       * número. Escrito como "Financiamento aprovado", o rótulo lia-se como se
       * a aprovação fosse do aplicativo, e a auditoria de App Store apontou o
       * risco (regra 5.1.1(ix)). Nomear o banco resolve sem tirar nada do
       * corretor.
       */}
      <Input
        label="Financiamento aprovado pelo banco"
        value={sim.financingApproved}
        onChangeText={(t) => sim.setField('financingApproved', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label="Subsídio"
            value={sim.subsidy}
            onChangeText={(t) => sim.setField('subsidy', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <Input
            label="FGTS"
            value={sim.fgts}
            onChangeText={(t) => sim.setField('fgts', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      </View>
      <Text style={styles.nota}>
        Valores informados pela instituição financeira na carta de crédito. O POUP não faz análise
        de crédito nem aprova financiamento.
      </Text>

      {/* ------------------------------------------ como a poupança se paga */}
      <Text style={styles.secao}>Como o cliente paga a poupança</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label="Ato"
            value={sim.ato}
            onChangeText={(t) => sim.setField('ato', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <DateField
            label="Vencimento do ato"
            value={sim.atoDueDate}
            onChange={(iso) => sim.setField('atoDueDate', iso)}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <Input
            label={`Parcelas mensais${sim.companyMaxInstallments ? ` (máx. ${sim.companyMaxInstallments})` : ''}`}
            value={sim.mensaisCount}
            onChangeText={(t) => sim.setField('mensaisCount', clampCount(t, sim.companyMaxInstallments))}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
        <View style={styles.col}>
          <Input
            label="Dia do vencimento"
            value={sim.mensalDueDay}
            onChangeText={(t) => sim.setField('mensalDueDay', t.replace(/[^0-9]/g, '').slice(0, 2))}
            placeholder="Dia"
            keyboardType="numeric"
          />
        </View>
      </View>
      <Text style={styles.dica}>
        {flow.mensalFirstDue
          ? `1ª mensal em ${formatDateBR(flow.mensalFirstDue)} · um mês depois do ato`
          : 'A 1ª mensal vence um mês depois do ato.'}
      </Text>

      {sim.semestralEnabled ? (
        <View style={styles.inter}>
          <View style={styles.interTopo}>
            <Text style={styles.interTitulo}>Semestrais</Text>
            <Button label="Remover" variant="ghost" onPress={() => sim.setField('semestralEnabled', false)} />
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Input
                label={`Quantidade${sim.companyMaxSemiannual ? ` (máx. ${sim.companyMaxSemiannual})` : ''}`}
                value={sim.semestralCount}
                onChangeText={(t) => sim.setField('semestralCount', clampCount(t, sim.companyMaxSemiannual))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Valor de cada"
                value={sim.semestralValue}
                onChangeText={(t) => sim.setField('semestralValue', formatCurrencyBRL(t))}
                placeholder="R$ 0,00"
                keyboardType="numeric"
              />
            </View>
          </View>
          <Text style={styles.dica}>
            {flow.semestralDueDates[0]
              ? `1ª semestral em ${formatDateBR(flow.semestralDueDates[0])}`
              : 'De 6 em 6 meses, a partir da 1ª mensal.'}
          </Text>
        </View>
      ) : null}

      {sim.anualEnabled ? (
        <View style={styles.inter}>
          <View style={styles.interTopo}>
            <Text style={styles.interTitulo}>Anuais</Text>
            <Button label="Remover" variant="ghost" onPress={() => sim.setField('anualEnabled', false)} />
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Input
                label={`Quantidade${sim.companyMaxAnnual ? ` (máx. ${sim.companyMaxAnnual})` : ''}`}
                value={sim.anualCount}
                onChangeText={(t) => sim.setField('anualCount', clampCount(t, sim.companyMaxAnnual))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Valor de cada"
                value={sim.anualValue}
                onChangeText={(t) => sim.setField('anualValue', formatCurrencyBRL(t))}
                placeholder="R$ 0,00"
                keyboardType="numeric"
              />
            </View>
          </View>
          <Text style={styles.dica}>
            {flow.anualDueDates[0]
              ? `1ª anual em ${formatDateBR(flow.anualDueDates[0])}`
              : 'Uma vez por ano, a partir da 1ª mensal.'}
          </Text>
        </View>
      ) : null}

      {!sim.semestralEnabled || !sim.anualEnabled ? (
        <View style={styles.row}>
          {!sim.semestralEnabled ? (
            <Button
              label="+ Semestrais"
              variant="secondary"
              onPress={() => sim.setField('semestralEnabled', true)}
              style={styles.col}
            />
          ) : null}
          {!sim.anualEnabled ? (
            <Button
              label="+ Anuais"
              variant="secondary"
              onPress={() => sim.setField('anualEnabled', true)}
              style={styles.col}
            />
          ) : null}
        </View>
      ) : null}

      {/* ---------------------------------------------------- mais opções */}
      <Pressable
        onPress={() => setMaisAberto((v) => !v)}
        style={styles.maisLinha}
        accessibilityRole="button"
        accessibilityState={{ expanded: maisAberto }}
      >
        <Text style={styles.secaoSemMargem}>Cupom e taxa CEF</Text>
        <Text style={styles.seta}>{maisAberto ? '−' : '+'}</Text>
      </Pressable>

      {maisAberto ? (
        <View style={styles.mais}>
          <View style={styles.cupomLinha}>
            <Pressable onPress={tocarCupom} style={styles.cupomBotao} accessibilityLabel="Cupom">
              <Text style={styles.cupomMais}>+</Text>
            </Pressable>
            <Text style={styles.cupomRotulo}>Cupom de desconto</Text>
            {sim.couponType ? (
              <View style={styles.flex1}>
                <SwipeToDelete onDelete={limparCupom}>
                  <View style={styles.cupomTag}>
                    <Text style={styles.cupomTagTexto}>
                      {sim.couponType === 'R$'
                        ? formatCurrencyBRL(sim.couponValue) || 'R$ 0,00'
                        : `${sim.couponValue || '0'}%`}
                    </Text>
                  </View>
                </SwipeToDelete>
              </View>
            ) : null}
          </View>

          {cupomAberto ? (
            <View style={styles.cupomCaixa}>
              <View style={styles.segmento}>
                {(['R$', '%'] as const).map((t) => {
                  const ativo = sim.couponType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => tipoCupom(t)}
                      style={[styles.segItem, ativo && styles.segItemAtivo]}
                    >
                      <Text style={[styles.segTexto, ativo && styles.segTextoAtivo]}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {sim.couponType === 'R$' ? (
                <Input
                  label="Valor do desconto"
                  value={sim.couponValue}
                  onChangeText={(t) => sim.setField('couponValue', formatCurrencyBRL(t))}
                  placeholder="R$ 0,00"
                  keyboardType="numeric"
                />
              ) : sim.couponType === '%' ? (
                <>
                  <Input
                    label="Percentual sobre o valor de venda"
                    value={sim.couponValue}
                    onChangeText={(t) => sim.setField('couponValue', t.replace(/[^0-9.,]/g, ''))}
                    placeholder="Ex.: 5"
                    keyboardType="numeric"
                  />
                  <Text style={styles.dica}>
                    {(() => {
                      const pct = Number.parseFloat(sim.couponValue.replace(',', '.')) || 0;
                      const val = (currencyToNumber(sim.unitValue) * pct) / 100;
                      return `= ${brl(val)} (${pct || 0}% do valor de venda)`;
                    })()}
                  </Text>
                </>
              ) : (
                <Text style={styles.dica}>Escolha o tipo de desconto acima.</Text>
              )}
            </View>
          ) : null}

          <ToggleField
            label="Taxa CEF: o cliente paga"
            value={sim.cefClientPays}
            onChange={(v) => sim.setField('cefClientPays', v)}
          />
          {sim.cefClientPays ? (
            <>
              <ToggleField
                label="Parcelar a taxa?"
                value={sim.cefInstallment}
                onChange={(v) => sim.setField('cefInstallment', v)}
              />
              {sim.cefInstallment ? (
                <Input
                  label="Quantidade de parcelas da taxa"
                  value={sim.cefInstallmentsCount}
                  onChangeText={(t) => sim.setField('cefInstallmentsCount', t.replace(/[^0-9]/g, ''))}
                  placeholder="Ex.: 12"
                  keyboardType="numeric"
                />
              ) : null}
            </>
          ) : null}
          <Input
            label="Parcela CEF"
            value={sim.cefParcela}
            onChangeText={(t) => sim.setField('cefParcela', formatCurrencyBRL(t))}
            placeholder="R$ 0,00"
            keyboardType="numeric"
          />
        </View>
      ) : null}

      <Button label="Continuar: unidade e cliente" onPress={continuar} style={styles.cta} />

      <Modal visible={avisoCupom} transparent animationType="fade" onRequestClose={fecharAvisoCupom}>
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <Text style={styles.modalTitulo}>Atenção</Text>
            <Text style={styles.modalTexto}>
              O cupom informado será validado pela construtora antes da confirmação da venda.
            </Text>
            <Button label="Entendi" onPress={fecharAvisoCupom} />
          </View>
        </View>
      </Modal>
    </CascoSimulador>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    secaoLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    limpar: { ...typography.caption, color: colors.primary, fontWeight: '600' },

    secao: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    secaoSemMargem: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    col: { flex: 1 },
    nota: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: -spacing.sm,
      marginBottom: spacing.xl,
    },
    dica: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: -spacing.sm,
      marginBottom: spacing.lg,
    },

    inter: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xs,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    interTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    interTitulo: { ...typography.heading, color: colors.ink },

    maisLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      marginTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    seta: { fontSize: 22, lineHeight: 24, color: colors.inkMuted },
    mais: { paddingBottom: spacing.sm },

    cupomLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    cupomBotao: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cupomMais: { color: colors.success, fontSize: 22, lineHeight: 24, fontWeight: '700' },
    cupomRotulo: { ...typography.body, color: colors.ink, fontWeight: '600' },
    cupomTag: {
      backgroundColor: colors.successSoft,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      alignSelf: 'flex-start',
    },
    cupomTagTexto: { ...typography.label, color: colors.success },
    cupomCaixa: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    segmento: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 3,
      marginBottom: spacing.lg,
      alignSelf: 'flex-start',
    },
    segItem: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.sm },
    segItemAtivo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    segTexto: { ...typography.label, color: colors.inkMuted },
    segTextoAtivo: { color: colors.primary },

    cta: { marginTop: spacing.lg },

    modalFundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCartao: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.md,
    },
    modalTitulo: { ...typography.heading, color: colors.warning },
    modalTexto: { ...typography.body, color: colors.ink },
  });
