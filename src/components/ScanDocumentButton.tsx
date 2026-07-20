import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { scanDocument, type ScannedDocument } from '@/lib/documentScan';
import { radius, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface ScanDocumentButtonProps {
  onScanned: (result: ScannedDocument) => void;
}

/**
 * Botão discreto (ícone de scanner) — tira foto da CNH/RG do cliente e usa o
 * Claude para ler nome e CPF. O resultado sempre cai em campos editáveis.
 */
export function ScanDocumentButton({ onScanned }: ScanDocumentButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(false);

  function notify(message: string) {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('POUP', message);
  }

  async function handlePress() {
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
    const scan = await scanDocument(result.assets[0].base64, result.assets[0].mimeType ?? 'image/jpeg');
    setLoading(false);

    if (!scan.ok) return notify(scan.error);
    if (scan.data.confidence === 'baixa') {
      notify('Não consegui ler com certeza. Confira os dados preenchidos.');
    }
    onScanned(scan.data);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityLabel="Escanear documento (CNH/RG)"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={styles.icon}>🪪</Text>
      )}
    </Pressable>
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
  });
