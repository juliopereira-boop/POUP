/**
 * Excluir a conta, de dentro do app.
 *
 * ------------------------------------------------------------------
 * POR QUE PRECISA EXISTIR
 * ------------------------------------------------------------------
 * A App Store rejeita automaticamente app que deixa CRIAR conta lá dentro mas
 * não deixa EXCLUIR lá dentro — mandar o corretor escrever para o suporte não
 * conta. E, loja à parte, é o que a LGPD espera.
 *
 * ------------------------------------------------------------------
 * POR QUE DIGITAR A PALAVRA
 * ------------------------------------------------------------------
 * Isto é irreversível: leads, simulações, vendas e comissões vão embora e não
 * têm de onde voltar. Um botão "tem certeza?" é rápido demais para uma ação
 * assim — digitar EXCLUIR obriga o corretor a parar e ler. A mesma palavra é
 * conferida no servidor, então nem uma chamada solta apaga nada por acidente.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from './Button';
import { Input } from './Input';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

/** Precisa bater com a constante do Edge Function `delete-account`. */
const CONFIRMACAO = 'EXCLUIR';

const O_QUE_SOME = [
  'Seus leads, com todo o histórico de contato',
  'Suas simulações e propostas geradas',
  'Suas vendas e o controle de comissões',
  'Seus arquivos de material de venda',
  'Suas empresas, empreendimentos e agendamentos',
];

export function DeleteAccountButton() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { deleteAccount } = useAuth();

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const confirmado = texto.trim().toUpperCase() === CONFIRMACAO;

  function fechar() {
    if (excluindo) return;
    setAberto(false);
    setTexto('');
    setErro(null);
  }

  async function excluir() {
    if (!confirmado || excluindo) return;
    setExcluindo(true);
    setErro(null);
    const result = await deleteAccount(CONFIRMACAO);
    if (!result.ok) {
      setExcluindo(false);
      setErro(result.error);
      return;
    }
    // A sessão já morreu junto com a conta. A raiz decide para onde mandar.
    setAberto(false);
    router.replace('/');
  }

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Text style={styles.rowLabel}>Excluir minha conta</Text>
        <Text style={styles.rowSubtitle}>
          Apaga para sempre tudo que você guardou aqui. Não tem como desfazer.
        </Text>
      </Pressable>

      <Modal visible={aberto} transparent animationType="slide" onRequestClose={fechar}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>Excluir minha conta</Text>
              <Text style={styles.lead}>
                Isto apaga sua conta e tudo que ela guarda. Não é possível recuperar depois — nem
                por nós.
              </Text>

              <View style={styles.list}>
                {O_QUE_SOME.map((item) => (
                  <View key={item} style={styles.listItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.aviso}>
                Se você tem assinatura ativa, ela é cancelada agora e não haverá nova cobrança.
              </Text>

              <Input
                label={`Para confirmar, digite ${CONFIRMACAO}`}
                value={texto}
                onChangeText={setTexto}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={CONFIRMACAO}
                editable={!excluindo}
              />

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              <Button
                label="Excluir minha conta para sempre"
                variant="danger"
                onPress={() => void excluir()}
                disabled={!confirmado}
                loading={excluindo}
              />
              <View style={styles.cancelWrap}>
                <Button
                  label="Cancelar"
                  variant="secondary"
                  onPress={fechar}
                  disabled={excluindo}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { paddingVertical: spacing.md, gap: 2 },
    rowPressed: { opacity: 0.6 },
    rowLabel: { ...typography.label, color: colors.danger },
    rowSubtitle: { ...typography.caption, color: colors.inkMuted },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
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
    title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    lead: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
    list: { gap: spacing.sm, marginBottom: spacing.lg },
    listItem: { flexDirection: 'row', gap: spacing.sm },
    bullet: { ...typography.body, color: colors.danger },
    listText: { ...typography.body, color: colors.ink, flex: 1 },
    aviso: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg },
    erro: { ...typography.caption, color: colors.danger, marginBottom: spacing.md },
    cancelWrap: { marginTop: spacing.md },
  });
