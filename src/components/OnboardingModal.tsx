import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Input } from './Input';
import { formatCNPJ, formatPhone } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

/**
 * Popup exibido após o primeiro login enquanto o corretor não completa o
 * cadastro obrigatório (nome, imobiliária, CNPJ, telefone). Depois, os mesmos
 * dados ficam editáveis na tela de Perfil.
 */
export function OnboardingModal() {
  const styles = useThemedStyles(makeStyles);
  const { needsOnboarding, profile, updateProfile } = useProfile();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [agency, setAgency] = useState(profile?.agency ?? '');
  const [cnpj, setCnpj] = useState(profile?.cnpj ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!fullName.trim() || !agency.trim() || !cnpj.trim() || !phone.trim()) {
      setError('Preencha todos os campos para continuar.');
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      fullName: fullName.trim(),
      agency: agency.trim(),
      cnpj: cnpj.trim(),
      phone: phone.trim(),
    });
    setSaving(false);
    if (!result.ok) setError(result.error);
    // Se ok, needsOnboarding vira false e o modal fecha sozinho.
  }

  return (
    <Modal visible={needsOnboarding} animationType="slide" transparent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Complete seu cadastro</Text>
            <Text style={styles.subtitle}>
              Precisamos de alguns dados para personalizar suas simulações e propostas.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Input label="Nome completo" value={fullName} onChangeText={setFullName} placeholder="Seu nome" autoCapitalize="words" />
            <Input label="Imobiliária" value={agency} onChangeText={setAgency} placeholder="Nome da imobiliária" />
            <Input label="CNPJ" value={cnpj} onChangeText={(t) => setCnpj(formatCNPJ(t))} placeholder="00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
            <Input label="Telefone" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="(00) 00000-0000" keyboardType="phone-pad" />

            <Button label="Salvar e continuar" onPress={save} loading={saving} style={styles.cta} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.xs },
    subtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.xl },
    cta: { marginTop: spacing.sm, marginBottom: spacing.lg },
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
