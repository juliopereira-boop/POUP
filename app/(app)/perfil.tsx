import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { CampoCidade } from '@/components/CampoCidade';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Segmento } from '@/components/Segmento';
import { Select } from '@/components/Select';
import type { TipoCorretor } from '@/data';
import { formatCNPJ, formatCPF, formatPhone, isValidCPF } from '@/lib/masks';
import { UF_OPTIONS } from '@/features/uf';
import { estadoDaConta, resumoDaConta } from '@/features/planos/acoes';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { voltar } from '@/lib/navegacao';

export default function PerfilScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { subscription, trialDaysLeft } = useSubscription();
  const plano = resumoDaConta(estadoDaConta(subscription), trialDaysLeft);

  const [fullName, setFullName] = useState('');
  const [agency, setAgency] = useState('');
  const [agencyManager, setAgencyManager] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [creci, setCreci] = useState('');
  const [uf, setUf] = useState<string | null>(null);
  const [cidade, setCidade] = useState('');
  const [tipoCorretor, setTipoCorretor] = useState<TipoCorretor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setAgency(profile.agency ?? '');
    setAgencyManager(profile.agencyManager ?? '');
    setCnpj(formatCNPJ(profile.cnpj ?? ''));
    setCpf(formatCPF(profile.cpf ?? ''));
    setPhone(formatPhone(profile.phone ?? ''));
    setCreci(profile.creci ?? '');
    setUf(profile.uf ?? null);
    setCidade(profile.cidade ?? '');
    setTipoCorretor(profile.tipoCorretor);
  }, [profile]);

  async function save() {
    setError(null);
    if (!fullName.trim() || !cpf.trim() || !phone.trim() || !uf) {
      setError('Nome, CPF, telefone e estado são obrigatórios.');
      return;
    }
    if (!isValidCPF(cpf)) {
      setError('CPF inválido. Confira os números.');
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      fullName: fullName.trim(),
      agency: agency.trim() || null,
      agencyManager: agencyManager.trim() || null,
      cnpj: cnpj.trim() || null,
      cpf: cpf.trim(),
      phone: phone.trim(),
      creci: creci.trim() || null,
      uf,
      cidade: cidade.trim() || null,
      tipoCorretor,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (Platform.OS === 'web') voltar(router, '/(app)');
    else Alert.alert('POUP', 'Perfil atualizado!', [{ text: 'OK', onPress: () => voltar(router, '/(app)') }]);
  }

  return (
    <Screen>
      <Text style={styles.email}>{user?.email}</Text>

      {/* Meu plano: a tela Planos fica sempre a um toque, em qualquer situação. */}
      <Pressable
        onPress={() => router.push('/(app)/planos')}
        style={({ pressed }) => [styles.plano, pressed && styles.planoPressionado]}
        accessibilityRole="button"
        accessibilityLabel={`Meu plano: ${plano.titulo}. Ver planos`}
      >
        <View style={styles.planoTextos}>
          <Text style={styles.planoRotulo}>MEU PLANO</Text>
          <Text style={styles.planoTitulo}>{plano.titulo}</Text>
          <Text style={styles.planoDetalhe} numberOfLines={2}>{plano.detalhe}</Text>
        </View>
        <Text style={styles.planoAcao}>Ver planos ›</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Input label="Nome completo" value={fullName} onChangeText={setFullName} placeholder="Seu nome" autoCapitalize="words" />
      <Input
        label="Seu CPF"
        value={cpf}
        onChangeText={(t) => setCpf(formatCPF(t))}
        placeholder="000.000.000-00"
        keyboardType="numbers-and-punctuation"
      />
      <Text style={styles.rotuloTipo}>Você é corretor</Text>
      <Segmento
        opcoes={[
          { valor: 'house', rotulo: 'House' },
          { valor: 'imob', rotulo: 'Imob' },
        ]}
        valor={tipoCorretor ?? ''}
        onMudar={(v) => setTipoCorretor(v as TipoCorretor)}
      />
      <Text style={styles.dicaTipo}>
        {tipoCorretor === 'imob'
          ? 'Imob: corretor de imobiliária parceira. Suas vendas usam o percentual Imob da construtora.'
          : tipoCorretor === 'house'
            ? 'House: corretor da própria construtora. Suas vendas usam o percentual House.'
            : 'Escolha o seu tipo: a comissão das vendas é calculada pela regra da construtora para ele.'}
      </Text>
      <Input label="Imobiliária (opcional)" value={agency} onChangeText={setAgency} placeholder="Nome da imobiliária, se houver" />
      <Input label="Gerente imob" value={agencyManager} onChangeText={setAgencyManager} placeholder="Nome do gerente da imobiliária" autoCapitalize="words" />
      <Input label="CNPJ (opcional)" value={cnpj} onChangeText={(t) => setCnpj(formatCNPJ(t))} placeholder="00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
      <Input label="Telefone" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
      <Input label="CRECI (opcional)" value={creci} onChangeText={setCreci} placeholder="Seu registro CRECI" />
      <Select
        label="Estado onde você atua"
        placeholder="Selecione seu estado"
        value={uf}
        options={UF_OPTIONS}
        onChange={(v) => {
          // Trocou de estado: a cidade do estado antigo não vale mais.
          if (v !== uf) setCidade('');
          setUf(v);
        }}
        searchable
      />
      <Text style={styles.hint}>
        Define quais empreendimentos do catálogo do POUP aparecem para você.
      </Text>
      <CampoCidade uf={uf} value={cidade} onChange={setCidade} />
      <Text style={styles.hint}>É a cidade do seu ranking. CRECI, estado e cidade são exigidos para participar.</Text>

      <Button label="Salvar" onPress={save} loading={saving} style={styles.cta} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    rotuloTipo: { ...typography.label, color: colors.ink, marginBottom: spacing.xs },
    dicaTipo: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs, marginBottom: spacing.md },
    email: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    plano: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.primarySoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.xl,
    },
    planoPressionado: { opacity: 0.7 },
    planoTextos: { flex: 1, gap: 2 },
    planoRotulo: { ...typography.caption, color: colors.primary, fontWeight: '800', letterSpacing: 1 },
    planoTitulo: { ...typography.label, color: colors.ink },
    planoDetalhe: { ...typography.caption, color: colors.inkMuted },
    planoAcao: { ...typography.caption, color: colors.primary, fontWeight: '700' },
    hint: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.xs, marginBottom: spacing.md },
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
