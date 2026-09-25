/**
 * A VENDA NO RANKING: se ela pontua, o que falta, e o comprovante.
 *
 * Fica na tela da venda porque é ali que o corretor resolve: o ranking diz
 * "2 vendas sem comprovante", ele toca, cai aqui e anexa o contrato. O
 * comprovante é sigiloso — só o corretor e a auditoria do POUP abrem.
 *
 * Sem a migration do ranking, o cartão simplesmente não aparece: a venda
 * continua funcionando como sempre.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { db, type ComprovanteDaVenda } from '@/data';
import { pickFiles } from '@/features/files/pick';
import { textoDaSituacao, type SituacaoDaVenda } from '@/features/ranking/regras';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

export function RankingDaVenda({ saleId }: { saleId: string }) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const [ativo, setAtivo] = useState(false);
  const [comprovante, setComprovante] = useState<ComprovanteDaVenda | null>(null);
  const [situacao, setSituacao] = useState<SituacaoDaVenda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [c, s] = await Promise.all([db.ranking.comprovante(saleId), db.ranking.minhasSituacoes('ano')]);
    if (!c.ok) {
      setAtivo(false); // migration ainda não rodou: o cartão fica de fora
      return;
    }
    setAtivo(true);
    setComprovante(c.data);
    setSituacao(s.get(saleId) ?? null);
  }, [saleId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function anexar() {
    if (!user) return;
    setErro(null);
    const [arquivo] = await pickFiles({ multiple: false, type: TIPOS });
    if (!arquivo) return;
    setOcupado(true);
    // Trocando: o arquivo antigo só sai depois que o novo está registrado.
    const r = await db.ranking.anexarComprovante(user.id, saleId, arquivo, comprovante?.path);
    setOcupado(false);
    if (!r.ok) return setErro(r.error);
    void carregar();
  }

  async function remover() {
    if (!comprovante) return;
    setOcupado(true);
    const r = await db.ranking.removerComprovante(saleId, comprovante.path);
    setOcupado(false);
    if (!r.ok) return setErro(r.error);
    void carregar();
  }

  async function abrir() {
    if (!comprovante) return;
    const url = await db.ranking.linkDoComprovante(comprovante.path);
    if (!url) return setErro('Não foi possível abrir o comprovante agora.');
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }

  if (!ativo) return null;
  const t = situacao ? textoDaSituacao(situacao) : null;

  return (
    <View style={styles.card}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>Ranking</Text>
        {t ? (
          <Text style={[styles.pill, t.tom === 'ok' ? styles.pillOk : t.tom === 'pendente' ? styles.pillPendente : styles.pillFora]}>
            {t.rotulo}
          </Text>
        ) : null}
      </View>
      {t?.acao ? <Text style={styles.texto}>{t.acao}</Text> : null}
      {!t ? <Text style={styles.texto}>Esta venda é de uma temporada encerrada.</Text> : null}

      <Text style={styles.subtitulo}>Comprovante da venda</Text>
      {comprovante ? (
        <View style={styles.arquivo}>
          <Text style={styles.arquivoNome} numberOfLines={1}>
            {comprovante.nome}
          </Text>
          <View style={styles.acoes}>
            <Pressable onPress={() => void abrir()} hitSlop={6}>
              <Text style={styles.link}>Abrir</Text>
            </Pressable>
            <Pressable onPress={() => void anexar()} hitSlop={6} disabled={ocupado}>
              <Text style={styles.link}>Trocar</Text>
            </Pressable>
            <Pressable onPress={() => void remover()} hitSlop={6} disabled={ocupado}>
              <Text style={styles.linkPerigo}>Remover</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.texto}>
            Contrato assinado ou comprovante da comissão, em PDF ou foto. Só você e a auditoria do POUP abrem.
          </Text>
          <Button label="Anexar comprovante" variant="secondary" onPress={() => void anexar()} loading={ocupado} />
        </>
      )}
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}
      <Pressable onPress={() => router.push('/(app)/ranking')} hitSlop={6} style={styles.verRanking}>
        <Text style={styles.link}>Ver o ranking ›</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    titulo: { ...typography.heading, color: colors.ink },
    subtitulo: { ...typography.label, color: colors.ink, marginTop: spacing.sm },
    texto: { ...typography.caption, color: colors.inkMuted },
    pill: {
      ...typography.caption,
      fontWeight: '700',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
      overflow: 'hidden',
      flexShrink: 1,
    },
    pillOk: { color: colors.success, backgroundColor: colors.successSoft },
    pillPendente: { color: colors.warning, backgroundColor: colors.warningSoft },
    pillFora: { color: colors.inkMuted, backgroundColor: colors.surfaceAlt },
    arquivo: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
    arquivoNome: { ...typography.label, color: colors.ink },
    acoes: { flexDirection: 'row', gap: spacing.lg },
    link: { ...typography.label, color: colors.primary },
    linkPerigo: { ...typography.label, color: colors.danger },
    erro: { ...typography.caption, color: colors.danger },
    verRanking: { alignSelf: 'flex-start', marginTop: spacing.xs },
  });
