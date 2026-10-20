/**
 * UMA OBRA DO UAU VINCULADA — CONFERÊNCIA, PREÇO E SAÚDE.
 *
 * A regra que não pode quebrar: UNIDADE X COM UNIDADE X. O vínculo é gravado
 * pela chave do UAU (empresa/produto/número), e só quando o par é exato dos
 * dois lados (`features/disponibilidade/chaveUau.ts`). O que não casou fica
 * listado para resolver à mão — nunca por "parecido".
 *
 * Aqui o admin:
 *   • vê, bloco a bloco, quantas unidades há no POUP, no UAU e vinculadas;
 *   • grava os pares exatos que ainda faltam;
 *   • cadastra no POUP as unidades que só existem no UAU (sem apagar nada);
 *   • desfaz vínculo de unidade renumerada no UAU (ela volta a casar pelo
 *     número novo) e vincula à mão o que sobrar;
 *   • escolhe de onde vem o valor de venda, e pede uma leitura agora.
 *
 * O POUP só LÊ o UAU: nada aqui altera o ERP.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/Loading';
import { Screen } from '@/components/Screen';
import { Segmento } from '@/components/Segmento';
import { Select } from '@/components/Select';
import { OPCOES_DA_FONTE, TEXTO_DA_FONTE } from '@/components/uau/ImportarObra';
import { db, type ConferenciaUau, type FonteDoPreco, type PainelUau } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { haQuanto } from '@/features/disponibilidade/aplicar';
import {
  blocosDoUau,
  identificadorMudou,
  lerIdentificador,
  mesclarBlocos,
} from '@/features/disponibilidade/chaveUau';
import { sugestaoDaConferencia } from '@/features/disponibilidade/importarObra';
import { chaveDoBloco } from '@/features/tabelaPreco/chaves';
import { confirmar } from '@/lib/confirmar';
import { voltar } from '@/lib/navegacao';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export default function AdminUauObraScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { isAdmin, loading: carregandoAdmin } = useIsAdmin();
  const params = useLocalSearchParams<{ developmentId?: string; empresa?: string; obra?: string }>();
  const developmentId = params.developmentId ?? '';
  const empresa = Number(params.empresa);
  const obra = String(params.obra ?? '');

  const [conf, setConf] = useState<ConferenciaUau | null>(null);
  const [painel, setPainel] = useState<PainelUau['obras'][number] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [manualPoup, setManualPoup] = useState<string | null>(null);
  const [manualUau, setManualUau] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!developmentId) return;
    const [c, p] = await Promise.all([db.disponibilidade.conferencia(developmentId), db.disponibilidade.painel()]);
    if (c.ok) setConf(c.data);
    else setErro(c.error);
    if (p.ok) setPainel(p.data.obras.find((o) => o.developmentId === developmentId && o.obra === obra) ?? null);
  }, [developmentId, obra]);

  useEffect(() => {
    if (isAdmin) void carregar();
  }, [isAdmin, carregar]);

  const s = useMemo(() => (conf ? sugestaoDaConferencia(conf) : null), [conf]);
  const renumeradas = useMemo(
    () => (conf ? conf.vinculos.filter((v) => identificadorMudou(v.identificadorNoVinculo, v.identificadorAtual)) : []),
    [conf],
  );

  // Bloco a bloco: POUP × UAU × vinculadas.
  const porBloco = useMemo(() => {
    if (!conf) return [];
    const vinculadas = new Set(conf.vinculos.map((v) => v.unitId));
    const linhas = new Map<string, { nome: string; poup: number; uau: number; vinculadas: number }>();
    for (const p of conf.poup) {
      const k = chaveDoBloco(p.bloco);
      const l = linhas.get(k) ?? { nome: p.bloco, poup: 0, uau: 0, vinculadas: 0 };
      l.poup++;
      if (vinculadas.has(p.id)) l.vinculadas++;
      linhas.set(k, l);
    }
    for (const u of conf.uau) {
      if (u.ausente) continue;
      const lido = lerIdentificador(u.identificador);
      const k = lido?.bloco != null ? chaveDoBloco(lido.bloco) : '?';
      const l = linhas.get(k) ?? { nome: lido?.bloco != null ? `Bloco ${lido.bloco} (só no UAU)` : 'Sem bloco legível', poup: 0, uau: 0, vinculadas: 0 };
      l.uau++;
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
        s.casadas.map((p) => ({ unitId: p.unitId, empresa: p.uau.empresa, produto: p.uau.produto, numPer: p.uau.numPer, origem: 'automatico' })),
      );
      if (!r.ok) return r.error;
      setAviso(`${r.data.gravados} unidades vinculadas.`);
      return null;
    });
  }

  async function completarCadastro() {
    if (!s || s.soNoUau.length === 0) return;
    const seguir = await confirmar(
      'Cadastrar o que só existe no UAU',
      `${s.soNoUau.length} unidades do UAU não existem no cadastro do POUP. Elas serão acrescentadas aos blocos (blocos novos, se precisar). Nada do que já existe é apagado ou renomeado.`,
      'Cadastrar',
    );
    if (!seguir) return;
    void executar('completar', async () => {
      const lidos = await db.unidades.listarBlocos(developmentId);
      if (!lidos.ok) return lidos.error;
      const doUau = blocosDoUau(s.soNoUau);
      const m = mesclarBlocos(lidos.data.map((b) => ({ id: b.id, nome: b.nome, unidades: b.unidades })), doUau.blocos);
      if (m.unidadesNovas === 0) return 'Nenhuma unidade nova para cadastrar.';
      const r = await db.unidades.salvarBlocos(developmentId, m.blocos);
      if (!r.ok) return r.error;
      setAviso(`${m.unidadesNovas} unidades cadastradas. Agora grave os vínculos que casaram.`);
      return null;
    });
  }

  function desfazerRenumeradas() {
    void executar('renumeradas', async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [], renumeradas.map((v) => v.unitId));
      if (!r.ok) return r.error;
      setAviso('Vínculos desfeitos. Se o número novo casar com uma unidade do POUP, ela aparece em "Gravar".');
      return null;
    });
  }

  function trocarDivergente(unitId: string) {
    const d = s?.divergentes.find((x) => x.unitId === unitId);
    if (!d) return;
    void executar(`div-${unitId}`, async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [
        { unitId, empresa: d.sugerida.empresa, produto: d.sugerida.produto, numPer: d.sugerida.numPer, origem: 'manual' },
      ]);
      return r.ok ? null : r.error;
    });
  }

  function vincularManual() {
    if (!manualPoup || !manualUau) return;
    const [e, p, n] = manualUau.split('/').map(Number);
    void executar('manual', async () => {
      const r = await db.disponibilidade.salvarVinculos(developmentId, [
        { unitId: manualPoup, empresa: e, produto: p, numPer: n, origem: 'manual' },
      ]);
      if (!r.ok) return r.error;
      setManualPoup(null);
      setManualUau(null);
      setAviso('Vínculo gravado.');
      return null;
    });
  }

  function mudarFonte(f: FonteDoPreco) {
    void executar('fonte', async () => {
      const r = await db.disponibilidade.definirFontePreco(developmentId, f);
      return r.ok ? null : r.error;
    });
  }

  function atualizarAgora() {
    void executar('atualizar', async () => {
      const r = await db.disponibilidade.atualizarAgora(developmentId);
      if (!r.ok) return r.error;
      setAviso('Lido no UAU agora.');
      return null;
    });
  }

  async function desvincularObra() {
    const seguir = await confirmar(
      'Desvincular a obra',
      `A obra ${empresa}/${obra} sai deste empreendimento: as unidades perdem a cor do UAU e o valor do UAU. Blocos, unidades e a tabela de preço continuam. Nada muda no UAU.`,
      'Desvincular',
    );
    if (!seguir) return;
    setOcupado('remover');
    const r = await db.disponibilidade.removerObra(developmentId, empresa, obra);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    voltar(router, '/(app)/admin/uau');
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
  const opcoesUau = s
    ? [...s.soNoUau, ...s.naoReconhecidas, ...s.conflitos.flatMap((c) => c.uau)].map((u) => ({
        value: `${u.empresa}/${u.produto}/${u.numPer}`,
        label: `${u.identificador ?? 'sem identificador'} (${u.empresa}/${u.produto}/${u.numPer})`,
      }))
    : [];
  const leitura = painel
    ? haQuanto([painel.ultimoLeveEm, painel.ultimoCompletoEm].filter(Boolean).sort().pop() ?? null, Date.now())
    : null;

  return (
    <Screen>
      <View style={styles.cabeca}>
        <Text style={styles.titulo}>{painel?.empreendimento ?? 'Obra do UAU'}</Text>
        <Text style={styles.meta}>
          UAU {empresa}/{obra} · {leitura ? `última leitura ${leitura}` : 'leitura automática ainda não rodou'}
        </Text>
        {painel?.ultimoErro ? <Text style={styles.itemErro}>Erro na última leitura: {painel.ultimoErro.slice(0, 200)}</Text> : null}
        <Button label="Ler no UAU agora" variant="secondary" onPress={atualizarAgora} loading={ocupado === 'atualizar'} />
      </View>

      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
      {aviso ? <Text style={styles.ok}>{aviso}</Text> : null}

      <Text style={styles.secao}>Valor de venda</Text>
      <Segmento
        opcoes={OPCOES_DA_FONTE}
        valor={painel?.fontePreco ?? 'automatico'}
        onMudar={mudarFonte}
        desabilitado={ocupado === 'fonte'}
      />
      <Text style={styles.hint}>{TEXTO_DA_FONTE[painel?.fontePreco ?? 'automatico']}</Text>

      <Text style={styles.secao}>Unidade a unidade</Text>
      {!conf || !s ? (
        erro ? null : <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.texto}>
              {conf.vinculos.length} vinculadas · {s.casadas.length} prontas para vincular · {s.soNoPoup.length} só no POUP ·{' '}
              {s.soNoUau.length} só no UAU
              {s.conflitos.length ? ` · ${s.conflitos.length} conflitos` : ''}
              {s.naoReconhecidas.length ? ` · ${s.naoReconhecidas.length} não reconhecidas` : ''}
              {s.divergentes.length ? ` · ${s.divergentes.length} divergentes` : ''}
              {renumeradas.length ? ` · ${renumeradas.length} renumeradas no UAU` : ''}
            </Text>
            {porBloco.map((b) => (
              <Text key={b.nome} style={[styles.linhaBloco, b.poup !== b.uau || b.vinculadas !== b.poup ? styles.linhaBlocoAtencao : null]}>
                {b.nome}: {b.poup} no POUP · {b.uau} no UAU · {b.vinculadas} vinculadas
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
          {s.soNoUau.length > 0 ? (
            <View style={styles.espaco}>
              <Button
                label={`Cadastrar no POUP ${s.soNoUau.length} unidades que só existem no UAU`}
                variant="secondary"
                onPress={() => void completarCadastro()}
                loading={ocupado === 'completar'}
              />
            </View>
          ) : null}

          {renumeradas.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Renumeradas no UAU (estão sem cor)</Text>
              {renumeradas.slice(0, 20).map((v) => (
                <Text key={v.unitId} style={styles.meta}>
                  {nomeDoPoup(v.unitId)}: era "{v.identificadorNoVinculo}", agora "{v.identificadorAtual ?? 'sumiu'}"
                </Text>
              ))}
              <Button label="Desfazer esses vínculos" variant="secondary" onPress={desfazerRenumeradas} loading={ocupado === 'renumeradas'} />
            </View>
          ) : null}

          {s.divergentes.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Divergentes: vinculadas a outra unidade do UAU</Text>
              {s.divergentes.slice(0, 20).map((d) => (
                <View key={d.unitId} style={styles.linhaAcao}>
                  <Text style={[styles.meta, styles.flex1]}>
                    {nomeDoPoup(d.unitId)}: hoje {d.atual}; o par exato seria "{d.sugerida.identificador}"
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
                  Conflito {c.chave}: {c.poup.length} no POUP, {c.uau.length} no UAU com a mesma chave
                </Text>
              ))}
              {s.naoReconhecidas.slice(0, 10).map((u) => (
                <Text key={`${u.produto}/${u.numPer}`} style={styles.meta}>
                  Não reconhecida: "{u.identificador ?? 'sem identificador'}"
                </Text>
              ))}
            </View>
          ) : null}

          {opcoesPoup.length > 0 && opcoesUau.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.itemNome}>Vincular à mão</Text>
              <Text style={styles.hint}>Confira no UAU antes: o vínculo pinta a unidade do POUP com a situação da unidade do UAU.</Text>
              <Select label="Unidade do POUP" placeholder="Escolha" value={manualPoup} options={opcoesPoup} onChange={setManualPoup} searchable />
              <Select label="Unidade do UAU" placeholder="Escolha" value={manualUau} options={opcoesUau} onChange={setManualUau} searchable />
              <Button label="Vincular" onPress={vincularManual} loading={ocupado === 'manual'} disabled={!manualPoup || !manualUau} />
            </View>
          ) : null}
        </>
      )}

      <Text style={styles.secao}>Desvincular</Text>
      <Button label="Desvincular esta obra do empreendimento" variant="danger" onPress={() => void desvincularObra()} loading={ocupado === 'remover'} />
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
