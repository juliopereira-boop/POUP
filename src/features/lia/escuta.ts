/**
 * O OUVIDO DA LIA.
 *
 * ===========================================================================
 * O QUE ISTO É
 * ===========================================================================
 * Uma camada fina sobre o reconhecimento de fala do navegador que transforma
 * uma API cheia de arestas em três coisas: texto novo, silêncio, e erro.
 *
 * ===========================================================================
 * ONDE FUNCIONA HOJE — E POR QUE ISSO ESTÁ DITO EM VOZ ALTA
 * ===========================================================================
 * Reconhecimento de fala contínuo não é algo que o React Native tenha. No
 * aplicativo nativo (Expo Go incluído) **não existe** API de transcrição: seria
 * preciso um módulo nativo (`expo-speech-recognition` ou `@react-native-voice`)
 * e um *development build* — Expo Go não carrega módulo nativo que não venha
 * embutido nele.
 *
 * Em vez de deixar o botão da LIA parecer quebrado, `suporteDeEscuta()` diz
 * exatamente o que falta, e a tela mostra isso. Um recurso que não existe
 * naquela plataforma é uma informação; um botão que não faz nada é um bug.
 *
 * ===========================================================================
 * AS ARESTAS DA API DO NAVEGADOR (todas custaram tempo de alguém)
 * ===========================================================================
 * 1. **Ela desliga sozinha.** Mesmo com `continuous = true`, o Chrome encerra a
 *    sessão depois de um tempo sem fala. Sem religar no `onend`, a LIA ficaria
 *    "ouvindo" em silêncio pelo resto da reunião. Daí o religamento automático
 *    — com trava anti-loop, porque religar num erro permanente vira um laço que
 *    trava a aba.
 * 2. **`no-speech` não é erro.** É o que ela devolve quando ninguém falou. Numa
 *    negociação, silêncio é metade do tempo.
 * 3. **Resultados chegam duas vezes.** Primeiro `isFinal = false` (o palpite,
 *    que muda enquanto a pessoa fala) e depois `isFinal = true`. Guardar os dois
 *    duplicaria a conversa inteira. Só o final entra na transcrição; o parcial
 *    serve para a tela mostrar que está viva.
 * 4. **`resultIndex`.** O evento traz a lista inteira desde o começo, não só o
 *    pedaço novo. Ignorar isso reprocessa tudo a cada palavra.
 * 5. **Permissão só é pedida com gesto do usuário.** Por isso `iniciar()` só
 *    pode ser chamado de dentro de um toque — nunca de um `useEffect`.
 */
import { Platform } from 'react-native';

export type SuporteEscuta = 'ok' | 'sem-api-no-navegador' | 'precisa-build-nativo';

/* -------------------------------------------------------------------------
 * Tipos mínimos da Web Speech API.
 * O `lib.dom` do TypeScript não declara `webkitSpeechRecognition`, e declarar
 * só o que se usa é melhor do que despejar `any` no meio do caminho.
 * ------------------------------------------------------------------------- */
interface ResultadoFala {
  readonly isFinal: boolean;
  readonly length: number;
  item(i: number): { transcript: string; confidence: number };
  [i: number]: { transcript: string; confidence: number };
}

interface EventoResultado {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [i: number]: ResultadoFala };
}

interface EventoErro {
  readonly error: string;
}

interface ReconhecimentoFala {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: EventoErro) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type ConstrutorReconhecimento = new () => ReconhecimentoFala;

function construtor(): ConstrutorReconhecimento | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecimento;
    webkitSpeechRecognition?: ConstrutorReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function suporteDeEscuta(): SuporteEscuta {
  if (Platform.OS !== 'web') return 'precisa-build-nativo';
  return construtor() ? 'ok' : 'sem-api-no-navegador';
}

export interface OpcoesEscuta {
  /** Chamado quando uma frase fecha. `texto` é só o pedaço novo. */
  aoFechar: (texto: string) => void;
  /** Chamado a cada palavra provisória. Serve para a tela mostrar vida. */
  aoOuvir: (parcial: string) => void;
  /**
   * Pausa curta: a frase acabou. Hora de interpretar.
   *
   * Separado da pausa longa de propósito. Interpretar é o que faz a LIA
   * parecer rápida, e esperar três segundos para começar a pensar é tempo
   * jogado fora — quando a próxima frase chegar, ela ainda estará processando
   * a anterior. A pausa curta manda ela trabalhar no vão entre as frases.
   */
  aoPausar: () => void;
  /**
   * Pausa longa: a conversa parou de verdade. Hora de cobrar o que falta.
   *
   * Cobrar na pausa curta seria pior que não cobrar: a lista apareceria e
   * sumiria a cada respiração, no canto do olho de quem está negociando.
   */
  aoSilenciar: () => void;
  /** Erro que interrompe a escuta de verdade (permissão, rede). */
  aoFalhar: (mensagem: string) => void;
  /** Pausa curta, em ms. */
  pausaMs: number;
  /** Pausa longa, em ms. */
  silencioMs: number;
}

export interface Escuta {
  iniciar: () => void;
  parar: () => void;
}

/**
 * Uma sessão que durou menos que isto não "funcionou": ela nasceu e morreu.
 *
 * É a régua que separa o religamento legítimo (o navegador encerrou depois de
 * um tempo de silêncio, e é para religar mesmo) da sessão natimorta, que se
 * repetida vira laço.
 */
const SESSAO_CURTA_MS = 1500;
const MAX_SESSOES_CURTAS = 5;

/**
 * Espera antes de religar, crescendo a cada sessão natimorta seguida.
 *
 * O primeiro valor não é zero de propósito: religar de dentro do `onend` sem
 * passar pela fila de eventos é exatamente o que travava a aba.
 */
const ESPERA_RELIGAR_MS = [120, 250, 500, 1000, 2000];

export function criarEscuta(opts: OpcoesEscuta): Escuta {
  const Reconhecimento = construtor();
  let rec: ReconhecimentoFala | null = null;
  let ativo = false;
  let timerPausa: ReturnType<typeof setTimeout> | null = null;
  let timerSilencio: ReturnType<typeof setTimeout> | null = null;
  let timerReligar: ReturnType<typeof setTimeout> | null = null;
  let sessaoIniciadaEm = 0;
  let sessoesCurtas = 0;

  function reiniciarTimerSilencio() {
    if (timerPausa) clearTimeout(timerPausa);
    if (timerSilencio) clearTimeout(timerSilencio);
    timerPausa = setTimeout(() => {
      if (ativo) opts.aoPausar();
    }, opts.pausaMs);
    timerSilencio = setTimeout(() => {
      if (ativo) opts.aoSilenciar();
    }, opts.silencioMs);
  }

  function pararTimer() {
    if (timerPausa) clearTimeout(timerPausa);
    timerPausa = null;
    if (timerSilencio) clearTimeout(timerSilencio);
    timerSilencio = null;
    if (timerReligar) clearTimeout(timerReligar);
    timerReligar = null;
  }

  function montar(): ReconhecimentoFala | null {
    if (!Reconhecimento) return null;
    const r = new Reconhecimento();
    r.lang = 'pt-BR';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => {
      sessaoIniciadaEm = Date.now();
      reiniciarTimerSilencio();
    };

    r.onresult = (e) => {
      let fechado = '';
      let parcial = '';
      // `resultIndex`: o evento traz a lista desde o começo da sessão.
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const resultado = e.results[i];
        if (!resultado) continue;
        const texto = resultado[0]?.transcript ?? '';
        if (resultado.isFinal) fechado += texto;
        else parcial += texto;
      }

      // Qualquer sinal de voz — inclusive provisório — adia o silêncio.
      if (fechado.trim() || parcial.trim()) reiniciarTimerSilencio();
      if (parcial.trim()) opts.aoOuvir(parcial.trim());
      if (fechado.trim()) {
        opts.aoOuvir('');
        opts.aoFechar(fechado.trim());
      }
    };

    r.onerror = (e) => {
      switch (e.error) {
        // Silêncio não é falha: numa negociação é metade do tempo.
        case 'no-speech':
        case 'aborted':
          return;
        case 'not-allowed':
        case 'service-not-allowed':
          ativo = false;
          pararTimer();
          opts.aoFalhar(
            'O navegador bloqueou o microfone. Libere o acesso na barra de endereço e comece de novo.',
          );
          return;
        case 'audio-capture':
          ativo = false;
          pararTimer();
          opts.aoFalhar('Nenhum microfone encontrado neste aparelho.');
          return;
        case 'network':
          opts.aoFalhar('A transcrição perdeu a conexão. Verifique a internet.');
          return;
        default:
          return;
      }
    };

    /*
     * ---------------------------------------------------------------------
     * O RELIGAMENTO — e o travamento que ele já causou
     * ---------------------------------------------------------------------
     * O navegador encerra a sessão sozinho depois de um tempo sem fala. Sem
     * religar, a LIA ficaria "ouvindo" em silêncio pelo resto da reunião. Só
     * que a primeira versão religava de dois jeitos errados, e juntos eles
     * TRAVAVAM O APLICATIVO INTEIRO:
     *
     *   1. `r.start()` era chamado DENTRO do `onend`, de forma síncrona. Se a
     *      sessão morresse logo ao nascer, o par end→start virava um laço que
     *      nunca devolvia o controle à fila de eventos — e um laço assim não
     *      trava só a LIA: o toque em "Encerrar" nunca chega a ser processado,
     *      porque não sobra volta de laço para processar toque nenhum. Era
     *      exatamente isso que dava a sensação de app travado.
     *
     *   2. A trava anti-laço era zerada no `onstart`. Como a sessão CHEGAVA a
     *      começar (e só então morria), o contador voltava a zero a cada
     *      volta e a proteção nunca disparava.
     *
     * A correção ataca as duas: religa sempre por `setTimeout` — o que basta
     * para o toque no botão passar na frente — e mede a DURAÇÃO da sessão em
     * vez de contar starts. Sessão que durou o bastante é sinal de que estava
     * funcionando; sessão natimorta repetida é o laço, e aí desiste com uma
     * mensagem em vez de queimar a aba.
     */
    r.onend = () => {
      if (!ativo) return;

      const durou = Date.now() - sessaoIniciadaEm;
      sessoesCurtas = durou < SESSAO_CURTA_MS ? sessoesCurtas + 1 : 0;

      if (sessoesCurtas >= MAX_SESSOES_CURTAS) {
        ativo = false;
        pararTimer();
        opts.aoFalhar(
          'A escuta não conseguiu se manter aberta. Verifique o microfone e comece de novo.',
        );
        return;
      }

      const espera = ESPERA_RELIGAR_MS[Math.min(sessoesCurtas, ESPERA_RELIGAR_MS.length - 1)]!;
      if (timerReligar) clearTimeout(timerReligar);
      timerReligar = setTimeout(() => {
        timerReligar = null;
        // `ativo` pode ter virado false enquanto esperávamos: quem encerrou
        // ganha, sempre.
        if (!ativo || rec !== r) return;
        try {
          r.start();
        } catch {
          // `InvalidStateError` acontece quando já está rodando: nada a fazer.
        }
      }, espera);
    };

    return r;
  }

  return {
    iniciar() {
      if (ativo) return;
      rec = montar();
      if (!rec) {
        opts.aoFalhar('Este navegador não transcreve fala.');
        return;
      }
      ativo = true;
      sessoesCurtas = 0;
      sessaoIniciadaEm = Date.now();
      try {
        rec.start();
      } catch {
        ativo = false;
        opts.aoFalhar('Não foi possível abrir o microfone.');
      }
    },

    parar() {
      ativo = false;
      pararTimer();
      if (!rec) return;
      // `abort` e não `stop`: `stop` ainda entrega o resultado pendente e
      // dispara `onend`, e aqui a intenção é encerrar de vez.
      try {
        rec.abort();
      } catch {
        /* já estava parado */
      }
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      rec = null;
    },
  };
}
