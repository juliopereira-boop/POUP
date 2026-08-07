/**
 * Teto de tamanho por arquivo enviado.
 *
 * Fica em um só lugar porque a regra é a MESMA no material de venda e nos
 * anexos do lead: dois números soltos divergiriam na primeira vez que alguém
 * mudasse só um, e o corretor levaria "arquivo grande demais" em uma tela e
 * não na outra, sem entender o motivo.
 *
 * O bucket do Supabase também tem um limite próprio, definido no projeto. Se
 * este número passar do de lá, o upload é recusado pelo servidor mesmo depois
 * de a tela aprovar — ao mexer aqui, confira o limite global do Storage.
 */
export const MAX_FILE_MB = 35;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
