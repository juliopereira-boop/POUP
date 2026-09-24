import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { LiaOrbe } from './LiaOrbe';
import { useLia } from '@/features/lia/LiaProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

export type HabilidadeLia = 'simulacao' | 'material' | 'agenda';

interface Funcionalidade {
  chave: HabilidadeLia;
  titulo: string;
  descricao: string;
  emoji: string;
}

const FUNCIONALIDADES: Funcionalidade[] = [
  {
    chave: 'simulacao',
    titulo: 'Simulação de poupança',
    descricao: 'Digite os dados da negociação e a LIA preenche a simulação.',
    emoji: '💬',
  },
  {
    chave: 'material',
    titulo: 'Material de venda',
    descricao: 'Digite o empreendimento e a pasta. A LIA encontra a mídia.',
    emoji: '🖼️',
  },
  {
    chave: 'agenda',

    titulo: 'Agendar compromisso',
    descricao: 'Digite o dia, a hora e o compromisso. A LIA marca no calendário.',
    emoji: '📅',
  },
];

interface LiaBotaoProps {
  onAbrir: (habilidade: HabilidadeLia) => void;
}

export function LiaBotao({ onAbrir }: LiaBotaoProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { status } = useLia();
  const [aberto, setAberto] = useState(false);

  const ativa = status === 'pronta' || status === 'entendendo';

  // Leque: cada item entra com um atraso, de baixo para cima.
  const leque = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(leque, {
      toValue: aberto ? 1 : 0,
      duration: aberto ? 220 : 140,
      easing: aberto ? Easing.out(Easing.back(1.4)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [aberto, leque]);

  function abrirFuncionalidade(chave: HabilidadeLia) {
    setAberto(false);
    onAbrir(chave);
  }

  return (
    <View
      style={[styles.ancora, { bottom: 74 + Math.max(insets.bottom, spacing.sm) }]}
      pointerEvents="box-none"
    >
      {aberto ? (
        <Animated.View
          style={[
            styles.menu,
            {
              opacity: leque,
              transform: [
                { translateY: leque.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                { scale: leque.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <Text style={styles.menuTitulo}>LIA</Text>
          <Text style={styles.menuSub}>Sua assistente de corretagem</Text>
          {FUNCIONALIDADES.map((f) => (
            <Pressable
              key={f.chave}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => abrirFuncionalidade(f.chave)}
            >
              <Text style={styles.itemEmoji}>{f.emoji}</Text>
              <View style={styles.itemTextos}>
                <Text style={styles.itemTitulo}>{f.titulo}</Text>
                <Text style={styles.itemDescricao}>{f.descricao}</Text>
              </View>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      {ativa ? (
        <View style={styles.orbeAtras} pointerEvents="none">
          <LiaOrbe modo={status === 'entendendo' ? 'pensando' : 'parada'} tamanho={58} compacto />
        </View>
      ) : null}

      <Pressable
        onPress={() => (ativa ? onAbrir('simulacao') : setAberto((v) => !v))}
        style={({ pressed }) => [
          styles.botao,
          ativa && styles.botaoAtivo,
          pressed && styles.botaoPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={ativa ? 'Abrir a sessão de texto da LIA.' : 'Abrir a LIA'}
      >
        {ativa ? null : <Logo size={30} />}
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    ancora: {
      position: 'absolute',
      right: spacing.lg,
      alignItems: 'flex-end',
      zIndex: 40,
    },
    botao: {
      width: 58,
      height: 58,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    botaoAtivo: { backgroundColor: 'transparent', borderColor: 'transparent' },
    botaoPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
    // (58 * 1,6 - 58) / 2 = 17,4 — o quanto a caixa do orbe passa do botão de
    // cada lado, para ficar centrada nele. Some com os 16 px de margem da tela,
    // e é por isso que o modo compacto do orbe é calibrado para caber: a régua
    // final, porém, é o `overflow-x: hidden` declarado em app/+html.tsx.
    orbeAtras: { position: 'absolute', bottom: -17, right: -17 },
    menu: {
      marginBottom: spacing.md,
      width: 280,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: spacing.xs,
      ...shadow.card,
    },
    menuTitulo: { ...typography.heading, color: colors.primary },
    menuSub: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm },
    item: {
      flexDirection: 'row',
      gap: spacing.md,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemPressed: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    itemEmoji: { fontSize: 22 },
    itemTextos: { flex: 1 },
    itemTitulo: { ...typography.label, color: colors.ink },
    itemDescricao: { ...typography.caption, color: colors.inkMuted },
  });
