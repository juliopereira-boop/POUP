import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import {
  ASSOCIATION_OPTIONS,
  useSimulador,
  type Proponent,
} from '@/features/simulador/SimuladorProvider';
import { formatCPF, formatPhone } from '@/lib/masks';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function SimuladorCliente() {
  const styles = useThemedStyles(makeStyles);
  const sim = useSimulador();
  const [error, setError] = useState<string | null>(null);

  function validProponent(p: Proponent): boolean {
    return Boolean(p.name.trim() && p.cpf.trim() && p.email.trim() && p.contact.trim());
  }

  function advance() {
    setError(null);
    if (!validProponent(sim.proponent1)) {
      return setError('Preencha todos os dados do 1º proponente.');
    }
    if (sim.hasSecondProponent) {
      if (!sim.association) return setError('Selecione o tipo de associação do 2º proponente.');
      if (!validProponent(sim.proponent2)) {
        return setError('Preencha todos os dados do 2º proponente.');
      }
    }
    // Próximas etapas do simulador entram em seguida.
    if (Platform.OS === 'web') window.alert('Dados do cliente salvos! Próxima etapa em breve.');
  }

  return (
    <Screen>
      <Text style={styles.step}>Etapa 3 de 3</Text>
      <Text style={styles.title}>Dados do cliente</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* 1º proponente */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1º Proponente</Text>
        <Input
          label="Nome"
          value={sim.proponent1.name}
          onChangeText={(t) => sim.setProponent1({ name: t })}
          placeholder="Nome completo"
          autoCapitalize="words"
        />
        <Input
          label="CPF"
          value={sim.proponent1.cpf}
          onChangeText={(t) => sim.setProponent1({ cpf: formatCPF(t) })}
          placeholder="000.000.000-00"
          keyboardType="numbers-and-punctuation"
        />
        <Input
          label="E-mail"
          value={sim.proponent1.email}
          onChangeText={(t) => sim.setProponent1({ email: t })}
          placeholder="email@exemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Contato"
          value={sim.proponent1.contact}
          onChangeText={(t) => sim.setProponent1({ contact: formatPhone(t) })}
          placeholder="(00) 00000-0000"
          keyboardType="phone-pad"
        />
      </View>

      {/* 2º proponente (opcional) */}
      {sim.hasSecondProponent ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>2º Proponente</Text>
            <Button
              label="Remover"
              variant="ghost"
              onPress={() => sim.setField('hasSecondProponent', false)}
            />
          </View>

          <Select
            label="Tipo de associação"
            placeholder="Selecione o tipo"
            value={sim.association}
            options={ASSOCIATION_OPTIONS}
            onChange={(v) => sim.setField('association', v as typeof sim.association)}
          />

          <Input
            label="Nome"
            value={sim.proponent2.name}
            onChangeText={(t) => sim.setProponent2({ name: t })}
            placeholder="Nome completo"
            autoCapitalize="words"
          />
          <Input
            label="CPF"
            value={sim.proponent2.cpf}
            onChangeText={(t) => sim.setProponent2({ cpf: formatCPF(t) })}
            placeholder="000.000.000-00"
            keyboardType="numbers-and-punctuation"
          />
          <Input
            label="E-mail"
            value={sim.proponent2.email}
            onChangeText={(t) => sim.setProponent2({ email: t })}
            placeholder="email@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Contato"
            value={sim.proponent2.contact}
            onChangeText={(t) => sim.setProponent2({ contact: formatPhone(t) })}
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
          />
        </View>
      ) : (
        <Button
          label="+ 2º proponente"
          variant="secondary"
          onPress={() => sim.setField('hasSecondProponent', true)}
          style={styles.addBtn}
        />
      )}

      <Button label="Avançar" onPress={advance} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xl },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: { ...typography.heading, color: colors.ink, marginBottom: spacing.md },
    addBtn: { marginBottom: spacing.lg },
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
