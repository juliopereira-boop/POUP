import { sessionStorage } from '@/lib/storage';

const CHAVE = 'poup.lia.consentimento';
export const VERSAO_AVISO_LIA = 3;
// Autorização só na sessão atual: um aceite antigo não autoriza outra conversa.
let autorizado = false;
const revogacoes = new Set<() => void>();

export function aoRevogarConsentimentoLia(callback: () => void): () => void {
  revogacoes.add(callback);
  return () => {
    revogacoes.delete(callback);
  };
}

export const AVISOS_LIA = [
  'A LIA funciona por texto e não acessa o microfone.',
  'Na simulação e na agenda, o texto digitado e os dados necessários do cadastro são enviados à Anthropic para interpretação. A busca de materiais compara o texto com o catálogo, sem envio à IA.',
  'O texto da sessão não é salvo como conversa pelo POUP. Simulações e agendamentos que você salva ficam na sua conta. Dados enviados à Anthropic seguem as políticas de retenção desse fornecedor.',
  'Antes de informar dados de um cliente, informe-o e obtenha a autorização necessária. Você pode recusar e usar os formulários manuais.',
];

export async function temConsentimentoLia(): Promise<boolean> {
  return autorizado;
}

export async function darConsentimentoLia(): Promise<void> {
  autorizado = true;
  // Registro local informativo; ele NÃO é reutilizado para autorizar outra sessão.
  await sessionStorage
    .setItem(CHAVE, JSON.stringify({ versao: VERSAO_AVISO_LIA, em: new Date().toISOString() }))
    .catch(() => undefined);
}

export async function limparConsentimentoLia(): Promise<void> {
  autorizado = false;
  for (const callback of revogacoes) callback();
  await sessionStorage.removeItem(CHAVE).catch(() => undefined);
}
