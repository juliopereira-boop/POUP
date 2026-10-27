/**
 * DISPONIBILIDADE DO CV — O PAINEL DO ADMIN.
 *
 * Cada construtora tem a SUA conta do CV, integrada no cadastro dela
 * (Catálogo do sistema › construtora › Integrar CV). Aqui:
 *
 *   1. As construtoras com o CV integrado e a saúde de cada conta.
 *   2. As duas leituras automáticas (a leve, de minuto em minuto, e a
 *      completa, de 30 em 30 min): quando rodaram e se deu certo.
 *   3. Os empreendimentos do CV já vinculados a empreendimentos do POUP —
 *      toque para conferir unidade a unidade ou ler agora.
 *   4. Situações do CV que ainda não têm cor (nova no CV): classificar.
 *   5. Importar do CV: escolhe a construtora, busca os empreendimentos que
 *      existem na conta dela; tocar num abre a prévia e cadastra
 *      empreendimento, blocos, unidades e vínculos.
 *
 * O POUP só LÊ o CV. Nenhuma ação desta tela altera o CV.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { ImportarDoCv } from '@/components/cvcrm/ImportarDoCv';
import { db, type EmpreendimentoDoCv, type LeituraDoCv, type PainelCv, type SituacaoDaUnidade } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { haQuanto } from '@/features/disponibilidade/aplicar';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const CLASSES: { valor: Exclude<SituacaoDaUnidade, 'sem_vinculo'>; rotulo: string }[] = [
  { valor: 'disponivel', rotulo: 'Verde' },
  { valor: 'negociacao', rotulo: 'Amarelo' },
  { valor: 'vendida', rotulo: 'Vermelho' },
  { valor: 'indisponivel', rotulo: 'Cinza' },
];
const COR: Record<string, string> = { disponivel: 'verde', negociacao: 'amarelo', vendida: 'vermelho', indisponivel: 'cinza' };
const CONTA: Record<string, string> = { ok: 'Conectado', erro: 'Com erro', pendente: 'Não integrado' };

export default function AdminCvcrmScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { isAdmin, loading: carregandoAdmin } = useIsAdmin();

  const [painel, setPainel] = useState<PainelCv | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  /** A construtora (a conta do CV) de onde se importa. */
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [lista, setLista] = useState<EmpreendimentoDoCv[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [idManual, setIdManual] = useState('');
  const [importando, setImportando] = useState<EmpreendimentoDoCv | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const carregar = useCallback(async () => {
    setAgora(Date.now());
    const r = await db.disponibilidade.painel();
    if (r.ok) {
      setPainel(r.data);
      setErroPainel(null);
    } else setErroPainel(r.error);
  }, []);

  useEffect(() => {
    if (isAdmin) void carregar();
  }, [isAdmin, carregar]);

  /** As contas que leem o CV (com credencial). Só delas se importa. */
  const ligadas = useMemo(
    () => (painel?.integracoes ?? []).filter((i) => i.ativo && i.temToken && i.situacao !== 'pendente'),
    [painel],
  );
  const nomeDaEmpresa = useMemo(
    () => new Map((painel?.integracoes ?? []).map((i) => [i.companyId, i.empresa])),
    [painel],
  );
  const empresa = ligadas.find((i) => i.companyId === empresaId) ?? null;

  // Uma conta só: já vem escolhida.
  useEffect(() => {
    if (!empresaId && ligadas.length === 1) setEmpresaId(ligadas[0].companyId);
  }, [ligadas, empresaId]);

  /**
   * Empreendimento do CV DA CONTA ESCOLHIDA → os vínculos dele (um por etapa,
   * ou um só para o CV inteiro). O número do CV só vale dentro da conta: o 63
   * de uma construtora não é o 63 de outra.
   */
  const vinculados = useMemo(() => {
    const m = new Map<number, PainelCv['empreendimentos']>();
    for (const e of painel?.empreendimentos ?? []) {
      if (e.companyId !== empresaId) continue;
      m.set(e.cvEmpreendimento, [...(m.get(e.cvEmpreendimento) ?? []), e]);
    }
    return m;
  }, [painel, empresaId]);

  function escolherEmpresa(id: string | null) {
    setEmpresaId(id);
    setLista(null);
    setErroLista(null);
    setImportando(null);
  }

  async function buscar() {
    if (!empresaId) {
      setErroLista('Escolha a construtora.');
      return;
    }
    setBuscando(true);
    setErroLista(null);
    const r = await db.disponibilidade.empreendimentosDoCv(empresaId);
    setBuscando(false);
    if (!r.ok) {
      setErroLista(r.error);
      return;
    }
    // Os que ainda não estão no POUP primeiro; depois pelo nome.
    setLista(
      [...r.data].sort((a, b) => {
        const va = vinculados.has(a.id);
        const vb = vinculados.has(b.id);
        if (va !== vb) return va ? 1 : -1;
        return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR');
      }),
    );
  }

  function abrir(developmentId: string) {
    router.push({ pathname: '/(app)/admin/cvcrm-empreendimento', params: { developmentId } });
  }

  function abrirManual() {
    if (!empresaId) {
      setErroLista('Escolha a construtora.');
      return;
    }
    const id = Number(idManual.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setErroLista('Informe o número do empreendimento no CV (o que aparece no endereço do mapa de disponibilidade).');
      return;
    }
    setErroLista(null);
    setImportando(lista?.find((e) => e.id === id) ?? { id, nome: null, cidade: null, estado: null, dataEntrega: null, unidadesDisponiveis: null });
  }

  async function classificar(chave: string, situacao: Exclude<SituacaoDaUnidade, 'sem_vinculo'>) {
    const r = await db.disponibilidade.classificarSituacao(chave, situacao);
    if (!r.ok) setErroPainel(r.error);
    await carregar();
  }

  if (carregandoAdmin) return <LoadingScreen />;
  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.texto}>Esta área é só do administrador do POUP.</Text>
      </Screen>
    );
  }

  const linhaDaLeitura = (rotulo: string, l: LeituraDoCv | undefined) => (
    <Text style={[styles.itemMeta, l && l.ok === false ? styles.itemErro : null]}>
      {rotulo}:{' '}
      {!l?.terminadoEm
        ? 'ainda não rodou'
        : `${haQuanto(l.terminadoEm, agora)}${l.ok === false ? ` · erro: ${(l.erro ?? '').slice(0, 140)}` : ` · ${l.lidas ?? 0} lidas, ${l.mudaram ?? 0} mudaram`}`}
    </Text>
  );

  return (
    <Screen>
      <View style={styles.cardInfo}>
        <Text style={styles.texto}>
          A tabela de preço mostra cada unidade pintada conforme o CV CRM: verde disponível, amarelo reservada, vermelho
          vendida, cinza bloqueada. O POUP só lê o CV, nunca altera nada lá. O valor de venda continua o da tabela de preço.
        </Text>
      </View>

      {erroPainel ? <Text style={styles.erro}>{erroPainel}</Text> : null}

      {importando && empresa ? (
        <ImportarDoCv
          companyId={empresa.companyId}
          empresa={empresa.empresa}
          empreendimento={importando}
          onFechar={() => setImportando(null)}
          onImportou={() => void carregar()}
          onAbrirConferencia={(devId) => {
            setImportando(null);
            abrir(devId);
          }}
        />
      ) : null}

      <Text style={styles.secao}>Construtoras com o CV</Text>
      {!painel ? null : painel.integracoes.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.texto}>
            Nenhuma construtora com o CV integrado. Cada construtora integra a sua conta no cadastro dela.
          </Text>
          <Button label="Abrir o Catálogo do sistema" variant="secondary" onPress={() => router.push('/(app)/admin/catalogo')} />
        </View>
      ) : (
        painel.integracoes.map((i) => {
          const leitura = haQuanto(i.ultimaLeveEm, agora);
          return (
            <View key={i.companyId} style={styles.card}>
              <Text style={styles.itemNome}>
                {i.empresa} · {CONTA[i.situacao] ?? i.situacao}
              </Text>
              <Text style={styles.itemMeta}>
                {i.url ?? 'sem conta'}
                {i.empreendimentos ? ` · ${i.empreendimentos} empreendimentos` : ''}
                {leitura ? ` · última leitura ${leitura}` : ''}
              </Text>
              {i.situacao === 'erro' && i.ultimoErro ? (
                <Text style={styles.itemErro}>Erro: {i.ultimoErro.slice(0, 200)}</Text>
              ) : null}
              {i.situacao === 'pendente' ? (
                <Text style={styles.itemMeta}>Integre no cadastro da construtora (Catálogo do sistema).</Text>
              ) : null}
            </View>
          );
        })
      )}

      <Text style={styles.secao}>Leitura automática</Text>
      {painel ? (
        <View style={styles.card}>
          {linhaDaLeitura('Leve (de minuto em minuto)', painel.leituras.leve)}
          {linhaDaLeitura('Completa (de 30 em 30 min)', painel.leituras.completo)}
        </View>
      ) : null}

      <Text style={styles.secao}>Empreendimentos vinculados</Text>
      {!painel ? (
        erroPainel ? null : <ActivityIndicator color={colors.primary} />
      ) : painel.empreendimentos.length === 0 ? (
        <Text style={styles.muted}>Nenhum ainda. Importe o primeiro abaixo.</Text>
      ) : (
        painel.empreendimentos.map((e) => {
          const leitura = haQuanto([e.ultimoLeveEm, e.ultimoCompletoEm].filter(Boolean).sort().pop() ?? null, agora);
          return (
            <Pressable
              key={`${e.companyId}/${e.cvEmpreendimento}/${e.cvEtapa ?? ''}`}
              onPress={() => abrir(e.developmentId)}
              style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <View style={styles.flex1}>
                <Text style={styles.itemNome}>{e.empreendimento}</Text>
                <Text style={styles.itemMeta}>
                  {nomeDaEmpresa.get(e.companyId) ?? 'Construtora'} · CV {e.cvEmpreendimento}
                  {e.etapaNoCv ? ` · ${e.etapaNoCv}` : ''} · {e.vinculadas} de {e.noCv} unidades vinculadas
                </Text>
                <Text style={styles.itemMeta}>{leitura ? `Última leitura ${leitura}` : 'Leitura automática ainda não rodou'}</Text>
                {e.ultimoErro ? <Text style={styles.itemErro}>Erro na leitura: {e.ultimoErro.slice(0, 160)}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })
      )}

      {painel && painel.situacoesRevisar.length > 0 ? (
        <>
          <Text style={styles.secao}>Situações novas do CV</Text>
          <Text style={styles.hint}>
            O CV mandou uma situação que o POUP não conhecia. Até você classificar, essas unidades ficam cinza (nunca verdes
            por engano).
          </Text>
          {painel.situacoesRevisar.map((s) => (
            <View key={s.chave} style={styles.card}>
              <Text style={styles.itemNome}>{s.descricao || s.chave}</Text>
              <View style={styles.linhaBotoes}>
                {CLASSES.map((c) => (
                  <Button
                    key={c.valor}
                    label={c.rotulo}
                    variant="secondary"
                    onPress={() => void classificar(s.chave, c.valor)}
                    style={styles.botaoPequeno}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      {painel && painel.situacoes.length > 0 ? (
        <>
          <Text style={styles.secao}>Cores das situações do CV</Text>
          <View style={styles.card}>
            {painel.situacoes
              .filter((s) => !s.revisar)
              .map((s) => (
                <Text key={s.chave} style={styles.itemMeta}>
                  {s.descricao || s.chave}: {COR[s.situacao] ?? s.situacao}
                </Text>
              ))}
          </View>
        </>
      ) : null}

      <Text style={styles.secao}>Importar do CV</Text>
      <Text style={styles.hint}>
        Escolha a construtora e busque os empreendimentos da conta dela no CV. Ao importar, o POUP cadastra o
        empreendimento (ou usa um que já existe), os blocos e as unidades que faltarem e vincula cada unidade à sua no CV,
        só quando o par é exato.
      </Text>
      {ligadas.length === 0 ? (
        <Text style={styles.muted}>Nenhuma construtora com o CV conectado ainda.</Text>
      ) : (
        <>
          <Select
            label="Construtora"
            placeholder="Escolha a construtora"
            value={empresaId}
            options={ligadas.map((i) => ({ value: i.companyId, label: i.empresa }))}
            onChange={escolherEmpresa}
          />
          <Button
            label={lista ? 'Buscar de novo' : 'Buscar empreendimentos no CV'}
            variant="secondary"
            onPress={() => void buscar()}
            loading={buscando}
            disabled={!empresaId}
          />
        </>
      )}
      {erroLista ? <Text style={[styles.erro, styles.espaco]}>{erroLista}</Text> : null}
      {lista ? (
        lista.length === 0 ? (
          <Text style={[styles.muted, styles.espaco]}>O CV não devolveu nenhum empreendimento.</Text>
        ) : (
          <View style={styles.espaco}>
            {lista.map((e) => {
              const ja = vinculados.get(e.id) ?? [];
              // Vinculado só por etapa: as outras etapas ainda podem ir para outro empreendimento do POUP.
              const parcial = ja.length > 0 && ja.every((v) => v.cvEtapa != null);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => (ja.length && !parcial ? abrir(ja[0].developmentId) : setImportando(e))}
                  style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
                  accessibilityRole="button"
                >
                  <View style={styles.flex1}>
                    <Text style={styles.itemNome}>
                      {e.nome ?? 'Empreendimento'} · CV {e.id}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {ja.length
                        ? `Vinculado a ${ja.map((v) => v.empreendimento + (v.etapaNoCv ? ` (${v.etapaNoCv})` : '')).join(', ')}`
                        : [e.cidade, e.unidadesDisponiveis != null ? `${e.unidadesDisponiveis} disponíveis` : null]
                            .filter(Boolean)
                            .join(' · ') || 'Ainda não está no POUP'}
                    </Text>
                  </View>
                  <Text style={styles.acao}>{ja.length && !parcial ? 'Abrir ›' : 'Importar ›'}</Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}

      {empresa ? (
        <>
          <Text style={styles.secao}>Empreendimento que não apareceu</Text>
          <Input label="Número do empreendimento no CV" value={idManual} onChangeText={setIdManual} keyboardType="number-pad" placeholder="Ex.: 63" />
          <Button label="Abrir este empreendimento" variant="ghost" onPress={abrirManual} />
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    texto: { ...typography.body, color: colors.ink },
    muted: { ...typography.body, color: colors.inkSubtle },
    hint: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md },
    espaco: { marginTop: spacing.md },
    secao: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cardInfo: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginBottom: spacing.sm,
      gap: spacing.md,
    },
    pressionado: { opacity: 0.6 },
    itemNome: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemMeta: { ...typography.caption, color: colors.inkMuted },
    itemErro: { ...typography.caption, color: colors.danger },
    chevron: { ...typography.title, color: colors.inkSubtle },
    acao: { ...typography.label, color: colors.primary },
    linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    botaoPequeno: { minWidth: 96 },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
