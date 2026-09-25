/**
 * AUDITORIA DO RANKING (só o admin do POUP).
 *
 * O que precisa de olho humano na temporada, agrupado por corretor:
 *   * vendas EM DISPUTA (a mesma unidade ou comprador em duas contas);
 *   * vendas ACIMA DO TETO de 20 no mês;
 *   * vendas de quem foi CONTESTADO por outro corretor;
 *   * as vendas dos 10 primeiros do Brasil — o topo é o que mais importa
 *     estar certo.
 *
 * Para cada venda: abrir o comprovante, validar ou invalidar. Para cada
 * corretor: arquivar as contestações (conferido, está certo) ou tirar do
 * ranking (fraude). Tudo passa por funções do banco que conferem se quem
 * chama é admin.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Segmento } from '@/components/Segmento';
import { db, type ItemDaAuditoria } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { textoDaSituacao, type Periodo } from '@/features/ranking/regras';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export default function AuditoriaDoRanking() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { isAdmin, loading: carregandoAdmin } = useIsAdmin();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [itens, setItens] = useState<ItemDaAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [bloqueando, setBloqueando] = useState<{ id: string; nome: string } | null>(null);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    setErro(null);
    const r = await db.ranking.auditoria(periodo);
    if (!r.ok) {
      setErro(r.error);
      setItens([]);
      return;
    }
    setItens(r.data);
  }, [periodo]);

  useEffect(() => {
    if (isAdmin) void carregar();
  }, [isAdmin, carregar]);

  const porCorretor = useMemo(() => {
    const mapa = new Map<string, ItemDaAuditoria[]>();
    for (const i of itens ?? []) mapa.set(i.corretor, [...(mapa.get(i.corretor) ?? []), i]);
    return [...mapa.values()];
  }, [itens]);

  async function agir(chave: string, acao: () => Promise<{ ok: boolean; error?: string }>) {
    setOcupado(chave);
    const r = await acao();
    setOcupado(null);
    if (!r.ok) return setErro(r.error ?? 'Não foi possível concluir.');
    void carregar();
  }

  async function abrirComprovante(path: string) {
    const url = await db.ranking.linkDoComprovante(path);
    if (!url) return setErro('Não foi possível abrir o comprovante.');
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }

  if (carregandoAdmin) {
    return (
      <Screen center>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen>
        <Text style={styles.muted}>Só a auditoria do POUP acessa esta tela.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.titulo}>Auditoria do ranking</Text>
      <Text style={styles.subtitulo}>
        Disputas, vendas acima do teto, contestações e os 10 primeiros do Brasil.
      </Text>
      <Segmento
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'ano', rotulo: 'Este ano' },
        ]}
        valor={periodo}
        onMudar={(v) => setPeriodo(v as Periodo)}
        style={styles.filtro}
      />
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
      {itens == null ? (
        <ActivityIndicator color={colors.primary} style={styles.carregando} />
      ) : porCorretor.length === 0 ? (
        <Text style={styles.muted}>Nada para conferir nesta temporada.</Text>
      ) : (
        porCorretor.map((vendas) => {
          const c = vendas[0];
          return (
            <View key={c.corretor} style={styles.card}>
              <View style={styles.cabeca}>
                <View style={styles.flex1}>
                  <Text style={styles.nome}>{c.corretorNome || 'Sem nome'}</Text>
                  <Text style={styles.meta}>
                    {[c.corretorCidade, c.corretorUf].filter(Boolean).join('/') || 'Sem cidade'}
                  </Text>
                </View>
                {c.bloqueado ? <Text style={[styles.tag, styles.tagRuim]}>Bloqueado</Text> : null}
                {c.denuncias > 0 ? <Text style={[styles.tag, styles.tagAlerta]}>{c.denuncias} contestação(ões)</Text> : null}
              </View>
              {c.motivos ? <Text style={styles.motivos}>“{c.motivos}”</Text> : null}

              {vendas.map((v) => {
                const t = textoDaSituacao(v.situacao);
                return (
                  <View key={v.saleId} style={styles.venda}>
                    <View style={styles.vendaTopo}>
                      <Text style={styles.vendaTitulo} numberOfLines={2}>
                        {v.empreendimento ?? 'Sem empreendimento'} · Bl {v.bloco ?? '—'} · {v.unidade ?? '—'}
                      </Text>
                      <Text
                        style={[styles.tag, t.tom === 'ok' ? styles.tagOk : t.tom === 'pendente' ? styles.tagAlerta : styles.tagRuim]}
                      >
                        {t.rotulo}
                      </Text>
                    </View>
                    <Text style={styles.meta}>
                      {v.cliente} · {brl(v.valor)} · {dataBR(v.dataVenda)}
                      {v.decisao ? ` · decisão: ${v.decisao === 'valida' ? 'válida' : 'inválida'}` : ''}
                    </Text>
                    <View style={styles.acoes}>
                      {v.comprovantePath ? (
                        <Pressable onPress={() => void abrirComprovante(v.comprovantePath as string)} hitSlop={6}>
                          <Text style={styles.link}>Comprovante</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.meta}>Sem comprovante</Text>
                      )}
                      <Pressable
                        disabled={ocupado != null}
                        onPress={() => void agir(v.saleId, () => db.ranking.revisar(v.saleId, 'valida'))}
                        hitSlop={6}
                      >
                        <Text style={styles.linkOk}>Validar</Text>
                      </Pressable>
                      <Pressable
                        disabled={ocupado != null}
                        onPress={() => void agir(v.saleId, () => db.ranking.revisar(v.saleId, 'invalida'))}
                        hitSlop={6}
                      >
                        <Text style={styles.linkRuim}>Invalidar</Text>
                      </Pressable>
                      {v.decisao ? (
                        <Pressable
                          disabled={ocupado != null}
                          onPress={() => void agir(v.saleId, () => db.ranking.revisar(v.saleId, null))}
                          hitSlop={6}
                        >
                          <Text style={styles.link}>Desfazer</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}

              <View style={styles.acoesCorretor}>
                {c.denuncias > 0 ? (
                  <Button
                    label="Arquivar contestações"
                    variant="secondary"
                    onPress={() => void agir(c.corretor, () => db.ranking.arquivarDenuncias(c.corretor))}
                    style={styles.flex1}
                  />
                ) : null}
                {c.bloqueado ? (
                  <Button
                    label="Devolver ao ranking"
                    variant="secondary"
                    onPress={() => void agir(c.corretor, () => db.ranking.bloquear(c.corretor, null))}
                    style={styles.flex1}
                  />
                ) : (
                  <Button
                    label="Tirar do ranking"
                    variant="danger"
                    onPress={() => {
                      setMotivo('');
                      setBloqueando({ id: c.corretor, nome: c.corretorNome });
                    }}
                    style={styles.flex1}
                  />
                )}
              </View>
            </View>
          );
        })
      )}

      <Modal visible={bloqueando != null} transparent animationType="fade" onRequestClose={() => setBloqueando(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <Text style={styles.nome}>Tirar {bloqueando?.nome} do ranking</Text>
            <Text style={styles.meta}>O motivo fica registrado. As contestações abertas são encerradas.</Text>
            <TextInput
              value={motivo}
              onChangeText={setMotivo}
              placeholder="Ex.: comprovantes falsos"
              placeholderTextColor={colors.inkSubtle}
              style={styles.input}
              maxLength={500}
            />
            <Button
              label="Tirar do ranking"
              variant="danger"
              disabled={!motivo.trim()}
              onPress={() => {
                const alvo = bloqueando;
                setBloqueando(null);
                if (alvo) void agir(alvo.id, () => db.ranking.bloquear(alvo.id, motivo.trim()));
              }}
            />
            <Button label="Cancelar" variant="ghost" onPress={() => setBloqueando(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    titulo: { ...typography.title, color: colors.ink },
    subtitulo: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
    muted: { ...typography.body, color: colors.inkSubtle, marginTop: spacing.lg },
    filtro: { marginBottom: spacing.lg },
    carregando: { paddingVertical: spacing.xxl },
    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    cabeca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    nome: { ...typography.heading, color: colors.ink },
    meta: { ...typography.caption, color: colors.inkMuted },
    motivos: { ...typography.caption, color: colors.warning, fontStyle: 'italic' },
    tag: {
      ...typography.caption,
      fontWeight: '700',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    tagOk: { color: colors.success, backgroundColor: colors.successSoft },
    tagAlerta: { color: colors.warning, backgroundColor: colors.warningSoft },
    tagRuim: { color: colors.danger, backgroundColor: colors.dangerSoft },
    venda: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: 4 },
    vendaTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    vendaTitulo: { ...typography.label, color: colors.ink, flex: 1 },
    acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs },
    link: { ...typography.label, color: colors.primary },
    linkOk: { ...typography.label, color: colors.success },
    linkRuim: { ...typography.label, color: colors.danger },
    acoesCorretor: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    modalFundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCartao: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.md,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      fontSize: 15,
    },
  });
