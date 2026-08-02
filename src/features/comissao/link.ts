/**
 * A ponte entre Vendas Realizadas e Comissões.
 *
 * Regra do produto: registrar a venda já lança a comissão, com as parcelas
 * calculadas pela regra da construtora vigente **na data da venda**. O corretor
 * não precisa cadastrar nada duas vezes.
 *
 * Tudo aqui é best-effort e idempotente: a venda é a fonte da verdade e não
 * pode ser perdida nem bloqueada porque a comissão falhou. Se o lançamento não
 * acontecer na hora, a próxima abertura da venda tenta de novo.
 */
import { db, type Sale } from '@/data';
import { buildCommissionForSale } from './engine';

/**
 * Garante que a venda tenha comissão lançada.
 *
 * @returns `true` quando lançou agora, `false` quando já existia ou não deu.
 */
export async function ensureCommissionForSale(userId: string, sale: Sale): Promise<boolean> {
  try {
    const existing = await db.commissions.getBySale(sale.id);
    if (existing) return false;

    const [rule, campaigns] = sale.companyId
      ? await Promise.all([
          db.commissions.getRule(sale.companyId),
          db.commissions.listCampaigns(sale.companyId),
        ])
      : [null, []];

    const payload = buildCommissionForSale(sale, rule, campaigns);
    const res = await db.commissions.createForSale(userId, payload);
    return res.ok;
  } catch {
    return false;
  }
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
