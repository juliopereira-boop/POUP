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

/**
 * Logo do PDF: SOMENTE o nome "POUP" (sem o símbolo), em fonte FINA.
 * A tipografia oficial é a "Banana" (Canva); por ser uma fonte proprietária
 * que não vem embutida no navegador, usamos uma pilha de fontes finas/
 * geométricas semelhantes como fallback. O aspecto fino vem de font-weight:300.
 */
function brandHtml(): string {
  return `<div class="brand">POUP</div>`;
}

// --- Diagrama "Jornada do cliente" (mapa estilo metrô) exibido no final da
// proposta, igual ao modelo de referência. É estático (não reflete o estágio
// real da simulação) — desenhado em SVG puro para imprimir nítido no PDF.
const J_GRAY = '#A3A3A3';
const J_GRAY_TXT = '#7A7A7A';
const J_GOLD = '#C9A227';
const J_GREEN = '#2FA36B';
const J_WHITE = '#FFFFFF';

function jIcon(kind: string, color: string, accent: string): string {
  switch (kind) {
    case 'flag':
      return `<path d="M -1 -9 L -1 9" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="M -1 -9 L 8 -6 L -1 -3 Z" fill="${color}"/>`;
    case 'person':
      return `<circle cx="0" cy="-4.5" r="4.3" fill="${color}"/><path d="M -8 8.5 C -8 -1 8 -1 8 8.5 Z" fill="${color}"/>`;
    case 'badge':
      return `<path d="M -7 -8 L 7 -8 L 7 3 L 0 8 L -7 3 Z" fill="${color}"/><text x="0" y="0.5" font-size="9" font-weight="800" fill="${accent}" text-anchor="middle" font-family="Arial">5</text>`;
    case 'key':
      return `<circle cx="-5" cy="0" r="4.3" fill="none" stroke="${color}" stroke-width="2.2"/><path d="M -1 0 L 9 0 M 9 0 L 9 3.6 M 5 0 L 5 2.8" stroke="${color}" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
    case 'check':
      return `<path d="M -7 0 L -2 6 L 8 -7" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'undo':
      return `<path d="M -6 -4 A 8 8 0 1 1 -6 6" stroke="${color}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M -9 -7 L -6 -4 L -2 -7" stroke="${color}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'refresh':
      return `<path d="M -7 -2 A 7 7 0 1 1 -7 3" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M -10 -5 L -7 -2 L -3 -4" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M 7 2 A 7 7 0 1 1 7 -3" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M 10 5 L 7 2 L 3 4" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'headset':
      return `<path d="M -8 1 A 8 8 0 0 1 8 1" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="-9.5" y="1" width="3.4" height="6" rx="1.5" fill="${color}"/><rect x="6.1" y="1" width="3.4" height="6" rx="1.5" fill="${color}"/>`;
    case 'checkCircle':
      return `<circle cx="0" cy="0" r="8.5" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M -4 0 L -1 3.2 L 4.2 -3.2" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'search':
      return `<circle cx="-1.5" cy="-1.5" r="5.5" fill="none" stroke="${color}" stroke-width="2"/><path d="M 3 3 L 8 8" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

function jNode(
  cx: number,
  cy: number,
  fill: string,
  stroke: string,
  iconKind: string,
  iconColor: string,
  label: string,
  labelColor: string,
): string {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="20" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <g transform="translate(${cx},${cy})">${jIcon(iconKind, iconColor, fill)}</g>
    <text x="${cx}" y="${cy + 38}" font-size="13" font-weight="700" fill="${labelColor}" text-anchor="middle" font-family="Arial" letter-spacing="0.2">${label}</text>
  </g>`;
}

function journeyMapSvg(): string {
  const xLead = 70;
  const xCadastro = 195;
  const xPre = 265;
  const xReserva = 335;
  const xVenda = 445;
  const xRepasse = 555;
  const xAtendMid = 695;
  const xRight = 940;
  const yTop = 38;
  const yMid = 122;
  const yLow = 206;
  const w = 5;

  const paths = [
    `M ${xLead} ${yMid} L ${xCadastro} ${yMid}|${J_GRAY}`,
    `M ${xCadastro} ${yMid} L ${xReserva} ${yMid}|url(#jg1)`,
    `M ${xCadastro} ${yMid} C ${xCadastro + 35} ${yMid} ${xPre - 35} ${yTop} ${xPre} ${yTop}|url(#jg1)`,
    `M ${xPre} ${yTop} C ${xPre + 35} ${yTop} ${xReserva - 35} ${yMid} ${xReserva} ${yMid}|${J_GREEN}`,
    `M ${xReserva} ${yMid} L ${xVenda} ${yMid}|url(#jg2)`,
    `M ${xVenda} ${yMid} L ${xVenda} ${yLow}|${J_GRAY}`,
    `M ${xVenda} ${yMid} L ${xAtendMid} ${yMid}|${J_GRAY}`,
    `M ${xVenda} ${yMid} C ${xVenda + 35} ${yMid} ${xAtendMid - 35} ${yTop} ${xAtendMid} ${yTop}|${J_GRAY}`,
    `M ${xAtendMid} ${yTop} L ${xRight} ${yTop}|${J_GRAY}`,
    `M ${xRight} ${yTop} L ${xRight} ${yLow}|${J_GRAY}`,
  ]
    .map((p) => {
      const [d, stroke] = p.split('|');
      return `<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    })
    .join('');

  const nodes = [
    jNode(xLead, yMid, J_WHITE, J_GRAY, 'flag', J_GRAY, 'LEAD', J_GRAY_TXT),
    jNode(xCadastro, yMid, J_GOLD, J_GOLD, 'person', J_WHITE, 'CADASTRO', J_GOLD),
    jNode(xPre, yTop, J_GREEN, J_GREEN, 'badge', J_WHITE, 'PRE CADASTRO', J_GREEN),
    jNode(xReserva, yMid, J_GREEN, J_GREEN, 'key', J_WHITE, 'RESERVA', J_GREEN),
    jNode(xVenda, yMid, J_WHITE, J_GRAY, 'check', J_GRAY, 'VENDA', J_GRAY_TXT),
    jNode(xVenda, yLow, J_WHITE, J_GRAY, 'undo', J_GRAY, 'DISTRATO', J_GRAY_TXT),
    jNode(xRepasse, yMid, J_WHITE, J_GRAY, 'refresh', J_GRAY, 'REPASSE', J_GRAY_TXT),
    jNode(xAtendMid, yMid, J_WHITE, J_GRAY, 'headset', J_GRAY, 'ATENDIMENTO', J_GRAY_TXT),
    jNode(xAtendMid, yTop, J_WHITE, J_GRAY, 'key', J_GRAY, 'ENT. DECHAVES', J_GRAY_TXT),
    jNode(xRight, yTop, J_WHITE, J_GRAY, 'headset', J_GRAY, 'ATENDIMENTO', J_GRAY_TXT),
    jNode(xRight, yMid, J_WHITE, J_GRAY, 'checkCircle', J_GRAY, 'REP CONCLUIDO', J_GRAY_TXT),
    jNode(xRight, yLow, J_WHITE, J_GRAY, 'search', J_GRAY, 'PESQUISA', J_GRAY_TXT),
  ].join('');

  return `<svg class="journeySvg" viewBox="0 0 1040 258" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="jg1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${J_GOLD}"/><stop offset="100%" stop-color="${J_GREEN}"/>
      </linearGradient>
      <linearGradient id="jg2" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${J_GREEN}"/><stop offset="100%" stop-color="${J_GRAY}"/>
      </linearGradient>
    </defs>
    ${paths}
    ${nodes}
  </svg>`;
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

/**
 * Nome de arquivo sugerido para o PDF: "Cliente-Empreendimento", sem
 * caracteres inválidos em nomes de arquivo.
 */
function proposalFileName(ctx: ProposalContext): string {
  const client = ctx.sim.proponent1.name.trim() || 'Cliente';
  const dev = ctx.developmentName?.trim() || 'Proposta';
  return `${client}-${dev}`
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ProposalParts {
  style: string;
  bodyHtml: string;
  fileName: string;
}

function buildProposalParts(ctx: ProposalContext): ProposalParts {
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

  const style = `
    @page { size: A4; margin: 10mm; }
    * {
      box-sizing: border-box;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 12px; color: #1a1a1a; font-size: 10.5px; }
    .sheet { border: 2px solid #333; }
    .top { display: flex; justify-content: space-between; align-items: center; background: ${GRAYHDR}; padding: 7px 14px; }
    .top .date { font-weight: 700; }
    .top .brand { font-family: 'Banana', 'Century Gothic', 'Questrial', 'Trebuchet MS', Arial, sans-serif; font-weight: 300; font-size: 30px; letter-spacing: 3px; color: #1a1a1a; }
    .resumoWrap { display: flex; gap: 10px; align-items: flex-start; }
    .resumo.main { flex: 2; }
    .resumo.side { flex: 1; font-size: 9.5px; }
    .resumo.side td { padding: 2.5px 6px; }
    .band { background: ${ORANGE}; color: #fff; font-weight: 700; text-align: center; padding: 3px; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; }
    .kv td { border: 1px solid #bbb; padding: 3.5px 8px; }
    .kv td.k { background: #f2f2f2; font-weight: 700; text-align: right; width: 18%; }
    .flow td { border: 1px solid #bbb; padding: 3px 8px; }
    .flow th { background: ${GRAYHDR}; border: 1px solid #bbb; padding: 3px; font-size: 10px; }
    td.lbl { background: #f2f2f2; font-weight: 700; }
    td.c { text-align: center; }
    td.r { text-align: right; }
    td.b { font-weight: 700; }
    td.small { font-size: 10px; }
    .totrow td { border: 1px solid #bbb; padding: 3.5px 8px; font-weight: 700; }
    .green { background: ${GREEN}; }
    .red { background: ${RED}; }
    .accept { background: ${GREEN}; text-align: center; font-weight: 800; color: #2b6a2b; padding: 6px; margin: 4px; border-radius: 4px; }
    .resumo td { border: 1px solid #bbb; padding: 3.5px 8px; }
    .muted { color: #666; }
    .journeyWrap { text-align: center; margin-top: 4px; }
    .journeySvg { height: 140px; width: auto; }
    .obs { border: 1px solid #bbb; padding: 6px; margin-top: 4px; font-size: 9.5px; }
  `;

  const bodyHtml = `<div class="sheet">
    <div class="top">
      ${brandHtml()}
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

    <div class="band">JORNADA DO CLIENTE</div>
    <div class="journeyWrap">${journeyMapSvg()}</div>

    <div class="obs muted">Proposta gerada pelo POUP em ${formatDateBR(ctx.todayISO)}. Cupom, quando aplicado, sujeito à validação da construtora.</div>
  </div>`;

  return { style, bodyHtml, fileName: proposalFileName(ctx) };
}

/**
 * Script embutido no documento completo (usado no nativo via expo-print):
 * ao carregar, se o conteúdo for mais alto que uma página A4, reduz a escala
 * do `.sheet` até caber — garante uma única página mesmo com pequenas
 * diferenças de métricas de fonte entre motores de renderização.
 */
const AUTO_FIT_SCRIPT = `<script>
(function () {
  function fit() {
    var sheet = document.querySelector('.sheet');
    if (!sheet) return;
    var availablePx = (297 - 20) * 96 / 25.4;
    var height = sheet.getBoundingClientRect().height;
    if (height > availablePx) {
      var scale = availablePx / height;
      sheet.style.transformOrigin = 'top left';
      sheet.style.transform = 'scale(' + scale + ')';
      sheet.style.width = (100 / scale) + '%';
    }
  }
  if (document.readyState === 'complete') fit();
  else window.addEventListener('load', fit);
})();
</script>`;

/** Documento HTML completo e independente — usado no nativo (expo-print). */
export function generateProposalHtml(ctx: ProposalContext): string {
  const { style, bodyHtml, fileName } = buildProposalParts(ctx);
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(fileName)}</title>
  <style>${style}</style></head>
  <body>${bodyHtml}${AUTO_FIT_SCRIPT}</body></html>`;
}

interface PrintIframeDoc {
  open?: () => void;
  write?: (html: string) => void;
  close?: () => void;
}
interface PrintIframeWin {
  focus?: () => void;
  print?: () => void;
  onafterprint?: (() => void) | null;
  requestAnimationFrame?: (cb: () => void) => void;
}
interface PrintIframeEl {
  style: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
  srcdoc: string;
  onload: (() => void) | null;
  contentWindow: PrintIframeWin | null;
  contentDocument: PrintIframeDoc | null;
}
interface PrintGlobal {
  document?: {
    createElement: (t: string) => PrintIframeEl;
    body: { appendChild: (n: unknown) => void; removeChild: (n: unknown) => void };
  };
  requestAnimationFrame?: (cb: () => void) => void;
  setTimeout: (cb: () => void, ms: number) => void;
}

/**
 * Imprime a proposta no web usando um IFRAME OCULTO.
 *
 * Por que iframe (e não nova aba): quando o app é aberto como atalho na tela
 * inicial do celular (modo standalone/PWA), NÃO existe "nova aba" — abrir uma
 * cai numa tela quebrada/inexistente. O iframe evita isso por completo.
 *
 * Por que iframe (e não imprimir o próprio documento): esconder o app via CSS
 * se mostrou frágil e voltava a imprimir a TELA inteira. O iframe é um
 * documento ISOLADO contendo só a proposta, então nunca "vaza" o app pro PDF.
 *
 * Detalhes CRÍTICOS para NÃO imprimir em branco:
 *  - O iframe precisa ficar PINTADO. `opacity:0`, `visibility:hidden` e
 *    `display:none` fazem o motor de impressão do Chromium tratar o iframe
 *    como não-renderizado e serializar uma página VAZIA. Por isso ele fica
 *    apenas FORA DA TELA (`left:-10000px`), com tamanho real de folha A4
 *    (nunca 0x0, que também imprime em branco).
 *  - `srcdoc` navega de forma assíncrona; imprimimos só no evento `load`.
 *    Como fallback (caso o `load` não dispare em algum motor), também
 *    escrevemos o HTML via `document.open/write/close`.
 *  - Ainda no `load`, esperamos um `requestAnimationFrame` + ~500ms para o
 *    layout, o SVG e o auto-ajuste de escala assentarem antes de imprimir.
 *  - O iframe só é removido no `afterprint` (ou por timeout longo), nunca
 *    antes do job de impressão ser serializado.
 * O <title> (nome do arquivo Cliente-Empreendimento) e o auto-ajuste de
 * escala para 1 página já vêm embutidos em generateProposalHtml.
 */
function printHtmlWeb(ctx: ProposalContext): Promise<void> {
  const g = globalThis as unknown as PrintGlobal;
  const doc = g.document;
  if (!doc) return Promise.resolve();
  const html = generateProposalHtml(ctx);

  return new Promise<void>((resolve) => {
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    // PINTADO, porém fora da tela — sem opacity/visibility/display que
    // fariam o motor de impressão pular a renderização (página em branco).
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = '0';

    let done = false;
    let printed = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      g.setTimeout(() => {
        try {
          doc.body.removeChild(iframe);
        } catch {
          // ignore
        }
      }, 1000);
      resolve();
    };

    const doPrint = () => {
      if (printed) return;
      printed = true;
      const win = iframe.contentWindow;
      if (!win || !win.print) {
        cleanup();
        return;
      }
      win.onafterprint = cleanup;
      const raf = win.requestAnimationFrame ?? g.requestAnimationFrame;
      const afterPaint = () => {
        // Espera layout/SVG e o auto-ajuste de escala assentarem.
        g.setTimeout(() => {
          try {
            win.focus?.();
          } catch {
            // ignore
          }
          win.print?.();
          // Fallback: nem todo navegador dispara afterprint de forma confiável.
          g.setTimeout(cleanup, 60000);
        }, 500);
      };
      if (raf) raf(afterPaint);
      else afterPaint();
    };

    iframe.onload = doPrint;
    iframe.srcdoc = html;
    doc.body.appendChild(iframe);

    // Fallback de robustez: se o evento `load` do srcdoc não disparar,
    // escrevemos o HTML diretamente no documento do iframe e imprimimos.
    g.setTimeout(() => {
      if (printed) return;
      const cdoc = iframe.contentDocument;
      if (cdoc?.open && cdoc.write && cdoc.close) {
        try {
          cdoc.open();
          cdoc.write(html);
          cdoc.close();
        } catch {
          // ignore
        }
      }
      doPrint();
    }, 1500);

    g.setTimeout(cleanup, 60000);
  });
}

/**
 * Gera e compartilha/imprime o PDF da proposta.
 * A Promise só resolve depois que o usuário conclui a impressão/
 * compartilhamento (fecha o diálogo) — use isso para saber quando é seguro
 * limpar a simulação e voltar ao menu.
 */
export async function generateProposal(ctx: ProposalContext): Promise<void> {
  if (Platform.OS === 'web') {
    await printHtmlWeb(ctx);
    return;
  }
  const html = generateProposalHtml(ctx);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: proposalFileName(ctx),
    });
  }
}
