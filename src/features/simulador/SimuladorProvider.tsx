import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useGlobalSearchParams } from 'expo-router';

import { LoadingScreen } from '@/components/Loading';
import { sessionStorage } from '@/lib/storage';

/** Um proponente (comprador) da simulação. */
export interface Proponent {
  name: string;
  cpf: string;
  email: string;
  contact: string;
  /** Renda bruta (mascarada em R$). */
  rendaBruta: string;
}

/** Tipo de associação do 2º proponente com o 1º. */
export type AssociationType = 'conjuge' | 'parente' | 'fiador' | 'socio';

export const ASSOCIATION_OPTIONS: { value: AssociationType; label: string }[] = [
  { value: 'conjuge', label: 'Cônjuge' },
  { value: 'parente', label: 'Parente' },
  { value: 'fiador', label: 'Fiador' },
  { value: 'socio', label: 'Sócio' },
];

export function emptyProponent(): Proponent {
  return { name: '', cpf: '', email: '', contact: '', rendaBruta: '' };
}

/**
 * Estado do fluxo do Simulador de poupança, compartilhado entre as páginas
 * do wizard (empreendimento → corretor → cliente → financiamento). Vive no
 * _layout e é PERSISTIDO em disco a cada mudança — se o navegador/app for
 * recarregado (troca de app, app em segundo plano descartado pelo sistema
 * etc.), o progresso é restaurado automaticamente em vez de se perder.
 */
export interface SimuladorState {
  companyId: string | null;
  developmentId: string | null;
  /** Bloco/Quadra (0 a 100). */
  block: number;
  /** Unidade (digitada). */
  unit: string;
  /** Valor da unidade (mascarado em R$). */
  unitValue: string;
  /** Risco da poupança (%) da empresa selecionada (do cadastro). */
  companyRisk: number | null;
  /** Regras de negócio da empresa (limites). */
  companyMaxInstallments: number | null;
  companyMaxSemiannual: number | null;
  companyMaxAnnual: number | null;
  companyCoincide: boolean;
  /** Correspondente selecionado (da empresa). */
  correspondentId: string | null;
  correspondentName: string | null;
  /** 1º proponente. */
  proponent1: Proponent;
  /** Se há um 2º proponente. */
  hasSecondProponent: boolean;
  /** Tipo de associação do 2º proponente. */
  association: AssociationType | null;
  /** 2º proponente. */
  proponent2: Proponent;

  // --- Valores de financiamento ---
  /** Financiamento aprovado (mascarado em R$). */
  financingApproved: string;
  /** Subsídio aprovado (mascarado em R$). */
  subsidy: string;
  /** FGTS (mascarado em R$). */
  fgts: string;
  /** Cupom: tipo de desconto ('R$' fixo ou '%' sobre o valor da unidade). */
  couponType: 'R$' | '%' | null;
  /** Valor do cupom (mascarado conforme o tipo). */
  couponValue: string;
  /** Se o usuário já viu o aviso de validação do cupom. */
  couponWarningSeen: boolean;

  // --- Taxa CEF ---
  /** Cliente paga a taxa CEF? (sim = verde). */
  cefClientPays: boolean;
  /** Parcelar a taxa CEF? */
  cefInstallment: boolean;
  /** Quantidade de parcelas da taxa CEF. */
  cefInstallmentsCount: string;
  /** Valor da parcela CEF (mascarado em R$). */
  cefParcela: string;

  // --- Fluxo de pagamento (página 5) ---
  /** Ato do cliente (mascarado em R$). */
  ato: string;
  /** Vencimento do ato (ISO). */
  atoDueDate: string | null;
  /** Quantidade de parcelas mensais. */
  mensaisCount: string;
  /** Semestrais. */
  semestralEnabled: boolean;
  semestralCount: string;
  semestralValue: string;
  /** Anuais. */
  anualEnabled: boolean;
  anualCount: string;
  anualValue: string;
}

interface SimuladorContextValue extends SimuladorState {
  setField: <K extends keyof SimuladorState>(key: K, value: SimuladorState[K]) => void;
  setProponent1: (patch: Partial<Proponent>) => void;
  setProponent2: (patch: Partial<Proponent>) => void;
  reset: () => void;
  /**
   * Se preenchido, este wizard está EDITANDO uma simulação já salva em
   * Relatórios (o id dela). Nesse modo, o rascunho é guardado numa chave
   * separada, então NÃO interfere na simulação nova iniciada pelo menu.
   */
  editId: string | null;
  /** Estado "puro" (sem métodos) — usado para persistir a simulação. */
  snapshot: SimuladorState;
}

const INITIAL: SimuladorState = {
  companyId: null,
  developmentId: null,
  block: 0,
  unit: '',
  unitValue: '',
  companyRisk: null,
  companyMaxInstallments: null,
  companyMaxSemiannual: null,
  companyMaxAnnual: null,
  companyCoincide: true,
  correspondentId: null,
  correspondentName: null,
  proponent1: emptyProponent(),
  hasSecondProponent: false,
  association: null,
  proponent2: emptyProponent(),
  financingApproved: '',
  subsidy: '',
  fgts: '',
  couponType: null,
  couponValue: '',
  couponWarningSeen: false,
  cefClientPays: true,
  cefInstallment: false,
  cefInstallmentsCount: '',
  cefParcela: '',
  ato: '',
  atoDueDate: null,
  mensaisCount: '',
  semestralEnabled: false,
  semestralCount: '',
  semestralValue: '',
  anualEnabled: false,
  anualCount: '',
  anualValue: '',
};

const DRAFT_KEY = 'poup.simulador.draft';
/**
 * Chave SEPARADA para o rascunho de edição (quando o wizard foi aberto a
 * partir de um card em Relatórios). Assim, editar uma simulação salva NUNCA
 * mexe no rascunho da simulação nova iniciada pelo menu.
 */
export const EDIT_DRAFT_KEY = 'poup.simulador.edit.draft';
const SAVE_DEBOUNCE_MS = 300;

const SimuladorContext = createContext<SimuladorContextValue | undefined>(undefined);

export function SimuladorProvider({ children }: { children: ReactNode }) {
  // `editId` vem da rota (?editId=...). Latcheamos o primeiro valor não-vazio
  // num ref — assim, ao navegar entre as etapas (onde o param some da URL), o
  // modo de edição não se perde e a chave de rascunho continua a mesma.
  const params = useGlobalSearchParams<{ editId?: string }>();
  const editIdRef = useRef<string | null>(null);
  if (params.editId && !editIdRef.current) editIdRef.current = params.editId;
  const editId = editIdRef.current;

  const [state, setState] = useState<SimuladorState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restaura o rascunho salvo (se houver) ao montar o wizard. A chave depende
  // do modo (edição x novo), lida do ref (já latcheado no 1º render).
  useEffect(() => {
    const key = editIdRef.current ? EDIT_DRAFT_KEY : DRAFT_KEY;
    let mounted = true;
    sessionStorage.getItem(key).then((raw) => {
      if (!mounted) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<SimuladorState>;
          setState({ ...INITIAL, ...saved });
        } catch {
          // Rascunho corrompido: ignora e começa do zero.
        }
      }
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Salva a cada mudança (com um pequeno debounce), só depois de hidratado —
  // evita sobrescrever um rascunho salvo com o estado inicial em branco.
  useEffect(() => {
    if (!hydrated) return;
    const key = editIdRef.current ? EDIT_DRAFT_KEY : DRAFT_KEY;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void sessionStorage.setItem(key, JSON.stringify(state));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const value = useMemo<SimuladorContextValue>(
    () => ({
      ...state,
      editId,
      snapshot: state,
      setField: (key, val) => setState((prev) => ({ ...prev, [key]: val })),
      setProponent1: (patch) =>
        setState((prev) => ({ ...prev, proponent1: { ...prev.proponent1, ...patch } })),
      setProponent2: (patch) =>
        setState((prev) => ({ ...prev, proponent2: { ...prev.proponent2, ...patch } })),
      reset: () => {
        setState(INITIAL);
        void sessionStorage.removeItem(editIdRef.current ? EDIT_DRAFT_KEY : DRAFT_KEY);
      },
    }),
    [state, editId],
  );

  if (!hydrated) return <LoadingScreen />;

  return <SimuladorContext.Provider value={value}>{children}</SimuladorContext.Provider>;
}

export function useSimulador(): SimuladorContextValue {
  const ctx = useContext(SimuladorContext);
  if (!ctx) throw new Error('useSimulador deve ser usado dentro de <SimuladorProvider>.');
  return ctx;
}
