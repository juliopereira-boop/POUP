/**
 * Preview do material de venda, com botão de baixar.
 *
 * O corretor precisa CONFERIR o arquivo antes de mandar para o cliente — abrir
 * numa aba nova a cada conferência tira ele do app e some com o contexto. Aqui
 * imagem, vídeo e PDF abrem por cima da lista, e o download continua a um
 * toque.
 *
 * ------------------------------------------------------------------
 * POR QUE `createElement` COM TAGS DE HTML
 * ------------------------------------------------------------------
 * Vídeo e PDF não têm componente no React Native sem dependência nova (e uma
 * tentativa anterior de instalar biblioteca já quebrou o Metro neste projeto).
 * Na web o app renderiza por react-dom, então `<video>` e `<iframe>` funcionam
 * de verdade. Fora da web esse caminho não existe: cai no botão "Abrir", que
 * usa o visualizador do próprio sistema.
 */
import { createElement, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from './Button';
import { canPreviewInApp, KIND_BADGE, type FileKind } from '@/features/material/fileKind';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

export interface FilePreviewTarget {
  name: string;
  kind: FileKind;
  /** URL assinada para visualizar. `null` enquanto carrega. */
  url: string | null;
  /** URL assinada que força o download com o nome original. */
  downloadUrl: string | null;
  sizeLabel: string;
}

interface FilePreviewModalProps {
  target: FilePreviewTarget | null;
  onClose: () => void;
}

const isWeb = Platform.OS === 'web';

export function FilePreviewModal({ target, onClose }: FilePreviewModalProps) {
  const styles = useThemedStyles(makeStyles);
  const [imageFailed, setImageFailed] = useState(false);

  // Arquivo novo, erro zerado: senão o "não deu para mostrar" do anterior
  // grudaria no próximo que abrisse.
  useEffect(() => {
    setImageFailed(false);
  }, [target?.url]);

  if (!target) return null;

  const { name, kind, url, downloadUrl, sizeLabel } = target;

  function baixar() {
    const href = downloadUrl ?? url;
    if (href) void Linking.openURL(href);
  }

  function abrirEmNovaAba() {
    if (url) void Linking.openURL(url);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.name} numberOfLines={2}>
                {name}
              </Text>
              <Text style={styles.meta}>
                {KIND_BADGE[kind].label}
                {sizeLabel ? ` · ${sizeLabel}` : ''}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.stage}>
            {!url ? (
              <ActivityIndicator />
            ) : kind === 'image' && !imageFailed ? (
              <Image
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setImageFailed(true)}
              />
            ) : kind === 'video' && isWeb ? (
              createElement('video', {
                src: url,
                controls: true,
                playsInline: true,
                style: { width: '100%', height: '100%', backgroundColor: '#000' },
              })
            ) : kind === 'pdf' && isWeb ? (
              createElement('iframe', {
                src: url,
                title: name,
                style: { width: '100%', height: '100%', border: 'none', background: '#fff' },
              })
            ) : (
              <View style={styles.semPreview}>
                <Text style={styles.semPreviewIcon}>{KIND_BADGE[kind].icon}</Text>
                <Text style={styles.semPreviewText}>
                  {canPreviewInApp(kind)
                    ? 'Não deu para mostrar aqui. Abra ou baixe o arquivo.'
                    : 'Este tipo de arquivo não abre dentro do app. Baixe para ver.'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label="Abrir"
              variant="secondary"
              onPress={abrirEmNovaAba}
              disabled={!url}
              style={styles.action}
            />
            <Button label="Baixar" onPress={baixar} disabled={!url} style={styles.action} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '92%',
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: radius.xl,
      padding: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    headerText: { flex: 1, gap: 2 },
    name: { ...typography.heading, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    close: { ...typography.heading, color: colors.inkMuted },

    stage: {
      flex: 1,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: { width: '100%', height: '100%' },

    semPreview: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
    semPreviewIcon: { fontSize: 44 },
    semPreviewText: {
      ...typography.body,
      color: colors.inkMuted,
      textAlign: 'center',
    },

    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    action: { flex: 1 },
  });
