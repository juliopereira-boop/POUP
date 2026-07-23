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
  CompanyInput,
  Correspondent,
  Development,
  DevelopmentInput,
  Lead,
  LeadStatus,
  MetaLeadIntegration,
  MetaLeadIntegrationInput,
  Result,
  Simulation,
  SimulationInput,
  StorageEntry,
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
  create(userId: string, data: CompanyInput): Promise<Result<Company>>;
  update(id: string, data: CompanyInput): Promise<Result<Company>>;
  remove(id: string): Promise<Result<void>>;

  // Correspondentes (1:N com a empresa)
  listCorrespondents(companyId: string): Promise<Correspondent[]>;
  addCorrespondent(userId: string, companyId: string, name: string): Promise<Result<Correspondent>>;
  removeCorrespondent(id: string): Promise<Result<void>>;
}

export interface DevelopmentRepository {
  list(userId: string): Promise<Development[]>;
  create(userId: string, data: DevelopmentInput): Promise<Result<Development>>;
  update(id: string, data: DevelopmentInput): Promise<Result<Development>>;
  remove(id: string): Promise<Result<void>>;
}

export interface SimulationRepository {
  /** Simulações do usuário, mais recentes primeiro. */
  list(userId: string): Promise<Simulation[]>;
  get(id: string): Promise<Simulation | null>;
  create(userId: string, data: SimulationInput): Promise<Result<Simulation>>;
  update(id: string, data: SimulationInput): Promise<Result<Simulation>>;
  remove(id: string): Promise<Result<void>>;
}

/**
 * Material de Vendas — pastas/arquivos no Storage (não no banco), sob o
 * caminho `<userId>/<relPath>` do bucket privado. `relPath` é relativo à raiz
 * do usuário (ex.: "material/<companyId>/<developmentId>/Pasta").
 */
export interface MaterialRepository {
  list(userId: string, relPath: string): Promise<StorageEntry[]>;
  createFolder(userId: string, relPath: string, name: string): Promise<Result<void>>;
  upload(
    userId: string,
    relPath: string,
    fileName: string,
    data: Blob,
    contentType: string,
  ): Promise<Result<void>>;
  /** Remove um arquivo ou (recursivamente) uma pasta pelo caminho completo. */
  remove(path: string, isFolder: boolean): Promise<Result<void>>;
  /** URL assinada temporária para abrir/baixar um arquivo do bucket privado. */
  signedUrl(path: string, expiresIn?: number): Promise<string | null>;
}

/**
 * Leads captados (gestão + prospecção). Leads chegam por 4 caminhos:
 * landing page pública, link de WhatsApp (cadastro manual), Meta Lead Ads
 * (webhook) ou cadastro manual direto na Gestão de Leads.
 */
export interface LeadRepository {
  /** Leads do usuário, mais recentes primeiro. */
  list(userId: string): Promise<Lead[]>;
  create(
    userId: string,
    data: { name: string; phone: string; email?: string | null },
  ): Promise<Result<Lead>>;
  updateStatus(id: string, status: LeadStatus): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
  getMetaIntegration(userId: string): Promise<MetaLeadIntegration | null>;
  saveMetaIntegration(
    userId: string,
    data: MetaLeadIntegrationInput,
  ): Promise<Result<MetaLeadIntegration>>;
}
