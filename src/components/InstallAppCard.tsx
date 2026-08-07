/**
 * Convite para deixar o POUP na tela de início do celular.
 *
 * Aparece no topo da tela inicial de quem ainda usa pelo navegador. Some
 * sozinho quando o app já está instalado e quando o corretor dispensa.
 *
 * O texto muda conforme o aparelho porque o CAMINHO muda: no Android existe um
 * botão de verdade, no iPhone só dá para ensinar o passo a passo (a Apple não
 * deixa nenhum site instalar sozinho). Mostrar "toque em Instalar" para quem
 * está no iPhone seria mandar o corretor procurar um botão que não existe.
 *
 * Daqui saem três coisas, todas em volta do mesmo passo a passo:
 * - `useInstallPrompt`: o estado (dá para instalar? qual aparelho?);
 * - `InstallHowToModal`: a folha com as instruções, usada também em Ajustes;
 * - `InstallAppCard`: o convite da tela inicial.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Logo } from './Logo';
import {
  canPromptInstall,
  detectPlatform,
  dismiss,
  isDismissed,
  isInstalled,
  promptInstall,
  watchInstallPrompt,
  type InstallPlatform,
} from '@/features/install/pwa';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const isWeb = Platform.OS === 'web';

/** O passo a passo do iPhone, que é o caso sem botão. */
const PASSOS_IOS = [
  'Toque no botão Compartilhar — o quadradinho com a seta para cima, embaixo da tela.',
  'Deslize a lista para baixo e toque em "Adicionar à Tela de Início".',
  'Toque em "Adicionar", no canto superior direito.',
];

const PASSOS_ANDROID = [
  'Toque nos três pontinhos, no canto superior direito do navegador.',
  'Toque em "Instalar aplicativo" ou "Adicionar à tela inicial".',
  'Confirme tocando em "Instalar".',
];

const PASSOS_DESKTOP = [
  'Na barra de endereço, procure o ícone de instalar — um monitor com uma seta.',
  'Clique nele e depois em "Instalar".',
  'Se não aparecer, abra o menu do navegador e procure "Instalar POUP".',
];

/**
 * O que dá para fazer neste aparelho.
 *
 * `instalavel` só fica verdadeiro depois que o navegador avisa; por isso é
 * estado, e não uma leitura única no primeiro render.
 */
export function useInstallPrompt(): {
  plataforma: InstallPlatform;
  instalavel: boolean;
  jaInstalado: boolean;
} {
  const [plataforma, setPlataforma] = useState<InstallPlatform>('unsupported');
  const [instalavel, setInstalavel] = useState(false);
  const [jaInstalado, setJaInstalado] = useState(false);

  useEffect(() => {
    // Fora da web isto não faz sentido: o app já É um app.
    if (!isWeb) return undefined;
    if (isInstalled()) {
      setJaInstalado(true);
      return undefined;
    }
    setPlataforma(detectPlatform());
    setInstalavel(canPromptInstall());
    return watchInstallPrompt(setInstalavel);
  }, []);

  return { plataforma, instalavel, jaInstalado };
}

interface InstallHowToModalProps {
  visible: boolean;
  plataforma: InstallPlatform;
  onClose: () => void;
}

/** A folha com o passo a passo. Compartilhada entre a tela inicial e Ajustes. */
export function InstallHowToModal({ visible, plataforma, onClose }: InstallHowToModalProps) {
  const styles = useThemedStyles(makeStyles);
  const passos =
    plataforma === 'ios' ? PASSOS_IOS : plataforma === 'desktop' ? PASSOS_DESKTOP : PASSOS_ANDROID;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {plataforma === 'ios'
                ? 'No iPhone, é assim'
                : plataforma === 'desktop'
                  ? 'No computador, é assim'
                  : 'No seu celular, é assim'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {passos.map((passo, i) => (
              <View key={passo} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{passo}</Text>
              </View>
            ))}
            <Text style={styles.sheetHint}>
              Depois disso, o POUP aparece com o ícone laranja junto dos seus outros apps. É só
              tocar — nunca mais precisa abrir o navegador.
            </Text>
            <Button label="Entendi" onPress={onClose} style={styles.cta} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function InstallAppCard() {
  const styles = useThemedStyles(makeStyles);
  const { plataforma, instalavel, jaInstalado } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  useEffect(() => {
    if (!isWeb || jaInstalado) return;
    void isDismissed().then((d) => {
      if (!d) setVisible(true);
    });
  }, [jaInstalado]);

  const onDismiss = useCallback(() => {
    setVisible(false);
    void dismiss();
  }, []);

  const onInstalar = useCallback(async () => {
    // Android: caixa oficial do navegador, um toque e pronto.
    if (canPromptInstall()) {
      const aceitou = await promptInstall();
      if (aceitou) setVisible(false);
      return;
    }
    // iPhone (e Android sem o convite): só resta ensinar o caminho.
    setHowToOpen(true);
  }, []);

  if (!visible) return null;

  const rotuloBotao = instalavel ? 'Instalar agora' : 'Ver como fazer';

  return (
    <>
      <View style={styles.card}>
        <View style={styles.top}>
          <Logo size={34} />
          <View style={styles.texts}>
            <Text style={styles.title}>Deixe o POUP na tela do celular</Text>
            <Text style={styles.subtitle}>
              Vira um ícone como qualquer outro app: abre direto, sem procurar o site.
            </Text>
          </View>
          {/* Sem ✕ aqui: quem dispensa usa o "Agora não" logo abaixo, escrito
              com todas as letras. Dois jeitos de fechar só confundiriam. */}
        </View>
        <View style={styles.actions}>
          <Button label={rotuloBotao} onPress={() => void onInstalar()} style={styles.cta} />
          <Pressable onPress={onDismiss} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.later}>Agora não</Text>
          </Pressable>
        </View>
      </View>

      <InstallHowToModal
        visible={howToOpen}
        plataforma={plataforma}
        onClose={() => {
          setHowToOpen(false);
          // Quem já leu o passo a passo não precisa do convite de novo: o
          // atalho em Ajustes continua ali para reabrir quando quiser.
          onDismiss();
        }}
      />
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    texts: { flex: 1, gap: 2 },
    title: { ...typography.label, color: colors.ink, fontSize: 16 },
    subtitle: { ...typography.caption, color: colors.inkMuted },
    close: { ...typography.heading, color: colors.inkMuted },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    cta: { flex: 1 },
    later: { ...typography.label, color: colors.inkMuted },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
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
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetTitle: { ...typography.heading, color: colors.ink, flex: 1 },
    step: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    stepNum: {
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 0,
      flexBasis: 30,
    },
    stepNumText: { ...typography.label, color: colors.white },
    stepText: { ...typography.body, color: colors.ink, flex: 1 },
    sheetHint: {
      ...typography.caption,
      color: colors.inkMuted,
      marginBottom: spacing.lg,
    },
  });
