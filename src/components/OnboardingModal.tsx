/**
 * Pedido dos dados do corretor logo após o primeiro login.
 *
 * ------------------------------------------------------------------
 * POR QUE EXISTE UMA SAÍDA
 * ------------------------------------------------------------------
 * Antes esta tela era um beco: sem botão de fechar, sem pular, e exigindo CPF
 * com dígito verificador válido. Duas consequências:
 *
 * 1. Um revisor da App Store, que não tem CPF brasileiro, ficaria preso aqui e
 *    nunca veria o app — reprovação certa pela regra 2.1.
 * 2. A regra 5.1.1(v) diz que o app "não pode exigir que o usuário informe
 *    dados pessoais para funcionar", salvo quando diretamente ligados à função
 *    principal. Esses dados são necessários para EMITIR PROPOSTA, não para
 *    abrir o app.
 *
 * Por isso o "Preencher depois": o pedido continua aparecendo a cada abertura
 * enquanto o cadastro estiver incompleto, mas nunca tranca a porta.
 */
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { UF_OPTIONS } from '@/features/uf';
import { formatCNPJ, formatCPF, formatPhone, isValidCPF } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

export function OnboardingModal() {
  const styles = useThemedStyles(makeStyles);
  const { needsOnboarding, profile, updateProfile } = useProfile();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [agency, setAgency] = useState(profile?.agency ?? '');
  const [cnpj, setCnpj] = useState(profile?.cnpj ?? '');
  const [cpf, setCpf] = useState(profile?.cpf ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [uf, setUf] = useState<string | null>(profile?.uf ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Adiado nesta sessão. Volta a aparecer na próxima abertura do app. */
  const [adiado, setAdiado] = useState(false);

  async function save() {
    setError(null);
    if (!fullName.trim() || !agency.trim() || !cnpj.trim() || !cpf.trim() || !phone.trim() || !uf) {
      setError('Preencha todos os campos para continuar.');
      return;
    }
    if (!isValidCPF(cpf)) {
      setError('CPF inválido. Confira os números.');
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      fullName: fullName.trim(),
      agency: agency.trim(),
      cnpj: cnpj.trim(),
      cpf: cpf.trim(),
      phone: phone.trim(),
      uf,
    });
    setSaving(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <Modal
      visible={needsOnboarding && !adiado}
      animationType="slide"
      transparent
      onRequestClose={() => setAdiado(true)}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Complete seu cadastro</Text>
            <Text style={styles.subtitle}>
              Precisamos de alguns dados para personalizar suas simulações e propostas. Seu CPF identifica sua conta.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Input label="Nome completo" value={fullName} onChangeText={setFullName} placeholder="Seu nome" autoCapitalize="words" />
            <Input
              label="Seu CPF"
              value={cpf}
              onChangeText={(t) => setCpf(formatCPF(t))}
              placeholder="000.000.000-00"
              keyboardType="numbers-and-punctuation"
            />
            <Input label="Imobiliária" value={agency} onChangeText={setAgency} placeholder="Nome da imobiliária" />
            <Input label="CNPJ" value={cnpj} onChangeText={(t) => setCnpj(formatCNPJ(t))} placeholder="00.000.000/0000-00" keyboardType="numbers-and-punctuation" />
            <Input label="Telefone" value={phone} onChangeText={(t) => setPhone(formatPhone(t))} placeholder="(00) 00000-0000" keyboardType="phone-pad" />
            <Select
              label="Estado onde você atua"
              placeholder="Selecione seu estado"
              value={uf}
              options={UF_OPTIONS}
              onChange={setUf}
              searchable
            />
            {/*
              O estado não é burocracia: é ele que faz o app mostrar só os
              empreendimentos que este corretor pode vender.
            */}
            <Text style={styles.hint}>
              Usamos para mostrar só os empreendimentos do seu estado.
            </Text>

            <Button label="Salvar e continuar" onPress={save} loading={saving} style={styles.cta} />
            <Button
              label="Preencher depois"
              variant="ghost"
              onPress={() => setAdiado(true)}
              disabled={saving}
            />
            <Text style={styles.hint}>
              Você consegue usar o app sem isso. Só precisamos desses dados na hora de gerar uma
              proposta em PDF — dá para preencher em Ajustes → Editar perfil.
            </Text>
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
    hint: { ...typography.caption, color: colors.inkMuted, marginTop: -spacing.sm, marginBottom: spacing.md },
    title: { ...typography.title, color: colors.primary, marginBottom: spacing.xs },
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
