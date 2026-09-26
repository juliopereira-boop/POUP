/**
 * A SESSÃO DA LIA — texto digitado, entendido no próprio aparelho.
 *
 * O cérebro (`cerebro/campos.ts`) lê o texto; este provider junta o que já foi
 * capturado, carrega o cadastro que o cérebro precisa (empreendimentos,
 * correspondentes e a carteira de clientes) e acrescenta o que só dá para
 * saber consultando o banco:
 *
 *   - o PREÇO da unidade, pela tabela de preço, quando o texto traz
 *     empreendimento + bloco + unidade e não traz o valor (`precoDaTabela.ts`);
 *   - a PRÓXIMA PERGUNTA: o primeiro campo essencial que falta vira pergunta,
 *     e a resposta curta que vier em seguida ("3.500") vai para ele.
 *
 * Nenhum acesso ao microfone e nenhum envio a serviço de IA.
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
import { resolverDoCatalogo, type ItemCatalogo } from './catalogo';
import { perguntaPara, type ClienteDoCadastro } from './cerebro/campos';
import { extrair, type CampoOuvido } from './extrair';
import { precoPelaTabela } from './precoDaTabela';

export type StatusLia = 'desligada' | 'pronta' | 'entendendo' | 'erro';
export interface CampoCapturado {
  chave: string;
  /** O valor cru. É o que vai para o simulador. */
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
  status: StatusLia;
  capturados: Record<string, CampoCapturado>;
  faltando: string[];
  observacao: string | null;
  /** O que a LIA está perguntando agora ("Qual a renda bruta do cliente?"). */
  pergunta: string | null;
  erro: string | null;
  enviarTexto: (texto: string) => Promise<boolean>;
  encerrar: () => void;
  descartar: (chave: string) => void;
  levarParaSimulador: () => Promise<boolean | null>;
}
const LiaContext = createContext<LiaContextValue | undefined>(undefined);

/** A ordem em que a LIA pergunta o que falta: do imóvel ao pagamento. */
const ORDEM_DAS_PERGUNTAS = [
  'clienteNome', 'empreendimento', 'bloco', 'unidade', 'valorUnidade', 'clienteRenda', 'financiamentoAprovado',
  'ato', 'atoDataVencimento', 'mensaisQuantidade', 'mensalDiaVencimento', 'clienteCpf', 'clienteTelefone',
  'correspondente',
];

export function LiaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusLia>('desligada');
  const [capturados, setCapturados] = useState<Record<string, CampoCapturado>>({});
  const [observacao, setObservacao] = useState<string | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const capturadosRef = useRef<Record<string, CampoCapturado>>({});
  const pendenteRef = useRef<string | null>(null);
  const empreendimentosRef = useRef<ItemCatalogo[]>([]);
  const nomesRef = useRef<Record<string, string>>({});
  const contextoRef = useRef<ContextoCatalogo>({
    empresaDoEmpreendimento: {},
    correspondentes: [],
  });
  const geracao = useRef(0);
  const ocupado = useRef(false);
  const owner = useRef(user?.id);
  owner.current = user?.id;

  const encerrar = useCallback(() => {
    geracao.current += 1;
    ocupado.current = false;
    capturadosRef.current = {};
    pendenteRef.current = null;
    empreendimentosRef.current = [];
    nomesRef.current = {};
    contextoRef.current = { empresaDoEmpreendimento: {}, correspondentes: [] };
    setCapturados({});
    setObservacao(null);
    setPendente(null);
    setErro(null);
    setStatus('desligada');
  }, []);
  useEffect(() => {
    encerrar();
    return encerrar;
  }, [user?.id, encerrar]);

  /** Valores que ainda vierem como nome (e não id) são casados com o cadastro. */
  const resolverReferencias = useCallback(
    (campos: CampoOuvido[]): { campos: CampoOuvido[]; avisos: string[] } => {
      const avisos: string[] = [];
      const resolvidos: CampoOuvido[] = [];
      for (const c of campos) {
        const tipo = CAMPOS_POR_CHAVE[c.chave]?.tipo;
        if ((tipo !== 'empreendimento' && tipo !== 'correspondente') || nomesRef.current[c.valor]) {
          resolvidos.push(c);
          continue;
        }
        const itens = tipo === 'empreendimento' ? empreendimentosRef.current : contextoRef.current.correspondentes;
        const { id, aviso } = resolverDoCatalogo(c.valor, itens);
        if (id) resolvidos.push({ ...c, valor: id });
        else if (aviso) avisos.push(aviso);
      }
      return { campos: resolvidos, avisos };
    },
    [],
  );

  const enviarTexto = useCallback(
    async (texto: string): Promise<boolean> => {
      const mensagem = texto.trim();
      if (!user || !mensagem || ocupado.current) return false;
      ocupado.current = true;
      const sessao = geracao.current;
      const uid = user.id;
      const atual = () => sessao === geracao.current && owner.current === uid;
      try {
        setStatus('entendendo');
        setErro(null);
        const [empresas, devs, leads] = await Promise.all([
          db.companies.list(uid),
          db.developments.list(uid),
          db.leads.list(uid).catch(() => []),
        ]);
        const listas = await Promise.all(empresas.map((e) => db.companies.listCorrespondents(e.id)));
        if (!atual()) return false;
        const correspondentes = listas.flat().map((c) => ({ id: c.id, nome: c.name }));
        empreendimentosRef.current = devs.map((d) => ({ id: d.id, nome: d.name }));
        contextoRef.current = {
          empresaDoEmpreendimento: Object.fromEntries(devs.map((d) => [d.id, d.companyId])),
          correspondentes,
        };
        nomesRef.current = Object.fromEntries([
          ...devs.map((d) => [d.id, d.name]),
          ...correspondentes.map((c) => [c.id, c.nome]),
        ]);
        const clientes: ClienteDoCadastro[] = leads.map((l) => ({
          id: l.id,
          nome: l.name,
          cpf: l.cpf,
          telefone: l.phone,
          email: l.email,
          renda: l.income,
        }));
        const estado = Object.fromEntries(Object.values(capturadosRef.current).map((c) => [c.chave, c.valor]));

        const r = await extrair({
          texto: mensagem,
          estado,
          empreendimentos: empreendimentosRef.current,
          correspondentes,
          clientes,
          pendente: pendenteRef.current,
        });
        if (!atual()) return false;
        if ('erro' in r) {
          setErro(r.erro);
          setStatus('erro');
          return false;
        }

        const { campos, avisos } = resolverReferencias(r.campos);
        const novo = { ...capturadosRef.current };
        for (const chave of r.remover) delete novo[chave];
        const gravar = (c: CampoOuvido) => {
          if (!CAMPOS_POR_CHAVE[c.chave]) return;
          novo[c.chave] = {
            ...c,
            exibicao: exibirValor(c.chave, c.valor, nomesRef.current),
            corrigido: !!novo[c.chave] && novo[c.chave].valor !== c.valor,
            em: Date.now(),
          };
        };
        campos.forEach(gravar);

        // Empreendimento + bloco + unidade sem valor: a tabela de preço sabe.
        const mudouUnidade = campos.some((c) => ['empreendimento', 'bloco', 'unidade'].includes(c.chave));
        if (mudouUnidade && novo.empreendimento && novo.bloco && novo.unidade && !campos.some((c) => c.chave === 'valorUnidade')) {
          const preco = await precoPelaTabela(novo.empreendimento.valor, novo.bloco.valor, novo.unidade.valor);
          if (!atual()) return false;
          if (preco) {
            gravar({
              chave: 'valorUnidade',
              valor: String(preco.venda),
              trecho: `tabela de preço${preco.referencia ? ` (${preco.referencia})` : ''}`,
              confianca: 'alta',
            });
          }
        }

        capturadosRef.current = novo;
        setCapturados(novo);

        // A próxima pergunta: o primeiro essencial que ainda falta.
        const proximo = ORDEM_DAS_PERGUNTAS.find((c) => CHAVES_ESSENCIAIS.includes(c) && !novo[c]) ?? null;
        pendenteRef.current = proximo;
        setPendente(proximo);
        setObservacao([r.observacao, ...avisos].filter(Boolean).join(' ') || null);
        setStatus('pronta');
        return true;
      } catch {
        if (atual()) {
          setErro('Não foi possível analisar o texto. Tente novamente.');
          setStatus('erro');
        }
        return false;
      } finally {
        if (atual()) ocupado.current = false;
      }
    },
    [user, resolverReferencias],
  );
  const descartar = useCallback((chave: string) => {
    const novo = { ...capturadosRef.current };
    delete novo[chave];
    capturadosRef.current = novo;
    setCapturados(novo);
  }, []);
  const levarParaSimulador = useCallback(async () => {
    if (ocupado.current || !owner.current) return null;
    const atual = capturadosRef.current;
    if (!Object.keys(atual).length) return null;
    const bruto: CapturaBruta = Object.fromEntries(Object.values(atual).map((c) => [c.chave, c.valor]));
    const estado = paraSimulador(bruto, contextoRef.current);
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ estado }));
    const completo = CHAVES_ESSENCIAIS.every((c) => atual[c]);
    encerrar();
    return completo;
  }, [encerrar]);
  const faltando = useMemo(() => CHAVES_ESSENCIAIS.filter((c) => !capturados[c]), [capturados]);
  const pergunta = pendente && Object.keys(capturados).length > 0 ? perguntaPara(pendente) : null;
  return (
    <LiaContext.Provider
      value={{
        status,
        capturados,
        faltando,
        observacao,
        pergunta,
        erro,
        enviarTexto,
        encerrar,
        descartar,
        levarParaSimulador,
      }}
    >
      {children}
    </LiaContext.Provider>
  );
}
export function useLia(): LiaContextValue {
  const ctx = useContext(LiaContext);
  if (!ctx) throw new Error('useLia deve ser usado dentro de <LiaProvider>.');
  return ctx;
}
