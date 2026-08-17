/**
 * Leitura automática de CNH/RG para preencher nome e CPF.
 *
 * ------------------------------------------------------------------
 * O AVISO ANTES DA PRIMEIRA LEITURA NÃO É ENFEITE
 * ------------------------------------------------------------------
 * A foto vai para um serviço de IA de terceiro (Anthropic) para ser lida. E o
 * documento não é do corretor: é do CLIENTE dele, que não instalou o app nem
 * leu a política de privacidade.
 *
 * A regra 5.1.2(i) da App Store exige divulgar o compartilhamento com IA de
 * terceiros **e obter permissão explícita antes**. Por isso a primeira leitura
 * passa por uma tela que explica para onde a foto vai, o que acontece com ela
 * depois, e pede que o corretor confirme que tem autorização do cliente.
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
import { grantScanConsent, hasScanConsent } from '@/features/scan/consent';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface ScanDocumentButtonProps {
  onScanned: (result: ScannedDocument) => void;
}

/** O que o corretor precisa saber antes de mandar o documento de outra pessoa. */
const AVISOS = [
  'A foto do documento é enviada para um serviço de inteligência artificial (Anthropic) que lê o nome e o CPF.',
  'A foto é usada só para essa leitura e não fica guardada nos nossos servidores.',
  'Só use com autorização do titular do documento.',
];

export function ScanDocumentButton({ onScanned }: ScanDocumentButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(false);
  const [pedindoConsentimento, setPedindoConsentimento] = useState(false);

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
    if (result.canceled || !result.assets?.[0]?.base64) return;

    setLoading(true);
    const scan = await scanDocument(
      result.assets[0].base64,
      result.assets[0].mimeType ?? 'image/jpeg',
    );
    setLoading(false);

    if (!scan.ok) return notify(scan.error);
    if (scan.data.confidence === 'baixa') {
      notify('Não consegui ler com certeza. Confira os dados preenchidos.');
    }
    onScanned(scan.data);
  }

  async function handlePress() {
    // Primeira vez: explica para onde a foto vai antes de abrir a câmera.
    if (await hasScanConsent()) {
      await escanear();
      return;
    }
    setPedindoConsentimento(true);
  }

  async function aceitar() {
    setPedindoConsentimento(false);
    await grantScanConsent();
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
                {AVISOS.map((aviso) => (
                  <View key={aviso} style={styles.item}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.itemText}>{aviso}</Text>
                  </View>
                ))}
              </View>

              <Button label="Concordo e quero continuar" onPress={() => void aceitar()} />
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
    cancelWrap: { marginTop: spacing.md },
  });
