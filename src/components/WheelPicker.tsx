import { useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
} from 'react-native';

import { radius, spacing, typography, type AppColors } from '@/theme';
import { useThemedStyles } from '@/providers/ThemeProvider';

interface WheelPickerProps {
  label?: string;
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
  itemHeight?: number;
  visibleCount?: number;
}

/**
 * Roleta estilo iOS (0 a 100 por padrão) — funciona em Web, iOS e Android.
 * Implementada com ScrollView + snap, sem depender de módulo nativo.
 */
export function WheelPicker({
  label,
  min = 0,
  max = 100,
  value,
  onChange,
  itemHeight = 44,
  visibleCount = 5,
}: WheelPickerProps) {
  const styles = useThemedStyles(makeStyles);
  const scrollRef = useRef<ScrollView>(null);
  const didInit = useRef(false);
  const count = max - min + 1;
  const values = Array.from({ length: count }, (_, i) => min + i);
  const [active, setActive] = useState(Math.min(Math.max(value - min, 0), count - 1));

  const containerHeight = itemHeight * visibleCount;
  const padding = (itemHeight * (visibleCount - 1)) / 2;

  // Posiciona na opção inicial (uma vez).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const y = (value - min) * itemHeight;
    // pequeno atraso garante que o ScrollView já mediu
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  }, [value, min, itemHeight]);

  function indexFromOffset(y: number): number {
    return Math.min(Math.max(Math.round(y / itemHeight), 0), count - 1);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    if (idx !== active) {
      setActive(idx);
      const next = min + idx;
      if (next !== value) onChange(next);
    }
  }

  function selectIndex(idx: number) {
    scrollRef.current?.scrollTo({ y: idx * itemHeight, animated: true });
    setActive(idx);
    onChange(min + idx);
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.picker, { height: containerHeight }]}>
        {/* Faixa de seleção central */}
        <View
          pointerEvents="none"
          style={[styles.selection, { top: padding, height: itemHeight }]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={itemHeight}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleScroll}
          contentContainerStyle={{ paddingVertical: padding }}
        >
          {values.map((v, idx) => {
            const isActive = idx === active;
            return (
              <Pressable
                key={v}
                onPress={() => selectIndex(idx)}
                style={[styles.item, { height: itemHeight }]}
              >
                <Text style={[styles.itemText, isActive ? styles.itemTextActive : styles.itemTextIdle]}>
                  {v}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.lg },
    label: { ...typography.label, color: colors.inkMuted, marginBottom: spacing.sm },
    picker: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    selection: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: colors.primarySoft,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.primary,
    },
    item: { alignItems: 'center', justifyContent: 'center' },
    itemText: { ...typography.title },
    itemTextActive: { color: colors.primary, fontWeight: '700' },
    itemTextIdle: { color: colors.inkSubtle },
  });
