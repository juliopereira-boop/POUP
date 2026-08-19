/**
 * AGENDA POR VOZ — o mini-chat da LIA.
 *
 * ===========================================================================
 * A CONVERSA
 * ===========================================================================
 *   LIA:      O que você quer agendar?
 *   corretor: "dia 25 às 10 horas, apresentar o Connect pra Fulana"
 *   LIA:      Agendado: Apresentar o Connect — 25/08 às 10:00.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE, SE A ESCUTA AMBIENTE JÁ AGENDA
 * ===========================================================================
 * A escuta ambiente pega o comando no meio da negociação — é ótimo, e é grátis
 * quando o corretor já está com a LIA ligada. Mas ela exige uma sessão de
 * escuta aberta, com o consentimento do cliente, o microfone captando a sala
 * inteira e a captura de catorze campos rodando junto.
 *
 * Nove em cada dez agendamentos não acontecem assim: acontecem no carro, entre
 * um atendimento e outro, com o corretor sozinho querendo marcar uma coisa.
 * Para isso, abrir a negociação inteira é desproporcional — e, pior, é
 * invisível: um recurso que só existe dentro de outro recurso não é
 * descoberto por ninguém.
 *
 * Daí um item próprio no leque. Os dois caminhos chamam a MESMA
 * `agendarPorVoz`; muda só como o corretor chega até ela.
 *
 * ===========================================================================
 * O QUE ESTA TELA DIZ EM VOZ ALTA
 * ===========================================================================
 * A frase ditada **sai do aparelho** — ela vai para um serviço de IA que
 * resolve "dia 25 às 10" em data e hora. Isso está escrito na tela, sem
 * modal de consentimento: o consentimento da LIA existe para a conversa com o
 * CLIENTE, cujos dados não são do corretor. Aqui é ele falando sozinho sobre a
 * própria agenda. Repetir o mesmo aviso pesado nos dois casos treinaria o
 * corretor a aceitar sem ler — e é na negociação que ele precisa ler.
 *
 * ===========================================================================
 * A SAÍDA QUANDO A VOZ FALHA
 * ===========================================================================
 * Diferente do material, aqui não dá para listar opções tocáveis: data e hora
 * não são uma lista curta. Então a saída é outra — o botão que leva ao
 * calendário, onde o formulário completo já existe. Uma interface só por voz é
 * uma interface que trava quando a voz falha.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { LiaOrbe } from './LiaOrbe';
import { db } from '@/data';
import { agendarPorVoz, type CatalogoAgendamento } from '@/features/lia/agendamento';
import { criarEscuta, type Escuta } from '@/features/lia/escuta';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/**
 * Pausa mais longa que a do material (700 ms).
 *
 * Ali a resposta é uma palavra ("posts"); aqui é uma frase inteira, com data,
 * hora, empreendimento e cliente. Cortar em 700 ms partiria o comando no meio
 * e mandaria metade dele para o modelo.
 */
const PAUSA_MS = 1400;

interface Fala {
  de: 'lia' | 'corretor';
  texto: string;
}

const PRIMEIRA_FALA: Fala = {
  de: 'lia',
  texto: 'O que você quer agendar? Diga o dia, a hora e o que é.',
};

interface LiaAgendaChatProps {
  visivel: boolean;
  aoFechar: () => void;
}

export function LiaAgendaChat({ visivel, aoFechar }: LiaAgendaChatProps) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();

  const [falas, setFalas] = useState<Fala[]>([PRIMEIRA_FALA]);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoAgendamento>({
    empreendimentos: [],
    clientes: [],
    empresaDoEmpreendimento: {},
  });

  const escutaRef = useRef<Escuta | null>(null);
  const rolagemRef = useRef<ScrollView | null>(null);

  const dizer = useCallback((de: Fala['de'], texto: string) => {
    setFalas((antes) => [...antes, { de, texto }]);
  }, []);

  /* ---------------------------------------------------------- catálogo */

  useEffect(() => {
    if (!visivel || !user) return;
    void (async () => {
      const [devs, leads] = await Promise.all([
        db.developments.list(user.id),
        db.leads.list(user.id),
      ]);
      setCatalogo({
        empreendimentos: devs.map((d) => ({ id: d.id, nome: d.name })),
        clientes: leads.map((l) => ({ id: l.id, nome: l.name })),
        empresaDoEmpreendimento: Object.fromEntries(devs.map((d) => [d.id, d.companyId])),
      });
    })();
  }, [visivel, user]);

  /* ------------------------------------------------------------- ouvir */

  const processarFala = useCallback(
    async (texto: string) => {
      if (!user) return;
      dizer('corretor', texto);
      setPensando(true);
      const r = await agendarPorVoz(user.id, texto, catalogo);
      setPensando(false);
      /*
       * O gatilho `pareceAgendamento` NÃO é usado aqui, e é de propósito: quem
       * abriu a tela de agenda e apertou o microfone já disse o que queria
       * fazer. Exigir que ele fale a palavra "agendar" de novo seria pedir uma
       * senha para entrar numa porta que ele acabou de abrir.
       */
      dizer('lia', r.ok ? `✅ Agendado: ${r.resumo}` : r.motivo);
    },
    [user, catalogo, dizer],
  );

  /*
   * A fala mais recente vive numa ref porque o callback da escuta é montado uma
   * vez e enxergaria para sempre o estado daquele instante — o mesmo cuidado do
   * `LiaProvider` e do `LiaMaterialChat`.
   */
  const processarRef = useRef(processarFala);
  processarRef.current = processarFala;

  const alternarEscuta = useCallback(() => {
    if (ouvindo) {
      escutaRef.current?.parar();
      escutaRef.current = null;
      setOuvindo(false);
      setParcial('');
      return;
    }

    let acumulado = '';
    const escuta = criarEscuta({
      pausaMs: PAUSA_MS,
      silencioMs: PAUSA_MS * 2,
      aoOuvir: setParcial,
      aoFechar: (t) => {
        acumulado = `${acumulado} ${t}`.trim();
      },
      aoPausar: () => {
        if (!acumulado) return;
        const dito = acumulado;
        acumulado = '';
        setParcial('');
        void processarRef.current(dito);
      },
      aoSilenciar: () => undefined,
      aoFalhar: (m) => {
        setErro(m);
        setOuvindo(false);
      },
    });
    escutaRef.current = escuta;
    escuta.iniciar();
    setOuvindo(true);
  }, [ouvindo]);

  // Fechar sem soltar o microfone deixaria a luz do aparelho acesa.
  useEffect(() => {
    if (!visivel) {
      escutaRef.current?.parar();
      escutaRef.current = null;
      setOuvindo(false);
      setFalas([PRIMEIRA_FALA]);
      setErro(null);
    }
  }, [visivel]);
  useEffect(() => () => escutaRef.current?.parar(), []);

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: true });
  }, [falas]);

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabecalho}>
            <LiaOrbe modo={pensando ? 'pensando' : ouvindo ? 'ouvindo' : 'parada'} tamanho={26} compacto />
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.titulo}>LIA · Agenda</Text>
              <Text style={styles.subtitulo}>
                {ouvindo ? 'Pode falar' : 'Toque no microfone e diga o compromisso'}
              </Text>
            </View>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.fechar}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={rolagemRef}
            style={styles.conversa}
            contentContainerStyle={styles.conversaConteudo}
          >
            {falas.map((f, i) => (
              <View
                key={`${i}-${f.texto}`}
                style={[styles.balao, f.de === 'lia' ? styles.balaoLia : styles.balaoCorretor]}
              >
                <Text style={f.de === 'lia' ? styles.balaoTextoLia : styles.balaoTextoCorretor}>
                  {f.texto}
                </Text>
              </View>
            ))}

            {parcial ? (
              <View style={[styles.balao, styles.balaoCorretor, styles.balaoParcial]}>
                <Text style={styles.balaoTextoCorretor}>{parcial}…</Text>
              </View>
            ) : null}

            {pensando ? <ActivityIndicator style={styles.carregando} /> : null}

            {/* Exemplos concretos: o corretor descobre o que dá para dizer LENDO. */}
            {falas.length === 1 ? (
              <View style={styles.exemplos}>
                <Text style={styles.exemplosTitulo}>Por exemplo</Text>
                <Text style={styles.exemplo}>
                  "dia 25 às 10 horas, apresentar o Connect para a Fulana"
                </Text>
                <Text style={styles.exemplo}>"amanhã às 15h, reunião de assinatura"</Text>
                <Text style={styles.exemplo}>"sexta às 9, visita ao Parque das Águas"</Text>
              </View>
            ) : null}

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <Text style={styles.aviso}>
              A frase que você ditar é enviada como TEXTO a um serviço de inteligência artificial
              (Anthropic) para virar data e hora. O áudio não é gravado.
            </Text>
          </ScrollView>

          <View style={styles.rodape}>
            <Button
              label={ouvindo ? 'Parar de ouvir' : '🎤 Falar'}
              variant={ouvindo ? 'secondary' : 'primary'}
              onPress={alternarEscuta}
            />
            {/*
              A saída quando a voz falha. Não é uma lista de opções tocáveis
              como no material — data e hora não cabem numa lista curta —, mas
              o formulário completo já existe no calendário.
            */}
            <Button
              label="Abrir o calendário"
              variant="ghost"
              onPress={() => {
                aoFechar();
                router.push('/(app)/calendario');
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    folha: {
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.lg,
    },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cabecalhoTextos: { flex: 1 },
    titulo: { ...typography.heading, color: colors.primary },
    subtitulo: { ...typography.caption, color: colors.inkMuted },
    fechar: { ...typography.heading, color: colors.inkMuted },

    conversa: { maxHeight: 420 },
    conversaConteudo: { padding: spacing.lg, gap: spacing.sm },
    balao: {
      maxWidth: '86%',
      padding: spacing.md,
      borderRadius: radius.md,
    },
    balaoLia: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    balaoCorretor: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
    balaoParcial: { opacity: 0.6 },
    balaoTextoLia: { ...typography.body, color: colors.ink },
    balaoTextoCorretor: { ...typography.body, color: colors.primary },

    carregando: { marginVertical: spacing.md },

    exemplos: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      gap: 4,
    },
    exemplosTitulo: { ...typography.caption, color: colors.inkSubtle, textTransform: 'uppercase' },
    exemplo: { ...typography.caption, color: colors.inkMuted, fontStyle: 'italic' },

    erro: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
    aviso: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: spacing.lg,
      lineHeight: 17,
      fontSize: 11.5,
    },

    rodape: { padding: spacing.lg, gap: spacing.sm },
  });
