/**
 * Consentimento para a leitura automática de documento por IA.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * A regra 5.1.2(i) da App Store diz, com todas as letras, que é preciso
 * "divulgar claramente onde dados pessoais serão compartilhados com terceiros,
 * **inclusive com IA de terceiros**, e obter permissão explícita antes disso".
 *
 * Aqui o dado nem é do corretor: é a foto do documento de identidade do
 * CLIENTE dele — alguém que não instalou o app e nunca leu a política de
 * privacidade. Mandar essa foto para um serviço de IA atrás de um botão com um
 * emoji, sem uma palavra de aviso, é exatamente o que a regra proíbe.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA VEZ SÓ
 * ------------------------------------------------------------------
 * A permissão é pedida na primeira vez e fica guardada. Repetir o aviso a cada
 * documento treinaria o corretor a tocar em "continuar" sem ler, que é o
 * oposto de consentimento informado. O aviso continua acessível na política de
 * privacidade, e some do caminho depois de aceito.
 */
import { sessionStorage } from '@/lib/storage';

const KEY = 'poup.scan.aiConsent.v1';

/** O corretor já autorizou o envio da foto para a leitura automática. */
export async function hasScanConsent(): Promise<boolean> {
  try {
    return (await sessionStorage.getItem(KEY)) === '1';
  } catch {
    // Sem armazenamento, perguntar de novo é o lado seguro do erro.
    return false;
  }
}

export async function grantScanConsent(): Promise<void> {
  try {
    await sessionStorage.setItem(KEY, '1');
  } catch {
    // O aviso volta na próxima vez. Chato, não quebrado.
  }
}

/** Usado ao sair da conta: o consentimento é de quem o deu, não do aparelho. */
export async function clearScanConsent(): Promise<void> {
  try {
    await sessionStorage.removeItem(KEY);
  } catch {
    // Idem.
  }
}
