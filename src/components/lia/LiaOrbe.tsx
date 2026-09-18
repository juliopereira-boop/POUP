import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { useTheme } from '@/providers/ThemeProvider';

export type ModoOrbe = 'parada' | 'pensando';

interface LiaOrbeProps {
  modo: ModoOrbe;

  tamanho?: number;

  compacto?: boolean;
}

const NATIVO = false;

const ORBITAS = [
  { duracao: 7000, raio: 34, tamanho: 1.55, atraso: 0, escura: false },
  { duracao: 11000, raio: 24, tamanho: 1.25, atraso: 400, escura: true },
  { duracao: 13000, raio: 42, tamanho: 1.75, atraso: 900, escura: false },
  { duracao: 17000, raio: 30, tamanho: 1.4, atraso: 1500, escura: true },
  { duracao: 19000, raio: 38, tamanho: 1.6, atraso: 2100, escura: false },
  { duracao: 23000, raio: 20, tamanho: 1.1, atraso: 2600, escura: true },
  { duracao: 29000, raio: 46, tamanho: 1.9, atraso: 3300, escura: false },
];

const ANEIS = [0, 1, 2, 3];

export function LiaOrbe({ modo, tamanho = 96, compacto = false }: LiaOrbeProps) {
  const { colors } = useTheme();

  const ativo = modo !== 'parada';
  const pensando = modo === 'pensando';

  // Um valor fixo quando não há medição de voz: as interpolações não precisam
  // saber se o microfone respondeu.
  const nivelInterno = useRef(new Animated.Value(0)).current;
  const nivelUsado = nivelInterno;

  const orbitas = useRef(ORBITAS.map(() => new Animated.Value(0))).current;
  const aneis = useRef(ANEIS.map(() => new Animated.Value(0))).current;
  const respiro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const laços = orbitas.map((valor, i) => {
      const o = ORBITAS[i]!;
      valor.setValue(0);
      return Animated.loop(
        Animated.timing(valor, {
          toValue: 1,
          // Pensando, a nuvem acelera: o mesmo desenho, com outra urgência.
          duration: pensando ? o.duracao * 0.45 : o.duracao,
          delay: o.atraso,
          easing: Easing.linear,
          useNativeDriver: NATIVO,
        }),
      );
    });
    laços.forEach((l) => l.start());
    return () => laços.forEach((l) => l.stop());
  }, [orbitas, pensando]);

  useEffect(() => {
    if (!ativo) {
      aneis.forEach((a) => a.setValue(0));
      return;
    }
    const laços = aneis.map((valor, i) => {
      valor.setValue(0);
      return Animated.loop(
        Animated.timing(valor, {
          toValue: 1,
          duration: pensando ? 1400 : 2200,
          delay: i * (pensando ? 350 : 550),
          easing: Easing.out(Easing.quad),
          useNativeDriver: NATIVO,
        }),
      );
    });
    laços.forEach((l) => l.start());
    return () => laços.forEach((l) => l.stop());
  }, [aneis, ativo, pensando]);

  useEffect(() => {
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(respiro, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVO,
        }),
        Animated.timing(respiro, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: NATIVO,
        }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [respiro]);

  const caixa = tamanho * (compacto ? 1.6 : 3.1);

  const alcance = compacto ? 1.4 : 2.5;

  const espalha = compacto ? 0.22 : 1;

  // A voz empurra tudo: anel maior, fumaça mais densa, núcleo mais cheio.
  const empurrao = useMemo(
    () => nivelUsado.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [nivelUsado],
  );

  return (
    <View style={[styles.caixa, { width: caixa, height: caixa }]} pointerEvents="none">
      {ORBITAS.map((o, i) => {
        const t = orbitas[i]!;
        const d = tamanho * (compacto ? Math.min(o.tamanho, 1.05) : o.tamanho);
        const raio = o.raio * espalha;
        return (
          <Animated.View
            key={`fumaca-${i}`}
            style={[
              styles.mancha,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: o.escura ? colors.primaryDark : colors.primary,
                opacity: Animated.multiply(
                  t.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: o.escura ? [0.05, 0.14, 0.05] : [0.09, 0.24, 0.09],
                  }),
                  Animated.add(1, Animated.multiply(empurrao, ativo ? 1.8 : 0)),
                ),
                transform: [
                  {
                    translateX: t.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: [0, raio, 0, -raio, 0],
                    }),
                  },
                  {
                    translateY: t.interpolate({
                      inputRange: [0, 0.25, 0.5, 0.75, 1],
                      outputRange: [-raio, 0, raio, 0, -raio],
                    }),
                  },
                  {
                    scale: t.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.75, 1.25, 0.75],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}

      {ativo
        ? ANEIS.map((_, i) => {
            const t = aneis[i]!;
            return (
              <Animated.View
                key={`anel-${i}`}
                style={[
                  styles.anel,
                  {
                    width: tamanho,
                    height: tamanho,
                    borderRadius: tamanho / 2,
                    borderColor: colors.primary,
                    // Sobe rápido e some devagar: a onda "nasce" com força e
                    // se dissolve, em vez de piscar.
                    opacity: t.interpolate({
                      inputRange: [0, 0.08, 0.55, 1],
                      outputRange: [0, 0.65, 0.28, 0],
                    }),
                    // A borda afina enquanto cresce, como a crista de uma onda
                    // que se abre. Sem isso o anel vira um aro de desenho.
                    borderWidth: t.interpolate({
                      inputRange: [0, 1],
                      outputRange: pensando ? [1, 3] : [3, 1],
                    }),
                    transform: [
                      {
                        scale: Animated.add(
                          // Pensando, o anel vem de fora para dentro.
                          t.interpolate({
                            inputRange: [0, 1],
                            outputRange: pensando ? [alcance, 0.65] : [0.7, alcance],
                          }),
                          Animated.multiply(empurrao, compacto ? 0.15 : 0.7),
                        ),
                      },
                    ],
                  },
                ]}
              />
            );
          })
        : null}

      <Animated.View
        style={[
          styles.nucleo,
          {
            width: tamanho,
            height: tamanho,
            borderRadius: tamanho / 2,
            backgroundColor: colors.surface,
            borderColor: ativo ? colors.primary : colors.border,
            transform: [
              {
                scale: Animated.add(
                  respiro.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }),
                  Animated.multiply(empurrao, 0.1),
                ),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={{
          transform: [
            {
              scale: Animated.add(
                respiro.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
                Animated.multiply(empurrao, 0.14),
              ),
            },
          ],
        }}
      >
        <Logo size={tamanho * 0.42} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  mancha: { position: 'absolute' },
  anel: { position: 'absolute' },
  nucleo: { position: 'absolute', borderWidth: 1 },
});
