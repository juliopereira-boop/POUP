/**
 * Traduz erro técnico em frase que dá para mostrar a uma pessoa.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * Os repositórios devolviam a mensagem crua do Postgres/PostgREST, e as telas
 * jogavam esse texto direto na frente do corretor. Na prática ele podia ver
 * coisas como:
 *
 *   duplicate key value violates unique constraint "sales_simulation_unique"
 *   new row violates row-level security policy for table "leads"
 *   Could not find the table 'public.commissions' in the schema cache
 *
 * Isso é ruim por dois motivos. Para o corretor, é incompreensível. Para a
 * revisão da App Store, é a cara de um app inacabado — a regra 2.1 fala em
 * rejeitar binários que "exibem problemas técnicos óbvios".
 *
 * ------------------------------------------------------------------
 * POR QUE FICA NO `err()`, E NÃO EM CADA TELA
 * ------------------------------------------------------------------
 * Eram cerca de quarenta pontos diferentes onde o erro cru saía. Corrigir um
 * por um deixaria o próximo esquecido. Passando por aqui, qualquer erro novo
 * já nasce tratado.
 *
 * ------------------------------------------------------------------
 * O CUIDADO QUE ISSO EXIGE
 * ------------------------------------------------------------------
 * A maioria das mensagens que passam por `err()` JÁ está em português e escrita
 * para o corretor ler. Estragar essas seria pior que o problema original. Por
 * isso o reconhecimento é conservador: só reescreve o que tem cara inequívoca
 * de erro de banco (código SQLSTATE, código PostgREST, jargão em inglês). Na
 * dúvida, o texto passa intacto.
 */

/** Frase padrão quando o erro é técnico mas não se encaixa em nenhum caso. */
const GENERICA = 'Não foi possível concluir. Tente de novo.';

interface Caso {
  /** O que denuncia esse tipo de erro. */
  teste: RegExp;
  mensagem: string;
}

/**
 * Ordem importa: o primeiro que casar vence, então os casos específicos vêm
 * antes dos genéricos.
 */
const CASOS: Caso[] = [
  {
    // 23505 = unique_violation
    teste: /duplicate key|already exists|unique constraint|\b23505\b/i,
    mensagem: 'Esse registro já existe.',
  },
  {
    // 42501 / RLS: o corretor tentou mexer em algo que não é dele.
    teste: /row-level security|permission denied|insufficient privilege|\b42501\b/i,
    mensagem: 'Você não tem permissão para fazer isso.',
  },
  {
    // 42P01 / PGRST205: tabela ou coluna que o banco ainda não tem. O corretor
    // não pode ver nome de migration nem de tabela — isso é problema nosso.
    teste:
      /does not exist|could not find the table|could not find the .* column|schema cache|PGRST\d+|\b42P01\b|\b42703\b/i,
    mensagem: 'Este recurso está indisponível no momento. Tente de novo mais tarde.',
  },
  {
    // 23503 = foreign_key_violation
    teste: /foreign key|violates foreign key constraint|\b23503\b/i,
    mensagem: 'Não foi possível concluir porque este item está ligado a outro.',
  },
  {
    // 23502 = not_null_violation
    teste: /null value in column|not-null constraint|\b23502\b/i,
    mensagem: 'Faltou preencher um campo obrigatório.',
  },
  {
    // 22P02 = invalid_text_representation
    teste: /invalid input syntax|invalid text representation|\b22P02\b/i,
    mensagem: 'Algum dado foi digitado num formato que o sistema não entendeu.',
  },
  {
    teste: /\bJWT\b|token is expired|invalid claim|session.*expired/i,
    mensagem: 'Sua sessão expirou. Entre de novo para continuar.',
  },
  {
    teste: /failed to fetch|network request failed|networkerror|timeout|ETIMEDOUT|ECONNREFUSED/i,
    mensagem: 'Sem conexão com o servidor. Confira sua internet e tente de novo.',
  },
];

/**
 * O texto tem cara de erro de sistema (e não de recado ao corretor)?
 *
 * Serve de rede final: pega jargão que não caiu em nenhum caso acima, para não
 * deixar passar coisas como `relation "x" violates ...`.
 */
function pareceTecnico(texto: string): boolean {
  return /violates|constraint|relation "|column "|table "|PGRST|\bSQL\b|stack trace|at Object\.|TypeError|undefined is not|\b[0-9A-Z]{5}\b:/i.test(
    texto,
  );
}

/**
 * A versão apresentável de uma mensagem de erro.
 *
 * @returns a própria mensagem quando ela já serve para leitura humana.
 */
export function friendlyError(raw: string): string {
  const texto = (raw ?? '').trim();
  if (!texto) return GENERICA;

  for (const caso of CASOS) {
    if (caso.teste.test(texto)) return caso.mensagem;
  }
  if (pareceTecnico(texto)) return GENERICA;

  return texto;
}
