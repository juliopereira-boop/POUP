import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { scanDocument, type ScannedDocument } from '@/lib/documentScan';
import { radius, spacing, typography, type AppColors } from '@/theme';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';

interface ScanDocumentButtonProps {
  onScanned: (result: ScannedDocument) => void;
}

/**
 * Botão "Escanear documento" — tira foto da CNH/RG do cliente (ou escolhe da
 * galeria) e usa o Claude para ler nome e CPF automaticamente. O resultado
 * deve sempre ser conferido pelo corretor: os campos continuam editáveis.
 */
export function ScanDocumentButton({ onScanned }: ScanDocumentButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [loading, setLoading] = useState(false);

  function notify(message: string) {
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('POUP', message);
  }

  async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const options: ImagePicker.ImagePickerOptions = {
      base64: true,
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    };

    const result = cam.granted
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]) return null;
    return result.assets[0];
  }

  async function handlePress() {
    const asset = await pickImage();
    if (!asset?.base64) return;

    setLoading(true);
    const result = await scanDocument(asset.base64, asset.mimeType ?? 'image/jpeg');
    setLoading(false);

    if (!result.ok) {
      notify(result.error);
      return;
    }
    if (result.data.confidence === 'baixa') {
      notify('Não consegui ler o documento com certeza. Confira os dados preenchidos.');
    }
    onScanned(result.data);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, loading && styles.disabled]}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.label}>Escanear documento</Text>
        </>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
    },
    icon: { fontSize: 16 },
    label: { ...typography.label, color: colors.primary },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.6 },
  });
