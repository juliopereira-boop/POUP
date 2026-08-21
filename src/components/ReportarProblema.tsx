/**
 * "REPORTAR PROBLEMA OU DAR SUGESTÃO".
 *
 * ===========================================================================
 * POR QUE ISTO VALE UMA TELA INTEIRA NO PILOTO
 * ===========================================================================
 * A telemetria mostra ONDE as pessoas param; ela nunca diz POR QUÊ. No piloto,
 * com poucos corretores, a frase de um deles vale mais que o gráfico — e a
 * alternativa (esperar que ele mande no WhatsApp) perde o essencial: em qual
 * tela e em qual etapa aconteceu.
 *
 * ===========================================================================
 * A TELA VEM DE GRAÇA, E É O CAMPO MAIS ÚTIL
 * ===========================================================================
 * A rota é capturada sozinha (`telaDoProblema()`), descartando o caminho que o
 * corretor percorreu até chegar aqui. Ele não precisa saber o nome da rota, e
 * "na tela de fazer conta" não localizaria nada num relatório.
 *
 * ===========================================================================
 * O PEDIDO PARA NÃO ESCREVER DADO DE CLIENTE
 * ===========================================================================
 * Este é o único campo de texto livre que sai do aparelho para o nosso banco.
 * O aviso existe porque o reflexo natural é escrever "a simulação da Maria deu
 * errado" — e nome de cliente num sistema de suporte é dado pessoal de terceiro
 * que ninguém pediu. O texto sugere descrever pelo que aconteceu, não por quem.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from './Button';
import { db } from '@/data';
import { telaDoProblema } from '@/features/analytics/tela';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const MAX = 2000;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Etapa dentro da tela, quando quem abre sabe dizer. */
  etapa?: string | null;
}

export function ReportarProblema({ visible, onClose, etapa }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  /*
   * A tela é lida na ABERTURA do modal, não no envio: abrir o modal não navega,
   * mas ler no envio deixaria a informação à mercê de qualquer navegação que
   * acontecesse enquanto ele digita.
   */
  const [tela] = useState(() => telaDoProblema());

  async function enviar() {
    setErro(null);
    setEnviando(true);
    const res = await db.feedback.enviar({ tela, etapa: etapa ?? null, mensagem });
    setEnviando(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    setEnviado(true);
    setMensagem('');
  }

  function fechar() {
    setErro(null);
    setEnviado(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fechar}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {enviado ? (
              <>
                <Text style={styles.title}>Recebido, obrigado.</Text>
                <Text style={styles.lead}>
                  Sua mensagem chegou junto com a tela onde aconteceu. É assim que o POUP melhora.
                </Text>
                <Button label="Fechar" onPress={fechar} />
              </>
            ) : (
              <>
                <Text style={styles.title}>Reportar problema ou dar sugestão</Text>
                <Text style={styles.lead}>
                  Conte o que aconteceu, ou o que faltou. Quanto mais direto, melhor.
                </Text>

                {tela ? (
                  <View style={styles.contexto}>
                    <Text style={styles.contextoLabel}>Tela</Text>
                    <Text style={styles.contextoValor}>{tela}</Text>
                    {etapa ? (
                      <>
                        <Text style={styles.contextoLabel}>Etapa</Text>
                        <Text style={styles.contextoValor}>{etapa}</Text>
                      </>
                    ) : null}
                    <Text style={styles.contextoNota}>
                      Vai junto automaticamente. Você não precisa descrever onde estava.
                    </Text>
                  </View>
                ) : null}

                <TextInput
                  style={styles.input}
                  value={mensagem}
                  onChangeText={setMensagem}
                  placeholder="Ex.: o botão de gerar proposta não fez nada depois que preenchi a renda."
                  placeholderTextColor={colors.inkSubtle}
                  multiline
                  numberOfLines={6}
                  maxLength={MAX}
                  textAlignVertical="top"
                  accessibilityLabel="Descreva o problema ou a sugestão"
                />
                <Text style={styles.contador}>
                  {mensagem.length}/{MAX}
                </Text>

                <Text style={styles.aviso}>
                  Não escreva nome, CPF ou telefone de cliente. Descreva pelo que aconteceu, não por
                  quem — a gente acha o resto pela tela.
                </Text>

                {erro ? <Text style={styles.erro}>{erro}</Text> : null}

                <Button
                  label="Enviar"
                  onPress={() => void enviar()}
                  loading={enviando}
                  disabled={mensagem.trim().length < 3}
                />
                <View style={styles.cancelWrap}>
                  <Pressable onPress={fechar} accessibilityRole="button">
                    <Text style={styles.cancelText}>Agora não</Text>
                  </Pressable>
                </View>
              </>
            )}
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
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    lead: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },

    contexto: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: 2,
    },
    contextoLabel: {
      ...typography.label,
      color: colors.inkSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    contextoValor: { ...typography.body, color: colors.ink },
    contextoNota: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.sm },

    input: {
      ...typography.body,
      color: colors.ink,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 130,
    },
    contador: {
      ...typography.caption,
      color: colors.inkSubtle,
      textAlign: 'right',
      marginTop: spacing.xs,
    },
    aviso: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    erro: { ...typography.body, color: colors.danger, marginBottom: spacing.md },
    cancelWrap: { alignItems: 'center', marginTop: spacing.lg },
    cancelText: { ...typography.body, color: colors.inkMuted },
  });
