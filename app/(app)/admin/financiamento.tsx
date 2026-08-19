/**
 * REGRAS DE FINANCIAMENTO — a tela do administrador.
 *
 * ===========================================================================
 * ELA EXISTE PARA QUE MUDANÇA DE TAXA NÃO SEJA MUDANÇA DE CÓDIGO
 * ===========================================================================
 * Quando a CAIXA reajusta uma faixa do Minha Casa Minha Vida — e ela reajusta —,
 * o certo é o administrador abrir esta tela, digitar o número novo, informar a
 * fonte e o motivo, e publicar. Sem republicar aplicativo, sem esperar loja,
 * sem mexer numa linha de TypeScript.
 *
 * ===========================================================================
 * TRÊS COISAS QUE ESTA TELA COBRA, E NÃO ABRE MÃO
 * ===========================================================================
 *   1. **A fonte.** Todo parâmetro tem que dizer de onde veio e quando foi
 *      verificado. É o que separa "oficial" de "achismo" na hora em que o
 *      corretor apresenta a condição ao cliente.
 *   2. **O motivo.** Toda publicação exige uma frase. Seis meses depois, "por
 *      que a taxa da Faixa 2 mudou em setembro?" precisa ter resposta.
 *   3. **Uma versão nova, não uma edição.** Publicar cria/atualiza uma versão
 *      datada, e as simulações antigas continuam carregando o snapshot delas.
 *      A proposta de ontem não muda porque a regra de hoje mudou.
 *
 * ===========================================================================
 * O QUE FALTA APARECE PRIMEIRO
 * ===========================================================================
 * O topo é a lista de pendências — todo parâmetro ainda não confirmado, com o
 * motivo e onde conferir. É a lista de tarefas do administrador, e enquanto ela
 * não esvaziar há linha de financiamento que o corretor não consegue usar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { db } from '@/data';
import { useIsAdmin } from '@/features/admin';
import {
  acharProduto,
  oficial,
  parametrosPendentes,
  produtoCalculavel,
  temValor,
  type Parametro,
  type ProdutoFinanciamento,
  type VersaoRegras,
} from '@/features/financiamento/regras';
import { REGRAS_PADRAO } from '@/features/financiamento/regrasPadrao';
import { hojeISO } from '@/features/financiamento/formulario';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** Os campos numéricos de um produto que a tela edita. */
const CAMPOS: {
  chave: keyof ProdutoFinanciamento;
  rotulo: string;
  sufixo: string;
  ajuda: string;
}[] = [
  { chave: 'taxaAnualPct', rotulo: 'Taxa ao ano', sufixo: '%', ajuda: 'Ex.: 8,66' },
  { chave: 'quotaMaxPct', rotulo: 'Quota máxima financiada', sufixo: '%', ajuda: 'Ex.: 80' },
  { chave: 'prazoMaxMeses', rotulo: 'Prazo máximo', sufixo: 'meses', ajuda: 'Ex.: 420' },
  { chave: 'valorImovelMax', rotulo: 'Valor máximo do imóvel', sufixo: 'R$', ajuda: 'Ex.: 500000' },
  {
    chave: 'comprometimentoRendaMaxPct',
    rotulo: 'Comprometimento máximo de renda',
    sufixo: '%',
    ajuda: 'Ex.: 30',
  },
  {
    chave: 'idadeMaisPrazoMaxAnos',
    rotulo: 'Idade + prazo (limite)',
    sufixo: 'anos',
    ajuda: 'Ex.: 80',
  },
  { chave: 'subsidioMax', rotulo: 'Subsídio máximo', sufixo: 'R$', ajuda: '0 se não houver' },
  { chave: 'entradaMinimaPct', rotulo: 'Entrada mínima', sufixo: '%', ajuda: 'Ex.: 20' },
  { chave: 'carenciaMaxMeses', rotulo: 'Carência máxima', sufixo: 'meses', ajuda: '0 se não houver' },
];

/**
 * Os parâmetros GLOBAIS da versão — os que não pertencem a um produto.
 *
 * Seguros e tarifa vêm da apólice e do contrato, não da linha de
 * financiamento; o limite SFH vem de normativo. Editá-los junto com um produto
 * daria a impressão errada de que a apólice muda por faixa do MCMV.
 */
const CAMPOS_GLOBAIS = [
  {
    chave: 'dfi',
    rotulo: 'DFI — taxa mensal sobre a avaliação (%)',
    ajuda: 'Ex.: 0,015. Vem da apólice, não da CAIXA.',
  },
  {
    chave: 'tarifa',
    rotulo: 'Tarifa de administração (R$/mês)',
    ajuda: 'Varia por tipo de financiamento e por SFH/SFI.',
  },
  {
    chave: 'sfh',
    rotulo: 'Limite de enquadramento SFH (R$)',
    ajuda: 'Acima deste valor de avaliação, a operação é SFI.',
  },
  {
    chave: 'tr',
    rotulo: 'TR observada (% ao mês)',
    ajuda: 'Do Banco Central. Em branco = a tabela sai sem correção.',
  },
];

function textoDe(p: Parametro<number> | undefined): string {
  return temValor(p) ? String(p.valor).replace('.', ',') : '';
}

function numeroDe(texto: string): number | null {
  const t = texto.trim().replace('%', '').replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function AdminFinanciamento() {
  const styles = useThemedStyles(makeStyles);
  const { isAdmin, loading } = useIsAdmin();

  const [regras, setRegras] = useState<VersaoRegras>(REGRAS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [produtoId, setProdutoId] = useState<string>('mcmv_1');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [globais, setGlobais] = useState<Record<string, string>>({});
  const [fonte, setFonte] = useState('CAIXA');
  const [fonteUrl, setFonteUrl] = useState('https://www.caixa.gov.br/');
  const [versao, setVersao] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const remotas = await db.financing.regrasVigentes();
    if (remotas && typeof remotas === 'object') setRegras(remotas as VersaoRegras);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // A versão sugerida é AAAA.MM do mês corrente: é assim que o corretor e o
  // administrador se referem a ela ("a regra de agosto").
  useEffect(() => {
    if (versao) return;
    const [ano, mes] = hojeISO().split('-');
    setVersao(`${ano}.${mes}`);
  }, [versao]);

  const produto = acharProduto(regras, produtoId);
  const pendencias = useMemo(() => parametrosPendentes(regras), [regras]);

  // Ao trocar de produto, os campos carregam o que já está cadastrado.
  useEffect(() => {
    if (!produto) return;
    const proximo: Record<string, string> = {};
    for (const c of CAMPOS) {
      proximo[c.chave] = textoDe(produto[c.chave] as Parametro<number>);
    }
    const faixa = produto.faixaRenda;
    proximo.rendaMin = temValor(faixa) ? String(faixa.valor.min).replace('.', ',') : '';
    proximo.rendaMax =
      temValor(faixa) && faixa.valor.max !== null ? String(faixa.valor.max).replace('.', ',') : '';
    setValores(proximo);
    setFonte(produto.fonte ?? 'CAIXA');
    setFonteUrl(produto.fonteUrl ?? 'https://www.caixa.gov.br/');
  }, [produto]);

  // Os globais carregam da versão, e não do produto escolhido.
  useEffect(() => {
    const tr = regras.indexadores.find((i) => i.id === 'TR');
    setGlobais({
      dfi: textoDe(regras.seguros.dfiPctMensalSobreAvaliacao),
      tarifa: textoDe(regras.seguros.tarifaAdminMensal),
      sfh: textoDe(regras.sfh.limiteValorImovel),
      tr: temValor(tr?.taxaMensal) ? String((tr.taxaMensal.valor as number) * 100).replace('.', ',') : '',
    });
  }, [regras]);

  if (loading || carregando) return <LoadingScreen />;
  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.titulo}>Acesso restrito</Text>
        <Text style={styles.texto}>Esta área é do administrador do POUP.</Text>
      </Screen>
    );
  }

  async function publicar() {
    setAviso(null);
    if (!motivo.trim()) {
      setAviso('Explique o motivo da alteração. Ele fica gravado na auditoria.');
      return;
    }
    if (!produto) return;

    const hoje = hojeISO();
    const novoProduto: ProdutoFinanciamento = { ...produto };

    for (const c of CAMPOS) {
      const n = numeroDe(valores[c.chave] ?? '');
      if (n === null) continue;
      /*
       * Quem digita aqui é o administrador lendo a fonte oficial — então o
       * parâmetro nasce `oficial`, com fonte e data de verificação. É esse
       * carimbo que a tela do corretor e o PDF usam para dizer se a condição é
       * oficial ou estimada; sem ele, tudo viraria "estimativa" e o rótulo
       * perderia o sentido.
       */
      (novoProduto as unknown as Record<string, Parametro<number>>)[c.chave] = oficial(
        n,
        fonte.trim(),
        fonteUrl.trim(),
        hoje,
      );
    }

    const min = numeroDe(valores.rendaMin ?? '');
    const max = numeroDe(valores.rendaMax ?? '');
    if (min !== null) {
      novoProduto.faixaRenda = oficial({ min, max }, fonte.trim(), fonteUrl.trim(), hoje);
    }
    novoProduto.fonte = fonte.trim() || null;
    novoProduto.fonteUrl = fonteUrl.trim() || null;

    /*
     * Os globais só são gravados quando FOREM PREENCHIDOS.
     *
     * Campo vazio mantém o que já estava — inclusive o `pendente`. Limpar um
     * campo aqui não pode apagar em silêncio uma taxa que alguém cadastrou na
     * semana passada; para remover, o administrador troca o valor.
     */
    const dfi = numeroDe(globais.dfi ?? '');
    const tarifa = numeroDe(globais.tarifa ?? '');
    const sfhLimite = numeroDe(globais.sfh ?? '');
    const trPct = numeroDe(globais.tr ?? '');

    const payload: VersaoRegras = {
      ...regras,
      versao: versao.trim(),
      vigenciaInicio: hoje,
      vigenciaFim: null,
      status: 'ativa',
      produtos: regras.produtos.map((p) => (p.id === produtoId ? novoProduto : p)),
      seguros: {
        ...regras.seguros,
        dfiPctMensalSobreAvaliacao:
          dfi !== null
            ? oficial(dfi, fonte.trim(), fonteUrl.trim(), hoje)
            : regras.seguros.dfiPctMensalSobreAvaliacao,
        tarifaAdminMensal:
          tarifa !== null
            ? oficial(tarifa, fonte.trim(), fonteUrl.trim(), hoje)
            : regras.seguros.tarifaAdminMensal,
      },
      sfh: {
        limiteValorImovel:
          sfhLimite !== null
            ? oficial(sfhLimite, fonte.trim(), fonteUrl.trim(), hoje)
            : regras.sfh.limiteValorImovel,
      },
      indexadores: regras.indexadores.map((i) =>
        i.id === 'TR' && trPct !== null
          ? {
              ...i,
              taxaMensal: oficial(
                trPct / 100,
                'Banco Central do Brasil',
                'https://www.bcb.gov.br/',
                hoje,
              ),
            }
          : i,
      ),
      fonte: fonte.trim() || null,
      fonteUrl: fonteUrl.trim() || null,
      notas: null,
    };

    setSalvando(true);
    const r = await db.financing.salvarVersao({
      versao: versao.trim(),
      vigenciaInicio: hoje,
      vigenciaFim: null,
      status: 'ativa',
      payload,
      motivo: motivo.trim(),
      fonte: fonte.trim() || null,
      fonteUrl: fonteUrl.trim() || null,
    });
    setSalvando(false);

    if (!r.ok) {
      setAviso(r.error);
      return;
    }
    setRegras(payload);
    setMotivo('');
    setAviso(`Versão ${versao} publicada. As próximas simulações já usam estes parâmetros.`);
  }

  return (
    <Screen>
      <Text style={styles.titulo}>Regras de financiamento</Text>
      <Text style={styles.sub}>
        Versão vigente: <Text style={styles.forte}>{regras.versao}</Text> (desde{' '}
        {regras.vigenciaInicio}). Alterar aqui NÃO recalcula simulação já salva — cada uma guarda
        as regras do dia em que foi feita.
      </Text>

      {/* ------------------------------------------------------ pendências */}
      <Text style={styles.secao}>O que falta confirmar ({pendencias.length})</Text>
      {pendencias.length === 0 ? (
        <Text style={styles.texto}>
          Nenhuma pendência: todas as linhas estão com parâmetros cadastrados.
        </Text>
      ) : (
        <View style={styles.pendencias}>
          {pendencias.slice(0, 12).map((p) => (
            <View key={p.onde} style={styles.pendencia}>
              <Text style={styles.pendenciaOnde}>{p.onde}</Text>
              <Text style={styles.pendenciaMotivo}>{p.motivo}</Text>
            </View>
          ))}
          {pendencias.length > 12 ? (
            <Text style={styles.texto}>e mais {pendencias.length - 12}…</Text>
          ) : null}
        </View>
      )}

      {/* --------------------------------------------------------- produto */}
      <Text style={styles.secao}>Linha de financiamento</Text>
      <View style={styles.chips}>
        {regras.produtos
          .filter((p) => !p.parametrosManuais)
          .map((p) => {
            const ativo = p.id === produtoId;
            const completo = produtoCalculavel(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => setProdutoId(p.id)}
                style={[styles.chip, ativo && styles.chipAtivo]}
              >
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                  {completo ? '● ' : '○ '}
                  {p.nome}
                </Text>
              </Pressable>
            );
          })}
      </View>

      {produto ? (
        <>
          <Text style={styles.descricao}>{produto.descricao}</Text>

          <View style={styles.linha}>
            <View style={styles.col}>
              <Input
                label="Renda mínima da faixa (R$)"
                value={valores.rendaMin ?? ''}
                onChangeText={(t) => setValores((v) => ({ ...v, rendaMin: t }))}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.col}>
              <Input
                label="Renda máxima (R$)"
                value={valores.rendaMax ?? ''}
                onChangeText={(t) => setValores((v) => ({ ...v, rendaMax: t }))}
                placeholder="em branco = sem teto"
                keyboardType="numeric"
              />
            </View>
          </View>

          {CAMPOS.map((c) => (
            <Input
              key={c.chave}
              label={`${c.rotulo} (${c.sufixo})`}
              value={valores[c.chave] ?? ''}
              onChangeText={(t) => setValores((v) => ({ ...v, [c.chave]: t }))}
              placeholder={c.ajuda}
              keyboardType="numeric"
            />
          ))}

          <Text style={styles.secao}>Parâmetros globais da versão</Text>
          <Text style={styles.texto}>
            Valem para todas as linhas: os seguros vêm da apólice, a tarifa vem do contrato, e o
            limite SFH vem de normativo. Campo em branco mantém o que já está cadastrado.
          </Text>
          <View style={{ height: spacing.md }} />
          {CAMPOS_GLOBAIS.map((c) => (
            <View key={c.chave}>
              <Input
                label={c.rotulo}
                value={globais[c.chave] ?? ''}
                onChangeText={(t) => setGlobais((v) => ({ ...v, [c.chave]: t }))}
                placeholder={c.ajuda}
                keyboardType="numeric"
              />
            </View>
          ))}
          <Text style={styles.ajuda}>
            A tábua do MIP por faixa etária ainda não é editável por esta tela — ela é uma lista de
            faixas, não um número, e merece um editor próprio. Enquanto isso, a prestação sai sem o
            seguro de morte e invalidez, e o resultado diz isso.
          </Text>

          <Text style={styles.secao}>Procedência</Text>
          <Input label="Fonte" value={fonte} onChangeText={setFonte} placeholder="CAIXA" />
          <Input
            label="URL da fonte"
            value={fonteUrl}
            onChangeText={setFonteUrl}
            placeholder="https://www.caixa.gov.br/..."
            autoCapitalize="none"
          />
          <Text style={styles.ajuda}>
            O que você digitar acima entra como parâmetro <Text style={styles.forte}>oficial</Text>,
            com a data de hoje como verificação. É esse carimbo que faz o app apresentar a condição
            como oficial em vez de estimativa — então só preencha com o que você conferiu na fonte.
          </Text>

          <Text style={styles.secao}>Publicar</Text>
          <Input
            label="Versão"
            value={versao}
            onChangeText={setVersao}
            placeholder="2026.08"
            autoCapitalize="none"
          />
          <Input
            label="Motivo da alteração"
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ex.: reajuste da Faixa 2 publicado em 01/08"
            multiline
          />
          <Text style={styles.ajuda}>
            Fica gravado na trilha de auditoria junto com quem alterou, quando, e os valores antes e
            depois.
          </Text>

          {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

          <Button
            label={salvando ? 'Publicando…' : 'Publicar versão'}
            onPress={() => void publicar()}
            disabled={salvando}
            style={{ marginTop: spacing.md }}
          />
          <Text style={styles.legal}>
            Publicar torna esta versão a vigente e encerra a anterior. Simulações já salvas
            continuam com as regras que tinham.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    titulo: { ...typography.title, color: colors.primary },
    sub: { ...typography.caption, color: colors.inkMuted, lineHeight: 19, marginBottom: spacing.md },
    texto: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },
    forte: { fontWeight: '700', color: colors.ink },
    secao: {
      ...typography.heading,
      color: colors.ink,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    descricao: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.lg, lineHeight: 18 },

    pendencias: { gap: spacing.sm },
    pendencia: {
      padding: spacing.md,
      borderRadius: radius.sm,
      backgroundColor: colors.warningSoft,
      gap: 2,
    },
    pendenciaOnde: { ...typography.label, color: colors.ink, fontSize: 13 },
    pendenciaMotivo: { ...typography.caption, color: colors.inkMuted, lineHeight: 18 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipAtivo: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    chipTexto: { ...typography.caption, color: colors.inkMuted },
    chipTextoAtivo: { color: colors.primary, fontWeight: '700' },

    linha: { flexDirection: 'row', gap: spacing.lg },
    col: { flex: 1 },

    ajuda: {
      ...typography.caption,
      color: colors.inkMuted,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
      lineHeight: 18,
    },
    aviso: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginTop: spacing.md,
      overflow: 'hidden',
    },
    legal: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md, lineHeight: 17 },
  });
