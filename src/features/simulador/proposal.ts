import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { UserProfile } from '@/data';
import { currencyToNumber, formatCNPJ, formatPhone } from '@/lib/masks';
import { buildFlow, computeFinancingSum, formatDateBR } from './calc';
import type { SimuladorState } from './SimuladorProvider';

export interface ProposalContext {
  sim: SimuladorState;
  profile: UserProfile | null;
  companyName: string | null;
  developmentName: string | null;
  deliveryDate: string | null;
  gerente: string | null;
  todayISO: string;
}

const ORANGE = '#E2621B';
const GRAYHDR = '#D9D9D9';
const GREEN = '#C6E0B4';
const RED = '#F4B0B0';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

/** Linha da tabela de negociação. */
function flowRow(label: string, qtd: string, valor: string, total: string, venc: string): string {
  return `<tr>
    <td class="lbl">${label}</td>
    <td class="c">${qtd}</td>
    <td class="r">${valor}</td>
    <td class="r b">${total}</td>
    <td class="c small">${venc}</td>
  </tr>`;
}

export function generateProposalHtml(ctx: ProposalContext): string {
  const { sim, profile } = ctx;
  const flow = buildFlow(sim);
  const unitValue = currencyToNumber(sim.unitValue);
  const fin = currencyToNumber(sim.financingApproved);
  const sub = currencyToNumber(sim.subsidy);
  const fgts = currencyToNumber(sim.fgts);
  const financingSum = computeFinancingSum(sim);

  const rendaBruta =
    currencyToNumber(sim.proponent1.rendaBruta) +
    (sim.hasSecondProponent ? currencyToNumber(sim.proponent2.rendaBruta) : 0);
  const rendaPct = rendaBruta > 0 ? (flow.monthlyValue / rendaBruta) * 100 : 0;

  const parcelasPoupanca = flow.mensaisCount + flow.semestralCount + flow.anualCount;
  const totalPago = flow.ato + financingSum + flow.monthlyValue * flow.mensaisCount + flow.semestralTotal + flow.anualTotal;
  const contrato = unitValue;
  const saldo = contrato - totalPago;

  const risco = sim.companyRisk;
  const riscoPoupancaPct = unitValue > 0 ? (flow.poupanca / unitValue) * 100 : 0;
  const withinRisk = risco != null && riscoPoupancaPct <= risco;

  const rows: string[] = [];
  rows.push(flowRow('SINAL', '1', brl(flow.ato), brl(flow.ato), formatDateBR(sim.atoDueDate)));
  if (fin > 0) rows.push(flowRow('FINANCIAMENTO', '1', brl(fin), brl(fin), ''));
  if (fgts > 0) rows.push(flowRow('FGTS', '1', brl(fgts), brl(fgts), ''));
  if (sub > 0) rows.push(flowRow('SUBSÍDIO', '1', brl(sub), brl(sub), ''));
  rows.push(
    flowRow(
      'MENSAIS',
      String(flow.mensaisCount),
      brl(flow.monthlyValue),
      brl(flow.monthlyValue * flow.mensaisCount),
      formatDateBR(flow.mensalFirstDue),
    ),
  );
  if (flow.semestralCount > 0) {
    rows.push(
      flowRow(
        'INTERCALADA SEMESTRAL',
        String(flow.semestralCount),
        brl(flow.semestralValue),
        brl(flow.semestralTotal),
        formatDateBR(flow.semestralDueDates[0] ?? null),
      ),
    );
  }
  if (flow.anualCount > 0) {
    rows.push(
      flowRow(
        'INTERCALADA ANUAL',
        String(flow.anualCount),
        brl(flow.anualValue),
        brl(flow.anualTotal),
        formatDateBR(flow.anualDueDates[0] ?? null),
      ),
    );
  }

  const secondProponent = sim.hasSecondProponent
    ? `<div class="band">DADOS SEGUNDO PROPONENTE</div>
       <table class="kv">
         <tr><td class="k">CLIENTE:</td><td>${esc(sim.proponent2.name)}</td><td class="k">CPF:</td><td>${esc(sim.proponent2.cpf)}</td></tr>
         <tr><td class="k">EMAIL:</td><td>${esc(sim.proponent2.email)}</td><td class="k">CONTATO:</td><td>${esc(sim.proponent2.contact)}</td></tr>
       </table>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 10mm; }
    * {
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 16px; color: #1a1a1a; font-size: 11px; }
    .sheet { border: 2px solid #333; }
    .top { display: flex; justify-content: space-between; align-items: center; background: ${GRAYHDR}; padding: 10px 14px; }
    .top .title { font-size: 20px; font-weight: 800; }
    .top .date { font-weight: 700; }
    .band { background: ${ORANGE}; color: #fff; font-weight: 700; text-align: center; padding: 4px; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; }
    .kv td { border: 1px solid #bbb; padding: 5px 8px; }
    .kv td.k { background: #f2f2f2; font-weight: 700; text-align: right; width: 18%; }
    .flow td { border: 1px solid #bbb; padding: 4px 8px; }
    .flow th { background: ${GRAYHDR}; border: 1px solid #bbb; padding: 4px; font-size: 10px; }
    td.lbl { background: #f2f2f2; font-weight: 700; }
    td.c { text-align: center; }
    td.r { text-align: right; }
    td.b { font-weight: 700; }
    td.small { font-size: 10px; }
    .totrow td { border: 1px solid #bbb; padding: 5px 8px; font-weight: 700; }
    .green { background: ${GREEN}; }
    .red { background: ${RED}; }
    .accept { background: ${GREEN}; text-align: center; font-weight: 800; color: #2b6a2b; padding: 8px; margin: 6px; border-radius: 4px; }
    .resumo td { border: 1px solid #bbb; padding: 5px 8px; }
    .muted { color: #666; }
    .obs { border: 1px solid #bbb; padding: 10px; margin-top: 6px; }
  </style></head>
  <body><div class="sheet">
    <div class="top">
      <div class="title">${esc(ctx.developmentName ?? 'PROPOSTA')}</div>
      <div class="date">${formatDateBR(ctx.todayISO)}</div>
    </div>
    <div class="band">PROPOSTA DE COMPRA E VENDA</div>

    <table class="kv">
      <tr><td class="k">EMPREENDIMENTO:</td><td>${esc(ctx.developmentName)}</td><td class="k">BLOCO:</td><td>${sim.block}</td><td class="k">UNIDADE:</td><td>${esc(sim.unit)}</td></tr>
      <tr><td class="k">CORRETOR:</td><td>${esc(profile?.fullName)}</td><td class="k">CONTATO:</td><td colspan="3">${esc(profile?.phone ? formatPhone(profile.phone) : '')}</td></tr>
      <tr><td class="k">IMOBILIÁRIA:</td><td>${esc(profile?.agency)}</td><td class="k">CNPJ:</td><td colspan="3">${esc(profile?.cnpj ? formatCNPJ(profile.cnpj) : '')}</td></tr>
    </table>

    <div class="band">DADOS PRIMEIRO PROPONENTE</div>
    <table class="kv">
      <tr><td class="k">CLIENTE:</td><td>${esc(sim.proponent1.name)}</td><td class="k">CPF:</td><td>${esc(sim.proponent1.cpf)}</td></tr>
      <tr><td class="k">EMAIL:</td><td>${esc(sim.proponent1.email)}</td><td class="k">CONTATO:</td><td>${esc(sim.proponent1.contact)}</td></tr>
    </table>
    ${secondProponent}

    <div class="band">NEGOCIAÇÃO</div>
    <table class="kv">
      <tr><td class="k">VALOR DE VENDA:</td><td>${brl(unitValue)}</td><td class="k">PARCELA CEF:</td><td>${brl(currencyToNumber(sim.cefParcela))}</td></tr>
      <tr><td class="k">RENDA BRUTA:</td><td>${brl(rendaBruta)}</td><td class="k">COMPROMETIMENTO:</td><td>${rendaPct.toFixed(0)}%</td></tr>
    </table>

    <table class="flow">
      <tr><th>SÉRIE</th><th>QTD</th><th>VALOR</th><th>TOTAL</th><th>VENCIMENTOS</th></tr>
      ${rows.join('')}
    </table>

    <table class="kv">
      <tr>
        <td class="k">POUPANÇA:</td><td>${brl(flow.poupanca)}</td>
        <td class="k">PARCELAS POUPANÇA:</td><td>${parcelasPoupanca}</td>
      </tr>
      <tr class="totrow"><td class="k">TOTAL A SER PAGO:</td><td>${brl(totalPago)}</td><td class="k">VALOR DO CONTRATO:</td><td>${brl(contrato)}</td></tr>
      <tr class="totrow"><td class="k">SALDO A DISTRIBUIR:</td><td colspan="3" class="${Math.abs(saldo) < 1 ? 'green' : 'red'}">${brl(saldo)}</td></tr>
    </table>

    ${Math.abs(saldo) < 1 ? '<div class="accept">PARCELAMENTO ACEITÁVEL!</div>' : ''}

    <div class="band">QUADRO RESUMO</div>
    <table class="resumo">
      <tr>
        <td class="k" style="background:#f2f2f2;font-weight:700">RISCO / POUPANÇA</td>
        <td>${brl(flow.poupanca)}</td>
        <td class="${withinRisk ? 'green' : 'red'}" style="font-weight:700">${riscoPoupancaPct.toFixed(2)}%${risco != null ? ` (máx. ${risco}%)` : ''}</td>
      </tr>
      <tr><td style="font-weight:700">Correspondente</td><td colspan="2">${esc(sim.correspondentName)}</td></tr>
      <tr><td style="font-weight:700">Taxa CEF</td><td colspan="2">${sim.cefClientPays ? 'CLIENTE PAGA' : 'NÃO PAGA'}</td></tr>
      <tr><td style="font-weight:700">Gerente</td><td colspan="2">${esc(ctx.gerente)}</td></tr>
      <tr><td style="font-weight:700">Gerente Imob.</td><td colspan="2">${esc(profile?.agencyManager)}</td></tr>
      <tr><td style="font-weight:700">Data de entrega</td><td colspan="2">${formatDateBR(ctx.deliveryDate)}</td></tr>
    </table>

    <div class="obs muted">Proposta gerada pelo POUP em ${formatDateBR(ctx.todayISO)}. Cupom, quando aplicado, sujeito à validação da construtora.</div>
  </div></body></html>`;
}

/**
 * Renderiza o HTML da proposta num iframe isolado e imprime SOMENTE ele.
 * (No web, o expo-print apenas chama window.print(), que imprimiria o app
 * inteiro — daí o "print da tela". Aqui geramos o documento de verdade; o
 * usuário escolhe "Salvar como PDF" no diálogo e obtém o PDF no modelo.)
 */
function printHtmlWeb(html: string): Promise<void> {
  const dom = globalThis as unknown as {
    document?: {
      createElement: (t: string) => HTMLIFrameElementLike;
      body: { appendChild: (n: unknown) => void; removeChild: (n: unknown) => void };
    };
  };
  const doc = dom.document;
  if (!doc) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const iframe = doc.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    doc.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const idoc = win?.document;
    if (!win || !idoc) {
      resolve();
      return;
    }

    idoc.open();
    idoc.write(html);
    idoc.close();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        try {
          doc.body.removeChild(iframe);
        } catch {
          // ignore
        }
      }, 300);
      resolve();
    };

    // afterprint dispara quando o diálogo de impressão FECHA (imprimiu,
    // salvou como PDF ou cancelou) — é o sinal real de "concluído".
    win.onafterprint = cleanup;

    let printed = false;
    const run = () => {
      if (printed) return;
      printed = true;
      win.focus();
      win.print();
      // Fallback: alguns navegadores não disparam onafterprint de forma
      // confiável em iframes. Garante que o app não fique esperando pra sempre.
      setTimeout(cleanup, 60000);
    };
    // Dá um tempo para o layout/renderização antes de imprimir.
    iframe.onload = () => setTimeout(run, 300);
    setTimeout(run, 700); // fallback caso onload não dispare
  });
}

interface HTMLIFrameElementLike {
  style: Record<string, string>;
  onload: (() => void) | null;
  contentWindow: {
    focus: () => void;
    print: () => void;
    onafterprint: (() => void) | null;
    document: { open: () => void; write: (s: string) => void; close: () => void };
  } | null;
}

/**
 * Gera e compartilha/imprime o PDF da proposta.
 * A Promise só resolve depois que o usuário conclui a impressão/
 * compartilhamento (fecha o diálogo) — use isso para saber quando é seguro
 * limpar a simulação e voltar ao menu.
 */
export async function generateProposal(ctx: ProposalContext): Promise<void> {
  const html = generateProposalHtml(ctx);
  if (Platform.OS === 'web') {
    await printHtmlWeb(html);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Proposta POUP' });
  }
}
