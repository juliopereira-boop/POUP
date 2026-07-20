import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { formatCNPJ, formatPhone } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function SimuladorCorretor() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { profile } = useProfile();

  function advance() {
    router.push('/(app)/simulador/cliente');
  }

  return (
    <Screen>
      <Text style={styles.step}>Etapa 2 de 4</Text>
      <Text style={styles.title}>Dados do corretor</Text>
      <Text style={styles.hint}>
        Estes dados vêm do seu perfil. Para alterá-los, toque em Editar.
      </Text>

      <View style={styles.card}>
        <Field label="Nome" value={profile?.fullName} />
        <Divider />
        <Field label="Imobiliária" value={profile?.agency} />
        <Divider />
        <Field label="Telefone" value={profile?.phone ? formatPhone(profile.phone) : null} />
        <Divider />
        <Field label="CNPJ" value={profile?.cnpj ? formatCNPJ(profile.cnpj) : null} />
      </View>

      <Button
        label="Editar dados do perfil"
        variant="secondary"
        onPress={() => router.push('/(app)/perfil')}
        style={styles.editBtn}
      />
      <Button label="Avançar" onPress={advance} />
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

function Divider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    step: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
    hint: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.lg,
    },
    field: { paddingVertical: spacing.lg },
    fieldLabel: { ...typography.caption, color: colors.inkMuted, marginBottom: 2 },
    fieldValue: { ...typography.body, color: colors.ink },
    divider: { height: 1, backgroundColor: colors.border },
    editBtn: { marginBottom: spacing.md },
  });
