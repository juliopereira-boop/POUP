/**
 * A INFORMAÇÃO SURGINDO DO ORBE.
 *
 * ===========================================================================
 * O QUE ACONTECE NA TELA
 * ===========================================================================
 * Assim que a LIA entende alguma coisa, ela **sai de dentro do orbe**: uma
 * etiqueta sobe do centro da nuvem, com o campo, o valor e um ✓ verde —
 * `Empreendimento · Connect ✓` — fica um instante e se dissolve para cima.
 *
 * ===========================================================================
 * POR QUE NÃO BASTAVA A LISTA DE BAIXO
 * ===========================================================================
 * A lista de campos capturados já existia e continua sendo a fonte da verdade.
 * Só que ela é **estado**, não **acontecimento**: quem está numa negociação
 * olhando o cliente não fica varrendo uma lista para descobrir o que mudou.
 *
 * A etiqueta é o acontecimento. Ela responde, num olhar de meio segundo e sem
 * tirar o corretor da conversa, a única pergunta que importa naquele momento:
 * *"ela pegou?"*. E responde no lugar certo — saindo do orbe, que é para onde
 * ele já está olhando quando a LIA está processando.
 *
 * ===========================================================================
 * O CUIDADO QUE ESTE ARQUIVO TEM
 * ===========================================================================
 * Cada etiqueta se remove sozinha ao fim da própria animação, e a fila tem
 * teto. Uma rodada que capture doze campos de uma vez não pode encher a tela
 * de etiquetas nem deixar animações vivas para trás: numa tela que fica aberta
 * durante uma reunião inteira, um vazamento desses vira travamento — e este
 * projeto já pagou esse preço uma vez.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { CAMPOS_POR_CHAVE } from '@/features/lia/campos';
import type { CampoCapturado } from '@/features/lia/LiaProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

/** Quantas etiquetas podem estar no ar ao mesmo tempo. */
const MAX_NA_TELA = 4;

/** Tempo total de vida de uma etiqueta. */
const SUBIDA_MS = 620;
const PARADA_MS = 1500;
const SAIDA_MS = 480;
/** Intervalo entre uma etiqueta e a próxima da mesma rodada. */
const CASCATA_MS = 150;

interface Etiqueta {
  /** Único por aparição: a mesma chave pode surgir de novo ao ser corrigida. */
  id: string;
  chave: string;
  rotulo: string;
  valor: string;
  corrigido: boolean;
  /**
   * Altura em que esta etiqueta para, e sua vez na cascata.
   *
   * Fixado na criação, e **não** lido do índice no array. Com o índice, a saída
   * de uma etiqueta faria as outras escorregarem para baixo no meio da leitura
   * — um pulo feio bem no momento em que o corretor está lendo o valor.
   */
  degrau: number;
}

export function LiaCapturaSurgindo({
  capturados,
}: {
  capturados: Record<string, CampoCapturado>;
}) {
  const [fila, setFila] = useState<Etiqueta[]>([]);

  /*
   * O que já foi anunciado, por chave → valor.
   *
   * A comparação é pelo VALOR, não pela presença: um campo que a LIA corrige
   * ("na verdade são três e meio") tem que surgir de novo, porque a correção é
   * exatamente o tipo de coisa que o corretor precisa ver acontecer. Já um
   * campo reconfirmado igual em toda rodada não pode piscar a cada três
   * segundos — viraria ruído e o corretor pararia de olhar.
   */
  const anunciados = useRef<Record<string, string>>({});
  const contador = useRef(0);

  useEffect(() => {
    const novas: Etiqueta[] = [];
    for (const c of Object.values(capturados)) {
      if (anunciados.current[c.chave] === c.valor) continue;
      const jaExistia = anunciados.current[c.chave] !== undefined;
      anunciados.current[c.chave] = c.valor;
      contador.current += 1;
      novas.push({
        id: `${c.chave}-${contador.current}`,
        chave: c.chave,
        rotulo: CAMPOS_POR_CHAVE[c.chave]?.rotulo ?? c.chave,
        valor: c.exibicao,
        corrigido: jaExistia,
        degrau: novas.length,
      });
    }

    // Um campo removido pela mão do corretor volta a poder ser anunciado.
    for (const chave of Object.keys(anunciados.current)) {
      if (!capturados[chave]) delete anunciados.current[chave];
    }

    if (novas.length === 0) return;
    setFila((antes) => [...antes, ...novas].slice(-MAX_NA_TELA));
  }, [capturados]);

  const remover = (id: string) => setFila((antes) => antes.filter((e) => e.id !== id));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {fila.map((e) => (
        <EtiquetaSubindo key={e.id} etiqueta={e} aoTerminar={() => remover(e.id)} />
      ))}
    </View>
  );
}

function EtiquetaSubindo({
  etiqueta,
  aoTerminar,
}: {
  etiqueta: Etiqueta;
  aoTerminar: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const t = useRef(new Animated.Value(0)).current;

  /*
   * O callback vive numa ref, e isso não é preciosismo.
   *
   * `aoTerminar` é recriado a cada render do pai — e o pai renderiza sempre que
   * outra etiqueta entra ou sai. Se ele entrasse nas dependências do efeito, a
   * animação seria **cancelada e recomeçada** a cada vizinha nova: a etiqueta
   * nunca chegaria ao fim, nunca se removeria, e a fila cresceria até a tela
   * engasgar. É o mesmo formato de vazamento que já travou esta tela uma vez,
   * por outro caminho.
   */
  const terminar = useRef(aoTerminar);
  terminar.current = aoTerminar;

  useEffect(() => {
    const animacao = Animated.sequence([
      /*
       * A cascata.
       *
       * Uma rodada da LIA costuma devolver vários campos de uma vez, e todos
       * subindo no mesmo instante viram um bloco — o olho recebe quatro coisas
       * e não lê nenhuma. Saindo em fila, cada etiqueta ganha o seu momento e o
       * conjunto vira uma sequência que dá para acompanhar.
       */
      Animated.delay(etiqueta.degrau * CASCATA_MS),
      Animated.timing(t, {
        toValue: 1,
        duration: SUBIDA_MS,
        // `back` dá o pequeno estouro de quem é cuspido para fora: a etiqueta
        // passa um pouco do ponto e volta. Sem isso ela só desliza, e deslizar
        // não parece "surgir".
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: false,
      }),
      Animated.delay(PARADA_MS),
      Animated.timing(t, {
        toValue: 2,
        duration: SAIDA_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    animacao.start(({ finished }) => {
      // Só remove quando terminou de verdade: interrompida (desmontagem), quem
      // manda é quem desmontou.
      if (finished) terminar.current();
    });
    return () => animacao.stop();
    // `etiqueta.degrau` é fixado na criação e nunca muda para uma dada
    // etiqueta, então relê-lo não recomeçaria nada — mas deixar a lista
    // completa evita que alguém, no futuro, torne o degrau dinâmico sem
    // perceber que a animação passaria a reiniciar.
  }, [t, etiqueta.degrau]);

  return (
    <Animated.View
      style={[
        styles.etiqueta,
        {
          // Cada etiqueta da mesma rodada para um degrau acima da anterior,
          // para duas capturas simultâneas não se sobreporem.
          marginBottom: etiqueta.degrau * 40,
          opacity: t.interpolate({ inputRange: [0, 0.35, 1, 2], outputRange: [0, 1, 1, 0] }),
          transform: [
            {
              translateY: t.interpolate({
                inputRange: [0, 1, 2],
                outputRange: [26, 0, -34],
              }),
            },
            {
              scale: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1, 0.94] }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.rotulo} numberOfLines={1}>
        {etiqueta.rotulo}
      </Text>
      <Text style={styles.valor} numberOfLines={1}>
        {etiqueta.valor}
      </Text>
      {etiqueta.corrigido ? <Text style={styles.corrigido}>corrigido</Text> : null}
      <Text style={styles.check}>✓</Text>
    </Animated.View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    etiqueta: {
      position: 'absolute',
      alignSelf: 'center',
      bottom: spacing.sm,
      maxWidth: '92%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.success,
      ...shadow.floating,
    },
    rotulo: { ...typography.caption, color: colors.inkMuted },
    valor: { ...typography.label, color: colors.ink, flexShrink: 1 },
    corrigido: {
      ...typography.caption,
      fontSize: 10,
      color: colors.primary,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 6,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    check: { color: colors.success, fontSize: 16, fontWeight: '700' },
  });
