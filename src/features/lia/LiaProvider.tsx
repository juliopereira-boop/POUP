/**
 * A SESSÃO DA LIA.
 *
 * ===========================================================================
 * O CICLO, EM UMA FRASE
 * ===========================================================================
 * Ouve → junta o que foi dito → no primeiro silêncio, entende → mostra o que
 * capturou e o que falta → volta a ouvir.
 *
 * ===========================================================================
 * POR QUE O SILÊNCIO É O GATILHO
 * ===========================================================================
 * Chamar o modelo a cada palavra seria caro, lento e pior: metade das frases
 * chega pela metade, e uma frase pela metade produz um valor errado que depois
 * precisa ser desfeito na tela, piscando na cara do corretor.
 *
 * A pausa é o momento natural. Numa negociação ela significa "acabei de dizer
 * uma coisa" — que é exatamente quando vale a pena interpretar. E é o mesmo
 * instante em que o corretor tem atenção sobrando para olhar a tela e ver o que
 * ainda falta. Um gatilho, dois propósitos.
 *
 * ===========================================================================
 * POR QUE A CONVERSA INTEIRA VAI TODA VEZ
 * ===========================================================================
 * Porque negociação volta atrás: "na verdade são três e meio". Reinterpretar a
 * conversa inteira faz a correção se resolver sozinha — o estado devolvido é
 * sempre o FINAL. Um "patch" incremental precisaria de regras de retratação, e
 * elas errariam. Ver o comentário da Edge Function `lia-extract`.
 *
 * ===========================================================================
 * UMA CHAMADA POR VEZ, E A ÚLTIMA GANHA
 * ===========================================================================
 * A pessoa volta a falar enquanto a rodada anterior ainda está no ar. Se as
 * respostas voltassem fora de ordem, uma análise velha sobrescreveria uma nova
 * — e o corretor veria o valor corrigido virar de novo o valor antigo. Cada
 * rodada leva um número; resposta com número menor que a última aplicada é
 * descartada.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated } from 'react-native';

import { db } from '@/data';
import { useAuth } from '@/providers/AuthProvider';
import { sessionStorage } from '@/lib/storage';
import { PREFILL_KEY } from '@/features/simulador/SimuladorProvider';
import {
  CAMPOS_POR_CHAVE,
  CHAVES_ESSENCIAIS,
  exibirValor,
  paraSimulador,
  type CapturaBruta,
  type ContextoCatalogo,
} from './campos';
import { criarEscuta, suporteDeEscuta, type Escuta, type SuporteEscuta } from './escuta';
import { extrairDaConversa, type EmpreendimentoContexto } from './extrair';
import { temConsentimentoLia } from './consentimento';
import { medirVoz, type MedidorDeVoz } from './nivelDeVoz';

/**
 * DUAS PAUSAS, PORQUE SÃO DUAS COISAS DIFERENTES.
 *
 * `PAUSA_MS` — a frase acabou. É quando a LIA vai INTERPRETAR. Curta de
 * propósito: interpretar é o que a faz parecer rápida, e esperar três segundos
 * para começar a pensar significa ainda estar processando a frase anterior
 * quando a próxima chegar. Com 1,2 s ela trabalha no vão entre as frases, que
 * é tempo que já existia e estava sendo desperdiçado.
 *
 * `SILENCIO_MS` — a conversa parou de verdade. É quando ela COBRA o que falta.
 * Continua nos três segundos pedidos: cobrar a cada respiração faria a lista
 * piscar no canto do olho de quem está negociando.
 */
const PAUSA_MS = 1200;
const SILENCIO_MS = 3000;

/**
 * Piso entre duas chamadas ao modelo.
 *
 * Sem ele, uma conversa em frases curtas ("sim" · "certo" · "isso") dispararia
 * uma análise a cada segundo — e a conta de uma reunião de meia hora seria
 * absurda para uma informação que não mudou. Com 3,5 s, a LIA continua
 * respondendo dentro do mesmo assunto e o teto vira ~17 chamadas por minuto no
 * pior caso, não 50.
 */
const INTERVALO_MINIMO_MS = 3500;

export type StatusLia = 'desligada' | 'ouvindo' | 'entendendo' | 'erro';

export interface CampoCapturado {
  chave: string;
  /** O valor cru, como o modelo devolveu. É o que vai para o simulador. */
  valor: string;
  /**
   * O mesmo valor, legível para o corretor.
   *
   * Calculado aqui, e não na tela, porque só o provider tem o catálogo em mãos
   * — é ele que sabe que `dev-a1b2…` se chama "Connect". A tela não deveria
   * precisar carregar o catálogo só para escrever um rótulo.
   */
  exibicao: string;
  trecho: string;
  confianca: 'alta' | 'media' | 'baixa';
  /** Mudou em relação à rodada anterior — a negociação voltou atrás. */
  corrigido: boolean;
  /** Momento da última mudança. Serve para destacar o que é recente. */
  em: number;
}

interface LiaContextValue {
  suporte: SuporteEscuta;
  status: StatusLia;
  /** Tudo que já foi transcrito nesta sessão. */
  transcricao: string;
  /** A frase em andamento, ainda não fechada pelo reconhecimento. */
  parcial: string;
  capturados: Record<string, CampoCapturado>;
  /** Chaves essenciais ainda sem valor. É o que a tela cobra no silêncio. */
  faltando: string[];
  /** Aviso do modelo sobre algo que atrapalha (nome fora do catálogo etc.). */
  observacao: string | null;
  erro: string | null;
  /** Verdadeiro depois de uma pausa em que ainda faltava coisa essencial. */
  cobrando: boolean;
  /**
   * Volume da voz, de 0 a 1, para as animações.
   *
   * É um `Animated.Value` e não um número de estado porque ele muda ~60 vezes
   * por segundo: passar isso pelo React seriam 60 renderizações do aplicativo
   * inteiro a cada segundo de conversa.
   */
  nivelDeVoz: Animated.Value;

  iniciar: () => Promise<void>;
  encerrar: () => void;
  /** Força uma interpretação agora, sem esperar a pausa. */
  entenderAgora: () => void;
  /** Descarta um campo que a LIA entendeu errado. */
  descartar: (chave: string) => void;
  /**
   * Leva o que foi capturado para o simulador e encerra a sessão.
   *
   * Devolve `true` quando nada essencial ficou faltando — é o que decide se o
   * corretor cai direto no botão de gerar o PDF ou na primeira etapa.
   */
  levarParaSimulador: () => Promise<boolean>;
}

const LiaContext = createContext<LiaContextValue | undefined>(undefined);

export function LiaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [suporte] = useState<SuporteEscuta>(() => suporteDeEscuta());
  const [status, setStatus] = useState<StatusLia>('desligada');
  const [transcricao, setTranscricao] = useState('');
  const [parcial, setParcial] = useState('');
  const [capturados, setCapturados] = useState<Record<string, CampoCapturado>>({});
  const [observacao, setObservacao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const escutaRef = useRef<Escuta | null>(null);
  const medidorRef = useRef<MedidorDeVoz | null>(null);
  const nivelDeVozRef = useRef(new Animated.Value(0));
  /*
   * A transcrição vive TAMBÉM numa ref, e não é redundância.
   *
   * O callback da escuta é montado uma vez, na hora de iniciar, e viveria
   * eternamente enxergando o estado daquele instante — a conversa chegaria
   * sempre "vazia" para ele. A ref é a versão que o callback consegue ler.
   */
  const transcricaoRef = useRef('');
  const analisandoRef = useRef(false);
  /** A sessão está de pé? Ref porque callbacks antigos precisam consultá-la. */
  const sessaoAtivaRef = useRef(false);
  const rodadaRef = useRef(0);
  const ultimaAplicadaRef = useRef(0);
  /** Quando a última chamada ao modelo COMEÇOU. Base do intervalo mínimo. */
  const ultimaChamadaRef = useRef(0);
  const timerRefilaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Marca que chegou texto novo desde a última análise. */
  const pendenteRef = useRef(false);

  // Catálogo do corretor, carregado uma vez por sessão de escuta.
  const empreendimentosRef = useRef<EmpreendimentoContexto[]>([]);
  /** id → nome, para devolver nome onde o modelo devolveu id. */
  const nomesRef = useRef<Record<string, string>>({});
  const contextoRef = useRef<ContextoCatalogo>({
    empresaDoEmpreendimento: {},
    correspondentes: [],
  });

  const faltando = useMemo(
    () => CHAVES_ESSENCIAIS.filter((c) => !capturados[c]),
    [capturados],
  );

  /** Junta empresas, empreendimentos e correspondentes do corretor. */
  const carregarCatalogo = useCallback(async () => {
    if (!user) return;
    const [empresas, empreendimentos] = await Promise.all([
      db.companies.list(user.id),
      db.developments.list(user.id),
    ]);

    const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.name]));
    empreendimentosRef.current = empreendimentos.map((d) => ({
      id: d.id,
      nome: d.name,
      empresaNome: nomeEmpresa.get(d.companyId) ?? '',
    }));

    /*
     * Correspondentes de TODAS as empresas do corretor, não só da empresa já
     * escolhida — quando a LIA ouve o nome do correspondente, o empreendimento
     * pode ainda nem ter sido citado. A ordem da conversa é do cliente, não
     * nossa.
     */
    const listas = await Promise.all(empresas.map((e) => db.companies.listCorrespondents(e.id)));
    const correspondentes = listas.flat().map((c) => ({ id: c.id, nome: c.name }));
    contextoRef.current = {
      empresaDoEmpreendimento: Object.fromEntries(empreendimentos.map((d) => [d.id, d.companyId])),
      correspondentes,
    };
    nomesRef.current = Object.fromEntries([
      ...empreendimentos.map((d) => [d.id, d.name]),
      ...correspondentes.map((c) => [c.id, c.nome]),
    ]);
  }, [user]);

  const analisar = useCallback(async (forcado = false) => {
    const texto = transcricaoRef.current.trim();
    if (!texto) return;

    /*
     * Uma chamada por vez, e nunca mais rápido que o intervalo mínimo.
     *
     * Quando a vez ainda não chegou, a rodada NÃO é descartada: fica agendada
     * para o instante em que o intervalo fecha. Descartar faria a LIA "perder"
     * uma frase inteira até a próxima pausa; agendar faz ela responder assim
     * que pode. "Reler agora" (`forcado`) fura a fila, porque aí é o corretor
     * pedindo, e ele não deve esperar por uma regra de custo.
     */
    if (analisandoRef.current) {
      pendenteRef.current = true;
      return;
    }
    const desdeUltima = Date.now() - ultimaChamadaRef.current;
    if (!forcado && desdeUltima < INTERVALO_MINIMO_MS) {
      pendenteRef.current = true;
      if (!timerRefilaRef.current) {
        timerRefilaRef.current = setTimeout(() => {
          timerRefilaRef.current = null;
          if (sessaoAtivaRef.current && pendenteRef.current) void analisar();
        }, INTERVALO_MINIMO_MS - desdeUltima);
      }
      return;
    }

    analisandoRef.current = true;
    ultimaChamadaRef.current = Date.now();
    pendenteRef.current = false;
    rodadaRef.current += 1;
    const rodada = rodadaRef.current;

    // `sessaoAtivaRef`, e não o `status`: quem encerra a sessão mexe no estado,
    // e o estado que este callback enxerga é o do instante em que ele foi
    // criado. Sem a ref, encerrar durante uma análise deixaria a tela dizendo
    // "ouvindo" com o microfone já fechado.
    if (sessaoAtivaRef.current) setStatus('entendendo');

    const r = await extrairDaConversa(
      texto,
      empreendimentosRef.current,
      contextoRef.current.correspondentes,
    );

    analisandoRef.current = false;

    // Chegou depois de uma rodada mais nova: descarta. Aplicar isto agora
    // desfaria uma correção que o corretor já viu na tela.
    if (rodada < ultimaAplicadaRef.current) return;
    ultimaAplicadaRef.current = rodada;

    if ('erro' in r) {
      setErro(r.erro);
      if (sessaoAtivaRef.current) setStatus('ouvindo');
      return;
    }

    setErro(null);
    setObservacao(r.observacao);
    setCapturados((antes) => {
      const agora = Date.now();
      const novo: Record<string, CampoCapturado> = {};
      for (const c of r.campos) {
        if (!CAMPOS_POR_CHAVE[c.chave]) continue;
        const anterior = antes[c.chave];
        const mudou = !!anterior && anterior.valor !== c.valor;
        novo[c.chave] = {
          chave: c.chave,
          valor: c.valor,
          exibicao: exibirValor(c.chave, c.valor, nomesRef.current),
          trecho: c.trecho,
          confianca: c.confianca,
          corrigido: mudou,
          // Campo inalterado mantém o horário antigo: só o que mexeu é "novo".
          em: anterior && !mudou ? anterior.em : agora,
        };
      }
      return novo;
    });

    if (sessaoAtivaRef.current) setStatus('ouvindo');

    /*
     * Chegou fala nova durante a chamada: reanalisa — mas SEMPRE passando pelo
     * intervalo mínimo lá em cima.
     *
     * A primeira versão reanalisava sem esse freio, e o efeito era desfazer o
     * desenho inteiro: numa conversa corrida sempre chega texto novo durante a
     * análise, então cada resposta disparava outra chamada e o gatilho deixava
     * de ser a pausa para virar um laço contínuo. Com o freio, a LIA
     * acompanha a conversa sem que o custo cresça com a duração da reunião.
     */
    if (sessaoAtivaRef.current && pendenteRef.current) void analisar();
  }, []);

  const iniciar = useCallback(async () => {
    if (suporte !== 'ok') return;
    if (!(await temConsentimentoLia())) return;

    // Dois toques em "Começar a ouvir" deixariam dois reconhecedores vivos, e
    // o segundo sobrescreveria a referência do primeiro — que ficaria com o
    // microfone aberto, sem ninguém capaz de fechá-lo.
    escutaRef.current?.parar();
    escutaRef.current = null;

    setErro(null);
    setObservacao(null);
    setCobrando(false);
    sessaoAtivaRef.current = true;
    setStatus('ouvindo');

    await carregarCatalogo();

    const escuta = criarEscuta({
      pausaMs: PAUSA_MS,
      silencioMs: SILENCIO_MS,
      aoOuvir: (p) => setParcial(p),
      aoFechar: (texto) => {
        transcricaoRef.current = `${transcricaoRef.current} ${texto}`.trim();
        setTranscricao(transcricaoRef.current);
        pendenteRef.current = true;
        // Voltou a falar: some a cobrança, como pedido.
        setCobrando(false);
      },
      // Frase fechada: pensa já, sem esperar a conversa parar.
      aoPausar: () => {
        if (pendenteRef.current) void analisar();
      },
      // Conversa parada: aí sim mostra o que ainda falta perguntar.
      aoSilenciar: () => {
        if (pendenteRef.current) void analisar();
        setCobrando(true);
      },
      aoFalhar: (mensagem) => {
        sessaoAtivaRef.current = false;
        setErro(mensagem);
        setStatus('erro');
      },
    });

    escutaRef.current = escuta;
    escuta.iniciar();

    /*
     * O medidor de volume é ENFEITE, e por isso vem por último e sem travar
     * nada: se ele falhar (permissão, navegador sem Web Audio), o orbe cai na
     * animação por ritmo e a escuta segue igual. Uma animação nunca pode
     * derrubar a funcionalidade.
     */
    void medirVoz((n) => nivelDeVozRef.current.setValue(n)).then((m) => {
      // A sessão pode ter sido encerrada enquanto a permissão era resolvida.
      if (!sessaoAtivaRef.current) {
        m?.parar();
        return;
      }
      medidorRef.current = m;
    });
  }, [analisar, carregarCatalogo, suporte]);

  const encerrar = useCallback(() => {
    sessaoAtivaRef.current = false;
    escutaRef.current?.parar();
    escutaRef.current = null;
    // Sem isto, a luz do microfone fica acesa depois de encerrar a LIA.
    medidorRef.current?.parar();
    medidorRef.current = null;
    if (timerRefilaRef.current) clearTimeout(timerRefilaRef.current);
    timerRefilaRef.current = null;
    pendenteRef.current = false;
    setStatus('desligada');
    setParcial('');
    setCobrando(false);
  }, []);

  const entenderAgora = useCallback(() => {
    pendenteRef.current = true;
    void analisar(true);
  }, [analisar]);

  const descartar = useCallback((chave: string) => {
    setCapturados((antes) => {
      const resto = { ...antes };
      delete resto[chave];
      return resto;
    });
  }, []);

  const levarParaSimulador = useCallback(async (): Promise<boolean> => {
    const completo = faltando.length === 0;
    const bruto: CapturaBruta = Object.fromEntries(
      Object.values(capturados).map((c) => [c.chave, c.valor]),
    );
    const estado = paraSimulador(bruto, contextoRef.current);
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ estado }));
    encerrar();
    // A transcrição não sobrevive à entrega: ela contém nome, CPF e renda de
    // uma pessoa que não é o usuário do app.
    transcricaoRef.current = '';
    setTranscricao('');
    setCapturados({});
    return completo;
  }, [capturados, encerrar, faltando.length]);

  // Sair da conta com o microfone aberto não é aceitável.
  useEffect(() => {
    if (!user && escutaRef.current) encerrar();
  }, [user, encerrar]);

  // Desmontar sem soltar o microfone deixaria a luz do aparelho acesa.
  useEffect(
    () => () => {
      escutaRef.current?.parar();
      medidorRef.current?.parar();
    },
    [],
  );

  const value = useMemo<LiaContextValue>(
    () => ({
      suporte,
      status,
      transcricao,
      parcial,
      capturados,
      faltando,
      observacao,
      erro,
      cobrando,
      nivelDeVoz: nivelDeVozRef.current,
      iniciar,
      encerrar,
      entenderAgora,
      descartar,
      levarParaSimulador,
    }),
    [
      suporte,
      status,
      transcricao,
      parcial,
      capturados,
      faltando,
      observacao,
      erro,
      cobrando,
      iniciar,
      encerrar,
      entenderAgora,
      descartar,
      levarParaSimulador,
    ],
  );

  return <LiaContext.Provider value={value}>{children}</LiaContext.Provider>;
}

export function useLia(): LiaContextValue {
  const ctx = useContext(LiaContext);
  if (!ctx) throw new Error('useLia deve ser usado dentro de <LiaProvider>.');
  return ctx;
}
