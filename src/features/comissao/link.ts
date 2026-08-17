/**
 * A ponte entre Vendas Realizadas e Comissões.
 *
 * Regra do produto: registrar a venda já lança a comissão, com as parcelas
 * calculadas pela regra da construtora vigente **na data da venda**. O corretor
 * não precisa cadastrar nada duas vezes.
 *
 * A venda é a fonte da verdade e não pode ser perdida nem bloqueada porque a
 * comissão falhou — por isso nada aqui lança exceção. Mas falhar em SILÊNCIO é
 * pior: o corretor fica sem saber que o dinheiro dele não entrou no controle.
 * Então o resultado sempre diz o que aconteceu, e a tela da venda mostra o
 * motivo com um botão para tentar de novo.
 */
import { friendlyError } from '@/data/friendlyError';
import { db, type Sale } from '@/data';
import { buildCommissionForSale } from './engine';

export type EnsureCommissionResult =
  /** Lançada agora. */
  | { status: 'criada' }
  /** Já existia — esta função é idempotente por venda. */
  | { status: 'ja_existia' }
  /** Não deu: `message` é o texto pronto para a tela. */
  | { status: 'erro'; message: string };

/**
 * Garante que a venda tenha comissão lançada.
 *
 * Idempotente: pode ser chamada quantas vezes for (no registro da venda e a
 * cada abertura da tela dela) sem duplicar nada — o índice único em `sale_id` é
 * a trava final, no banco.
 */
export async function ensureCommissionForSale(
  userId: string,
  sale: Sale,
): Promise<EnsureCommissionResult> {
  try {
    const existing = await db.commissions.getBySale(sale.id);
    if (existing) return { status: 'ja_existia' };

    const [rule, campaigns] = sale.companyId
      ? await Promise.all([
          db.commissions.getRule(sale.companyId),
          db.commissions.listCampaigns(sale.companyId),
        ])
      : [null, []];

    const payload = buildCommissionForSale(sale, rule, campaigns);
    const res = await db.commissions.createForSale(userId, payload);
    if (res.ok) return { status: 'criada' };
    return { status: 'erro', message: describe(res.error) };
  } catch (e) {
    return { status: 'erro', message: describe(e instanceof Error ? e.message : '') };
  }
}

/**
 * Traduz a mensagem crua do banco para o corretor.
 *
 * ------------------------------------------------------------------
 * O QUE MUDOU E POR QUÊ
 * ------------------------------------------------------------------
 * Estas mensagens citavam a migration pelo nome ("falta rodar a
 * 0023_commissions.sql no Supabase"). Isso é instrução de manutenção nossa
 * aparecendo na tela de quem só queria registrar uma venda — e, na revisão da
 * App Store, é exatamente a cara de um app inacabado (regra 2.1).
 *
 * O diagnóstico continua existindo, mas onde ele serve: no log do servidor,
 * para quem opera o sistema. Para o corretor sobra o que ele pode fazer.
 */
function describe(raw: string): string {
  const text = (raw ?? '').trim();
  if (/does not exist|could not find the table|schema cache|PGRST205|42P01/i.test(text)) {
    console.error('[comissao] tabela ausente — conferir a migration 0023_commissions.sql:', text);
    return 'O controle de comissão está indisponível no momento. A venda foi salva; tente lançar a comissão mais tarde.';
  }
  if (/row-level security|permission denied|42501/i.test(text)) {
    console.error('[comissao] RLS bloqueou a gravação — conferir políticas da 0023:', text);
    return 'Sem permissão para lançar a comissão desta venda. A venda em si foi salva normalmente.';
  }
  return friendlyError(text) || 'Não foi possível lançar a comissão desta venda.';
}

/**
 * Distrato: a comissão não vai ser paga, então as parcelas pendentes viram
 * canceladas.
 *
 * O que já foi **recebido** não é mexido — o dinheiro entrou, e é o corretor
 * quem decide o que fazer com uma eventual devolução. Apagar histórico de
 * recebimento sem ele pedir seria pior que deixar visível.
 */
export async function cancelCommissionForDistrato(saleId: string): Promise<void> {
  try {
    const item = await db.commissions.getBySale(saleId);
    if (!item) return;
    await Promise.all(
      item.installments
        .filter((i) => i.status === 'pendente')
        .map((i) => db.commissions.setInstallmentStatus(i.id, 'cancelada')),
    );
  } catch {
    // Silencioso de propósito: o distrato da venda já foi salvo.
  }
}

/** Distrato revertido: as parcelas canceladas voltam a ser cobráveis. */
export async function revertCommissionCancellation(saleId: string): Promise<void> {
  try {
    const item = await db.commissions.getBySale(saleId);
    if (!item) return;
    await Promise.all(
      item.installments
        .filter((i) => i.status === 'cancelada')
        .map((i) => db.commissions.setInstallmentStatus(i.id, 'pendente')),
    );
  } catch {
    // Silencioso: o status da venda já foi salvo.
  }
}
