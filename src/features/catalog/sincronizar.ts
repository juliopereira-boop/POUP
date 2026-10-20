/**
 * SINCRONIZAR EMPRESAS: o atalho da tela inicial para o catálogo do sistema.
 *
 * O corretor não quer passar por Cadastros › Empresas › Catálogo e aceitar uma
 * construtora de cada vez. Aqui ele vê o catálogo já marcado (as construtoras
 * que atuam no estado dele) e sincroniza todas com um toque. É o MESMO vínculo
 * do aceite um a um (`db.catalog.adopt`): nada é copiado, e as atualizações do
 * POUP continuam chegando sozinhas.
 *
 * Quem abre a janela:
 *   - o botão flutuante da tela inicial, que fica sempre lá;
 *   - o fim do guia de boas-vindas, uma vez por conta, se houver o que
 *     sincronizar;
 *   - quem já tinha visto o guia antes deste atalho existir: uma vez, ao abrir
 *     o app.
 *
 * Sem tela aqui: a lógica é pura (testada em `scripts/testar-sincronizar.mjs`)
 * e o registro de quem abre segue o padrão de `features/guide.ts` — o botão
 * mora numa tela, a janela mora no layout.
 */
import type { CatalogCompany, Result } from '@/data/types';
import { matchesUF } from '@/features/uf';

/**
 * O catálogo que o corretor pode sincronizar. Empresa inativa só o admin vê
 * (ela ainda está sendo montada): não entra na janela nem para ele.
 */
export function empresasDoCatalogo(lista: CatalogCompany[]): CatalogCompany[] {
  return lista.filter((e) => e.company.ativa !== false);
}

/** As que ainda não estão na conta do corretor. */
export function paraSincronizar(lista: CatalogCompany[]): CatalogCompany[] {
  return empresasDoCatalogo(lista).filter((e) => !e.adopted);
}

/**
 * Atua no estado do corretor. Os empreendimentos do catálogo de outro estado
 * não aparecem para ele (`SupabaseDevelopmentRepository.list`): sincronizar uma
 * construtora que só tem obra fora traria uma empresa vazia. Sem estado no
 * perfil, ou sem estado na construtora, vale tudo — mesma regra de `matchesUF`.
 */
export function atuaNoEstado(entrada: CatalogCompany, ufDoCorretor: string | null): boolean {
  if (entrada.ufs.length === 0) return true;
  return entrada.ufs.some((uf) => matchesUF(ufDoCorretor, uf));
}

/** O que já vem marcado ao abrir: as pendentes do estado do corretor. */
export function marcadasDeInicio(lista: CatalogCompany[], ufDoCorretor: string | null): string[] {
  return paraSincronizar(lista)
    .filter((e) => atuaNoEstado(e, ufDoCorretor))
    .map((e) => e.company.id);
}

/** Quantas o botão flutuante anuncia: as pendentes que interessam ao corretor. */
export function quantasPendentes(lista: CatalogCompany[], ufDoCorretor: string | null): number {
  return marcadasDeInicio(lista, ufDoCorretor).length;
}

/**
 * A janela abre sozinha no máximo uma vez por conta, e só se houver o que
 * sincronizar no estado do corretor. Depois disso, quem abre é o botão.
 */
export function deveAbrirSozinha(args: { jaAberta: boolean; pendentes: number }): boolean {
  return !args.jaAberta && args.pendentes > 0;
}

/** "Já abriu sozinha" — por conta, no aparelho (como o "já vi o guia"). */
export function chaveJaAberta(userId: string): string {
  return `poup.sync.prompted.${userId}`;
}

export function rotuloDoBotao(marcadas: number): string {
  if (marcadas === 0) return 'Marque ao menos uma empresa';
  return marcadas === 1 ? 'Sincronizar 1 empresa' : `Sincronizar ${marcadas} empresas`;
}

/** "12 empreendimentos · MA, PI" — a linha de baixo de cada construtora. */
export function detalheDaEmpresa(entrada: CatalogCompany, ufDoCorretor: string | null): string {
  const n = entrada.developmentCount;
  const obras = n === 0 ? 'Sem empreendimentos ainda' : n === 1 ? '1 empreendimento' : `${n} empreendimentos`;
  if (entrada.ufs.length === 0) return obras;
  if (!atuaNoEstado(entrada, ufDoCorretor)) return `${obras} · só em ${entrada.ufs.join(', ')}`;
  return `${obras} · ${entrada.ufs.join(', ')}`;
}

export interface ResultadoDaSincronizacao {
  /** Ids sincronizados agora. */
  sincronizadas: string[];
  falhas: { id: string; erro: string }[];
}

/**
 * Sincroniza as marcadas. Uma falha não derruba as outras: o corretor recebe
 * o que deu certo e vê, com nome, o que precisa tentar de novo.
 */
export async function sincronizar(
  ids: string[],
  adotar: (companyId: string) => Promise<Result<void>>,
): Promise<ResultadoDaSincronizacao> {
  const unicos = [...new Set(ids)];
  const respostas = await Promise.all(
    unicos.map(async (id) => {
      try {
        return { id, r: await adotar(id) };
      } catch (e) {
        return { id, r: { ok: false as const, error: String((e as Error)?.message ?? e) } };
      }
    }),
  );
  return {
    sincronizadas: respostas.filter((x) => x.r.ok).map((x) => x.id),
    falhas: respostas.flatMap((x) => (x.r.ok ? [] : [{ id: x.id, erro: x.r.error }])),
  };
}

/** A frase de depois do toque. */
export function resumoDoResultado(r: ResultadoDaSincronizacao, nomes: Map<string, string>): string {
  const n = r.sincronizadas.length;
  const ok =
    n === 0
      ? ''
      : n === 1
        ? `${nomes.get(r.sincronizadas[0]) ?? 'A construtora'} já está no seu app.`
        : `${n} construtoras já estão no seu app.`;
  if (r.falhas.length === 0) {
    return `${ok} Os empreendimentos delas já aparecem no simulador e nos cadastros.`.trim();
  }
  const quais = r.falhas.map((f) => nomes.get(f.id) ?? 'uma construtora').join(', ');
  return `${ok} Não deu para sincronizar: ${quais}. Confira a internet e toque de novo.`.trim();
}

// ---------------------------------------------------------------------------
// Quem abre a janela, e quem quer saber que a conta mudou
// ---------------------------------------------------------------------------

export interface AberturaDaSincronizacao {
  /** O que fazer quando a janela fechar (ex.: o guia pediu o simulador). */
  depois?: () => void;
}

let abridor: ((opcoes?: AberturaDaSincronizacao) => void) | null = null;

export function registrarAbridorDaSincronizacao(
  fn: ((opcoes?: AberturaDaSincronizacao) => void) | null,
): void {
  abridor = fn;
}

export function abrirSincronizacao(opcoes?: AberturaDaSincronizacao): void {
  if (abridor) abridor(opcoes);
  else opcoes?.depois?.();
}

const ouvintes = new Set<() => void>();

/** O botão flutuante recontará quando a conta mudar. Devolve o "parar de ouvir". */
export function aoMudarAsEmpresas(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function avisarQueAsEmpresasMudaram(): void {
  ouvintes.forEach((fn) => fn());
}
