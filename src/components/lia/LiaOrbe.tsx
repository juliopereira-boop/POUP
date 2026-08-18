/**
 * O ORBE DA LIA — a logo viva.
 *
 * ===========================================================================
 * COMO ELE É FEITO
 * ===========================================================================
 * Quatro camadas, de baixo para cima:
 *
 *   1. **Fumaça** — sete manchas laranjas translúcidas, em dois tons, grandes e sobrepostas,
 *      cada uma girando numa órbita própria com duração diferente. Nenhuma
 *      delas é bonita sozinha; o que produz a nuvem que respira é a soma delas
 *      fora de fase. Durações primas entre si de propósito: com valores
 *      múltiplos, o conjunto reencontra a mesma posição a cada poucos
 *      segundos e o olho percebe o ciclo — que é justamente o que faz uma
 *      animação parecer barata.
 *
 *   2. **Ondas** — quatro anéis que nascem no centro, crescem e se dissolvem,
 *      escalonados no tempo, com a borda afinando enquanto abrem. É o pulso.
 *
 *   3. **Núcleo** — o disco claro que segura a logo e a separa da fumaça.
 *
 *   4. **Logo** — respirando devagar, sempre. Mesmo parada, a LIA está viva.
 *
 * ===========================================================================
 * A DECISÃO QUE FAZ ISSO NÃO PARECER PAPEL DE PAREDE
 * ===========================================================================
 * O pulso não segue o relógio: segue **a voz**. `nivel` é um `Animated.Value`
 * alimentado pelo volume real do microfone (ver `nivelDeVoz.ts`), e ele
 * multiplica a escala das ondas, a opacidade da fumaça e o tamanho do núcleo.
 *
 * Uma animação em laço fixo é bonita por dez segundos e vira papel de parede
 * no décimo primeiro — o olho percebe que ela não tem relação com o que está
 * acontecendo. Reagindo ao volume, o movimento vira informação: dá para ver,
 * sem ler nada, que a LIA está captando *aquela* frase.
 *
 * Quando o volume não está disponível (permissão negada, navegador sem Web
 * Audio), `nivel` fica em zero e sobra a animação de ritmo. Continua bonito,
 * só não é reativo.
 *
 * ===========================================================================
 * "PENSANDO" É O MOVIMENTO INVERTIDO
 * ===========================================================================
 * Enquanto a LIA entende o que ouviu, os anéis **contraem** em vez de
 * expandir, e a fumaça gira mais rápido e mais fechada. É a mesma linguagem
 * visual dizendo a coisa oposta: em vez de emitir, ela recolhe. O corretor
 * entende a diferença sem precisar de legenda.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { useTheme } from '@/providers/ThemeProvider';

export type ModoOrbe = 'parada' | 'ouvindo' | 'pensando';

interface LiaOrbeProps {
  modo: ModoOrbe;
  /** Volume da voz, 0 a 1. Vem de `nivelDeVoz.ts`. */
  nivel?: Animated.Value;
  /** Diâmetro do círculo interno (a logo fica dentro dele). */
  tamanho?: number;
  /**
   * Versão enxuta, para o botão flutuante.
   *
   * Não é só "menor": é **contida**. O botão vive a 16 px da borda da tela, e
   * a nuvem do orbe cheio se espalha uns 60 px além dele — o que, na web,
   * empurra a largura da página e faz o app **rolar para o lado**. Uma tela de
   * celular que desliza na horizontal parece app quebrado, e o preço não vale
   * o enfeite.
   *
   * Compacto, as manchas orbitam de perto e as ondas param em 1,4x, ficando
   * praticamente dentro do botão. A garantia final contra a rolagem lateral,
   * porém, é o `overflow-x: hidden` de `app/+html.tsx` — calibrar animação no
   * milímetro funciona hoje e quebra na próxima. O espetáculo mora no painel;
   * aqui o orbe é sinalização.
   */
  compacto?: boolean;
}

/*
 * `useNativeDriver` é desligado aqui de propósito.
 *
 * Na web o driver nativo não existe: o React Native Web avisa e ignora. Como
 * o mesmo `Animated.Value` do nível é escrito de fora, misturar valores
 * dirigidos por caminhos diferentes é fonte de erro difícil de achar. Um
 * punhado de círculos animados por JS não custa nada perto disso.
 */
const NATIVO = false;

/**
 * Durações fora de fase, em números primos: o conjunto nunca reencontra a
 * mesma posição. Com valores múltiplos, a nuvem se repetiria a cada poucos
 * segundos e o olho pega o ciclo — que é o que faz animação parecer barata.
 *
 * `escura` alterna o tom: manchas em dois laranjas diferentes dão profundidade,
 * porque as bordas de uma aparecem por dentro da outra em vez de somarem numa
 * mancha chapada.
 */
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

export function LiaOrbe({ modo, nivel, tamanho = 96, compacto = false }: LiaOrbeProps) {
  const { colors } = useTheme();

  const ativo = modo !== 'parada';
  const pensando = modo === 'pensando';

  // Um valor fixo quando não há medição de voz: as interpolações não precisam
  // saber se o microfone respondeu.
  const nivelInterno = useRef(new Animated.Value(0)).current;
  const nivelUsado = nivel ?? nivelInterno;

  const orbitas = useRef(ORBITAS.map(() => new Animated.Value(0))).current;
  const aneis = useRef(ANEIS.map(() => new Animated.Value(0))).current;
  const respiro = useRef(new Animated.Value(0)).current;

  /* ------------------------------------------------------------ fumaça */
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

  /* ------------------------------------------------------------- ondas */
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

  /* ---------------------------------------------------------- respiração */
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
  /** Até onde a onda abre. É este número que decide se a página rola. */
  const alcance = compacto ? 1.4 : 2.5;
  /** O quanto a nuvem se afasta do centro. */
  const espalha = compacto ? 0.22 : 1;

  // A voz empurra tudo: anel maior, fumaça mais densa, núcleo mais cheio.
  const empurrao = useMemo(
    () => nivelUsado.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [nivelUsado],
  );

  return (
    <View style={[styles.caixa, { width: caixa, height: caixa }]} pointerEvents="none">
      {/* 1. fumaça */}
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

      {/* 2. ondas */}
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

      {/* 3. núcleo */}
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

      {/* 4. logo */}
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
