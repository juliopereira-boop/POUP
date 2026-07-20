import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import { colors } from '@/theme';

interface SlotNumberProps {
  /** Valor alvo (em reais). */
  value: number;
  style?: TextStyle;
  durationMs?: number;
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Número monetário que anima ("caça-níquel") do valor anterior para o novo,
 * chamando atenção. Usado no valor das parcelas mensais.
 */
export function SlotNumber({ value, style, durationMs = 500 }: SlotNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <Text style={[styles.text, style]}>{brl(display)}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: -0.5,
  },
});
