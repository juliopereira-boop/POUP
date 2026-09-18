/** Sessão de simulação por texto: nenhum acesso ao microfone. */
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
import { extrair, type CampoOuvido } from './extrair';
import { temConsentimentoLia, aoRevogarConsentimentoLia } from './consentimento';

export type StatusLia = 'desligada' | 'pronta' | 'entendendo' | 'erro';
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
  status: StatusLia;
  capturados: Record<string, CampoCapturado>;
  faltando: string[];
  observacao: string | null;
  erro: string | null;
  enviarTexto: (texto: string) => Promise<boolean>;
  encerrar: () => void;
  descartar: (chave: string) => void;
  levarParaSimulador: () => Promise<boolean | null>;
}
const LiaContext = createContext<LiaContextValue | undefined>(undefined);
export function LiaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<StatusLia>('desligada');
  const [capturados, setCapturados] = useState<Record<string, CampoCapturado>>({});
  const [observacao, setObservacao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const capturadosRef = useRef<Record<string, CampoCapturado>>({});
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
    empreendimentosRef.current = [];
    nomesRef.current = {};
    contextoRef.current = { empresaDoEmpreendimento: {}, correspondentes: [] };
    setCapturados({});
    setObservacao(null);
    setErro(null);
    setStatus('desligada');
  }, []);
  useEffect(() => {
    encerrar();
    return encerrar;
  }, [user?.id, encerrar]);
  useEffect(() => aoRevogarConsentimentoLia(encerrar), [encerrar]);
  const resolverReferencias = useCallback(
    (campos: CampoOuvido[]): { campos: CampoOuvido[]; avisos: string[] } => {
      const avisos: string[] = [];
      const resolvidos: CampoOuvido[] = [];

      for (const c of campos) {
        const tipo = CAMPOS_POR_CHAVE[c.chave]?.tipo;
        if (tipo !== 'empreendimento' && tipo !== 'correspondente') {
          resolvidos.push(c);
          continue;
        }
        // Já é um id do catálogo? Acontece quando o valor veio do estado de uma
        // rodada anterior; não faz sentido tentar casar o UUID por som.
        if (nomesRef.current[c.valor]) {
          resolvidos.push(c);
          continue;
        }
        const itens =
          tipo === 'empreendimento'
            ? empreendimentosRef.current
            : contextoRef.current.correspondentes;
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
        if (!(await temConsentimentoLia()) || !atual()) return false;
        setStatus('entendendo');
        setErro(null);
        const [empresas, devs] = await Promise.all([
          db.companies.list(uid),
          db.developments.list(uid),
        ]);
        const listas = await Promise.all(
          empresas.map((e) => db.companies.listCorrespondents(e.id)),
        );
        if (!atual() || !(await temConsentimentoLia())) return false;
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
        const estado = Object.fromEntries(
          Object.values(capturadosRef.current).map((c) => [
            c.chave,
            nomesRef.current[c.valor] ?? c.valor,
          ]),
        );
        const r = await extrair({
          modo: 'final',
          antes: '',
          agora: mensagem,
          estado,
          empreendimentos: devs.map((d) => d.name),
          correspondentes: correspondentes.map((c) => c.nome),
        });
        if (!atual() || !(await temConsentimentoLia())) return false;
        if ('erro' in r) {
          setErro(r.erro);
          setStatus('erro');
          return false;
        }
        const { campos, avisos } = resolverReferencias(r.campos);
        const novo = { ...capturadosRef.current };
        for (const chave of r.remover) delete novo[chave];
        for (const c of campos) {
          if (!CAMPOS_POR_CHAVE[c.chave]) continue;
          novo[c.chave] = {
            ...c,
            exibicao: exibirValor(c.chave, c.valor, nomesRef.current),
            corrigido: !!novo[c.chave] && novo[c.chave].valor !== c.valor,
            em: Date.now(),
          };
        }
        capturadosRef.current = novo;
        setCapturados(novo);
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
    if (ocupado.current || !(await temConsentimentoLia()) || !owner.current) return null;
    const atual = capturadosRef.current;
    if (!Object.keys(atual).length) return null;
    const bruto: CapturaBruta = Object.fromEntries(
      Object.values(atual).map((c) => [c.chave, c.valor]),
    );
    const estado = paraSimulador(bruto, contextoRef.current);
    await sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ estado }));
    const completo = CHAVES_ESSENCIAIS.every((c) => atual[c]);
    encerrar();
    return completo;
  }, [encerrar]);
  const faltando = useMemo(() => CHAVES_ESSENCIAIS.filter((c) => !capturados[c]), [capturados]);
  return (
    <LiaContext.Provider
      value={{
        status,
        capturados,
        faltando,
        observacao,
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
