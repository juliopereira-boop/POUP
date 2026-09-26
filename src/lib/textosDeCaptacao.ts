/**
 * OS TEXTOS DE CAPTAÇÃO — ESCRITOS NO APARELHO, SEM IA.
 *
 * Eram dois pedidos a um modelo de linguagem: a mensagem de WhatsApp para um
 * lead (`generatePitch`) e os textos da página de captação (`generateInvite`).
 * Agora são modelos de texto preenchidos com o que o corretor já cadastrou:
 * nome dele, imobiliária, empreendimento, construtora e a descrição do
 * empreendimento — de onde saem os diferenciais.
 *
 * Por que é melhor para o corretor: sai na hora (sem espera nem "a IA não
 * respondeu"), nunca inventa um diferencial que o empreendimento não tem, e
 * não tem cota. Para não ficar sempre igual, cada texto tem algumas versões e
 * a escolha varia a cada geração.
 */
import type { LeadCampaign } from '@/data';

type Sorteio = () => number;

function escolher<T>(opcoes: readonly T[], sorteio: Sorteio): T {
  return opcoes[Math.floor(sorteio() * opcoes.length) % opcoes.length]!;
}

function primeiroNome(nome: string | null | undefined): string | null {
  const n = nome?.trim();
  return n ? n.split(/\s+/)[0]! : null;
}

/** Os diferenciais escritos na descrição do empreendimento, curtos e sem repetição. */
export function diferenciais(descricao: string | null | undefined, max = 3): string[] {
  if (!descricao?.trim()) return [];
  const itens = descricao
    .split(/\n|•|;|\s-\s|\.\s+|,\s+(?=[A-ZÀ-Ý])/)
    .map((s) => s.replace(/^[\s\-*✓✔️•]+/, '').replace(/[.\s]+$/, '').trim())
    .filter((s) => s.length >= 4 && s.length <= 70);
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const i of itens) {
    const k = i.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(i.charAt(0).toUpperCase() + i.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

export interface EntradaAbordagem {
  developmentName?: string | null;
  companyName?: string | null;
  descricao?: string | null;
  brokerName?: string | null;
}

/** A mensagem de WhatsApp para um lead: até ~600 caracteres, no máximo 3 emojis. */
export function escreverAbordagem(e: EntradaAbordagem, sorteio: Sorteio = Math.random): string {
  const quem = primeiroNome(e.brokerName);
  const emp = e.developmentName?.trim() || null;
  const empresa = e.companyName?.trim() || null;
  const difs = diferenciais(e.descricao);

  const abertura = escolher(
    [
      `Oi! ${quem ? `Aqui é ${quem}, corretor(a) de imóveis 😊` : 'Tudo bem? 😊'}`,
      `Olá, tudo bem? ${quem ? `Sou ${quem}, corretor(a) de imóveis.` : ''} 😊`.trim(),
      `Oi, tudo certo? ${quem ? `${quem} aqui, corretor(a) de imóveis 😊` : '😊'}`,
    ],
    sorteio,
  );
  const imovel = emp ? `o ${emp}${empresa ? `, da ${empresa}` : ''}` : 'uma oportunidade que combina com você';
  const gancho = escolher(
    [
      `Separei ${imovel} pra te mostrar e lembrei de você 🏡`,
      `Tenho uma novidade que tem a sua cara: ${imovel} 🏡`,
      `Queria te apresentar ${imovel}. Acho que você vai gostar 🏡`,
    ],
    sorteio,
  );
  const lista = difs.length ? `\n\n${difs.map((d) => `• ${d}`).join('\n')}` : '';
  const semLista = difs.length
    ? ''
    : `\n\n${escolher(
        [
          'Dá pra usar o FGTS e, dependendo da renda, ter subsídio do Minha Casa Minha Vida.',
          'Com a parcela certa, sair do aluguel fica mais perto do que parece.',
        ],
        sorteio,
      )}`;
  const convite = escolher(
    [
      'Que tal conhecer pessoalmente? Agendo sua visita e faço uma análise de crédito sem compromisso, pra você saber exatamente como fica a parcela.',
      'Bora conhecer de perto? Marco sua visita e faço uma análise de crédito sem compromisso pra você ver quanto consegue financiar.',
      'Posso agendar uma visita pra você conhecer e, se quiser, faço uma análise de crédito sem compromisso. O que acha?',
    ],
    sorteio,
  );

  let texto = `${abertura}\n\n${gancho}${lista}${semLista}\n\n${convite}`;
  // Descrição enorme: tira diferenciais até caber, sem cortar frase no meio.
  let difsUsados = difs.length;
  while (texto.length > 600 && difsUsados > 0) {
    difsUsados -= 1;
    const l = difsUsados ? `\n\n${difs.slice(0, difsUsados).map((d) => `• ${d}`).join('\n')}` : '';
    texto = `${abertura}\n\n${gancho}${l}\n\n${convite}`;
  }
  return texto;
}

export interface EntradaConvite {
  developmentName?: string | null;
  detalhes?: string | null;
  brokerName?: string | null;
  agency?: string | null;
}

/** Os textos da página de captação e o convite para divulgar. */
export function escreverConvite(e: EntradaConvite, sorteio: Sorteio = Math.random): LeadCampaign {
  const emp = e.developmentName?.trim() || null;
  const quem = primeiroNome(e.brokerName);
  const agencia = e.agency?.trim() || null;
  const difs = diferenciais(e.detalhes);

  const titulosComEmp = [`Seu apartamento no ${emp}`, `Conheça o ${emp}`, `O ${emp} pode ser seu`];
  const titulosGerais = ['Sua casa própria começa aqui', 'Saia do aluguel de vez', 'Seu primeiro imóvel está perto'];
  let titulo = emp ? escolher(titulosComEmp, sorteio) : escolher(titulosGerais, sorteio);
  if (titulo.length > 55) titulo = emp ? `Conheça o ${emp}`.slice(0, 55) : titulosGerais[0]!;

  const subtitulo = escolher(
    [
      'Deixe seu contato e receba uma simulação de financiamento gratuita, sem compromisso.',
      'Deixe seu nome e telefone: eu te mostro quanto você consegue financiar e como fica a parcela.',
      'Descubra em poucos minutos se você pode usar FGTS e subsídio. É grátis e sem compromisso.',
    ],
    sorteio,
  );

  const apresentacao = emp
    ? `O ${emp} é a oportunidade de conquistar o seu imóvel com segurança${difs.length ? `: ${difs.map((d) => d.charAt(0).toLowerCase() + d.slice(1)).join(', ')}` : ''}.`
    : 'Conquistar o imóvel próprio pode ser mais simples do que você imagina.';
  const ajuda = `${quem ? `Eu, ${quem}${agencia ? `, da ${agencia},` : ''}` : 'Nós'} ${quem ? 'te ajudo' : 'te ajudamos'} a entender o financiamento, o uso do FGTS e o subsídio do Minha Casa Minha Vida, do primeiro contato até a assinatura.`;
  const descricao = `${apresentacao} ${ajuda}`;

  const beneficios = [
    difs[0] && difs[0].length <= 45 ? difs[0] : 'Simulação de financiamento na hora',
    'Ajuda com FGTS e subsídio',
    'Atendimento do início à assinatura',
  ];

  const convite = escolher(
    [
      `🏡 Quer sair do aluguel? ${emp ? `Conheça o ${emp} e ` : ''}faça uma simulação gratuita, sem compromisso. Clica no link e deixa seu contato que eu te chamo! #casapropria #minhacasaminhavida`,
      `✨ Seu imóvel próprio pode estar mais perto do que você pensa. ${emp ? `Tenho condições especiais no ${emp}. ` : ''}Deixe seu contato no link e receba sua simulação! #casapropria`,
      `🔑 ${emp ? `${emp}: ` : ''}descubra quanto você consegue financiar, com FGTS e subsídio. É rápido, grátis e sem compromisso. Link abaixo! #minhacasaminhavida`,
    ],
    sorteio,
  ).slice(0, 280);

  return { titulo, subtitulo, descricao, beneficios, convite };
}
