import { type ReactNode, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { radius, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface SwipeToDeleteProps {
  children: ReactNode;
  onDelete: () => void;
}

/** Arraste para o lado para revelar a lixeira vermelha e excluir. */
export function SwipeToDelete({ children, onDelete }: SwipeToDeleteProps) {
  const styles = useThemedStyles(makeStyles);
  const ref = useRef<Swipeable>(null);

  function renderRightActions(progress: Animated.AnimatedInterpolation<number>) {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });
    return (
      <Pressable
        style={styles.trash}
        accessibilityLabel="Excluir cupom"
        onPress={() => {
          ref.current?.close();
          onDelete();
        }}
      >
        <Animated.Text style={[styles.trashIcon, { transform: [{ scale }] }]}>🗑</Animated.Text>
      </Pressable>
    );
  }

  return (
    <Swipeable ref={ref} renderRightActions={renderRightActions} overshootRight={false}>
      {children}
    </Swipeable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    trash: {
      width: 64,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      marginLeft: 8,
    },
    trashIcon: { fontSize: 20 },
  });
