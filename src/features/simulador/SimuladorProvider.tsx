import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Estado do fluxo do Simulador de poupança, compartilhado entre as páginas
 * do wizard (empreendimento → corretor → ... ). Vive no _layout do simulador.
 */
export interface SimuladorState {
  companyId: string | null;
  developmentId: string | null;
  /** Bloco/Quadra (0 a 100, escolhido na roleta). */
  block: number;
  /** Unidade (digitada). */
  unit: string;
}

interface SimuladorContextValue extends SimuladorState {
  setField: <K extends keyof SimuladorState>(key: K, value: SimuladorState[K]) => void;
  reset: () => void;
}

const INITIAL: SimuladorState = {
  companyId: null,
  developmentId: null,
  block: 0,
  unit: '',
};

const SimuladorContext = createContext<SimuladorContextValue | undefined>(undefined);

export function SimuladorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SimuladorState>(INITIAL);

  const value = useMemo<SimuladorContextValue>(
    () => ({
      ...state,
      setField: (key, val) => setState((prev) => ({ ...prev, [key]: val })),
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
