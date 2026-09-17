/**
 * Consentimento para a LIA ouvir.
 *
 * ===========================================================================
 * POR QUE ISTO NÃO É BUROCRACIA
 * ===========================================================================
 * A LIA liga um microfone numa sala onde há **outra pessoa** — o cliente — e
 * manda o que foi falado para um serviço de terceiro. Três coisas seguem daí:
 *
 * 1. **A App Store cobra.** Regra 5.1.2(i): compartilhar dados com IA de
 *    terceiro exige permissão explícita e informada, antes do fato. O mesmo
 *    aviso que o scan de documento já faz — aqui com peso maior, porque o dado
 *    é uma conversa inteira, não uma foto.
 * 2. **A LGPD cobra.** O titular do dado não é o corretor: é o cliente. O
 *    corretor não pode consentir sozinho pelo cliente, e o aviso diz isso com
 *    todas as letras em vez de fingir que o problema não existe.
 * 3. **A confiança do corretor depende disso.** Um app que abre o microfone sem
 *    avisar é um app que ele desinstala.
 *
 * A autorização vale somente para a sessão de uso da LIA. Reabrir a ferramenta,
 * revogar nas configurações ou trocar de conta exige novo aceite. O registro
 * persistido é informativo e nunca autoriza uma conversa futura.
 */
import { sessionStorage } from '@/lib/storage';

const CHAVE = 'poup.lia.consentimento';
export const VERSAO_AVISO_LIA = 2;
// Autorização só na sessão atual: um aceite antigo não autoriza outra conversa.
let autorizado = false;
const revogacoes = new Set<() => void>();

export function aoRevogarConsentimentoLia(callback: () => void): () => void {
  revogacoes.add(callback);
  return () => { revogacoes.delete(callback); };
}

/** O que o corretor precisa saber antes de o microfone abrir. */
export const AVISOS_LIA = [
  'A transcrição usa o reconhecimento de voz do navegador. Conforme o navegador, o áudio pode ser processado pelo fornecedor desse serviço; não é garantido processamento apenas no aparelho.',
  'Na simulação e na agenda, o texto e os dados necessários do cadastro são enviados à Anthropic para interpretação. O POUP não grava o áudio.',
  'A transcrição fica na memória durante a sessão. Simulações e agendamentos que você salva ficam na sua conta. Dados enviados a terceiros seguem as políticas de retenção desses fornecedores.',
  'Antes de falar dados de um cliente, informe-o e obtenha a autorização necessária para esta sessão. Você pode recusar e usar os formulários manuais.',
];

export async function temConsentimentoLia(): Promise<boolean> {
  return autorizado;
}

export async function darConsentimentoLia(): Promise<void> {
  autorizado = true;
  // Registro local informativo; ele NÃO é reutilizado para autorizar outra sessão.
  await sessionStorage.setItem(CHAVE, JSON.stringify({ versao: VERSAO_AVISO_LIA, em: new Date().toISOString() })).catch(() => undefined);
}

export async function limparConsentimentoLia(): Promise<void> {
  autorizado = false;
  for (const callback of revogacoes) callback();
  await sessionStorage.removeItem(CHAVE).catch(() => undefined);
}
