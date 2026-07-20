/**
 * Contratos (interfaces) da camada de dados.
 *
 * Estes são os "ports" da arquitetura: a UI depende destas interfaces, não de
 * uma tecnologia específica. Trocar Supabase por outro banco = escrever novas
 * classes que implementam estas interfaces e apontar o factory (./index.ts).
 */
import type {
  AuthUser,
  Company,
  Development,
  Result,
  Subscription,
  UserProfile,
} from './types';

export interface AuthChangePayload {
  user: AuthUser | null;
}

export interface AuthRepository {
  /** Sessão atual (ou null se deslogado). */
  getCurrentUser(): Promise<AuthUser | null>;

  /** Login com email/senha. */
  signInWithPassword(email: string, password: string): Promise<Result<AuthUser>>;

  /** Cadastro com email/senha. */
  signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<Result<AuthUser | null>>;

  /** Inicia o fluxo OAuth do Google (redirect no web, browser no nativo). */
  signInWithGoogle(): Promise<Result<void>>;

  /** Envia email de redefinição de senha. */
  sendPasswordReset(email: string): Promise<Result<void>>;

  signOut(): Promise<void>;

  /** Assina mudanças de sessão. Retorna função para cancelar a inscrição. */
  onAuthStateChange(cb: (payload: AuthChangePayload) => void): () => void;
}

export interface ProfileRepository {
  get(userId: string): Promise<UserProfile | null>;
  upsert(
    userId: string,
    patch: Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Result<UserProfile>>;
}

export interface BillingRepository {
  /** Assinatura atual do usuário. */
  getSubscription(userId: string): Promise<Subscription | null>;

  /** Total de bytes que o usuário ocupa no armazenamento (uploads). */
  getStorageUsedBytes(userId: string): Promise<number>;

  /**
   * Cria uma sessão de checkout e retorna a URL para redirecionar o usuário.
   * No futuro (App Store/Play Store) trocamos por billing das lojas sem
   * alterar a UI que consome este método.
   */
  createCheckoutSession(priceId: string): Promise<Result<{ url: string }>>;

  /** Abre o portal de gerenciamento da assinatura (cancelar, trocar cartão). */
  createBillingPortalSession(): Promise<Result<{ url: string }>>;
}

export interface CompanyRepository {
  list(userId: string): Promise<Company[]>;
  create(userId: string, data: { name: string; risk: number | null }): Promise<Result<Company>>;
  update(id: string, data: { name: string; risk: number | null }): Promise<Result<Company>>;
  remove(id: string): Promise<Result<void>>;
}

export interface DevelopmentRepository {
  list(userId: string): Promise<Development[]>;
  create(userId: string, data: { companyId: string; name: string }): Promise<Result<Development>>;
  update(id: string, data: { companyId: string; name: string }): Promise<Result<Development>>;
  remove(id: string): Promise<Result<void>>;
}
