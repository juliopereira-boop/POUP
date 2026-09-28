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
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { db, type ComprovanteDaVenda } from '@/data';
import { pickAnexo, type PickedFile } from '@/features/files/pick';
import {
  regraDoComprovante,
  regraDoDocumento,
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

type TipoDeAnexo = 'comprovante' | 'documento';

const ANEXO = {
  comprovante: {
    titulo: 'Comprovante de pagamento do sinal',
    botao: 'Anexar comprovante de pagamento',
    emConferencia: 'comprovante_em_analise' as SituacaoDaVenda,
  },
  documento: {
    titulo: 'Documento do cliente (com o CPF)',
    botao: 'Anexar documento do cliente',
    emConferencia: 'documento_em_analise' as SituacaoDaVenda,
  },
} as const;

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
  const [documento, setDocumento] = useState<ComprovanteDaVenda | null>(null);
  const [situacao, setSituacao] = useState<SituacaoDaVenda | null>(null);
  const [ocupado, setOcupado] = useState<TipoDeAnexo | null>(null);
  const [erro, setErro] = useState<{ tipo: TipoDeAnexo; texto: string } | null>(null);
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
    const [c, d, s] = await Promise.all([
      db.ranking.comprovante(saleId),
      db.ranking.documento(saleId),
      db.ranking.minhasSituacoes('ano'),
    ]);
    if (!c.ok) {
      setAtivo(false); // migration ainda não rodou: o cartão fica de fora
      return;
    }
    setAtivo(true);
    setComprovante(c.data);
    // Sem a migration do documento, a seção dele só não aparece preenchida.
    setDocumento(d.ok ? d.data : null);
    setSituacao(s.get(saleId) ?? null);
  }, [saleId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const anexoDe = (tipo: TipoDeAnexo) => (tipo === 'comprovante' ? comprovante : documento);

  /**
   * Manda o anexo para a conferência. Foto: o celular tira o texto dela antes
   * (do arquivo recém-escolhido ou, para conferir de novo, baixando).
   */
  async function conferir(tipo: TipoDeAnexo, path: string, local?: PickedFile) {
    let texto: string | null = null;
    if (ehFoto(local?.name ?? path) || local?.contentType.startsWith('image/')) {
      if (local?.uri) texto = await textoDaFoto(local.uri);
      else {
        const url = await db.ranking.linkDoComprovante(path);
        if (url) texto = await textoDaFotoNoLink(url);
      }
    }
    await db.ranking.conferirComprovante(saleId, texto, tipo);
  }

  async function anexar(tipo: TipoDeAnexo) {
    if (!user) return;
    setErro(null);
    const arquivo = await pickAnexo(ANEXO[tipo].titulo, TIPOS);
    if (!arquivo) return;
    setOcupado(tipo);
    // Trocando: o arquivo antigo só sai depois que o novo está registrado.
    const anterior = anexoDe(tipo)?.path;
    const r =
      tipo === 'comprovante'
        ? await db.ranking.anexarComprovante(user.id, saleId, arquivo, anterior)
        : await db.ranking.anexarDocumento(user.id, saleId, arquivo, anterior);
    if (!r.ok) {
      setOcupado(null);
      return setErro({ tipo, texto: r.error });
    }
    await conferir(tipo, r.data.path, arquivo);
    setOcupado(null);
    void carregar();
  }

  async function conferirDeNovo(tipo: TipoDeAnexo) {
    const anexo = anexoDe(tipo);
    if (!anexo) return;
    setOcupado(tipo);
    await conferir(tipo, anexo.path);
    setOcupado(null);
    void carregar();
  }

  async function remover(tipo: TipoDeAnexo) {
    const anexo = anexoDe(tipo);
    if (!anexo) return;
    setOcupado(tipo);
    const r = tipo === 'comprovante' ? await db.ranking.removerComprovante(saleId, anexo.path) : await db.ranking.removerDocumento(saleId, anexo.path);
    setOcupado(null);
    if (!r.ok) return setErro({ tipo, texto: r.error });
    void carregar();
  }

  async function abrir(tipo: TipoDeAnexo) {
    const anexo = anexoDe(tipo);
    if (!anexo) return;
    const url = await db.ranking.linkDoComprovante(anexo.path);
    if (!url) return setErro({ tipo, texto: 'Não foi possível abrir o arquivo agora.' });
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  }

  /** Um anexo da venda: a regra, o arquivo (abrir/trocar/conferir/remover) ou o botão. */
  function blocoDoAnexo(tipo: TipoDeAnexo, regra: string[]) {
    const anexo = anexoDe(tipo);
    const cfg = ANEXO[tipo];
    const trabalhando = ocupado === tipo;
    return (
      <>
        <Text style={styles.subtitulo}>{cfg.titulo}</Text>
        <View style={styles.regra}>
          {regra.map((linha) => (
            <Text key={linha} style={styles.regraLinha}>
              • {linha}
            </Text>
          ))}
        </View>
        {anexo ? (
          <View style={styles.arquivo}>
            <Text style={styles.arquivoNome} numberOfLines={1}>
              {anexo.nome}
            </Text>
            <View style={styles.acoes}>
              <Pressable onPress={() => void abrir(tipo)} hitSlop={6}>
                <Text style={styles.link}>Abrir</Text>
              </Pressable>
              <Pressable onPress={() => void anexar(tipo)} hitSlop={6} disabled={ocupado != null}>
                <Text style={styles.link}>Trocar</Text>
              </Pressable>
              {situacao === cfg.emConferencia ? (
                <Pressable onPress={() => void conferirDeNovo(tipo)} hitSlop={6} disabled={ocupado != null}>
                  <Text style={styles.link}>{trabalhando ? 'Conferindo…' : 'Conferir de novo'}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => void remover(tipo)} hitSlop={6} disabled={ocupado != null}>
                <Text style={styles.linkPerigo}>Remover</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Button label={cfg.botao} variant="secondary" onPress={() => void anexar(tipo)} loading={trabalhando} disabled={ocupado != null && !trabalhando} />
        )}
        {erro?.tipo === tipo ? <Text style={styles.erro}>{erro.texto}</Text> : null}
      </>
    );
  }

  if (!ativo) return null;
  const t = pro && situacao ? textoDaSituacao(situacao) : null;
  const requisitos = requisitosDaVenda(venda, {
    pro,
    participa: Boolean(profile?.rankingParticipa),
    temComprovante: Boolean(comprovante),
    temDocumento: Boolean(documento),
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
          Disputar o ranking é para assinantes do plano Pro. Anexe o comprovante e o documento agora e esta venda já
          conta quando você assinar.
        </Text>
      ) : !t ? (
        <Text style={styles.texto}>Esta venda é de uma temporada encerrada.</Text>
      ) : null}

      {blocoDoAnexo('comprovante', regraDoComprovante(venda.saleDate, sinal))}
      {blocoDoAnexo('documento', regraDoDocumento(venda.clientCpf))}
      <Text style={styles.texto}>Só você e a auditoria do POUP abrem os arquivos.</Text>

      {/* O que falta, item por item — a mesma regra do banco, para o corretor ler. */}
      <Pressable onPress={() => setVerRequisitos((v) => !v)} hitSlop={6} style={styles.requisitosTopo} accessibilityRole="button">
        <Text style={styles.subtitulo}>
          {faltam.length === 0 ? 'Todos os requisitos cumpridos ✓' : `${faltam.length === 1 ? 'Falta 1 requisito' : `Faltam ${faltam.length} requisitos`} para pontuar`}
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
