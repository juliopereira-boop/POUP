/**
 * Leitura automática de CNH/RG para preencher nome e CPF.
 *
 * ===========================================================================
 * DUAS PERGUNTAS DIFERENTES, EM MOMENTOS DIFERENTES
 * ===========================================================================
 * A foto vai para um serviço de IA de terceiro (Anthropic). E o documento não
 * é do corretor: é do CLIENTE dele — uma pessoa diferente a cada leitura, que
 * não instalou o app nem leu política nenhuma.
 *
 * A regra 5.1.2(i) da App Store exige divulgar o compartilhamento com IA de
 * terceiros e obter permissão explícita antes. Antes, isso era um "Concordo"
 * único, dado uma vez na vida — e uma auditoria externa apontou o problema:
 * o aceite era do corretor, e o dado é do cliente.
 *
 * Agora são dois momentos:
 *
 *   1. **O aviso**, uma vez (ou quando o texto muda de versão): explica para
 *      onde a foto vai, que a Anthropic pode retê-la por até 30 dias, e que dá
 *      para desligar em Ajustes.
 *
 *   2. **A autorização do titular**, a CADA documento: uma confirmação curta,
 *      de uma linha, sem parede de texto. É curta de propósito — ela é lida
 *      toda vez, e um texto longo repetido vira um botão que ninguém lê.
 *
 * O que se aprende uma vez pergunta-se uma vez; o que muda a cada pessoa
 * pergunta-se a cada pessoa.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button } from './Button';
import { scanDocument, type ScannedDocument } from '@/lib/documentScan';
import { reduzirParaEnvio } from '@/lib/imagemReduzida';
import {
  AVISOS_SCAN,
  CONFIRMACAO_TITULAR,
  darConsentimentoScan,
  temConsentimentoScan,
} from '@/features/scan/consent';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface ScanDocumentButtonProps {
  onScanned: (result: ScannedDocument) => void;
}

export function ScanDocumentButton({ onScanned }: ScanDocumentButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(false);
  const [pedindoConsentimento, setPedindoConsentimento] = useState(false);
  const [pedindoAutorizacao, setPedindoAutorizacao] = useState(false);

  function notify(message: string) {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('POUP', message);
  }

  /** A câmera/galeria e o envio propriamente ditos. Só roda após o consentimento. */
  async function escanear() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const options: ImagePicker.ImagePickerOptions = {
      base64: true,
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    };
    const result = cam.granted
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.base64) return;

    setLoading(true);
    /*
     * A redução entra ANTES do envio e depois do `setLoading`: numa foto de
     * celular ela leva um instante perceptível, e o corretor precisa ver que
     * algo está acontecendo. O ganho é no upload — ver `imagemReduzida.ts`.
     */
    const imagem = await reduzirParaEnvio(asset.uri, {
      base64: asset.base64,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
    const scan = await scanDocument(imagem.base64, imagem.mimeType);
    setLoading(false);

    if (!scan.ok) return notify(scan.error);
    if (scan.data.confidence === 'baixa') {
      notify('Não consegui ler com certeza. Confira os dados preenchidos.');
    }
    onScanned(scan.data);
  }

  /**
   * O caminho tem DOIS portões, e eles perguntam coisas diferentes.
   *
   * O primeiro é o aviso — uma vez, ou de novo quando o texto muda de versão.
   * O segundo é a autorização do titular, e esse é a cada documento, porque o
   * titular é outro a cada documento.
   */
  async function handlePress() {
    if (!(await temConsentimentoScan())) {
      setPedindoConsentimento(true);
      return;
    }
    setPedindoAutorizacao(true);
  }

  /** Aceitou o aviso: registra e emenda direto na autorização deste documento. */
  async function aceitarAviso() {
    setPedindoConsentimento(false);
    await darConsentimentoScan();
    setPedindoAutorizacao(true);
  }

  /** Confirmou ter autorização do titular: agora sim, abre a câmera. */
  async function confirmarAutorizacao() {
    setPedindoAutorizacao(false);
    await escanear();
  }

  return (
    <>
      <Pressable
        onPress={() => void handlePress()}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Preencher pela foto do documento (CNH ou RG)"
        accessibilityHint="A foto é enviada para leitura automática por inteligência artificial"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.icon}>🪪</Text>
        )}
      </Pressable>

      <Modal
        visible={pedindoConsentimento}
        transparent
        animationType="slide"
        onRequestClose={() => setPedindoConsentimento(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Preencher pela foto do documento</Text>
              <Text style={styles.lead}>
                Antes de continuar, é importante você saber o que acontece com a foto:
              </Text>

              <View style={styles.list}>
                {AVISOS_SCAN.map((aviso) => (
                  <View key={aviso} style={styles.item}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.itemText}>{aviso}</Text>
                  </View>
                ))}
              </View>

              <Button label="Entendi e quero continuar" onPress={() => void aceitarAviso()} />
              <View style={styles.cancelWrap}>
                <Button
                  label="Agora não"
                  variant="secondary"
                  onPress={() => setPedindoConsentimento(false)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/*
        A CONFIRMAÇÃO QUE SE REPETE.

        Curta de propósito: uma frase e dois botões. Ela aparece a cada
        documento, e um texto longo repetido vira um botão que ninguém lê — que
        é exatamente o consentimento de fachada que a regra 5.1.2(i) quer
        evitar.

        O botão diz "Tenho autorização", e não "OK": o corretor precisa
        declarar o que está declarando.
      */}
      <Modal
        visible={pedindoAutorizacao}
        transparent
        animationType="fade"
        onRequestClose={() => setPedindoAutorizacao(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Autorização do titular</Text>
            <Text style={styles.confirmacao}>{CONFIRMACAO_TITULAR}</Text>
            <Button
              label="Tenho autorização — continuar"
              onPress={() => void confirmarAutorizacao()}
            />
            <View style={styles.cancelWrap}>
              <Button
                label="Cancelar"
                variant="secondary"
                onPress={() => setPedindoAutorizacao(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    button: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    icon: { fontSize: 20 },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '85%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    title: { ...typography.heading, color: colors.ink, marginBottom: spacing.sm },
    lead: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
    list: { gap: spacing.md, marginBottom: spacing.xl },
    item: { flexDirection: 'row', gap: spacing.sm },
    bullet: { ...typography.body, color: colors.primary },
    itemText: { ...typography.body, color: colors.ink, flex: 1 },
    confirmacao: {
      ...typography.body,
      color: colors.ink,
      marginBottom: spacing.xl,
      lineHeight: 24,
    },
    cancelWrap: { marginTop: spacing.md },
  });
