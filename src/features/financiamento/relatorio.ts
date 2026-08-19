/**
 * O RELATÓRIO DA SIMULAÇÃO DE FINANCIAMENTO, EM PDF.
 *
 * ===========================================================================
 * O QUE ESTE DOCUMENTO PRECISA CONSEGUIR FAZER
 * ===========================================================================
 * Ele sai da mão do corretor para a mão do cliente, e muitas vezes para a mão
 * do correspondente bancário depois. Então ele precisa de três coisas ao mesmo
 * tempo:
 *
 *   1. **Ser lido em trinta segundos.** Os números que decidem — parcela,
 *      entrada, financiado, prazo — vêm em destaque, antes de qualquer tabela.
 *   2. **Ser conferível.** A composição da prestação, o enquadramento item a
 *      item e a evolução do saldo estão lá para quem quiser conferir.
 *   3. **Não prometer nada.** O rodapé diz, em toda página, que é simulação
 *      estimada e sujeita a análise. E onde faltou parâmetro, o documento diz
 *      "não calculado" em vez de omitir a linha — omitir faria a prestação
 *      parecer completa.
 *
 * ===========================================================================
 * A VERSÃO DAS REGRAS SAI IMPRESSA
 * ===========================================================================
 * No cabeçalho e no rodapé. É o que permite, seis meses depois, saber com quais
 * condições aquele papel foi gerado — e é o que torna a auditoria possível sem
 * depender de ninguém lembrar.
 *
 * ===========================================================================
 * A TABELA NÃO SAI INTEIRA
 * ===========================================================================
 * 420 linhas seriam nove páginas que ninguém lê e que fazem o corretor desistir
 * de mandar o PDF pelo WhatsApp. Saem as primeiras doze, as últimas três e um
 * marco a cada cinco anos — que é o recorte que responde as perguntas reais
 * ("quanto tá pagando daqui a dez anos?").
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { UserProfile } from '@/data';
import { imprimirHtmlNaWeb } from '@/features/pdf/imprimir';
import { LOGO_DATA_URI } from '@/features/simulador/logoDataUri';
import { formatarBRL, formatarPct, formatarPrazo, type Centavos } from './dinheiro';
import { AVISO_LEGAL, type ResultadoSimulacao } from './motor';
import { SISTEMA_ROTULO } from './amortizacao';
import { OPERACAO_ROTULO, type TipoOperacao } from './regras';

export interface ContextoRelatorio {
  resultado: ResultadoSimulacao;
  perfil: UserProfile | null;
  clienteNome: string | null;
  empresaNome: string | null;
  empreendimentoNome: string | null;
  bloco: number | null;
  unidade: string | null;
  operacao: TipoOperacao;
  /** AAAA-MM-DD, vindo do APARELHO — nunca do servidor, que roda em UTC. */
  hojeISO: string;
}

const LARANJA = '#E2621B';
const CINZA = '#EFEFEF';

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string,
  );
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** `Centavos | null` → texto. `null` vira "não calculado", nunca "R$ 0,00". */
function money(c: Centavos | null): string {
  return c === null ? '<i>não calculado</i>' : formatarBRL(c);
}

export function nomeArquivo(ctx: ContextoRelatorio): string {
  const cliente = (ctx.clienteNome ?? 'cliente').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 32);
  return `simulacao-financiamento-${cliente}-${ctx.hojeISO}`;
}

/**
 * As linhas da tabela que valem a pena imprimir.
 *
 * Primeiras doze (o primeiro ano, que é o que aperta), marcos de cinco em cinco
 * anos, e as três últimas (que mostram o contrato terminando). O resto é
 * previsível e ocuparia páginas.
 */
function linhasImpressas(r: ResultadoSimulacao) {
  const total = r.tabela.length;
  const indices = new Set<number>();
  for (let i = 0; i < Math.min(12, total); i++) indices.add(i);
  for (let m = 60; m < total; m += 60) indices.add(m - 1);
  for (let i = Math.max(0, total - 3); i < total; i++) indices.add(i);
  return [...indices].sort((a, b) => a - b).map((i) => r.tabela[i]!);
}

export function gerarHtmlRelatorio(ctx: ContextoRelatorio): string {
  const r = ctx.resultado;
  const p = ctx.perfil;

  const imovel = [
    ctx.empreendimentoNome,
    ctx.bloco ? `Bloco ${ctx.bloco}` : null,
    ctx.unidade ? `Unidade ${ctx.unidade}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const destaques = `
    <div class="destaques">
      ${caixa('Imóvel', formatarBRL(r.valorImovel))}
      ${caixa('Entrada total', formatarBRL(r.entradaTotal))}
      ${caixa('Financiamento', formatarBRL(r.valorFinanciado))}
      ${caixa('Prazo', formatarPrazo(r.prazoMeses))}
      ${caixa('1ª parcela', money(r.primeira.total), true)}
      ${caixa('Última parcela', money(r.ultima.total))}
      ${caixa('Renda mínima estimada', money(r.rendaMinimaEstimada))}
      ${caixa('Sistema', SISTEMA_ROTULO[r.sistema])}
    </div>`;

  const composicao = `
    <h2>Composição da 1ª prestação</h2>
    <table class="t">
      <tr><th>Amortização</th><td>${formatarBRL(r.primeira.amortizacao)}</td></tr>
      <tr><th>Juros</th><td>${formatarBRL(r.primeira.juros)}</td></tr>
      <tr><th>MIP (morte e invalidez)</th><td>${money(r.primeira.mip)}</td></tr>
      <tr><th>DFI (danos ao imóvel)</th><td>${money(r.primeira.dfi)}</td></tr>
      <tr><th>Tarifa de administração</th><td>${money(r.primeira.tarifa)}</td></tr>
      <tr class="tot"><th>Total</th><td>${formatarBRL(r.primeira.total)}${
        r.primeira.parcial ? ' <i>(parcial)</i>' : ''
      }</td></tr>
    </table>`;

  const enquadramento = `
    <h2>Enquadramento estimado</h2>
    <table class="t">
      ${r.elegibilidade.itens
        .map(
          (i) => `<tr>
            <th>${esc(i.rotulo)}</th>
            <td><span class="pill ${i.situacao}">${rotuloSituacao(i.situacao)}</span> ${esc(i.detalhe)}</td>
          </tr>`,
        )
        .join('')}
    </table>`;

  const naoCalculados = r.naoCalculados.length
    ? `<h2>O que não foi calculado</h2>
       <ul class="nc">
         ${r.naoCalculados.map((n) => `<li><b>${esc(n.o_que)}</b> — ${esc(n.motivo)}</li>`).join('')}
       </ul>`
    : '';

  const tabela = `
    <h2>Evolução (resumo)</h2>
    <table class="t linhas">
      <tr><th>Parcela</th><th>Saldo inicial</th><th>Juros</th><th>Amortização</th><th>Prestação</th></tr>
      ${linhasImpressas(r)
        .map(
          (l) => `<tr>
            <td>${l.numero}</td>
            <td>${formatarBRL(l.saldoInicial)}</td>
            <td>${formatarBRL(l.juros)}</td>
            <td>${formatarBRL(l.amortizacao)}</td>
            <td>${formatarBRL(l.encargoPrincipal)}</td>
          </tr>`,
        )
        .join('')}
    </table>
    <p class="nota">
      Prestação da tabela = amortização + juros (encargo principal). Seguros e tarifa entram por
      cima, conforme a composição acima. Linhas selecionadas: o primeiro ano, marcos de cinco em
      cinco anos e o fim do contrato.
    </p>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:#1A1A1A; font-size:11px; margin:0; }
  .sheet { width: 100%; }
  header { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${LARANJA}; padding-bottom:8px; margin-bottom:14px; }
  header img { height:34px; }
  h1 { font-size:15px; margin:0 0 2px; letter-spacing:-0.3px; }
  .meta { font-size:9.5px; color:#666; text-align:right; line-height:1.5; }
  h2 { font-size:11.5px; margin:16px 0 6px; color:${LARANJA}; text-transform:uppercase; letter-spacing:0.4px; }
  .ident { display:grid; grid-template-columns:1fr 1fr; gap:4px 18px; font-size:10.5px; margin-bottom:4px; }
  .ident b { color:#555; font-weight:600; }
  .destaques { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:10px 0 4px; }
  .cx { border:1px solid #DDD; border-radius:6px; padding:7px 8px; }
  .cx.forte { background:#FFF3EA; border-color:${LARANJA}; }
  .cx span { display:block; font-size:8.5px; color:#777; text-transform:uppercase; letter-spacing:0.4px; }
  .cx b { display:block; font-size:13px; margin-top:2px; }
  .cx.forte b { color:${LARANJA}; }
  table.t { width:100%; border-collapse:collapse; }
  table.t th, table.t td { border:1px solid #DDD; padding:4px 6px; text-align:left; vertical-align:top; }
  table.t th { background:${CINZA}; font-weight:600; width:32%; }
  table.t.linhas th { width:auto; text-align:center; }
  table.t.linhas td { text-align:right; font-variant-numeric:tabular-nums; }
  table.t.linhas td:first-child { text-align:center; }
  tr.tot th, tr.tot td { background:#FFF3EA; font-weight:700; }
  .pill { display:inline-block; padding:1px 6px; border-radius:8px; font-size:8.5px; font-weight:700; margin-right:4px; }
  .pill.ok { background:#DFF5E6; color:#15803D; }
  .pill.atencao { background:#FEF3C7; color:#B45309; }
  .pill.reprova { background:#FEE2E2; color:#B91C1C; }
  .pill.nao_verificado { background:#E5E7EB; color:#4B5563; }
  ul.nc { margin:4px 0 0 14px; padding:0; font-size:10px; line-height:1.5; }
  .nota { font-size:9px; color:#777; margin-top:5px; line-height:1.45; }
  footer { margin-top:16px; padding-top:8px; border-top:1px solid #DDD; font-size:8.5px; color:#666; line-height:1.5; }
  footer b { color:#B91C1C; }
</style></head>
<body><div class="sheet">
  <header>
    <div>
      <img src="${LOGO_DATA_URI}" alt=""/>
    </div>
    <div>
      <h1>Simulação de financiamento imobiliário</h1>
      <div class="meta">
        Gerada em ${dataBR(ctx.hojeISO)} · Regras versão ${esc(r.versaoRegras)}<br/>
        ${esc(p?.fullName)} ${p?.creci ? `· CRECI ${esc(p.creci)}` : ''} ${p?.agency ? `· ${esc(p.agency)}` : ''}
      </div>
    </div>
  </header>

  <h2>Identificação</h2>
  <div class="ident">
    <div><b>Cliente:</b> ${esc(ctx.clienteNome) || '—'}</div>
    <div><b>Operação:</b> ${esc(OPERACAO_ROTULO[ctx.operacao])}</div>
    <div><b>Imóvel:</b> ${esc(imovel) || '—'}</div>
    <div><b>Construtora:</b> ${esc(ctx.empresaNome) || '—'}</div>
    <div><b>Linha:</b> ${esc(r.produto.nome)}</div>
    <div><b>Indexador:</b> ${esc(r.indexador.nome)}${r.indexador.correcaoAplicada ? '' : ' (sem correção projetada)'}</div>
    <div><b>Taxa:</b> ${formatarPct(r.taxaAnualPct)} ao ano ${r.produto.parametrosManuais ? '(informada)' : ''}</div>
    <div><b>Corretor:</b> ${esc(p?.fullName) || '—'}</div>
  </div>

  ${destaques}
  ${composicao}
  ${enquadramento}
  ${naoCalculados}
  ${tabela}

  <footer>
    <b>SIMULAÇÃO ESTIMADA — SUJEITA À ANÁLISE DE CRÉDITO E ÀS CONDIÇÕES VIGENTES DA INSTITUIÇÃO FINANCEIRA.</b><br/>
    ${esc(AVISO_LEGAL)}<br/>
    Regras aplicadas: versão ${esc(r.versaoRegras)}, vigente desde ${dataBR(r.vigenciaRegras)}.
    ${r.produto.parametrosManuais ? 'Taxa, prazo e quota informados pelo corretor a partir da condição do correspondente bancário.' : ''}
  </footer>
</div></body></html>`;
}

function caixa(rotulo: string, valor: string, forte = false): string {
  return `<div class="cx${forte ? ' forte' : ''}"><span>${esc(rotulo)}</span><b>${valor}</b></div>`;
}

function rotuloSituacao(s: string): string {
  if (s === 'ok') return 'OK';
  if (s === 'atencao') return 'ATENÇÃO';
  if (s === 'reprova') return 'NÃO PASSA';
  return 'NÃO VERIFICADO';
}

export async function gerarRelatorio(ctx: ContextoRelatorio): Promise<void> {
  const html = gerarHtmlRelatorio(ctx);
  if (Platform.OS === 'web') {
    await imprimirHtmlNaWeb(html, nomeArquivo(ctx));
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: nomeArquivo(ctx),
    });
  }
}

/**
 * O resumo curto para mandar no WhatsApp.
 *
 * Existe porque o PDF nem sempre é o certo: no meio da conversa o corretor quer
 * colar quatro linhas no chat, e um anexo obriga o cliente a abrir outro
 * aplicativo. Termina com o aviso de simulação estimada — o mesmo do PDF, pela
 * mesma razão.
 */
export function resumoParaWhatsapp(ctx: ContextoRelatorio): string {
  const r = ctx.resultado;
  const linhas = [
    `*Simulação de financiamento*`,
    ctx.clienteNome ? `Cliente: ${ctx.clienteNome}` : null,
    ctx.empreendimentoNome ? `Imóvel: ${ctx.empreendimentoNome}` : null,
    ``,
    `Valor do imóvel: ${formatarBRL(r.valorImovel)}`,
    `Entrada total: ${formatarBRL(r.entradaTotal)}`,
    `Financiamento: ${formatarBRL(r.valorFinanciado)}`,
    `Prazo: ${formatarPrazo(r.prazoMeses)} (${r.sistema})`,
    `1ª parcela: ${formatarBRL(r.primeira.total)}${r.primeira.parcial ? ' (sem seguros)' : ''}`,
    `Última parcela: ${formatarBRL(r.ultima.total)}`,
    r.rendaMinimaEstimada ? `Renda mínima estimada: ${formatarBRL(r.rendaMinimaEstimada)}` : null,
    ``,
    `_Simulação estimada. Sujeita à análise de crédito e às condições da instituição financeira._`,
  ];
  return linhas.filter((l) => l !== null).join('\n');
}
