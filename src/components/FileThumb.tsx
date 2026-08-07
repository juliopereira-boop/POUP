/**
 * Miniatura redonda de um arquivo do material de venda.
 *
 * Mesma linguagem da foto de perfil (`EntityAvatar`): um círculo do tamanho da
 * linha. Imagem mostra a PRÓPRIA foto — é o que faz o corretor reconhecer a
 * planta certa sem abrir arquivo por arquivo. Os outros tipos mostram o ícone
 * do formato sobre um fundo colorido, que já diz de longe o que é.
 */
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { KIND_BADGE, usesImageThumb, type FileKind } from '@/features/material/fileKind';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, type AppColors } from '@/theme';

interface FileThumbProps {
  kind: FileKind;
  /** URL assinada da imagem. Só usada quando `kind` é `image`. */
  previewUrl?: string | null;
  size?: number;
}

export function FileThumb({ kind, previewUrl, size = 44 }: FileThumbProps) {
  const styles = useThemedStyles(makeStyles);
  // Uma URL assinada expira. Se falhar, cai no ícone do tipo em vez de deixar
  // um quadrado quebrado na lista.
  const [failed, setFailed] = useState(false);

  const box = { width: size, height: size, borderRadius: radius.pill };
  const showImage = usesImageThumb(kind) && previewUrl && !failed;

  if (showImage) {
    return (
      <Image
        source={{ uri: previewUrl }}
        style={[styles.photo, box]}
        onError={() => setFailed(true)}
        resizeMode="cover"
        accessibilityLabel={KIND_BADGE[kind].label}
      />
    );
  }

  return (
    <View
      style={[styles.badge, styles[kind], box]}
      accessibilityLabel={KIND_BADGE[kind].label}
    >
      <Text style={{ fontSize: Math.round(size * 0.42) }} allowFontScaling={false}>
        {KIND_BADGE[kind].icon}
      </Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    photo: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badge: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    // Cada tipo com sua cor: a lista fica legível de relance, sem ler o nome.
    folder: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    image: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
    video: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    pdf: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    doc: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
    sheet: { backgroundColor: colors.successSoft, borderColor: colors.success },
    other: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  });
