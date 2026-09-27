/**
 * A VENDA NO RANKING: se ela pontua, o que falta, e o comprovante.
 *
 * Fica na tela da venda porque é ali que o corretor resolve: o ranking diz
 * "2 vendas sem comprovante", ele toca, cai aqui e anexa o comprovante de
 * pagamento do sinal. O comprovante é sigiloso — só o corretor e a auditoria
 * do POUP abrem.
 *
 * A REGRA fica escrita aqui (o que o comprovante precisa mostrar: a data do
 * pagamento e o valor do sinal). COMO ele é conferido não aparece na tela: a
 * conferência é da Edge Function `conferir-comprovante` e do banco, e este
 * cartão só recebe a situação da venda.
 *
 * Sem a migration do ranking, o cartão simplesmente não aparece: a venda
 * continua funcionando como sempre.
 *
 * No teste gratuito (que registra venda mas não disputa o ranking) o cartão
 * avisa que a disputa é do Pro pago — e o comprovante já pode ir: a venda
 * pontua assim que ele assinar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { db, type ComprovanteDaVenda } from '@/data';
import { pickFiles, pickImageFrom, type PickedFile } from '@/features/files/pick';
import {
  regraDoComprovante,
  requisitosDaVenda,
  textoDaSituacao,
  type SituacaoDaVenda,
  type VendaParaRanking,
} from '@/features/ranking/regras';
import { ehFoto, textoDaFoto, textoDaFotoNoLink } from '@/features/ranking/textoDaFoto';
import { currencyToNumber } from '@/lib/masks';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import { isValidCPF } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** De onde vem o comprovante: galeria de fotos (print do Pix) ou arquivos (PDF do banco). */
function escolherOrigem(): Promise<'galeria' | 'arquivos' | null> {
  if (Platform.OS === 'web') return Promise.resolve('arquivos');
  return new Promise((resolve) => {
    Alert.alert(
      'Comprovante de pagamento do sinal',
      'De onde vem o comprovante?',
      [
        { text: 'Galeria de fotos', onPress: () => resolve('galeria') },
        { text: 'Arquivos (PDF)', onPress: () => resolve('arquivos') },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export function RankingDaVenda({
  saleId,
  venda,
}: {
  saleId: string;
  venda: VendaParaRanking & { simulationId?: string | null };
}) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useProfile();
  const pro = useFeatureAccess().canUse('ranking');
  const [verRequisitos, setVerRequisitos] = useState(false);
  const [ativo, setAtivo] = useState(false);
  const [comprovante, setComprovante] = useState<ComprovanteDaVenda | null>(null);
  const [situacao, setSituacao] = useState<SituacaoDaVenda | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sinal, setSinal] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!venda.simulationId) return;
    void db.simulations.get(venda.simulationId).then((sim) => {
      if (vivo && sim) setSinal(currencyToNumber(sim.state.ato ?? '') || null);
    });
    return () => {
      vivo = false;
    };
  }, [venda.simulationId]);

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

  /**
   * Manda o comprovante para a conferência. Foto: o celular tira o texto dela
   * antes (do arquivo recém-escolhido ou, para conferir de novo, baixando).
   */
  async function conferir(path: string, local?: PickedFile) {
    let texto: string | null = null;
    if (ehFoto(local?.name ?? path) || local?.contentType.startsWith('image/')) {
      if (local?.uri) texto = await textoDaFoto(local.uri);
      else {
        const url = await db.ranking.linkDoComprovante(path);
        if (url) texto = await textoDaFotoNoLink(url);
      }
    }
    await db.ranking.conferirComprovante(saleId, texto);
  }

  async function anexar() {
    if (!user) return;
    setErro(null);
    const origem = await escolherOrigem();
    if (!origem) return;
    const arquivo =
      origem === 'galeria'
        ? await pickImageFrom('galeria')
        : (await pickFiles({ multiple: false, type: TIPOS }))[0] ?? null;
    if (!arquivo) return;
    setOcupado(true);
    // Trocando: o arquivo antigo só sai depois que o novo está registrado.
    const r = await db.ranking.anexarComprovante(user.id, saleId, arquivo, comprovante?.path);
    if (!r.ok) {
      setOcupado(false);
      return setErro(r.error);
    }
    await conferir(r.data.path, arquivo);
    setOcupado(false);
    void carregar();
  }

  async function conferirDeNovo() {
    if (!comprovante) return;
    setOcupado(true);
    await conferir(comprovante.path);
    setOcupado(false);
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
  const t = pro && situacao ? textoDaSituacao(situacao) : null;
  const requisitos = requisitosDaVenda(venda, {
    pro,
    participa: Boolean(profile?.rankingParticipa),
    temComprovante: Boolean(comprovante),
    situacao,
    hoje: hojeLocal(),
    cpfValido: isValidCPF,
  });
  const faltam = requisitos.filter((r) => !r.ok);

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
      {!pro ? (
        <Text style={styles.texto}>
          Disputar o ranking é para assinantes do plano Pro. Anexe o comprovante agora e esta venda já conta quando
          você assinar.
        </Text>
      ) : !t ? (
        <Text style={styles.texto}>Esta venda é de uma temporada encerrada.</Text>
      ) : null}

      <Text style={styles.subtitulo}>Comprovante de pagamento do sinal</Text>
      <View style={styles.regra}>
        {regraDoComprovante(venda.saleDate, sinal).map((linha) => (
          <Text key={linha} style={styles.regraLinha}>
            • {linha}
          </Text>
        ))}
      </View>
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
            {situacao === 'comprovante_em_analise' ? (
              <Pressable onPress={() => void conferirDeNovo()} hitSlop={6} disabled={ocupado}>
                <Text style={styles.link}>Conferir de novo</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => void remover()} hitSlop={6} disabled={ocupado}>
              <Text style={styles.linkPerigo}>Remover</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Button
          label="Anexar comprovante de pagamento"
          variant="secondary"
          onPress={() => void anexar()}
          loading={ocupado}
        />
      )}
      <Text style={styles.texto}>Só você e a auditoria do POUP abrem o comprovante.</Text>
      {erro ? <Text style={styles.erro}>{erro}</Text> : null}

      {/* O que falta, item por item — a mesma regra do banco, para o corretor ler. */}
      <Pressable onPress={() => setVerRequisitos((v) => !v)} hitSlop={6} style={styles.requisitosTopo} accessibilityRole="button">
        <Text style={styles.subtitulo}>
          {faltam.length === 0 ? 'Todos os requisitos cumpridos ✓' : `Falta ${faltam.length} requisito${faltam.length === 1 ? '' : 's'} para pontuar`}
        </Text>
        <Text style={styles.link}>{verRequisitos || faltam.length > 0 ? '' : 'ver'}</Text>
      </Pressable>
      {verRequisitos || faltam.length > 0 ? (
        <View style={styles.requisitos}>
          {requisitos.map((r) => (
            <View key={r.rotulo} style={styles.requisito}>
              <Text style={[styles.marca, r.ok ? styles.marcaOk : r.pendente ? styles.marcaPendente : styles.marcaFalta]}>
                {r.ok ? '✓' : r.pendente ? '…' : '✕'}
              </Text>
              <View style={styles.flex1}>
                <Text style={[styles.requisitoTexto, !r.ok && styles.requisitoFalta]}>{r.rotulo}</Text>
                {!r.ok ? <Text style={styles.texto}>{r.dica}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

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
    requisitosTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
    requisitos: { gap: spacing.sm, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing.md },
    requisito: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    marca: { ...typography.label, width: 18, textAlign: 'center' },
    marcaOk: { color: colors.success },
    marcaFalta: { color: colors.danger },
    marcaPendente: { color: colors.warning },
    regra: { gap: 2 },
    regraLinha: { ...typography.caption, color: colors.ink },
    requisitoTexto: { ...typography.caption, color: colors.ink },
    requisitoFalta: { fontWeight: '700' },
    flex1: { flex: 1 },
  });
