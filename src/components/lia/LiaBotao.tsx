/**
 * O botão da LIA — o ponto de entrada da assistente.
 *
 * Fica flutuando acima da barra inferior. Um toque abre o leque de
 * funcionalidades — hoje três, e cada uma nova entra acrescentando uma linha a
 * `FUNCIONALIDADES`, sem redesenhar nada.
 *
 * O botão MUDA DE CARA quando a LIA está ouvindo: vira um anel pulsante. Numa
 * ferramenta que abre o microfone, o estado "estou gravando" precisa ser
 * visível de relance, de qualquer tela do aplicativo — nunca escondido atrás de
 * um menu.
 */
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
    descricao: 'A LIA ouve a negociação e preenche a simulação sozinha.',
    emoji: '🎧',
  },
  {
    chave: 'material',
    titulo: 'Material de venda',
    descricao: 'Diga o empreendimento e a pasta. Ela acha a mídia.',
    emoji: '🖼️',
  },
  {
    chave: 'agenda',
    /*
     * "Agendar compromisso", e não "Agenda": a barra inferior JÁ tem uma aba
     * chamada Agenda, que é um lugar. Este é uma ação — e dois rótulos iguais
     * para coisas diferentes na mesma tela é como o corretor toca no errado.
     */
    titulo: 'Agendar compromisso',
    descricao: 'Diga o dia, a hora e o que é. Ela marca no calendário.',
    emoji: '📅',
  },
];

interface LiaBotaoProps {
  /** Abre a habilidade escolhida. Quem controla a abertura é o layout. */
  onAbrir: (habilidade: HabilidadeLia) => void;
}

export function LiaBotao({ onAbrir }: LiaBotaoProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { status, nivelDeVoz } = useLia();
  const [aberto, setAberto] = useState(false);

  const ouvindo = status === 'ouvindo' || status === 'entendendo';

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

      {/*
        Ouvindo, o botão VIRA o orbe — a mesma linguagem visual do painel, com a
        mesma reação à voz. É o sinal de "microfone aberto" que acompanha o
        corretor por qualquer tela, e ele não pode ser um ícone parado: um
        ponto estático some no canto da tela em dez segundos.

        O orbe fica atrás do Pressable e sem captura de toque, para a área
        clicável continuar sendo o botão de 58 px e não a nuvem inteira.
      */}
      {ouvindo ? (
        <View style={styles.orbeAtras} pointerEvents="none">
          <LiaOrbe
            modo={status === 'entendendo' ? 'pensando' : 'ouvindo'}
            nivel={nivelDeVoz}
            tamanho={58}
            compacto
          />
        </View>
      ) : null}

      <Pressable
        // Ouvindo, o toque leva direto à sessão em andamento: nesse momento o
        // corretor quer voltar para o que está rolando, não escolher outra coisa.
        onPress={() => (ouvindo ? onAbrir('simulacao') : setAberto((v) => !v))}
        style={({ pressed }) => [
          styles.botao,
          ouvindo && styles.botaoOuvindo,
          pressed && styles.botaoPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={ouvindo ? 'LIA está ouvindo. Abrir a sessão.' : 'Abrir a LIA'}
      >
        {ouvindo ? null : <Logo size={30} />}
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
    // Ouvindo, o próprio orbe desenha o fundo e a borda: o botão só delimita a
    // área de toque.
    botaoOuvindo: { backgroundColor: 'transparent', borderColor: 'transparent' },
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
