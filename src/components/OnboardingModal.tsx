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
 * Por isso o "Preencher depois": o pedido reaparece depois de três dias
 * enquanto o cadastro estiver incompleto, mas nunca tranca a porta.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Input } from './Input';
import { Select } from './Select';
import { registrar } from '@/features/analytics/eventos';
import { UF_OPTIONS } from '@/features/uf';
import { formatCNPJ, formatCPF, formatPhone, isValidCPF } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

export function OnboardingModal() {
  const styles = useThemedStyles(makeStyles);
  const { needsOnboarding, profile, updateProfile } = useProfile();
  const { user } = useAuth();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [agency, setAgency] = useState(profile?.agency ?? '');
  const [cnpj, setCnpj] = useState(profile?.cnpj ?? '');
  const [cpf, setCpf] = useState(profile?.cpf ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [uf, setUf] = useState<string | null>(profile?.uf ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adiado, setAdiado] = useState(false);
  const [adiamentoCarregado, setAdiamentoCarregado] = useState(false);
  const chaveAdiamento = user ? `poup:onboarding-postponed:${user.id}` : null;

  useEffect(() => {
    let ativo = true;
    setAdiamentoCarregado(false);
    setAdiado(false);
    if (!chaveAdiamento) {
      setAdiamentoCarregado(true);
      return () => {
        ativo = false;
      };
    }
    void AsyncStorage.getItem(chaveAdiamento)
      .then((valor) => {
        if (!ativo) return;
        const ate = valor ? Number(valor) : 0;
        setAdiado(Number.isFinite(ate) && ate > Date.now());
      })
      .finally(() => {
        if (ativo) setAdiamentoCarregado(true);
      });
    return () => {
      ativo = false;
    };
  }, [chaveAdiamento]);

  async function save() {
    setError(null);
    if (!fullName.trim() || !cpf.trim() || !phone.trim() || !uf) {
      setError('Preencha nome, CPF, telefone e estado para continuar.');
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
      cnpj: cnpj.trim() || null,
      cpf: cpf.trim(),
      phone: phone.trim(),
      uf,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      registrar('onboarding_completed', { resultado: 'erro' });
      return;
    }
    /*
     * "Terminou o começo" é ISTO, e não ter visto o guia: é o momento em que o
     * corretor tem cadastro suficiente para EMITIR PROPOSTA. Antes daqui, o
     * produto está instalado; a partir daqui, está usável.
     */
    registrar('onboarding_completed', { resultado: 'ok' });
    if (chaveAdiamento) await AsyncStorage.removeItem(chaveAdiamento).catch(() => undefined);
  }

  /**
   * "Preencher depois" é uma resposta legítima, e saber quantos escolhem isso é
   * justamente o que diz se o pedido está pesado demais. Um handler só para o
   * botão e para o gesto de fechar: dois caminhos com a mesma consequência
   * precisam registrar a mesma coisa.
   */
  function adiar() {
    registrar('onboarding_completed', { etapa: 'adiado', resultado: 'cancelado' });
    setAdiado(true);
    if (chaveAdiamento) {
      const tresDias = Date.now() + 3 * 24 * 60 * 60 * 1000;
      void AsyncStorage.setItem(chaveAdiamento, String(tresDias));
    }
  }

  return (
    <Modal
      visible={adiamentoCarregado && needsOnboarding && !adiado}
      animationType="slide"
      transparent
      onRequestClose={adiar}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Complete seu cadastro</Text>
            <Text style={styles.subtitle}>
              Precisamos de alguns dados para personalizar suas simulações e propostas. Seu CPF
              identifica sua conta.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Input
              label="Nome completo"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Seu nome"
              autoCapitalize="words"
            />
            <Input
              label="Seu CPF"
              value={cpf}
              onChangeText={(t) => setCpf(formatCPF(t))}
              placeholder="000.000.000-00"
              keyboardType="numbers-and-punctuation"
            />
            <Input
              label="Imobiliária (opcional)"
              value={agency}
              onChangeText={setAgency}
              placeholder="Nome da imobiliária, se houver"
            />
            <Input
              label="CNPJ (opcional)"
              value={cnpj}
              onChangeText={(t) => setCnpj(formatCNPJ(t))}
              placeholder="00.000.000/0000-00"
              keyboardType="numbers-and-punctuation"
            />
            <Input
              label="Telefone"
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              placeholder="(00) 00000-0000"
              keyboardType="phone-pad"
            />
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
            <Button label="Preencher depois" variant="ghost" onPress={adiar} disabled={saving} />
            <Text style={styles.hint}>
              Você consegue usar o app sem isso. Só precisamos desses dados na hora de gerar uma
              proposta em PDF, dá para preencher em Ajustes → Editar perfil. Imobiliária e CNPJ são
              opcionais, inclusive para emitir propostas.
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
    hint: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
    },
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
