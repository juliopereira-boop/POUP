/**
 * Preview do material de venda, com botão de baixar.
 *
 * O corretor precisa CONFERIR o arquivo antes de mandar para o cliente — abrir
 * numa aba nova a cada conferência tira ele do app e some com o contexto. Aqui
 * imagem, vídeo e PDF abrem por cima da lista, e o download continua a um
 * toque.
 *
 * ------------------------------------------------------------------
 * COMO CADA TIPO APARECE, EM CADA AMBIENTE
 * ------------------------------------------------------------------
 * |        | Navegador                    | App das lojas                    |
 * |--------|------------------------------|----------------------------------|
 * | Imagem | `<Image>` na hora            | `<Image>` na hora                |
 * | PDF    | `<iframe>` embutido          | navegador interno (`WebBrowser`) |
 * | Vídeo  | `<video>` embutido           | navegador interno (`WebBrowser`) |
 *
 * `<iframe>` e `<video>` são tags de HTML: existem no navegador (o app roda
 * por react-dom lá) e **não existem** no celular. Em vez de trazer uma
 * biblioteca de vídeo e outra de PDF só para isso, o app nativo usa o
 * navegador interno do sistema — que já sabe exibir os dois, abre por cima do
 * app (sem jogar o corretor para fora) e não custa dependência nenhuma.
 */
import { createElement, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
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
import { prefetchFile, saveFile } from '@/features/files/save';
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
  /** Conteúdo já baixado, pronto para o compartilhar do sistema. Só web. */
  const [file, setFile] = useState<File | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Arquivo novo, erro zerado: senão o "não deu para mostrar" do anterior
  // grudaria no próximo que abrisse.
  useEffect(() => {
    setImageFailed(false);
    setSaveMsg(null);
    setSalvando(false);
  }, [target?.url]);

  /**
   * Baixa o conteúdo assim que o preview abre. **Só no navegador.**
   *
   * Tem que ser AGORA, e não no clique do "Salvar": o compartilhar da web
   * exige um toque recente, e um `await` no meio do caminho faz o iPhone
   * recusar em silêncio. No app nativo essa regra não existe, então lá não se
   * baixa nada à toa — o arquivo só é buscado se o corretor pedir.
   */
  useEffect(() => {
    if (!isWeb) return undefined;
    let alive = true;
    setFile(null);
    const url = target?.url;
    const name = target?.name;
    if (!url || !name) return undefined;
    void prefetchFile(url, name).then((f) => {
      if (alive) setFile(f);
    });
    return () => {
      alive = false;
    };
  }, [target?.url, target?.name]);

  if (!target) return null;

  const { name, kind, url, downloadUrl, sizeLabel } = target;

  /** No celular, PDF e vídeo abrem no navegador interno do sistema. */
  const abreForaNoNativo = !isWeb && (kind === 'pdf' || kind === 'video');

  async function salvar() {
    if (salvando) return;
    setSaveMsg(null);
    const alvo = downloadUrl ?? url;

    const resultado = saveFile(file, alvo, name);
    // Na web a resposta é imediata (tem que ser, por causa do toque recente);
    // no celular é uma promessa, e aí vale mostrar que está trabalhando.
    if (resultado instanceof Promise) {
      setSalvando(true);
      const out = await resultado;
      setSalvando(false);
      setSaveMsg(out.ok ? 'Escolha onde salvar na janela do aparelho.' : out.error);
      return;
    }

    if (!resultado.ok) {
      setSaveMsg(resultado.error);
      return;
    }
    // No compartilhar quem conclui é a folha do sistema; no download o
    // navegador não avisa nada. Uma linha curta confirma que algo aconteceu.
    setSaveMsg(
      resultado.via === 'share'
        ? 'Escolha onde salvar na janela do aparelho.'
        : 'Arquivo salvo nos downloads.',
    );
  }

  async function abrir() {
    if (!url) return;
    // O navegador interno abre POR CIMA do app e volta com um toque. Mandar
    // para o navegador do sistema (`Linking`) tiraria o corretor daqui.
    if (!isWeb) {
      try {
        await WebBrowser.openBrowserAsync(url);
        return;
      } catch {
        // Sem navegador interno, o do sistema ainda resolve.
      }
    }
    void Linking.openURL(url);
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
              <Pressable
                style={styles.semPreview}
                onPress={abreForaNoNativo ? () => void abrir() : undefined}
                disabled={!abreForaNoNativo}
              >
                <Text style={styles.semPreviewIcon}>{KIND_BADGE[kind].icon}</Text>
                <Text style={styles.semPreviewText}>
                  {abreForaNoNativo
                    ? kind === 'pdf'
                      ? 'Toque em Abrir para ver o PDF.'
                      : 'Toque em Abrir para assistir ao vídeo.'
                    : canPreviewInApp(kind)
                      ? 'Não deu para mostrar aqui. Abra ou baixe o arquivo.'
                      : 'Este tipo de arquivo não abre dentro do app. Baixe para ver.'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label="Abrir"
              variant="secondary"
              onPress={() => void abrir()}
              disabled={!url}
              style={styles.action}
            />
            <Button
              label="Salvar"
              onPress={() => void salvar()}
              disabled={!url}
              loading={salvando}
              style={styles.action}
            />
          </View>
          {saveMsg ? <Text style={styles.saveMsg}>{saveMsg}</Text> : null}
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

    saveMsg: {
      ...typography.caption,
      color: colors.inkMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    action: { flex: 1 },
  });
