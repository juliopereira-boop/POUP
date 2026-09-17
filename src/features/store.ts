import { Platform } from 'react-native';

/**
 * Modelo desta versão: app gratuito complementar ao serviço web (3.1.3(f)),
 * sem compra nem direcionamento para pagamento externo. A aceitação depende
 * da experiência real e da revisão da Apple, não apenas de esconder botões.
 * A flag serve para conferir a experiência de loja NO NAVEGADOR; nunca para
 * habilitar cobrança no binário nativo.
 */
function flagFromEnv(): boolean {
  const raw = process.env.EXPO_PUBLIC_STORE_BUILD;
  return raw === '1' || raw?.toLowerCase() === 'true';
}

export const isStoreBuild: boolean = Platform.OS !== 'web' || flagFromEnv();
export const canShowBilling: boolean = !isStoreBuild;

/** LIA digitada, exclusiva do Pro ativo, permanece web nesta versão. Sem voz. */
export const liaDisponivel: boolean = !isStoreBuild;

/**
 * Decisão de produto: formulário de cadastro disponível na web. Não é uma
 * proibição universal da Apple a cadastros gratuitos. Login social ainda pode
 * criar uma identidade no Supabase; direitos são verificados no servidor.
 */
export const podeCriarConta: boolean = !isStoreBuild;
