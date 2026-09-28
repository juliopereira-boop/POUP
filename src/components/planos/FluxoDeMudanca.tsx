/**
 * DESCER PARA O START OU CANCELAR — em dois passos, sem pegadinha.
 *
 *   1. O que muda: o que sai (a mesma lista do paywall) e o que fica salvo.
 *   2. Por quê: o motivo é obrigatório (vai para `mudancas_de_plano`); "Outro"
 *      pede uma frase. Depois, a confirmação — com "Continuar no Pro" sempre à
 *      mão, do mesmo tamanho.
 *
 * Quem executa a troca é a tela (`onConfirmar`): o portal de pagamento na web,
 * a página da loja no celular.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { erroDoMotivo, MOTIVOS, oQueMuda, type DestinoDaMudanca, type Motivo } from '@/features/planos/acoes';
import type { PlanTier } from '@/data/types';
import { usesNativeBilling } from '@/features/store';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  aberto: boolean;
  de: PlanTier;
  destino: DestinoDaMudanca;
  onFechar: () => void;
  /** Grava o motivo e leva à troca. Devolve a mensagem de erro, se houver. */
  onConfirmar: (motivo: Motivo, comentario: string) => Promise<string | null>;
}

export function FluxoDeMudanca({ aberto, de, destino, onFechar, onConfirmar }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setPasso(1);
      setMotivo(null);
      setComentario('');
      setErro(null);
    }
  }, [aberto]);

  const muda = oQueMuda(de, destino);
  const cancelar = destino === 'cancelar';
  const ficar = cancelar ? 'Manter minha assinatura' : `Continuar no ${de === 'pro' ? 'Pro' : 'plano atual'}`;
  const confirmar = cancelar ? 'Cancelar assinatura' : 'Mudar para o Start';
  const comoFunciona = usesNativeBilling
    ? cancelar
      ? 'A loja do seu celular abre a página da assinatura: o cancelamento é confirmado lá, e o acesso vai até o fim do período pago.'
      : 'A loja do seu celular abre a página da assinatura: escolha o Start lá. A troca vale na próxima renovação.'
    : cancelar
      ? 'O portal de pagamento abre na confirmação do cancelamento. O acesso vai até o fim do período pago.'
      : 'O portal de pagamento abre na confirmação da troca, mostrando o valor novo antes de você confirmar.';

  async function seguir() {
    const problema = erroDoMotivo(motivo, comentario);
    if (problema || !motivo) return setErro(problema);
    setErro(null);
    setEnviando(true);
    const falha = await onConfirmar(motivo, comentario);
    setEnviando(false);
    if (falha) setErro(falha);
  }

  return (
    <Modal visible={aberto} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
            <Text style={styles.etapa}>{passo} de 2</Text>
            {passo === 1 ? (
              <>
                <Text style={styles.titulo}>{cancelar ? 'Cancelar a assinatura?' : 'Mudar do Pro para o Start?'}</Text>
                <Text style={styles.secao}>{cancelar ? 'O que acontece' : 'O que sai do seu plano'}</Text>
                {muda.perde.map((t) => (
                  <View key={t} style={styles.linha}>
                    <Text style={styles.marcaSai}>✕</Text>
                    <Text style={styles.texto}>{t}</Text>
                  </View>
                ))}
                <Text style={styles.secao}>O que continua</Text>
                {muda.fica.map((t) => (
                  <View key={t} style={styles.linha}>
                    <Text style={styles.marcaFica}>✓</Text>
                    <Text style={styles.texto}>{t}</Text>
                  </View>
                ))}
                <View style={styles.botoes}>
                  <Button label={ficar} onPress={onFechar} />
                  <Button label="Continuar" variant="secondary" onPress={() => setPasso(2)} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.titulo}>Por que você quer {cancelar ? 'cancelar' : 'mudar'}?</Text>
                <Text style={styles.ajuda}>A sua resposta ajuda o POUP a melhorar. Só a equipe do POUP vê.</Text>
                {MOTIVOS.map((m) => {
                  const marcado = motivo === m.chave;
                  return (
                    <Pressable
                      key={m.chave}
                      onPress={() => setMotivo(m.chave)}
                      style={[styles.opcao, marcado && styles.opcaoMarcada]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: marcado }}
                    >
                      <View style={[styles.radio, marcado && styles.radioMarcado]}>{marcado ? <View style={styles.radioPonto} /> : null}</View>
                      <Text style={styles.opcaoTexto}>{m.rotulo}</Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder={motivo === 'outro' ? 'Conte o motivo (obrigatório)' : 'Quer contar mais? (opcional)'}
                  placeholderTextColor={colors.inkSubtle}
                  multiline
                  maxLength={500}
                  style={styles.comentario}
                />
                <Text style={styles.ajuda}>{comoFunciona}</Text>
                {erro ? <Text style={styles.erro}>{erro}</Text> : null}
                <View style={styles.botoes}>
                  <Button label={ficar} onPress={onFechar} disabled={enviando} />
                  <Button label={confirmar} variant={cancelar ? 'danger' : 'secondary'} onPress={() => void seguir()} loading={enviando} />
                  <Button label="Voltar" variant="ghost" onPress={() => setPasso(1)} disabled={enviando} />
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
    fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    folha: {
      maxHeight: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    conteudo: { padding: spacing.xl, paddingBottom: spacing.xl * 1.5, gap: spacing.sm },
    etapa: { ...typography.caption, color: colors.inkMuted, fontWeight: '700' },
    titulo: { ...typography.title, color: colors.ink, marginBottom: spacing.sm },
    secao: { ...typography.label, color: colors.ink, marginTop: spacing.md },
    linha: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    marcaSai: { color: colors.danger, fontWeight: '800', width: 16 },
    marcaFica: { color: colors.success, fontWeight: '800', width: 16 },
    texto: { ...typography.body, color: colors.ink, flex: 1 },
    ajuda: { ...typography.caption, color: colors.inkMuted, marginVertical: spacing.xs },
    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    opcaoMarcada: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
    radioMarcado: { borderColor: colors.primary },
    radioPonto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    opcaoTexto: { ...typography.body, color: colors.ink, flex: 1 },
    comentario: {
      ...typography.body,
      color: colors.ink,
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      textAlignVertical: 'top',
      marginTop: spacing.sm,
    },
    erro: { ...typography.caption, color: colors.danger },
    botoes: { gap: spacing.sm, marginTop: spacing.lg },
  });
