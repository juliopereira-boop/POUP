/**
 * O QUE PODE SER ENVIADO, E DE QUE TAMANHO.
 *
 * ===========================================================================
 * POR QUE ESTAS DUAS REGRAS EXISTEM
 * ===========================================================================
 * O POUP é um CRM de corretor, não uma nuvem de arquivos. Sem limite de TIPO,
 * o material de venda vira o Drive pessoal de quem descobrir isso primeiro — e
 * armazenamento é custo por gigabyte por mês, para sempre, contra uma
 * assinatura fixa. Sem limite de TAMANHO, um único arquivo desses paga o mês
 * inteiro do corretor.
 *
 * A regra fica em um só lugar porque é a MESMA no material de venda e nos
 * anexos do lead: dois números soltos divergiriam na primeira vez que alguém
 * mudasse só um, e o corretor levaria "arquivo grande demais" em uma tela e não
 * na outra, sem entender o motivo.
 *
 * ===========================================================================
 * SÓ DOCUMENTO E IMAGEM — E O QUE ISSO DEIXA DE FORA
 * ===========================================================================
 * PDF cobre book, planta, tabela de preço e memorial. JPEG/PNG/WebP cobrem
 * foto e post. Isso é o material de venda de um corretor em quase toda
 * situação.
 *
 * O que fica de fora, de propósito: **vídeo** (o tour do apartamento, o reels),
 * áudio, ZIP, e os formatos de escritório (DOCX, XLSX, PPTX). Vídeo é o caso
 * legítimo mais afetado — é também, de longe, o maior consumidor de espaço, e o
 * caminho certo para ele é o link (YouTube, Drive da construtora), que o
 * cadastro da empresa já aceita em "material online".
 *
 * Para liberar um formato novo: acrescente na lista abaixo. É o único lugar.
 *
 * ===========================================================================
 * O BUCKET TAMBÉM TEM LIMITE
 * ===========================================================================
 * O Storage do Supabase tem um teto próprio, definido no projeto. Se o número
 * daqui passar do de lá, o upload é recusado pelo servidor mesmo depois de a
 * tela aprovar. Ao mexer aqui, confira o limite global do Storage.
 */

/**
 * 20 MB. Um book em PDF bem exportado fica bem abaixo; um PDF de 20 MB
 * normalmente é foto sem compressão dentro do documento, e não conteúdo a mais.
 */
export const MAX_FILE_MB = 20;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Como a regra é dita ao corretor na tela. */
export const TIPOS_ACEITOS_ROTULO = 'PDF, JPG, PNG e WebP';

/**
 * Filtro entregue ao seletor de arquivos do sistema.
 *
 * Faz o próprio sistema esconder o que não serve, o que é muito melhor do que
 * recusar depois de escolhido: o corretor nunca vê a mensagem de erro porque
 * nunca chega a escolher errado. Não substitui a checagem — alguns seletores
 * ignoram o filtro —, mas resolve o caso comum.
 */
export const TIPOS_ACEITOS_PICKER = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const MIMES = new Set(TIPOS_ACEITOS_PICKER);

/**
 * Extensão é a checagem PRINCIPAL, não a de reforço.
 *
 * O mimetype vem do seletor de arquivos do sistema e nem sempre vem: no
 * Android é comum receber `application/octet-stream` para um PDF perfeitamente
 * válido, e na web um arquivo sem extensão conhecida vem com string vazia.
 * Recusar por causa disso seria recusar arquivo legítimo.
 */
const EXTENSOES = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

function extensaoDe(nome: string): string {
  const limpo = nome.trim().toLowerCase();
  const ponto = limpo.lastIndexOf('.');
  return ponto > 0 ? limpo.slice(ponto + 1) : '';
}

/**
 * O arquivo pode ser enviado?
 *
 * Basta UM dos dois casar — extensão conhecida ou mimetype conhecido. Exigir os
 * dois recusaria o PDF que chegou como `octet-stream`; não exigir nenhum
 * aceitaria qualquer coisa.
 */
export function tipoAceito(nome: string, contentType?: string | null): boolean {
  if (EXTENSOES.has(extensaoDe(nome))) return true;
  const mime = (contentType ?? '').trim().toLowerCase().split(';')[0];
  return MIMES.has(mime);
}

/** O mínimo que a triagem precisa saber sobre um arquivo escolhido. */
export interface ArquivoEscolhido {
  name: string;
  size: number;
  contentType?: string | null;
}

/**
 * Separa o que pode subir do que não pode, com UMA frase explicando o resto.
 *
 * Mora aqui, e não em cada tela, porque as duas telas que enviam arquivo
 * (material de venda e anexos do lead) precisam dizer exatamente a mesma coisa.
 * Duas mensagens diferentes para a mesma regra fazem o corretor achar que uma
 * das telas está com defeito.
 *
 * A frase nomeia o motivo de cada recusa em vez de dizer só "arquivo inválido":
 * quem escolheu um vídeo precisa saber que é o TIPO, e quem escolheu um PDF
 * enorme precisa saber que é o TAMANHO. São ações diferentes.
 */
export function separarEnviaveis<T extends ArquivoEscolhido>(
  arquivos: readonly T[],
): { aceitos: T[]; aviso: string | null } {
  const aceitos: T[] = [];
  let tipoRecusado = 0;
  let grandes = 0;

  for (const a of arquivos) {
    if (!tipoAceito(a.name, a.contentType)) {
      tipoRecusado += 1;
      continue;
    }
    if (a.size > MAX_FILE_BYTES) {
      grandes += 1;
      continue;
    }
    aceitos.push(a);
  }

  const partes: string[] = [];
  if (tipoRecusado > 0) {
    partes.push(
      `${tipoRecusado} arquivo(s) de tipo não aceito (só ${TIPOS_ACEITOS_ROTULO}).`,
    );
  }
  if (grandes > 0) {
    partes.push(`${grandes} arquivo(s) acima de ${MAX_FILE_MB} MB.`);
  }

  return { aceitos, aviso: partes.length > 0 ? partes.join(' ') : null };
}
