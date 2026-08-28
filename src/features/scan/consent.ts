/**
 * Consentimento para a leitura automática de documento por IA.
 *
 * ===========================================================================
 * POR QUE UMA VEZ SÓ ESTAVA ERRADO
 * ===========================================================================
 * Este arquivo pedia a autorização **uma vez na vida** e guardava um `'1'`. O
 * raciocínio parecia bom — repetir o aviso a cada documento treinaria o
 * corretor a tocar em "continuar" sem ler, que é o oposto de consentimento
 * informado.
 *
 * O raciocínio ignorava de quem é o dado. A foto não é do corretor: é do
 * **documento de identidade do cliente dele**, uma pessoa diferente a cada
 * leitura, que não instalou o app e nunca leu política nenhuma. Um "concordo"
 * dado em março não pode autorizar o envio do RG de alguém que apareceu em
 * novembro.
 *
 * A regra **5.1.2(i)** da App Store pede divulgação e permissão explícita
 * antes de compartilhar dados pessoais com IA de terceiros. Uma auditoria
 * externa apontou exatamente isto: o aceite era do corretor, e o dado é do
 * cliente.
 *
 * ===========================================================================
 * COMO FICOU
 * ===========================================================================
 * Duas camadas, cada uma respondendo a uma pergunta diferente:
 *
 *   1. **O AVISO** (`temConsentimentoScan`) — "você entende para onde a foto
 *      vai?". É sobre o corretor, aprende-se uma vez, e continua sendo pedido
 *      uma vez só. Repetir a explicação inteira toda vez é o treino ruim que o
 *      raciocínio original temia, e com razão.
 *
 *   2. **A AUTORIZAÇÃO** (não fica guardada) — "você tem autorização DESTE
 *      titular?". É sobre o cliente da vez, e por isso é perguntada a cada
 *      documento, numa confirmação curta, sem parede de texto.
 *
 * A separação é o ponto: o que se aprende uma vez pergunta-se uma vez; o que
 * muda a cada pessoa pergunta-se a cada pessoa.
 *
 * ===========================================================================
 * REGISTRO E REVOGAÇÃO
 * ===========================================================================
 * A LGPD pede que o consentimento seja demonstrável. Guardamos a **versão** do
 * texto aceito e **quando** — sem isso, "ele concordou" é palavra contra
 * palavra, e mudar o texto do aviso invalidaria silenciosamente o registro
 * antigo.
 *
 * E ele é revogável em Ajustes: consentimento que não se pode retirar não é
 * consentimento.
 */
import { sessionStorage } from '@/lib/storage';

const KEY = 'poup.scan.aiConsent.v1';

/**
 * Versão do texto do aviso.
 *
 * **Mudou `AVISOS_SCAN`? Suba este número.** Quem aceitou a versão anterior
 * concordou com outra coisa, e o aviso volta a aparecer — que é o
 * comportamento correto, não um efeito colateral.
 */
export const VERSAO_AVISO_SCAN = 2;

/** O que o corretor precisa saber antes de mandar o documento de outra pessoa. */
export const AVISOS_SCAN = [
  'A foto do documento é enviada para um serviço de inteligência artificial (Anthropic) que lê o nome e o CPF.',
  'A Anthropic pode manter o conteúdo enviado por até 30 dias para segurança e prevenção de abuso, e depois o descarta. O POUP não guarda a foto em momento nenhum.',
  'Só use com autorização do titular do documento — e a autorização é pedida a cada leitura.',
  'Você pode desligar a leitura automática a qualquer momento em Ajustes.',
];

/** O texto da confirmação por documento. Curto de propósito: é lido toda vez. */
export const CONFIRMACAO_TITULAR =
  'Confirmo que informei o titular deste documento e tenho autorização dele para esta leitura.';

interface RegistroConsentimento {
  versao: number;
  em: string;
  finalidade: string;
}

/**
 * O corretor já viu e aceitou o aviso — **na versão atual**.
 *
 * Devolve `false` para quem aceitou uma versão antiga: o texto mudou, então o
 * que ele aceitou não é o que vale hoje.
 */
export async function temConsentimentoScan(): Promise<boolean> {
  try {
    const bruto = await sessionStorage.getItem(KEY);
    if (!bruto) return false;

    /*
     * `'1'` é o formato antigo, de quando isto era um booleano. Vale como
     * "aceitou alguma coisa", mas não como "aceitou o texto de hoje" — e o
     * texto de hoje é justamente o que passou a falar em retenção de 30 dias e
     * em autorização por documento. Então volta a perguntar.
     */
    if (bruto === '1') return false;

    const reg = JSON.parse(bruto) as RegistroConsentimento;
    return reg.versao === VERSAO_AVISO_SCAN;
  } catch {
    // Sem armazenamento, ou registro corrompido: perguntar de novo é o lado
    // seguro do erro.
    return false;
  }
}

/** Registra o aceite do aviso, com versão, momento e finalidade. */
export async function darConsentimentoScan(): Promise<void> {
  try {
    const registro: RegistroConsentimento = {
      versao: VERSAO_AVISO_SCAN,
      em: new Date().toISOString(),
      finalidade: 'leitura-documento-identidade',
    };
    await sessionStorage.setItem(KEY, JSON.stringify(registro));
  } catch {
    // O aviso volta na próxima vez. Chato, não quebrado.
  }
}

/** Retira o consentimento. O aviso volta na próxima leitura. */
export async function revogarConsentimentoScan(): Promise<void> {
  try {
    await sessionStorage.removeItem(KEY);
  } catch {
    /* Sem armazenamento não há registro para apagar. */
  }
}

/** O que mostrar em Ajustes: quando foi aceito, ou `null` se não há aceite. */
export async function consentimentoScanEm(): Promise<string | null> {
  try {
    const bruto = await sessionStorage.getItem(KEY);
    if (!bruto || bruto === '1') return null;
    const reg = JSON.parse(bruto) as RegistroConsentimento;
    return reg.em ?? null;
  } catch {
    return null;
  }
}
