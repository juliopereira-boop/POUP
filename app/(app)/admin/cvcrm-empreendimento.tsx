/**
 * UM EMPREENDIMENTO VINCULADO AO CV — CONFERÊNCIA E SAÚDE.
 *
 * A regra que não pode quebrar: UNIDADE X COM UNIDADE X. O vínculo é gravado
 * pelo id da unidade no CV, e só quando o par é exato dos dois lados
 * (`features/disponibilidade/vinculo.ts`). O que não casou fica listado para
 * resolver à mão — nunca por "parecido".
 *
 * Aqui o admin:
 *   • vê, bloco a bloco, quantas unidades há no POUP, no CV e vinculadas;
 *   • grava os pares exatos que ainda faltam;
 *   • cadastra no POUP as unidades que só existem no CV (sem apagar nada);
 *   • desfaz vínculo de unidade renomeada no CV (ela volta a casar pelo nome
 *     novo) e vincula à mão o que sobrar;
 *   • pede uma leitura agora, ou tira o empreendimento do CV.
 *
 * O POUP só LÊ o CV: nada aqui altera o CV.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { Select } from '@/components/Select';
import { db, type ConferenciaCv, type PainelCv } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { haQuanto } from '@/features/disponibilidade/aplicar';
import { sugestaoDaConferencia } from '@/features/disponibilidade/importarDoCv';
import { blocosDoCv, identificadorMudou, lerIdentificador, mesclarBlocos } from '@/features/disponibilidade/vinculo';
import { chaveDoBloco } from '@/features/tabelaPreco/chaves';
import { confirmar } from '@/lib/confirmar';
import { voltar } from '@/lib/navegacao';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function AdminCvcrmEmpreendimentoScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { isAdmin, loading: carregandoAdmin } = useIsAdmin();
  const params = useLocalSearchParams<{ developmentId?: string }>();
  const developmentId = params.developmentId ?? '';

  const [conf, setConf] = useState<ConferenciaCv | null>(null);
  const [painel, setPainel] = useState<PainelCv['empreendimentos']>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [manualPoup, setManualPoup] = useState<string | null>(null);
  const [manualCv, setManualCv] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!developmentId) return;
    const [c, p] = await Promise.all([db.disponibilidade.conferencia(developmentId), db.disponibilidade.painel()]);
    if (c.ok) setConf(c.data);
    else setErro(c.error);
    if (p.ok) setPainel(p.data.empreendimentos.filter((e) => e.developmentId === developmentId));
  }, [developmentId]);

  useEffect(() => {
    if (isAdmin) void carregar();
  }, [isAdmin, carregar]);

  const s = useMemo(() => (conf ? sugestaoDaConferencia(conf) : null), [conf]);
  const renomeadas = useMemo(
    () => (conf ? conf.vinculos.filter((v) => identificadorMudou(v.identificadorNoVinculo, v.identificadorAtual)) : []),
    [conf],
  );

  // Bloco a bloco: POUP × CV × vinculadas.
  const porBloco = useMemo(() => {
    if (!conf) return [];
    const vinculadas = new Set(conf.vinculos.map((v) => v.unitId));
    const linhas = new Map<string, { nome: string; poup: number; cv: number; vinculadas: number }>();
    for (const p of conf.poup) {
      const k = chaveDoBloco(p.bloco);
      const l = linhas.get(k) ?? { nome: p.bloco, poup: 0, cv: 0, vinculadas: 0 };
      l.poup++;
      if (vinculadas.has(p.id)) l.vinculadas++;
      linhas.set(k, l);
    }
    for (const u of conf.cv) {
      if (u.ausente) continue;
      const lido = lerIdentificador(u.identificador);
      const k = lido?.bloco != null ? chaveDoBloco(lido.bloco) : '?';
      const l = linhas.get(k) ?? {
        nome: lido?.bloco != null ? `${u.bloco ?? `Bloco ${lido.bloco}`} (só no CV)` : 'Sem bloco legível',
        poup: 0,
        cv: 0,
        vinculadas: 0,
      };
      l.cv++;
      linhas.set(k, l);
    }
    return [...linhas.values()];
  }, [conf]);

  async function executar(chave: string, acao: () => Promise<string | null>) {
    setErro(null);
    setAviso(null);
    setOcupado(chave);
    const falha = await acao();
    setOcupado(null);
    if (falha) setErro(falha);
    await carregar();
  }

  function gravarCasadas() {
    if (!s || s.casadas.length === 0) return;
    void executar('casadas', async () => {
      const r = await db.disponibilidade.salvarVinculos(
        developmentId,
        s.casadas.map((p) => ({ unitId: p.unitId, cvUnidade: p.cv.cvUnidade, origem: 'automatico' })),
      );
      if (!r.ok) return r.error;
      setAviso(`${r.data.gravados} unidades vinculadas.`);
      return null;
    });
  }

  async function completarCadastro() {
    if (!s || s.soNoCv.length === 0) return;
    const seguir = await confirmar(
      'Cadastrar o que só existe no CV',
      `${s.soNoCv.length} unidades do CV não existem no cadastro do POUP. Elas serão acrescentadas aos blocos (blocos novos, se precisar). Nada do que já existe é apagado ou renomeado.`,
      'Cadastrar',
    );
    if (!seguir) return;
    void executar('completar', async () => {
      const lidos = await db.unidades.listarBlocos(developmentId);
      if (!lidos.ok) return lidos.error;
      const doCv = blocosDoCv(s.soNoCv);
      const m = mesclarBlocos(lidos.data.map((b) => ({ id: b.id, nome: b.nome, unidades: b.unidades })), doCv.blocos);
      if (m.unidadesNovas === 0) return 'Nenhuma unidade nova para cadastrar.';
      const r = await db.unidades.salvarBlocos(developmentId, m.blocos);
      if (!r.ok) return r.error;
      setAviso(`${m.unidadesNovas} unidades cadastradas. Agora grave os vínculos que casaram.`);
      return null;
    });
  }

  function desfazerRenomeadas() {
    void executar('renomeadas', async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [], renomeadas.map((v) => v.unitId));
      if (!r.ok) return r.error;
      setAviso('Vínculos desfeitos. Se o nome novo casar com uma unidade do POUP, ela aparece em "Vincular".');
      return null;
    });
  }

  function trocarDivergente(unitId: string) {
    const d = s?.divergentes.find((x) => x.unitId === unitId);
    if (!d) return;
    void executar(`div-${unitId}`, async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [
        { unitId, cvUnidade: d.sugerida.cvUnidade, origem: 'manual' },
      ]);
      return r.ok ? null : r.error;
    });
  }

  function vincularManual() {
    if (!manualPoup || !manualCv) return;
    void executar('manual', async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [
        { unitId: manualPoup, cvUnidade: Number(manualCv), origem: 'manual' },
      ]);
      if (!r.ok) return r.error;
      setManualPoup(null);
      setManualCv(null);
      setAviso('Vínculo gravado.');
      return null;
    });
  }

  function atualizarAgora() {
    void executar('atualizar', async () => {
      const r = await db.disponibilidade.atualizarAgora(developmentId);
      if (!r.ok) return r.error;
      setAviso('Lido no CV agora.');
      return null;
    });
  }

  async function desvincular(cvEmpreendimento: number, cvEtapa: number | null, nome: string) {
    const seguir = await confirmar(
      'Desvincular do CV',
      `O ${nome} sai deste empreendimento: as unidades perdem a cor do CV. Blocos, unidades e a tabela de preço continuam. Nada muda no CV.`,
      'Desvincular',
    );
    if (!seguir) return;
    setOcupado('remover');
    const r = await db.disponibilidade.removerEmpreendimento(developmentId, cvEmpreendimento, cvEtapa);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    voltar(router, '/(app)/admin/cvcrm');
  }

  if (carregandoAdmin) return <LoadingScreen />;
  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.texto}>Esta área é só do administrador do POUP.</Text>
      </Screen>
    );
  }

  const nomeDoPoup = (id: string) => {
    const p = conf?.poup.find((x) => x.id === id);
    return p ? `${p.bloco} · ${p.codigo}` : id;
  };
  const opcoesPoup = s
    ? [...s.soNoPoup.map((p) => p.id), ...s.conflitos.flatMap((c) => c.poup)].map((id) => ({ value: id, label: nomeDoPoup(id) }))
    : [];
  const opcoesCv = s
    ? [...s.soNoCv, ...s.naoReconhecidas, ...s.conflitos.flatMap((c) => c.cv)].map((u) => ({
        value: String(u.cvUnidade),
        label: `${u.identificador ?? 'sem nome'} (CV ${u.cvUnidade})`,
      }))
    : [];
  const nomeDoCv = (cvUnidade: number) => conf?.cv.find((u) => u.cvUnidade === cvUnidade)?.identificador ?? `CV ${cvUnidade}`;
  const titulo = painel[0]?.empreendimento ?? 'Empreendimento do CV';

  return (
    <Screen>
      <View style={styles.cabeca}>
        <Text style={styles.titulo}>{titulo}</Text>
        {(conf?.empreendimentos ?? []).map((e) => {
          const leitura = haQuanto([e.ultimoLeveEm, e.ultimoCompletoEm].filter(Boolean).sort().pop() ?? null, Date.now());
          return (
            <View key={`${e.cvEmpreendimento}/${e.cvEtapa ?? ''}`}>
              <Text style={styles.meta}>
                CV {e.cvEmpreendimento} · {e.nomeNoCv ?? ''}
                {e.etapaNoCv ? ` · ${e.etapaNoCv}` : ''} · {leitura ? `última leitura ${leitura}` : 'leitura automática ainda não rodou'}
              </Text>
              {e.ultimoErro ? <Text style={styles.itemErro}>Erro na última leitura: {e.ultimoErro.slice(0, 200)}</Text> : null}
            </View>
          );
        })}
        <Button label="Ler no CV agora" variant="secondary" onPress={atualizarAgora} loading={ocupado === 'atualizar'} />
      </View>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
      {aviso ? <Text style={styles.ok}>{aviso}</Text> : null}

      <Text style={styles.secao}>Unidade a unidade</Text>
      {!conf || !s ? (
        erro ? null : <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.texto}>
              {conf.vinculos.length} vinculadas · {s.casadas.length} prontas para vincular · {s.soNoPoup.length} só no POUP ·{' '}
              {s.soNoCv.length} só no CV
              {s.conflitos.length ? ` · ${s.conflitos.length} conflitos` : ''}
              {s.naoReconhecidas.length ? ` · ${s.naoReconhecidas.length} não reconhecidas` : ''}
              {s.divergentes.length ? ` · ${s.divergentes.length} divergentes` : ''}
              {renomeadas.length ? ` · ${renomeadas.length} renomeadas no CV` : ''}
            </Text>
            {porBloco.map((b) => (
              <Text key={b.nome} style={[styles.linhaBloco, b.poup !== b.cv || b.vinculadas !== b.poup ? styles.linhaBlocoAtencao : null]}>
                {b.nome}: {b.poup} no POUP · {b.cv} no CV · {b.vinculadas} vinculadas
              </Text>
            ))}
          </View>

          {s.casadas.length > 0 ? (
            <Button
              label={`Vincular ${s.casadas.length} unidades com par exato`}
              onPress={gravarCasadas}
              loading={ocupado === 'casadas'}
            />
          ) : null}
          {s.soNoCv.length > 0 ? (
            <View style={styles.espaco}>
              <Button
                label={`Cadastrar no POUP ${s.soNoCv.length} unidades que só existem no CV`}
                variant="secondary"
                onPress={() => void completarCadastro()}
                loading={ocupado === 'completar'}
              />
            </View>
          ) : null}

          {renomeadas.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Renomeadas no CV (estão sem cor)</Text>
              {renomeadas.slice(0, 20).map((v) => (
                <Text key={v.unitId} style={styles.meta}>
                  {nomeDoPoup(v.unitId)}: era "{v.identificadorNoVinculo}", agora "{v.identificadorAtual ?? 'sumiu'}"
                </Text>
              ))}
              <Button label="Desfazer esses vínculos" variant="secondary" onPress={desfazerRenomeadas} loading={ocupado === 'renomeadas'} />
            </View>
          ) : null}

          {s.divergentes.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Divergentes: vinculadas a outra unidade do CV</Text>
              {s.divergentes.slice(0, 20).map((d) => (
                <View key={d.unitId} style={styles.linhaAcao}>
                  <Text style={[styles.meta, styles.flex1]}>
                    {nomeDoPoup(d.unitId)}: hoje "{nomeDoCv(d.atual)}"; o par exato seria "{d.sugerida.identificador}"
                  </Text>
                  <Button label="Usar o par exato" variant="ghost" onPress={() => trocarDivergente(d.unitId)} loading={ocupado === `div-${d.unitId}`} />
                </View>
              ))}
            </View>
          ) : null}

          {s.conflitos.length > 0 || s.naoReconhecidas.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Sem par automático</Text>
              {s.conflitos.slice(0, 10).map((c) => (
                <Text key={c.chave} style={styles.meta}>
                  Conflito {c.chave}: {c.poup.length} no POUP, {c.cv.length} no CV com a mesma chave
                </Text>
              ))}
              {s.naoReconhecidas.slice(0, 10).map((u) => (
                <Text key={u.cvUnidade} style={styles.meta}>
                  Não reconhecida: "{u.identificador ?? 'sem nome'}"
                </Text>
              ))}
            </View>
          ) : null}

          {opcoesPoup.length > 0 && opcoesCv.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Vincular à mão</Text>
              <Text style={styles.hint}>Confira no CV antes: o vínculo pinta a unidade do POUP com a situação da unidade do CV.</Text>
              <Select label="Unidade do POUP" placeholder="Escolha" value={manualPoup} options={opcoesPoup} onChange={setManualPoup} searchable />
              <Select label="Unidade do CV" placeholder="Escolha" value={manualCv} options={opcoesCv} onChange={setManualCv} searchable />
              <Button label="Vincular" onPress={vincularManual} loading={ocupado === 'manual'} disabled={!manualPoup || !manualCv} />
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.secao}>Desvincular</Text>
      {(conf?.empreendimentos ?? []).map((e) => {
        const nome = `CV ${e.cvEmpreendimento}${e.etapaNoCv ? ` (${e.etapaNoCv})` : ''}`;
        return (
          <View key={`d-${e.cvEmpreendimento}/${e.cvEtapa ?? ''}`} style={styles.espaco}>
            <Button
              label={`Desvincular o ${nome}`}
              variant="danger"
              onPress={() => void desvincular(e.cvEmpreendimento, e.cvEtapa, nome)}
              loading={ocupado === 'remover'}
            />
          </View>
        );
      })}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    espaco: { marginTop: spacing.sm },
    texto: { ...typography.body, color: colors.ink },
    titulo: { ...typography.title, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    hint: { ...typography.caption, color: colors.inkMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
    itemNome: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemErro: { ...typography.caption, color: colors.danger },
    cabeca: { gap: spacing.sm, marginBottom: spacing.md },
    secao: {
      ...typography.label,
      color: colors.inkMuted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: spacing.lg,
      marginVertical: spacing.sm,
      gap: spacing.xs,
    },
    linhaBloco: { ...typography.caption, color: colors.ink, fontVariant: ['tabular-nums'] },
    linhaBlocoAtencao: { color: colors.warning, fontWeight: '600' },
    linhaAcao: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    ok: {
      ...typography.caption,
      color: colors.ink,
      backgroundColor: colors.successSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
  });
