import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/providers/ThemeProvider';
import { Logo } from './Logo';

const HOLD_MS = 3000;
const ENTER_MS = 620;
const EXIT_MS = 520;

export function SplashGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [done, setDone] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(exit, {
        toValue: 0,
        duration: EXIT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setDone(true));
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, [enter, exit]);

  return (
    <View style={styles.root}>
      {children}
      {done ? null : (
        <Animated.View
          pointerEvents="none"
          style={[styles.overlay, { backgroundColor: colors.background, opacity: exit }]}
        >
          <Animated.View
            style={{
              opacity: enter,
              transform: [
                {
                  scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
                },
              ],
            }}
          >
            <Logo size={200} />
          </Animated.View>

          <Animated.View
            style={[
              styles.barTrack,
              { backgroundColor: colors.border, opacity: enter },
            ]}
          >
            <Animated.View
              style={[
                styles.barFill,
                {
                  backgroundColor: colors.primary,
                  transform: [
                    { scaleX: enter.interpolate({ inputRange: [0, 1], outputRange: [0.05, 1] }) },
                  ],
                },
              ]}
            />
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  barTrack: {
    width: 132,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    transformOrigin: 'left',
  },
});
