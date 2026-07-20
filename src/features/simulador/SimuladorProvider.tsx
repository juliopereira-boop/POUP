import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { LoadingScreen } from '@/components/Loading';
import { sessionStorage } from '@/lib/storage';

/** Um proponente (comprador) da simulação. */
export interface Proponent {
  name: string;
  cpf: string;
  email: string;
  contact: string;
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
  return { name: '', cpf: '', email: '', contact: '' };
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
}

interface SimuladorContextValue extends SimuladorState {
  setField: <K extends keyof SimuladorState>(key: K, value: SimuladorState[K]) => void;
  setProponent1: (patch: Partial<Proponent>) => void;
  setProponent2: (patch: Partial<Proponent>) => void;
  reset: () => void;
}

const INITIAL: SimuladorState = {
  companyId: null,
  developmentId: null,
  block: 0,
  unit: '',
  unitValue: '',
  companyRisk: null,
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
};

const DRAFT_KEY = 'poup.simulador.draft';
const SAVE_DEBOUNCE_MS = 300;

const SimuladorContext = createContext<SimuladorContextValue | undefined>(undefined);

export function SimuladorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SimuladorState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restaura o rascunho salvo (se houver) ao montar o wizard.
  useEffect(() => {
    let mounted = true;
    sessionStorage.getItem(DRAFT_KEY).then((raw) => {
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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  const value = useMemo<SimuladorContextValue>(
    () => ({
      ...state,
      setField: (key, val) => setState((prev) => ({ ...prev, [key]: val })),
      setProponent1: (patch) =>
        setState((prev) => ({ ...prev, proponent1: { ...prev.proponent1, ...patch } })),
      setProponent2: (patch) =>
        setState((prev) => ({ ...prev, proponent2: { ...prev.proponent2, ...patch } })),
      reset: () => {
        setState(INITIAL);
        void sessionStorage.removeItem(DRAFT_KEY);
      },
    }),
    [state],
  );

  if (!hydrated) return <LoadingScreen />;

  return <SimuladorContext.Provider value={value}>{children}</SimuladorContext.Provider>;
}

export function useSimulador(): SimuladorContextValue {
  const ctx = useContext(SimuladorContext);
  if (!ctx) throw new Error('useSimulador deve ser usado dentro de <SimuladorProvider>.');
  return ctx;
}
