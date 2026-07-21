import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { UserProfile } from '@/data';
import { currencyToNumber, formatCNPJ, formatPhone } from '@/lib/masks';
import {
  buildFlow,
  computeFinancingSum,
  formatDateBR,
  formatMonthYearBR,
  monthsBetween,
} from './calc';
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
function pctOf(n: number, total: number): string {
  return `${(total > 0 ? (n / total) * 100 : 0).toFixed(2)}%`;
}

// Mesma proporção usada na marca oficial do POUP (src/components/Mark.tsx),
// desenhada aqui em HTML/CSS puro (o PDF não roda componentes React).
const MARK_WIDTH_RATIO = 3.44;
const MARK_STROKE_RATIO = 0.1375;
const MARK_RADIUS_RATIO = 0.42;

function markHtml(height: number, color: string): string {
  const width = height * MARK_WIDTH_RATIO;
  const stroke = Math.max(1, height * MARK_STROKE_RATIO);
  const r = height * MARK_RADIUS_RATIO;
  return `<div style="width:${width}px;height:${height}px;box-sizing:border-box;border-style:solid;border-color:${color};border-top-width:0;border-left-width:${stroke}px;border-right-width:${stroke}px;border-bottom-width:${stroke}px;border-bottom-left-radius:${r}px;border-bottom-right-radius:${r}px;"></div>`;
}

/** Segunda variante da marca (símbolo + nome), usada no cabeçalho do PDF. */
function wordMarkHtml(height: number, color: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;">
    ${markHtml(height, color)}
    <span style="font-size:${height * 0.72}px;font-weight:800;letter-spacing:1px;color:${color};">POUP</span>
  </div>`;
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
  const contrato = unitValue;
  // Total a ser pago pelo cliente: tudo, menos subsídio e FGTS (que não saem
  // do bolso do cliente).
  const totalPago = contrato - sub - fgts;
  // Checagem de distribuição: ato + mensais + intercaladas + financiamentos
  // deve fechar com o valor do contrato.
  const totalDistribuido =
    flow.ato + financingSum + flow.monthlyValue * flow.mensaisCount + flow.semestralTotal + flow.anualTotal;
  const saldo = contrato - totalDistribuido;

  const risco = sim.companyRisk;
  const riscoPoupancaPct = unitValue > 0 ? (flow.poupanca / unitValue) * 100 : 0;
  const withinRisk = risco != null && riscoPoupancaPct <= risco;

  const mesesParaEntrega = monthsBetween(ctx.todayISO, ctx.deliveryDate);
  const mesesEntregaLabel =
    mesesParaEntrega == null
      ? '—'
      : mesesParaEntrega <= 0
        ? 'Entregue'
        : `${mesesParaEntrega} ${mesesParaEntrega === 1 ? 'mês' : 'meses'}`;

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
    .top .date { font-weight: 700; }
    .resumoWrap { display: flex; gap: 10px; align-items: flex-start; }
    .resumo.main { flex: 2; }
    .resumo.side { flex: 1; font-size: 9.5px; }
    .resumo.side td { padding: 3px 6px; }
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
      ${wordMarkHtml(26, '#1a1a1a')}
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
    <div class="resumoWrap">
      <table class="resumo main">
        <tr>
          <td class="k" style="background:#f2f2f2;font-weight:700">SINAL</td>
          <td class="r">${brl(flow.ato)}</td>
          <td class="r" style="font-weight:700">${pctOf(flow.ato, contrato)}</td>
        </tr>
        <tr>
          <td class="k" style="background:#f2f2f2;font-weight:700">FINANCIAMENTO (FINANCIAMENTO + SUBSÍDIO + FGTS)</td>
          <td class="r">${brl(financingSum)}</td>
          <td class="r" style="font-weight:700">${pctOf(financingSum, contrato)}</td>
        </tr>
        <tr class="${withinRisk ? 'green' : 'red'}">
          <td class="k" style="font-weight:700">POUPANÇA${risco != null ? ` (risco máx. ${risco}%)` : ''}</td>
          <td class="r">${brl(flow.poupanca)}</td>
          <td class="r" style="font-weight:700">${riscoPoupancaPct.toFixed(2)}%</td>
        </tr>
        ${
          flow.semestralCount > 0
            ? `<tr>
                <td class="k" style="background:#f2f2f2;font-weight:700">COMPROMETIMENTO SEMESTRAL</td>
                <td class="r">${brl(flow.semestralTotal)}</td>
                <td class="r" style="font-weight:700">${pctOf(flow.semestralTotal, contrato)}</td>
              </tr>`
            : ''
        }
        ${
          flow.anualCount > 0
            ? `<tr>
                <td class="k" style="background:#f2f2f2;font-weight:700">COMPROMETIMENTO ANUAL</td>
                <td class="r">${brl(flow.anualTotal)}</td>
                <td class="r" style="font-weight:700">${pctOf(flow.anualTotal, contrato)}</td>
              </tr>`
            : ''
        }
      </table>
      <table class="resumo side">
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Gerente</td><td>${esc(ctx.gerente)}</td></tr>
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Gerente Imob.</td><td>${esc(profile?.agencyManager)}</td></tr>
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Correspondente</td><td>${esc(sim.correspondentName)}</td></tr>
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Taxa CEF</td><td>${sim.cefClientPays ? 'CLIENTE PAGA' : 'NÃO PAGA'}</td></tr>
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Entrega</td><td>${formatMonthYearBR(ctx.deliveryDate)}</td></tr>
        <tr><td class="k" style="background:#f2f2f2;font-weight:700">Meses p/ entrega</td><td>${mesesEntregaLabel}</td></tr>
      </table>
    </div>

    <div class="obs muted">Proposta gerada pelo POUP em ${formatDateBR(ctx.todayISO)}. Cupom, quando aplicado, sujeito à validação da construtora.</div>
  </div></body></html>`;
}

interface PrintDoc {
  open: () => void;
  write: (s: string) => void;
  close: () => void;
}
interface PrintWin {
  document: PrintDoc | null;
  focus?: () => void;
  print?: () => void;
  onafterprint?: (() => void) | null;
}
interface PrintIframe {
  style: Record<string, string>;
  onload: (() => void) | null;
  srcdoc: string;
  contentWindow: PrintWin | null;
}
interface PrintGlobal {
  open?: (url: string, target?: string) => PrintWin | null;
  document?: {
    createElement: (t: string) => PrintIframe;
    body: { appendChild: (n: unknown) => void; removeChild: (n: unknown) => void };
  };
}

/**
 * Script injetado no documento da proposta: quando ele carrega, dispara a
 * impressão automaticamente e, ao terminar, fecha a aba.
 */
const AUTO_PRINT_SCRIPT = `<script>
  window.addEventListener('load', function () {
    setTimeout(function () { try { window.focus(); } catch (e) {} window.print(); }, 250);
  });
  window.addEventListener('afterprint', function () {
    setTimeout(function () { try { window.close(); } catch (e) {} }, 100);
  });
</script>`;

function withAutoPrint(html: string): string {
  return html.includes('</body>')
    ? html.replace('</body>', `${AUTO_PRINT_SCRIPT}</body>`)
    : html + AUTO_PRINT_SCRIPT;
}

/**
 * Imprime a proposta no web.
 *
 * Método principal: abre o documento numa NOVA ABA (um contexto de nível
 * superior real) e imprime a partir dela. Isso é o que funciona de forma
 * confiável em todos os navegadores — imprimir a partir de um <iframe> oculto
 * é frágil e resultava em PDF EM BRANCO (a área de impressão do iframe podia
 * ser tratada como vazia). A nova aba tem viewport real, então o conteúdo é
 * renderizado e impresso corretamente.
 *
 * Fallback: se o pop-up for bloqueado, cai para um iframe dimensionado.
 */
function printHtmlWeb(html: string): Promise<void> {
  const g = globalThis as unknown as PrintGlobal;

  // --- Principal: nova aba com auto-impressão ---
  if (typeof g.open === 'function') {
    const win = g.open('', '_blank');
    if (win && win.document) {
      win.document.open();
      win.document.write(withAutoPrint(html));
      win.document.close();
      return Promise.resolve();
    }
  }

  // --- Fallback: iframe dimensionado, impresso no onload (pop-up bloqueado) ---
  const doc = g.document;
  if (!doc) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const iframe = doc.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '-10000px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = '0';
    iframe.srcdoc = html;
    doc.body.appendChild(iframe);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        try {
          doc.body.removeChild(iframe);
        } catch {
          // ignore
        }
      }, 500);
      resolve();
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (win?.print) {
        try {
          win.focus?.();
        } catch {
          // ignore
        }
        win.onafterprint = finish;
        win.print();
        setTimeout(finish, 60000);
      } else {
        finish();
      }
    };
    setTimeout(finish, 60000);
  });
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
