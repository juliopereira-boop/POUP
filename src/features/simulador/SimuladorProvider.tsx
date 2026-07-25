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

export interface Proponent {
  name: string;
  cpf: string;
  email: string;
  contact: string;
  rendaBruta: string;
}

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

export interface SimuladorState {
  companyId: string | null;
  developmentId: string | null;
  block: number;
  unit: string;
  unitValue: string;
  companyRisk: number | null;
  companyMaxInstallments: number | null;
  companyMaxSemiannual: number | null;
  companyMaxAnnual: number | null;
  companyCoincide: boolean;
  correspondentId: string | null;
  correspondentName: string | null;
  proponent1: Proponent;
  hasSecondProponent: boolean;
  association: AssociationType | null;
  proponent2: Proponent;

  financingApproved: string;
  subsidy: string;
  fgts: string;
  couponType: 'R$' | '%' | null;
  couponValue: string;
  couponWarningSeen: boolean;

  cefClientPays: boolean;
  cefInstallment: boolean;
  cefInstallmentsCount: string;
  cefParcela: string;

  ato: string;
  atoDueDate: string | null;
  mensaisCount: string;
  mensalDueDay: string;
  semestralEnabled: boolean;
  semestralCount: string;
  semestralValue: string;
  anualEnabled: boolean;
  anualCount: string;
  anualValue: string;
}

interface SimuladorContextValue extends SimuladorState {
  setField: <K extends keyof SimuladorState>(key: K, value: SimuladorState[K]) => void;
  setProponent1: (patch: Partial<Proponent>) => void;
  setProponent2: (patch: Partial<Proponent>) => void;
  reset: () => void;
  editId: string | null;
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
  mensalDueDay: '',
  semestralEnabled: false,
  semestralCount: '',
  semestralValue: '',
  anualEnabled: false,
  anualCount: '',
  anualValue: '',
};

export const INITIAL_SIMULADOR_STATE: SimuladorState = INITIAL;

const DRAFT_KEY = 'poup.simulador.draft';
export const EDIT_DRAFT_KEY = 'poup.simulador.edit.draft';
const SAVE_DEBOUNCE_MS = 300;

let pendingEditId: string | null = null;
export function setPendingEditId(id: string | null): void {
  pendingEditId = id;
}

const SimuladorContext = createContext<SimuladorContextValue | undefined>(undefined);

export function SimuladorProvider({ children }: { children: ReactNode }) {
  const params = useGlobalSearchParams<{ editId?: string }>();
  const [editId] = useState<string | null>(() => pendingEditId ?? params.editId ?? null);
  const draftKey = editId ? EDIT_DRAFT_KEY : DRAFT_KEY;

  const [state, setState] = useState<SimuladorState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pendingEditId = null;
  }, []);

  useEffect(() => {
    let mounted = true;
    sessionStorage.getItem(draftKey).then((raw) => {
      if (!mounted) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<SimuladorState>;
          setState({ ...INITIAL, ...saved });
        } catch {
        }
      }
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void sessionStorage.setItem(draftKey, JSON.stringify(state));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated, draftKey]);

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
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setState(INITIAL);
        void sessionStorage.removeItem(draftKey);
      },
    }),
    [state, editId, draftKey],
  );

  if (!hydrated) return <LoadingScreen />;

  return <SimuladorContext.Provider value={value}>{children}</SimuladorContext.Provider>;
}

export function useSimulador(): SimuladorContextValue {
  const ctx = useContext(SimuladorContext);
  if (!ctx) throw new Error('useSimulador deve ser usado dentro de <SimuladorProvider>.');
  return ctx;
}
