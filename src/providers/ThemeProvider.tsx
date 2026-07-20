import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';

import { darkColors, lightColors, type AppColors, type ColorScheme } from '@/theme';
import { sessionStorage } from '@/lib/storage';

const STORAGE_KEY = 'poup.theme';

interface ThemeContextValue {
  scheme: ColorScheme;
  colors: AppColors;
  isDark: boolean;
  setScheme: (scheme: ColorScheme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function initialScheme(): ColorScheme {
  const system = Appearance.getColorScheme();
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>(initialScheme);

  // Restaura a preferência salva (se houver).
  useEffect(() => {
    let mounted = true;
    sessionStorage.getItem(STORAGE_KEY).then((saved) => {
      if (mounted && (saved === 'light' || saved === 'dark')) {
        setSchemeState(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    void sessionStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = useCallback(() => {
    setSchemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      void sessionStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      isDark: scheme === 'dark',
      setScheme,
      toggle,
    }),
    [scheme, setScheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>.');
  return ctx;
}

/**
 * Cria estilos temáticos memoizados pela paleta ativa.
 * Uso: `const styles = useThemedStyles(makeStyles);` onde
 * `makeStyles = (colors) => StyleSheet.create({ ... })`.
 */
export function useThemedStyles<T>(factory: (colors: AppColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
