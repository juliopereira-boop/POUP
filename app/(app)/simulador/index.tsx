import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { NumberPickerField } from '@/components/NumberPickerField';
import { db, type Company, type Development } from '@/data';
import { formatCurrencyBRL } from '@/lib/masks';
import { useSimulador } from '@/features/simulador/SimuladorProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { spacing, typography, type AppColors } from '@/theme';

export default function SimuladorEmpreendimento() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const sim = useSimulador();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [comps, devs] = await Promise.all([
      db.companies.list(user.id),
      db.developments.list(user.id),
    ]);
    setCompanies(comps);
    setDevelopments(devs);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));
  const developmentOptions = useMemo(
    () =>
      developments
        .filter((d) => d.companyId === sim.companyId)
        .map((d) => ({ value: d.id, label: d.name })),
    [developments, sim.companyId],
  );

  function onSelectCompany(companyId: string) {
    sim.setField('companyId', companyId);
    sim.setField('developmentId', null); // troca de empresa reseta o empreendimento
  }

  function advance() {
    setError(null);
    if (!sim.companyId) return setError('Selecione a empresa.');
    if (!sim.developmentId) return setError('Selecione o empreendimento.');
    if (!sim.unit.trim()) return setError('Informe a unidade.');
    if (!sim.unitValue.trim()) return setError('Informe o valor da unidade.');
    router.push('/(app)/simulador/corretor');
  }

  return (
    <Screen>
      <Text style={styles.step}>Etapa 1 de 3</Text>
      <Text style={styles.title}>Escolha do empreendimento</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Select
        label="Empresa"
        placeholder="Escolha a empresa"
        value={sim.companyId}
        options={companyOptions}
        onChange={onSelectCompany}
        emptyHint="Cadastre uma empresa em Configurações › Cadastros."
      />

      <Select
        label="Empreendimento"
        placeholder={sim.companyId ? 'Escolha o empreendimento' : 'Selecione a empresa primeiro'}
        value={sim.developmentId}
        options={developmentOptions}
        onChange={(v) => sim.setField('developmentId', v)}
        emptyHint="Nenhum empreendimento para esta empresa."
      />

      <View style={styles.row}>
        <View style={styles.col}>
          <NumberPickerField
            label="Bloco / Quadra"
            min={0}
            max={100}
            value={sim.block}
            onChange={(n) => sim.setField('block', n)}
          />
        </View>
        <View style={styles.col}>
          <Input
            label="Unidade"
            value={sim.unit}
            onChangeText={(t) => sim.setField('unit', t)}
            placeholder="Ex.: 101"
            keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
          />
        </View>
      </View>

      <Input
        label="Valor da unidade"
        value={sim.unitValue}
        onChangeText={(t) => sim.setField('unitValue', formatCurrencyBRL(t))}
        placeholder="R$ 0,00"
        keyboardType="numeric"
      />

      <Button label="Avançar" onPress={advance} style={styles.cta} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xl },
    row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    col: { flex: 1 },
    cta: { marginTop: spacing.md },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
  });
