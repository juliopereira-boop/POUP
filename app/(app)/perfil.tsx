import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { formatCNPJ, formatPhone } from '@/lib/masks';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { spacing, typography, type AppColors } from '@/theme';

export default function PerfilScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();

  const [fullName, setFullName] = useState('');
  const [agency, setAgency] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [creci, setCreci] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setAgency(profile.agency ?? '');
    setCnpj(formatCNPJ(profile.cnpj ?? ''));
    setPhone(formatPhone(profile.phone ?? ''));
    setCreci(profile.creci ?? '');
  }, [profile]);

  async function save() {
    setError(null);
    if (!fullName.trim() || !agency.trim() || !cnpj.trim() || !phone.trim()) {
      setError('Nome, imobiliária, CNPJ e telefone são obrigatórios.');
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      fullName: fullName.trim(),
      agency: agency.trim(),
      cnpj: cnpj.trim(),
      phone: phone.trim(),
      creci: creci.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (Platform.OS === 'web') router.back();
    else Alert.alert('POUP', 'Perfil atualizado!', [{ text: 'OK', onPress: () => router.back() }]);
  }

  return (
    <Screen>
      <Text style={styles.email}>{user?.email}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Input label="Nome completo" value={fullName} onChangeText={setFullName} placeholder="Seu nome" autoCapitalize="words" />
      <Input label="Imobiliária" value={agency} onChangeText={setAgency} placeholder="Nome da imobiliária" />
      <Input label="CNPJ" value={cnpj} onChangeText={(t) => setCnpj(formatCNPJ(t))} placeholder="00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
      <Input label="Telefone" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
      <Input label="CRECI (opcional)" value={creci} onChangeText={setCreci} placeholder="Seu registro CRECI" />

      <Button label="Salvar" onPress={save} loading={saving} style={styles.cta} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    email: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    cta: { marginTop: spacing.sm },
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
