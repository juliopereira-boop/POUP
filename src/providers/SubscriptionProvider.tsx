import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { db } from '@/data';
import {
  type PlanTier,
  type Subscription,
  isSubscriptionActive,
  isTrialExpired,
  isTrialGrantCandidate,
  trialDaysRemaining,
} from '@/data';
import { getPlan, type PlanConfig } from '@/features/plans';
import { useAuth } from './AuthProvider';

interface SubscriptionContextValue {
  subscription: Subscription | null;
  isActive: boolean;
  tier: PlanTier | null;
  plan: PlanConfig | null;
  /** Dias que ainda faltam do período de teste. `null` quando não está em teste válido. */
  trialDaysLeft: number | null;
  /** Estava em período de teste e o prazo venceu. */
  trialExpired: boolean;
  loading: boolean;
  initialLoad: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  /**
   * Trava do período de teste preguiçoso.
   *
   * Guarda o id do usuário para quem já pedimos o trial nesta sessão. Sem ela,
   * uma conta que continua sem acesso (campanha desligada, teste já vencido)
   * pediria o trial a cada `refresh()` — e o `refresh()` do retorno do
   * checkout roda em laço, o que viraria um loop infinito de chamadas.
   *
   * Regra: no máximo UMA tentativa por usuário por sessão, sempre.
   */
  const trialAttemptedForUser = useRef<string | null>(null);

  /**
   * De quem é a assinatura que está em `subscription` agora. Enquanto isto não
   * bate com o usuário logado, o que temos em mãos é de outra conta (ou de
   * conta nenhuma) e NÃO pode ser usado para decidir acesso.
   */
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  /** Descarta resposta que chegou atrasada depois de uma troca de conta. */
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const myRequest = ++requestId.current;
    if (!user) {
      setSubscription(null);
      setResolvedUserId(null);
      trialAttemptedForUser.current = null;
      setLoading(false);
      setInitialLoad(false);
      return;
    }
    setLoading(true);
    try {
      let sub = await db.billing.getSubscription(user.id);

      // Concessão preguiçosa do período de teste.
      //
      // O trial só era dado no gatilho de criação da conta em `auth.users`.
      // Quem já tinha conta quando o dono ligou a campanha nunca recebia nada
      // e era mandado para o paywall. Aqui, se a conta está sem acesso e
      // NUNCA usou o teste (`trialStartedAt` vem do banco, não é chute),
      // pedimos o trial uma única vez e relemos a assinatura.
      //
      // Tudo isto acontece ANTES de `setLoading(false)`: enquanto a decisão
      // não termina o app continua em "carregando", então o paywall não
      // pisca na tela — que era exatamente a reclamação.
      if (trialAttemptedForUser.current !== user.id && isTrialGrantCandidate(sub)) {
        // Marca ANTES de chamar: mesmo se a chamada falhar, não tenta de novo.
        trialAttemptedForUser.current = user.id;
        const granted = await db.settings.ensureMyTrial();
        if (granted) {
          sub = await db.billing.getSubscription(user.id);
        }
      }

      // Chegou tarde: o usuário já trocou. Joga fora, quem mandou o pedido
      // novo é que decide.
      if (myRequest !== requestId.current) return;

      setSubscription(sub);
      setResolvedUserId(user.id);
    } finally {
      if (myRequest === requestId.current) {
        setLoading(false);
        setInitialLoad(false);
      }
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Ainda não sabemos nada sobre a conta que está logada agora.
   *
   * Acontece no intervalo entre o `user` mudar e o efeito acima rodar: nesse
   * render `loading` ainda é `false` (sobra do usuário anterior) e
   * `subscription` é de outra conta — ou `null`. Sem esta guarda, quem entra
   * com outra conta vê o `/paywall` por um instante antes de o app carregar a
   * assinatura de verdade. Era a queixa do dono: "no login fui direcionado
   * para a área de pagamento".
   */
  const stale = user != null && resolvedUserId !== user.id;

  // Só considera a assinatura quando ela é comprovadamente da conta logada.
  const current = stale ? null : subscription;
  const tier = current?.tier ?? null;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription: current,
        isActive: isSubscriptionActive(current),
        tier,
        plan: getPlan(tier),
        trialDaysLeft: trialDaysRemaining(current),
        trialExpired: isTrialExpired(current),
        loading: loading || stale,
        initialLoad: initialLoad || stale,
        refresh,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription deve ser usado dentro de <SubscriptionProvider>.');
  return ctx;
}
