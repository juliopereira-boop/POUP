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
 * ESTADO + TRECHO NOVO, E UM FECHO QUE RELÊ TUDO
 * ===========================================================================
 * As rodadas parciais mandam o ESTADO já capturado e só o PEDAÇO NOVO da
 * conversa. A correção continua funcionando justamente por causa do estado: o
 * modelo vê `clienteRenda: 2800`, ouve "na verdade são três e meio", e corrige.
 * Não é preciso reler a conversa para isso.
 *
 * A primeira versão reenviava a conversa inteira a cada rodada. Funcionava, e
 * custava US$ 2,13 por simulação — mais que a mensalidade do corretor. Hoje o
 * custo é linear na duração da reunião, não quadrático.
 *
 * O que segura a qualidade é o FECHO: antes de gerar o PDF, a conversa inteira
 * é relida pelo modelo bom, sem filtro nenhum. As rodadas parciais são para a
 * tela acompanhar; nenhuma delas decide o que o cliente assina.
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
import { extrair, type EmpreendimentoContexto, type ModoExtracao } from './extrair';
import { valeAnalisar } from './gatilho';
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
 * Foi de 3,5 s para 12 s, e é uma decisão de CUSTO com efeito pequeno na
 * experiência. A 3,5 s, uma negociação de dez minutos custava mais que a
 * mensalidade do corretor. A 12 s, o corretor vê os cards aparecerem em blocos
 * um pouco maiores — e não perde nada, porque a cobrança do que falta continua
 * saindo nos 3 s de silêncio (que é quando ele olha a tela) e o fecho relê a
 * conversa inteira antes de gerar o PDF.
 *
 * Uma janela maior ainda ajuda a qualidade: o modelo recebe uma frase inteira
 * em vez de meia.
 */
const INTERVALO_MINIMO_MS = 12000;

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
  /**
   * O que foi falado DESDE a última análise.
   *
   * É isto que vai ao modelo nas rodadas parciais, em vez da conversa inteira.
   * A `transcricaoRef` continua existindo, completa, para o fecho — e é ela
   * que garante que nada se perde: mesmo que uma rodada parcial erre ou seja
   * pulada pelo gatilho, a releitura final vê tudo.
   */
  const trechoNovoRef = useRef('');
  /**
   * Espelho de `capturados` legível pelo callback da análise.
   *
   * `analisar` é criado uma vez (dependências vazias, de propósito — ele é
   * chamado de dentro dos callbacks da escuta, que também são criados uma vez).
   * Sem o espelho, ele mandaria ao modelo o estado do primeiro instante e o
   * modelo reenviaria campos que já tínhamos, rodada após rodada.
   */
  const capturadosRef = useRef<Record<string, CampoCapturado>>({});
  /** Soma do que a sessão gastou, para medir custo real em vez de estimar. */
  const usoRef = useRef({ entrada: 0, cacheEscrita: 0, cacheLeitura: 0, saida: 0, chamadas: 0 });

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

  const analisar = useCallback(async (modo: ModoExtracao = 'parcial') => {
    const fecho = modo === 'final';
    const conversa = fecho ? transcricaoRef.current.trim() : trechoNovoRef.current.trim();
    if (!conversa) return;

    /*
     * O FILTRO MAIS BARATO QUE EXISTE.
     *
     * Boa parte do que o microfone capta não tem nenhum dado da simulação:
     * cumprimento, trânsito, "pois é", o corretor explicando como funciona o
     * financiamento. Mandar isso ao modelo custa e devolve lista vazia.
     *
     * O fecho NUNCA passa por aqui: quando o corretor manda gerar a proposta,
     * a conversa inteira é relida sem filtro. Assim, um trecho que este gatilho
     * tenha descartado por engano volta a ser visto antes de virar PDF.
     */
    if (!fecho && !valeAnalisar(conversa)) {
      trechoNovoRef.current = '';
      pendenteRef.current = false;
      return;
    }

    /*
     * Uma chamada por vez, e nunca mais rápido que o intervalo mínimo.
     *
     * Quando a vez ainda não chegou, a rodada NÃO é descartada: fica agendada
     * para o instante em que o intervalo fecha. Descartar faria a LIA "perder"
     * uma frase inteira até a próxima pausa. O fecho fura a fila, porque aí é o
     * corretor pedindo, e ele não deve esperar por uma regra de custo.
     */
    if (analisandoRef.current) {
      pendenteRef.current = true;
      return;
    }
    const desdeUltima = Date.now() - ultimaChamadaRef.current;
    if (!fecho && desdeUltima < INTERVALO_MINIMO_MS) {
      pendenteRef.current = true;
      if (!timerRefilaRef.current) {
        timerRefilaRef.current = setTimeout(() => {
          timerRefilaRef.current = null;
          if (sessaoAtivaRef.current && pendenteRef.current) void analisar('parcial');
        }, INTERVALO_MINIMO_MS - desdeUltima);
      }
      return;
    }

    analisandoRef.current = true;
    ultimaChamadaRef.current = Date.now();
    pendenteRef.current = false;
    // Esvazia JÁ: o que chegar durante a chamada é o trecho da PRÓXIMA rodada.
    // Esvaziar depois perderia tudo que foi falado enquanto o modelo pensava.
    if (!fecho) trechoNovoRef.current = '';
    rodadaRef.current += 1;
    const rodada = rodadaRef.current;

    // `sessaoAtivaRef`, e não o `status`: quem encerra a sessão mexe no estado,
    // e o estado que este callback enxerga é o do instante em que ele foi
    // criado. Sem a ref, encerrar durante uma análise deixaria a tela dizendo
    // "ouvindo" com o microfone já fechado.
    if (sessaoAtivaRef.current) setStatus('entendendo');

    // O estado vai SEM os trechos: o modelo só precisa saber o que já tem para
    // decidir o que mudou. Os trechos são da tela, e mandá-los dobraria o
    // tamanho do estado a cada rodada sem servir para nada.
    const estado = Object.fromEntries(
      Object.values(capturadosRef.current).map((c) => [c.chave, c.valor]),
    );

    const r = await extrair({
      modo,
      conversa,
      estado,
      empreendimentos: empreendimentosRef.current,
      correspondentes: contextoRef.current.correspondentes,
    });

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

    if (r.uso) {
      const u = usoRef.current;
      u.entrada += r.uso.entrada;
      u.cacheEscrita += r.uso.cacheEscrita;
      u.cacheLeitura += r.uso.cacheLeitura;
      u.saida += r.uso.saida;
      u.chamadas += 1;
    }

    setErro(null);
    setObservacao(r.observacao);

    /*
     * FUSÃO, não substituição.
     *
     * A resposta traz só o que mudou, então o que já estava capturado
     * permanece. É o outro lado da economia: sem a fusão, cada rodada teria de
     * pedir ao modelo que repetisse os catorze campos para não perder nenhum.
     */
    setCapturados((antes) => {
      const agora = Date.now();
      const novo = { ...antes };
      for (const chave of r.remover) delete novo[chave];
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
          em: agora,
        };
      }
      capturadosRef.current = novo;
      return novo;
    });

    if (sessaoAtivaRef.current) setStatus('ouvindo');

    // Chegou fala nova durante a chamada: reanalisa — passando pelo intervalo
    // mínimo lá em cima, que é o que impede o laço contínuo.
    if (sessaoAtivaRef.current && pendenteRef.current) void analisar('parcial');
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
    transcricaoRef.current = '';
    trechoNovoRef.current = '';
    capturadosRef.current = {};
    usoRef.current = { entrada: 0, cacheEscrita: 0, cacheLeitura: 0, saida: 0, chamadas: 0 };
    setTranscricao('');
    setCapturados({});
    setStatus('ouvindo');

    await carregarCatalogo();

    const escuta = criarEscuta({
      pausaMs: PAUSA_MS,
      silencioMs: SILENCIO_MS,
      aoOuvir: (p) => setParcial(p),
      aoFechar: (texto) => {
        transcricaoRef.current = `${transcricaoRef.current} ${texto}`.trim();
        trechoNovoRef.current = `${trechoNovoRef.current} ${texto}`.trim();
        setTranscricao(transcricaoRef.current);
        pendenteRef.current = true;
        // Voltou a falar: some a cobrança, como pedido.
        setCobrando(false);
      },
      // Frase fechada: pensa já, sem esperar a conversa parar.
      aoPausar: () => {
        if (pendenteRef.current) void analisar('parcial');
      },
      // Conversa parada: aí sim mostra o que ainda falta perguntar.
      aoSilenciar: () => {
        if (pendenteRef.current) void analisar('parcial');
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

  /**
   * "Reler agora" é um FECHO, não uma rodada parcial.
   *
   * Quando o corretor pede explicitamente, ele quer a melhor leitura possível —
   * conversa inteira, modelo bom. É a mesma passada que roda antes de gerar o
   * PDF, e é de propósito: assim ele consegue conferir o resultado definitivo
   * antes de sair da tela.
   */
  const entenderAgora = useCallback(() => {
    void analisar('final');
  }, [analisar]);

  const descartar = useCallback((chave: string) => {
    setCapturados((antes) => {
      const resto = { ...antes };
      delete resto[chave];
      capturadosRef.current = resto;
      return resto;
    });
  }, []);

  const levarParaSimulador = useCallback(async (): Promise<boolean> => {
    /*
     * O FECHO ACONTECE AQUI, E É O QUE DECIDE A PROPOSTA.
     *
     * Antes de entregar, a conversa INTEIRA é relida pelo modelo bom. As
     * rodadas parciais existiram para a tela acompanhar — rápidas, baratas e
     * vendo só um pedaço de cada vez. Nenhuma delas tem autoridade sobre o que
     * o cliente vai assinar.
     *
     * É também a rede que segura os dois atalhos de custo: um trecho que o
     * gatilho local descartou por engano, ou um campo que o modelo barato
     * deixou passar, reaparecem aqui — porque aqui nada é filtrado.
     */
    await analisar('final');

    // `capturadosRef`, e não `capturados`: o estado do React ainda não
    // atualizou quando esta linha roda, e o que vale é o resultado do fecho.
    const atual = capturadosRef.current;
    const completo = CHAVES_ESSENCIAIS.every((c) => atual[c]);

    const bruto: CapturaBruta = Object.fromEntries(
      Object.values(atual).map((c) => [c.chave, c.valor]),
    );
    const estado = paraSimulador(bruto, contextoRef.current);
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ estado }));
    encerrar();
    // A transcrição não sobrevive à entrega: ela contém nome, CPF e renda de
    // uma pessoa que não é o usuário do app.
    transcricaoRef.current = '';
    trechoNovoRef.current = '';
    capturadosRef.current = {};
    setTranscricao('');
    setCapturados({});
    return completo;
  }, [analisar, encerrar]);

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
