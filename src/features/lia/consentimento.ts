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
 * O consentimento é POR CONTA, não por aparelho: quem aceitou foi uma pessoa, e
 * o `AuthProvider` apaga isto na saída — do mesmo jeito que já faz com o
 * consentimento do scan.
 */
import { sessionStorage } from '@/lib/storage';

const CHAVE = 'poup.lia.consentimento';

/** O que o corretor precisa saber antes de o microfone abrir. */
export const AVISOS_LIA = [
  'A LIA transcreve o que for falado e envia o TEXTO para um serviço de inteligência artificial (Anthropic) que preenche a simulação.',
  'O áudio não é gravado nem guardado: só o texto da conversa, e apenas durante a sessão.',
  'A conversa fica no seu aparelho enquanto a LIA está ligada e some quando você encerra.',
  'Avise o cliente que a conversa será transcrita. O dado é dele, não seu — e a autorização também.',
];

export async function temConsentimentoLia(): Promise<boolean> {
  return (await sessionStorage.getItem(CHAVE)) === '1';
}

export async function darConsentimentoLia(): Promise<void> {
  await sessionStorage.setItem(CHAVE, '1');
}

export async function limparConsentimentoLia(): Promise<void> {
  await sessionStorage.removeItem(CHAVE);
}
