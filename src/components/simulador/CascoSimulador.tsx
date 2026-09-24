/**
 * O CASCO DO SIMULADOR: o resultado parado no topo, os campos rolando embaixo.
 *
 * O `Screen` do resto do app rola a página inteira, e o resultado subiria junto
 * com o primeiro campo — justamente quando o corretor começa a digitar e quer
 * ver a parcela mudar. Aqui o topo não rola. Mesmas larguras do `Screen`, para
 * o simulador não parecer de outro aplicativo no computador.
 *
 * ===========================================================================
 * O TECLADO NO NAVEGADOR DO CELULAR
 * ===========================================================================
 * No aplicativo, o teclado encolhe a área dos campos e o topo fica onde está.
 * No navegador do celular, não: o Safari (e o Chrome, desde a versão 108) NÃO
 * encolhe a página quando o teclado abre — ele a EMPURRA para cima até o campo
 * aparecer, e o bloco "congelado" sobe junto. Foi o que o corretor viu.
 *
 * O navegador conta, pela `visualViewport`, qual pedaço da página está de
 * fato visível. Enquanto o teclado está aberto, o casco passa a ocupar
 * exatamente esse pedaço, preso nele (`position: fixed` na posição e altura
 * visíveis): o resultado fica colado no topo do que se vê, e os campos rolam
 * entre ele e o teclado. Fechou o teclado, o casco volta ao lugar de sempre.
 *
 * Só a POSIÇÃO muda, nunca a árvore de componentes — trocar a árvore
 * remontaria o campo e o teclado fecharia no meio da digitação.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/providers/ThemeProvider';
import { layout, spacing } from '@/theme';

/**
 * Quanto a área visível precisa encolher para ser teclado, e não a barra de
 * endereço do navegador aparecendo e sumindo (que muda uns 50–100 px).
 */
const ENCOLHE_COM_TECLADO = 150;

interface AreaVisivel {
  topo: number;
  altura: number;
}

/** No navegador: o pedaço da tela que o teclado deixa à vista. `null` = teclado fechado. */
function useAreaComTecladoNaWeb(): AreaVisivel | null {
  const [area, setArea] = useState<AreaVisivel | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    let quadro = 0;
    const medir = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const encolheu = window.innerHeight - vv.height;
        // Zoom de pinça também encolhe a área visível; ali o corretor quer
        // olhar um pedaço da tela, não digitar — o casco fica onde está.
        const comZoom = vv.scale > 1.01;
        if (encolheu < ENCOLHE_COM_TECLADO || comZoom) {
          setArea(null);
          return;
        }
        const topo = Math.round(vv.offsetTop);
        const altura = Math.round(vv.height);
        setArea((antes) => (antes && antes.topo === topo && antes.altura === altura ? antes : { topo, altura }));
      });
    };

    vv.addEventListener('resize', medir);
    vv.addEventListener('scroll', medir);
    medir();
    return () => {
      cancelAnimationFrame(quadro);
      vv.removeEventListener('resize', medir);
      vv.removeEventListener('scroll', medir);
    };
  }, []);

  return area;
}

interface Props {
  topo: ReactNode;
  children: ReactNode;
}

export function CascoSimulador({ topo, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const teclado = useAreaComTecladoNaWeb();

  // O teclado acabou de abrir e a área encolheu: o campo em que o corretor
  // tocou pode ter ficado atrás dele. Traz o campo para o meio da área.
  const alturaComTeclado = teclado?.altura ?? null;
  useEffect(() => {
    if (alturaComTeclado == null || typeof document === 'undefined') return;
    const campo = document.activeElement;
    if (!(campo instanceof HTMLElement) || !/^(INPUT|TEXTAREA)$/.test(campo.tagName)) return;
    const quadro = requestAnimationFrame(() => campo.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(quadro);
  }, [alturaComTeclado]);

  const isDesktop = width >= layout.desktopBreakpoint;
  const isTablet = !isDesktop && width >= layout.tabletBreakpoint;
  const paddingHorizontal = isDesktop ? spacing.xxl : isTablet ? spacing.xl : spacing.lg;
  const largura = { width: '100%' as const, maxWidth: layout.maxContentWidth, alignSelf: 'center' as const };

  // `fixed` existe no navegador, mas não nos tipos do React Native.
  const presoNaAreaVisivel = teclado
    ? ({
        position: 'fixed',
        top: teclado.topo,
        left: 0,
        right: 0,
        height: teclado.altura,
        zIndex: 1000,
      } as unknown as ViewStyle)
    : null;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }, presoNaAreaVisivel]}>
      <View
        style={[
          styles.topo,
          { paddingHorizontal, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={largura}>{topo}</View>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingHorizontal,
          paddingTop: spacing.lg,
          // Folga extra no fim: o botão flutuante da LIA fica no canto de baixo e
          // cobriria o "Gerar proposta" se a lista acabasse rente à borda.
          paddingBottom: insets.bottom + spacing.xxl + 72,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={largura}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topo: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
