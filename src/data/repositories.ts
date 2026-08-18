import type {
  Appointment,
  AppointmentInput,
  AppointmentStatusInfo,
  AppointmentType,
  AuthUser,
  CatalogCompany,
  CatalogPhotoKind,
  Company,
  CompanyInput,
  Commission,
  CommissionCampaign,
  CommissionCampaignInput,
  CommissionFilters,
  CommissionInstallment,
  CommissionInstallmentStatus,
  CommissionRule,
  CommissionRuleInput,
  CommissionWithInstallments,
  CompanyMaterial,
  Correspondent,
  InvoiceStatus,
  Development,
  DevelopmentInput,
  Lead,
  LeadPatch,
  LeadSource,
  LeadStage,
  LeadStageFlag,
  LeadStageInput,
  LeadStatus,
  Result,
  Sale,
  SaleFilters,
  SaleInput,
  SaleStatus,
  Simulation,
  SimulationInput,
  SimulationStatus,
  StorageEntry,
  Subscription,
  TrialCampaign,
  TrialCampaignInput,
  UserProfile,
  UploadBody,
} from './types';

export interface AuthChangePayload {
  user: AuthUser | null;
}

export interface AuthRepository {
  getCurrentUser(): Promise<AuthUser | null>;

  signInWithPassword(email: string, password: string): Promise<Result<AuthUser>>;

  signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<Result<AuthUser | null>>;

  signInWithGoogle(): Promise<Result<void>>;

  /**
   * Exigido pela Apple em todo app que ofereça login social de terceiros
   * (regra 4.8) — ou seja, ter o Google já obriga a ter este.
   */
  signInWithApple(): Promise<Result<void>>;

  sendPasswordReset(email: string): Promise<Result<void>>;

  /**
   * Instala a sessão de recuperação que vem no link do e-mail.
   *
   * Só o celular precisa disto. Na web o cliente do Supabase é criado com
   * `detectSessionInUrl` e faz a leitura sozinho; no aplicativo nativo essa
   * opção está desligada (não existe "URL da página"), então o link chega como
   * deep link e os tokens têm que ser instalados na mão.
   */
  applyRecoveryLink(url: string): Promise<Result<void>>;

  /**
   * Troca a senha de quem está autenticado agora.
   *
   * É o segundo passo do "esqueci minha senha": o link do e-mail autentica, e
   * esta chamada grava a senha nova.
   */
  updatePassword(password: string): Promise<Result<void>>;

  signOut(): Promise<void>;

  /**
   * Apaga a conta e tudo que ela guarda, sem volta.
   *
   * `confirm` é a palavra que o corretor digitou na tela; o servidor recusa se
   * não bater. Em caso de sucesso a sessão já não vale mais — quem chama deve
   * limpar o estado local em seguida.
   */
  deleteAccount(confirm: string): Promise<Result<void>>;

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
  getSubscription(userId: string): Promise<Subscription | null>;

  getStorageUsedBytes(userId: string): Promise<number>;

  createCheckoutSession(priceId: string): Promise<Result<{ url: string }>>;

  createBillingPortalSession(): Promise<Result<{ url: string }>>;
}

/**
 * Configurações globais do app, mexidas apenas pelo dono (admin).
 * A autorização de escrita é garantida por RLS no banco, não pela UI.
 */
export interface SettingsRepository {
  /** O usuário logado é admin (está em `public.app_admins`). */
  isAdmin(): Promise<boolean>;

  getTrialCampaign(): Promise<TrialCampaign | null>;

  saveTrialCampaign(input: TrialCampaignInput): Promise<Result<TrialCampaign>>;

  /** Contas em período de teste válido agora. `null` quando não é admin. */
  countActiveTrials(): Promise<number | null>;

  /**
   * Pede ao banco o período de teste para o PRÓPRIO usuário logado.
   *
   * Existe porque o trial só era concedido no gatilho de criação da conta em
   * `auth.users`: quem já tinha conta quando a campanha foi ligada nunca
   * recebia nada e caía no paywall. Aqui a concessão acontece de forma
   * preguiçosa, no carregamento da assinatura.
   *
   * Todas as travas ficam no banco (campanha ligada, nunca conceder duas
   * vezes, não mexer em quem já paga). O app não escolhe o alvo: é sempre a
   * própria conta autenticada.
   *
   * @returns `true` apenas quando o teste foi concedido agora — nesse caso a
   * assinatura precisa ser lida de novo. `false` quando nada mudou.
   */
  ensureMyTrial(): Promise<boolean>;
}

export interface CompanyRepository {
  /**
   * As empresas que o corretor USA: as que ele cadastrou + as que ele ADOTOU do
   * catálogo do sistema.
   *
   * As adotadas vêm com `isCatalog: true` e são somente leitura — a tela deve
   * esconder editar/excluir e oferecer "remover da minha lista"
   * (`db.catalog.unadopt`) no lugar.
   *
   * As próprias empresas do catálogo NÃO entram só por serem do admin: mesmo o
   * admin precisa adotar para usar no simulador. Assim o catálogo não polui a
   * conta de ninguém sem consentimento.
   */
  list(userId: string): Promise<Company[]>;
  create(userId: string, data: CompanyInput): Promise<Result<Company>>;
  update(id: string, data: CompanyInput): Promise<Result<Company>>;
  remove(id: string): Promise<Result<void>>;

  listCorrespondents(companyId: string): Promise<Correspondent[]>;
  addCorrespondent(userId: string, companyId: string, name: string): Promise<Result<Correspondent>>;
  removeCorrespondent(id: string): Promise<Result<void>>;
}

export interface DevelopmentRepository {
  /**
   * Os empreendimentos que o corretor USA: os dele + todos os das empresas do
   * catálogo que ele adotou (com `isCatalog: true`, somente leitura).
   *
   * Mesma regra da `CompanyRepository.list`: empreendimento de empresa do
   * catálogo só aparece via adoção, nunca por ser do admin que o cadastrou.
   */
  list(userId: string): Promise<Development[]>;
  create(userId: string, data: DevelopmentInput): Promise<Result<Development>>;
  update(id: string, data: DevelopmentInput): Promise<Result<Development>>;
  remove(id: string): Promise<Result<void>>;
}

/**
 * O catálogo do sistema: empresas pré-configuradas pelo admin do POUP, com
 * regra de comissão, empreendimentos, material de venda e foto já prontos.
 *
 * ------------------------------------------------------------------
 * VÍNCULO, NÃO CÓPIA — a decisão de arquitetura mais importante daqui
 * ------------------------------------------------------------------
 * Adotar NÃO duplica os dados na conta do corretor: cria uma linha em
 * `company_adoptions` e a leitura passa a alcançar a MESMA empresa. Por isso
 * toda correção que o admin faz (regra mudou, empreendimento novo, material
 * atualizado) aparece automaticamente para quem adotou, sem reimportar nada.
 *
 * O que é do corretor continua dele: simulações, vendas e comissões já lançadas
 * guardam os valores em snapshot e não mudam quando a regra muda depois.
 *
 * Os métodos de escrita do catálogo são para o ADMIN. A autorização é do banco
 * (`is_app_admin()` nas policies), nunca da UI: esconder o botão não protege
 * nada.
 */
export interface CatalogRepository {
  /** O catálogo inteiro, com prévia e marcação de já adotada. */
  list(userId: string): Promise<CatalogCompany[]>;

  /** Passa a usar a empresa do catálogo. Idempotente. */
  adopt(userId: string, companyId: string): Promise<Result<void>>;

  /**
   * Deixa de usar. Não apaga nada do catálogo nem o histórico do corretor —
   * só remove o vínculo, então a empresa sai das listas dele.
   */
  unadopt(userId: string, companyId: string): Promise<Result<void>>;

  /* --- administração do catálogo (admin) --- */

  /** Só as empresas do catálogo, para o painel do admin. */
  listCompanies(): Promise<Company[]>;

  /**
   * Os empreendimentos de UMA empresa do catálogo.
   *
   * Existe porque `DevelopmentRepository.list` é a visão do CORRETOR: ela
   * descarta empreendimento de empresa do catálogo que ele não adotou. O admin
   * precisa editar o catálogo sem adotá-lo — se dependesse daquela lista, ele
   * não veria o que acabou de cadastrar.
   */
  listDevelopments(companyId: string): Promise<Development[]>;

  createCompany(userId: string, data: CompanyInput): Promise<Result<Company>>;

  /**
   * Sobe a foto redonda e devolve a URL pública já gravada na linha.
   * Substituir a foto sobrescreve o arquivo anterior.
   */
  uploadPhoto(
    kind: CatalogPhotoKind,
    id: string,
    data: UploadBody,
    contentType: string,
  ): Promise<Result<string>>;

  removePhoto(kind: CatalogPhotoKind, id: string): Promise<Result<void>>;
}

export interface SimulationRepository {
  list(userId: string): Promise<Simulation[]>;
  get(id: string): Promise<Simulation | null>;
  create(userId: string, data: SimulationInput): Promise<Result<Simulation>>;
  update(id: string, data: SimulationInput): Promise<Result<Simulation>>;
  remove(id: string): Promise<Result<void>>;
  /**
   * Marca o ciclo de vida da simulação. Usado pelo módulo de vendas para
   * sinalizar `venda_realizada` sem reescrever o resto da simulação.
   */
  setStatus(id: string, status: SimulationStatus): Promise<Result<void>>;
}

/**
 * Material de venda no Storage.
 *
 * `root` é a primeira pasta do caminho e define de quem é o material:
 * - o `userId` do corretor, para o material que ele mesmo subiu;
 * - `CATALOG_MATERIAL_ROOT` (`'catalog'`), para o material que o admin
 *   pré-cadastrou. Quem adotou a empresa LÊ dessa pasta; só admin escreve
 *   (garantido por policy no Storage, não pela UI).
 *
 * Use `materialRoot()` de `@/features/catalog/material` para escolher — nunca
 * monte a string na tela.
 */
export interface MaterialRepository {
  list(root: string, relPath: string): Promise<StorageEntry[]>;
  createFolder(root: string, relPath: string, name: string): Promise<Result<void>>;
  upload(
    root: string,
    relPath: string,
    fileName: string,
    data: UploadBody,
    contentType: string,
  ): Promise<Result<void>>;
  remove(path: string, isFolder: boolean): Promise<Result<void>>;
  signedUrl(path: string, expiresIn?: number): Promise<string | null>;

  /**
   * URLs assinadas de VÁRIOS arquivos de uma vez, indexadas pelo caminho.
   *
   * A listagem mostra uma miniatura por arquivo; pedir uma assinatura por vez
   * seria dezenas de idas ao servidor só para desenhar a tela. Caminho que
   * falhar simplesmente não aparece no resultado — a miniatura cai no ícone do
   * tipo e nada quebra.
   */
  signedUrls(paths: string[], expiresIn?: number): Promise<Record<string, string>>;

  /**
   * URL que força o BAIXAR com o nome original, em vez de abrir no navegador.
   * Sem isso o PDF abre numa aba e o corretor não consegue salvar o arquivo.
   */
  downloadUrl(path: string, fileName: string, expiresIn?: number): Promise<string | null>;
  download(path: string): Promise<Blob | null>;
  getCompanyMaterial(userId: string, companyId: string): Promise<CompanyMaterial | null>;
  saveCompanyMaterial(
    userId: string,
    companyId: string,
    driveUrl: string | null,
  ): Promise<Result<CompanyMaterial>>;
}

export interface AppointmentRepository {
  get(id: string): Promise<Appointment | null>;
  listRange(userId: string, startISO: string, endISO: string): Promise<Appointment[]>;
  listByLead(userId: string, leadId: string): Promise<Appointment[]>;
  create(userId: string, data: AppointmentInput): Promise<Result<Appointment>>;
  update(id: string, data: Partial<AppointmentInput>): Promise<Result<Appointment>>;
  setStatus(
    id: string,
    statusId: string,
    extra?: { note?: string | null; reason?: string | null },
  ): Promise<Result<void>>;
  reschedule(id: string, startAt: string, endAt: string | null): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
  listTypes(): Promise<AppointmentType[]>;
  listStatuses(): Promise<AppointmentStatusInfo[]>;
}

/**
 * Vendas realizadas.
 *
 * Os KPIs NÃO são calculados aqui: `list` devolve as vendas já filtradas e
 * `computeSaleKpis` (em `@/features/vendas/kpis`) faz as contas. Assim os
 * números do painel e a listagem nunca divergem, e as contas ficam testáveis.
 */
export interface SaleRepository {
  list(userId: string, filters: SaleFilters): Promise<Sale[]>;
  get(id: string): Promise<Sale | null>;
  /** A venda gerada por uma simulação, se já existir. */
  getBySimulation(simulationId: string): Promise<Sale | null>;
  create(userId: string, data: SaleInput): Promise<Result<Sale>>;
  update(id: string, data: Partial<SaleInput>): Promise<Result<Sale>>;
  setStatus(
    id: string,
    status: SaleStatus,
    extra?: { distratoDate?: string | null; distratoReason?: string | null },
  ): Promise<Result<Sale>>;
  remove(id: string): Promise<Result<void>>;
  /** Leads criados no período — base da taxa de conversão. */
  countLeadsInRange(userId: string, from: string | null, to: string | null): Promise<number>;
}

/**
 * Comissões.
 *
 * As regras (percentual, campanhas, parcelamento) ficam na construtora. As
 * parcelas são geradas quando a venda é registrada, aplicando a regra vigente
 * na DATA DA VENDA — e ficam congeladas: mudar a regra depois não reescreve
 * comissão já lançada.
 *
 * Os KPIs não são calculados aqui: `list` devolve o que passou pelos filtros e
 * `computeCommissionKpis` (em `@/features/comissao/kpis`) faz as contas.
 */
export interface CommissionRepository {
  /* --- regras, no cadastro da construtora --- */
  getRule(companyId: string): Promise<CommissionRule | null>;
  saveRule(userId: string, companyId: string, input: CommissionRuleInput): Promise<Result<CommissionRule>>;
  listCampaigns(companyId: string): Promise<CommissionCampaign[]>;
  addCampaign(
    userId: string,
    companyId: string,
    input: CommissionCampaignInput,
  ): Promise<Result<CommissionCampaign>>;
  updateCampaign(id: string, input: CommissionCampaignInput): Promise<Result<CommissionCampaign>>;
  removeCampaign(id: string): Promise<Result<void>>;

  /* --- comissões e parcelas --- */
  list(userId: string, filters: CommissionFilters): Promise<CommissionWithInstallments[]>;
  get(id: string): Promise<CommissionWithInstallments | null>;
  getBySale(saleId: string): Promise<CommissionWithInstallments | null>;

  /**
   * Cria a comissão de uma venda com as parcelas já calculadas.
   * Idempotente por venda: se já existir, devolve a existente sem duplicar.
   */
  createForSale(
    userId: string,
    data: {
      commission: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'>;
      installments: Omit<CommissionInstallment, 'id' | 'commissionId'>[];
    },
  ): Promise<Result<CommissionWithInstallments>>;

  /** Regera as parcelas de uma comissão (ex.: o corretor renegociou o parcelamento). */
  replaceInstallments(
    commissionId: string,
    installments: Omit<CommissionInstallment, 'id' | 'commissionId'>[],
  ): Promise<Result<CommissionWithInstallments>>;

  updateCommission(
    id: string,
    patch: Partial<Pick<Commission, 'pct' | 'totalValue' | 'source' | 'campaignName' | 'notes'>>,
  ): Promise<Result<Commission>>;

  updateInstallment(
    id: string,
    patch: Partial<
      Pick<
        CommissionInstallment,
        'dueDate' | 'value' | 'status' | 'paidDate' | 'paidValue' | 'notes'
      >
    >,
  ): Promise<Result<CommissionInstallment>>;

  setInstallmentStatus(
    id: string,
    status: CommissionInstallmentStatus,
    extra?: { paidDate?: string | null; paidValue?: number | null },
  ): Promise<Result<CommissionInstallment>>;

  /** Registra a nota fiscal da parcela. A emissão automática entra depois. */
  setInvoice(
    id: string,
    data: {
      invoiceStatus: InvoiceStatus;
      invoiceNumber?: string | null;
      invoiceUrl?: string | null;
      invoiceIssuedAt?: string | null;
    },
  ): Promise<Result<CommissionInstallment>>;

  removeCommission(id: string): Promise<Result<void>>;
}

export interface LeadRepository {
  list(userId: string): Promise<Lead[]>;
  create(
    userId: string,
    data: {
      name: string;
      phone: string;
      email?: string | null;
      message?: string | null;
      source?: LeadSource;
    },
  ): Promise<Result<Lead>>;
  get(id: string): Promise<Lead | null>;
  updateStatus(id: string, status: LeadStatus): Promise<Result<void>>;
  update(id: string, patch: LeadPatch): Promise<Result<Lead>>;
  remove(id: string): Promise<Result<void>>;

  listStages(userId: string): Promise<LeadStage[]>;
  createStage(userId: string, data: LeadStageInput): Promise<Result<LeadStage>>;
  updateStage(id: string, data: Partial<LeadStageInput>): Promise<Result<LeadStage>>;
  removeStage(id: string): Promise<Result<void>>;
  seedDefaultStages(userId: string): Promise<LeadStage[]>;

  /**
   * Move o lead para a etapa marcada com a flag informada.
   * Retorna a etapa aplicada, ou `null` quando o usuário não tem etapa com essa flag.
   */
  moveToFlaggedStage(
    userId: string,
    leadId: string,
    flag: LeadStageFlag,
  ): Promise<Result<LeadStage | null>>;
}
