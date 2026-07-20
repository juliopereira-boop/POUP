import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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
 * do wizard (empreendimento → corretor → cliente → ...). Vive no _layout.
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
  /** 1º proponente. */
  proponent1: Proponent;
  /** Se há um 2º proponente. */
  hasSecondProponent: boolean;
  /** Tipo de associação do 2º proponente. */
  association: AssociationType | null;
  /** 2º proponente. */
  proponent2: Proponent;
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
  proponent1: emptyProponent(),
  hasSecondProponent: false,
  association: null,
  proponent2: emptyProponent(),
};

const SimuladorContext = createContext<SimuladorContextValue | undefined>(undefined);

export function SimuladorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SimuladorState>(INITIAL);

  const value = useMemo<SimuladorContextValue>(
    () => ({
      ...state,
      setField: (key, val) => setState((prev) => ({ ...prev, [key]: val })),
      setProponent1: (patch) =>
        setState((prev) => ({ ...prev, proponent1: { ...prev.proponent1, ...patch } })),
      setProponent2: (patch) =>
        setState((prev) => ({ ...prev, proponent2: { ...prev.proponent2, ...patch } })),
      reset: () => setState(INITIAL),
    }),
    [state],
  );

  return <SimuladorContext.Provider value={value}>{children}</SimuladorContext.Provider>;
}

export function useSimulador(): SimuladorContextValue {
  const ctx = useContext(SimuladorContext);
  if (!ctx) throw new Error('useSimulador deve ser usado dentro de <SimuladorProvider>.');
  return ctx;
}
