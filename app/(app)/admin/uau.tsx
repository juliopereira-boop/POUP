/**
 * DISPONIBILIDADE DO UAU — O PAINEL DO ADMIN.
 *
 *   1. As obras do UAU já vinculadas a empreendimentos do POUP, com a saúde da
 *      leitura (última leve/completa, erro) — toque para conferir unidade a
 *      unidade, mudar a fonte do preço ou atualizar agora.
 *   2. Status do UAU que ainda não têm cor (código novo): classificar.
 *   3. Importar do UAU: busca as obras que existem no ERP; tocar numa abre a
 *      prévia e cadastra empreendimento, blocos, unidades e vínculos.
 *
 * O POUP só LÊ o UAU. Nenhuma ação desta tela altera o ERP.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { ImportarObra } from '@/components/uau/ImportarObra';
import { db, type ObraDoUau, type PainelUau, type SituacaoDaUnidade } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { haQuanto } from '@/features/disponibilidade/aplicar';
import { nomeDaObra } from '@/features/disponibilidade/obrasConhecidas';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const FONTE: Record<string, string> = { automatico: 'preço automático', tabela: 'preço da tabela', uau: 'preço do UAU' };
const CLASSES: { valor: Exclude<SituacaoDaUnidade, 'sem_vinculo'>; rotulo: string }[] = [
  { valor: 'disponivel', rotulo: 'Verde' },
  { valor: 'negociacao', rotulo: 'Amarelo' },
  { valor: 'vendida', rotulo: 'Vermelho' },
  { valor: 'indisponivel', rotulo: 'Cinza' },
];

export default function AdminUauScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { isAdmin, loading: carregandoAdmin } = useIsAdmin();

  const [painel, setPainel] = useState<PainelUau | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const [obras, setObras] = useState<ObraDoUau[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroObras, setErroObras] = useState<string | null>(null);
  const [empresaManual, setEmpresaManual] = useState('1');
  const [obraManual, setObraManual] = useState('');
  const [importando, setImportando] = useState<{ empresa: number; obra: string } | null>(null);
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

  const vinculadas = useMemo(
    () => new Map((painel?.obras ?? []).map((o) => [`${o.empresa}/${o.obra}`, o])),
    [painel],
  );

  async function buscarObras() {
    setBuscando(true);
    setErroObras(null);
    const r = await db.disponibilidade.obrasDoUau();
    setBuscando(false);
    if (!r.ok) {
      setErroObras(r.error);
      return;
    }
    // As conhecidas (com nome) primeiro; depois pelo código.
    setObras(
      [...r.data].sort((a, b) => {
        const na = nomeDaObra(a.empresa, a.obra);
        const nb = nomeDaObra(b.empresa, b.obra);
        if (Boolean(na) !== Boolean(nb)) return na ? -1 : 1;
        return a.empresa - b.empresa || a.obra.localeCompare(b.obra);
      }),
    );
  }

  function abrirObra(developmentId: string, empresa: number, obra: string) {
    router.push({ pathname: '/(app)/admin/uau-obra', params: { developmentId, empresa: String(empresa), obra } });
  }

  function abrirManual() {
    const empresa = Number(empresaManual);
    const obra = obraManual.trim().toUpperCase();
    if (!Number.isInteger(empresa) || empresa < 1 || empresa > 9999 || !/^[A-Z0-9]{1,10}$/.test(obra)) {
      setErroObras('Informe a empresa (número) e o código da obra, como no UAU: 1 e 259V.');
      return;
    }
    setErroObras(null);
    tocarNaObra(empresa, obra);
  }

  function tocarNaObra(empresa: number, obra: string) {
    const ja = vinculadas.get(`${empresa}/${obra}`);
    if (ja) abrirObra(ja.developmentId, empresa, obra);
    else setImportando({ empresa, obra });
  }

  async function classificar(codigo: number, situacao: Exclude<SituacaoDaUnidade, 'sem_vinculo'>) {
    const r = await db.disponibilidade.classificarStatus(codigo, situacao);
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

  return (
    <Screen>
      <View style={styles.cardInfo}>
        <Text style={styles.texto}>
          A tabela de preço mostra cada unidade pintada conforme o UAU: verde disponível, amarelo em negociação,
          vermelho vendida, cinza fora de venda. O POUP só lê o UAU, nunca altera nada no ERP.
        </Text>
      </View>

      {erroPainel ? <Text style={styles.erro}>{erroPainel}</Text> : null}

      {importando ? (
        <ImportarObra
          empresa={importando.empresa}
          obra={importando.obra}
          onFechar={() => setImportando(null)}
          onImportou={() => void carregar()}
          onAbrirConferencia={(devId) => {
            const o = importando;
            setImportando(null);
            abrirObra(devId, o.empresa, o.obra);
          }}
        />
      ) : null}

      <Text style={styles.secao}>Obras vinculadas</Text>
      {!painel ? (
        erroPainel ? null : <ActivityIndicator color={colors.primary} />
      ) : painel.obras.length === 0 ? (
        <Text style={styles.muted}>Nenhuma ainda. Importe a primeira abaixo.</Text>
      ) : (
        painel.obras.map((o) => {
          const leitura = haQuanto(
            [o.ultimoLeveEm, o.ultimoCompletoEm].filter(Boolean).sort().pop() ?? null,
            agora,
          );
          return (
            <Pressable
              key={`${o.empresa}/${o.obra}`}
              onPress={() => abrirObra(o.developmentId, o.empresa, o.obra)}
              style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <View style={styles.flex1}>
                <Text style={styles.itemNome}>{o.empreendimento}</Text>
                <Text style={styles.itemMeta}>
                  {o.empresa}/{o.obra} · {o.vinculadas} de {o.noUau} unidades vinculadas · {FONTE[o.fontePreco] ?? ''}
                  {o.ativo ? '' : ' · pausada'}
                </Text>
                <Text style={styles.itemMeta}>{leitura ? `Última leitura ${leitura}` : 'Leitura automática ainda não rodou'}</Text>
                {o.ultimoErro ? <Text style={styles.itemErro}>Erro na leitura: {o.ultimoErro.slice(0, 160)}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })
      )}

      {painel && painel.statusRevisar.length > 0 ? (
        <>
          <Text style={styles.secao}>Status novos do UAU</Text>
          <Text style={styles.hint}>
            O UAU mandou um status que o POUP não conhecia. Até você classificar, essas unidades ficam cinza (nunca verdes
            por engano).
          </Text>
          {painel.statusRevisar.map((s) => (
            <View key={s.codigo} style={styles.card}>
              <Text style={styles.itemNome}>
                {s.descricao || 'Sem nome'} (código {s.codigo})
              </Text>
              <View style={styles.linhaBotoes}>
                {CLASSES.map((c) => (
                  <Button
                    key={c.valor}
                    label={c.rotulo}
                    variant="secondary"
                    onPress={() => void classificar(s.codigo, c.valor)}
                    style={styles.botaoPequeno}
                  />
                ))}
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.secao}>Importar do UAU</Text>
      <Text style={styles.hint}>
        Busque as obras do UAU. Ao importar, o POUP cadastra o empreendimento (ou usa um que já existe), os blocos e as
        unidades que faltarem e vincula cada unidade à sua no UAU, só quando o par é exato.
      </Text>
      <Button label={obras ? 'Buscar de novo' : 'Buscar obras no UAU'} variant="secondary" onPress={() => void buscarObras()} loading={buscando} />
      {erroObras ? <Text style={[styles.erro, styles.espaco]}>{erroObras}</Text> : null}
      {obras ? (
        obras.length === 0 ? (
          <Text style={[styles.muted, styles.espaco]}>O UAU não devolveu nenhuma obra.</Text>
        ) : (
          <View style={styles.espaco}>
            {obras.map((o) => {
              const ja = vinculadas.get(`${o.empresa}/${o.obra}`);
              const nome = nomeDaObra(o.empresa, o.obra);
              return (
                <Pressable
                  key={`${o.empresa}/${o.obra}`}
                  onPress={() => tocarNaObra(o.empresa, o.obra)}
                  style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
                  accessibilityRole="button"
                >
                  <View style={styles.flex1}>
                    <Text style={styles.itemNome}>
                      {nome ?? 'Obra'} · {o.empresa}/{o.obra}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {ja ? `Vinculada a ${ja.empreendimento}` : o.exemplo ? `Ex.: ${o.exemplo}` : 'Sem exemplo de unidade'}
                    </Text>
                  </View>
                  <Text style={styles.acao}>{ja ? 'Abrir ›' : 'Importar ›'}</Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}

      <Text style={styles.secao}>Obra que não apareceu</Text>
      <View style={styles.linhaManual}>
        <View style={styles.campoEmpresa}>
          <Input label="Empresa" value={empresaManual} onChangeText={setEmpresaManual} keyboardType="number-pad" />
        </View>
        <View style={styles.flex1}>
          <Input label="Obra" value={obraManual} onChangeText={setObraManual} placeholder="Ex.: 259V" autoCapitalize="characters" />
        </View>
      </View>
      <Button label="Abrir esta obra" variant="ghost" onPress={abrirManual} />
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
    linhaManual: { flexDirection: 'row', gap: spacing.md },
    campoEmpresa: { width: 96 },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
  });
