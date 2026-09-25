/**
 * RANKING — quem mais vende, na cidade, no estado e no Brasil.
 *
 * ===========================================================================
 * UM JOGO, MAS UM JOGO JUSTO
 * ===========================================================================
 * A temporada é o mês (ou o ano): vence quem tem mais vendas COMPROVADAS, e o
 * VGV desempata. O pódio no topo, a lista embaixo, a posição do corretor
 * sempre à vista — e, logo abaixo dela, o que falta para subir ("2 vendas sem
 * comprovante"). É isso que faz o ranking puxar o corretor de volta ao app.
 *
 * Quem decide o que pontua é o banco (`20260925150000_ranking.sql`), não esta
 * tela: comprovante anexado, CPF do comprador válido, uma unidade por dono,
 * teto mensal, auditoria. A tela só explica — "Como o ranking é justo" no fim
 * da página diz as regras com todas as letras, porque ranking que ninguém
 * entende parece roubado.
 *
 * Participar é escolha: aparecer mostra nome, cidade e resultado aos outros
 * corretores (LGPD). Quem não participa vê o ranking, mas não aparece nele.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Segmento } from '@/components/Segmento';
import { db } from '@/data';
import { useIsAdmin } from '@/features/admin';
import {
  corDoParticipante,
  faltaParaParticipar,
  iniciais,
  nomeDaTemporada,
  ordinal,
  resumoDasSituacoes,
  rotuloDoEscopo,
  textoDaSituacao,
  textoDoPrazo,
  vgvCurto,
  type Escopo,
  type LinhaDoRanking,
  type Periodo,
  type SituacaoDaVenda,
} from '@/features/ranking/regras';
import { isValidCPF } from '@/lib/masks';
import { useProfile } from '@/providers/ProfileProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, shadow, spacing, typography, type AppColors } from '@/theme';

const OURO = '#F5B301';
const PRATA = '#A7B1C2';
const BRONZE = '#CD7F32';
const PALETA = ['#FF751F', '#2563EB', '#16A34A', '#9333EA', '#DB2777', '#0891B2', '#CA8A04'];

/** A lista que já veio, por escopo e período: trocar de aba é instantâneo. */
const memoria = new Map<string, LinhaDoRanking[]>();

export default function RankingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, refresh } = useProfile();
  const { isAdmin } = useIsAdmin();

  const [escopo, setEscopo] = useState<Escopo>('cidade');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [linhas, setLinhas] = useState<LinhaDoRanking[] | null>(() => memoria.get('cidade|mes') ?? null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);
  const [situacoes, setSituacoes] = useState<Map<string, SituacaoDaVenda>>(new Map());
  const [participarAberto, setParticiparAberto] = useState(false);
  const [contestando, setContestando] = useState<LinhaDoRanking | null>(null);
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const participa = Boolean(profile?.rankingParticipa);
  const hoje = useMemo(() => new Date(), []);

  const carregar = useCallback(async () => {
    const chave = `${escopo}|${periodo}`;
    const guardada = memoria.get(chave);
    setLinhas(guardada ?? null);
    setCarregando(!guardada);
    setErro(null);
    const [r, s] = await Promise.all([db.ranking.listar(escopo, periodo), db.ranking.minhasSituacoes(periodo)]);
    setCarregando(false);
    setSituacoes(s);
    if (!r.ok) {
      setMigracaoPendente(r.migracaoPendente);
      if (!guardada) setErro(r.error);
      return;
    }
    memoria.set(chave, r.data);
    setLinhas(r.data);
  }, [escopo, periodo]);

  // Ao abrir, ao trocar de filtro e ao voltar de Vendas (onde o comprovante
  // foi anexado): a posição é sempre a de agora.
  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const eu = linhas?.find((l) => l.eu) ?? null;
  const pontuando = (linhas ?? []).filter((l) => l.vendas > 0);
  const podio = pontuando.slice(0, 3);
  const resto = (linhas ?? []).filter((l) => l.posicao > 3 && (l.vendas > 0 || l.eu));
  const resumo = resumoDasSituacoes([...situacoes.values()]);
  const pendentes = (['sem_comprovante', 'dados_incompletos', 'em_disputa', 'acima_do_teto'] as SituacaoDaVenda[])
    .map((s) => ({ s, n: resumo[s] ?? 0 }))
    .filter((p) => p.n > 0);
  const semCidade = escopo === 'cidade' && !profile?.cidade;
  const semEstado = escopo === 'estado' && !profile?.uf;
  const lugar = rotuloDoEscopo(escopo, profile?.cidade ?? null, profile?.uf ?? null);

  async function sair() {
    const r = await db.ranking.participar(false);
    if (!r.ok) return setAviso(r.error);
    memoria.clear();
    await refresh();
    void carregar();
  }

  return (
    <Screen>
      {/* ------------------------------------------------ a temporada e você */}
      <View style={styles.hero}>
        <View style={styles.heroTopo}>
          <Text style={styles.heroMarca}>RANKING POUP</Text>
          {isAdmin ? (
            <Pressable onPress={() => router.push('/(app)/admin/ranking')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.heroAdmin}>Auditoria</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.heroTitulo}>{nomeDaTemporada(periodo, hoje)}</Text>
        <View style={styles.prazo}>
          <Text style={styles.prazoTexto}>{textoDoPrazo(periodo, hoje)}</Text>
        </View>

        {participa && eu && eu.vendas > 0 ? (
          <View style={styles.minhaPosicao}>
            <Text style={styles.minhaPosicaoNumero}>{ordinal(eu.posicao)}</Text>
            <View style={styles.flex1}>
              <Text style={styles.minhaPosicaoLugar}>em {lugar}</Text>
              <Text style={styles.minhaPosicaoDetalhe}>
                {eu.vendas} venda{eu.vendas === 1 ? '' : 's'} comprovada{eu.vendas === 1 ? '' : 's'} · {vgvCurto(eu.vgv)}
              </Text>
            </View>
            <Icon name="trophy" size={34} color="rgba(255,255,255,0.9)" strokeWidth={1.6} />
          </View>
        ) : participa ? (
          <Text style={styles.heroTexto}>
            Você está no ranking. Sua primeira venda comprovada da temporada já coloca você na lista.
          </Text>
        ) : (
          <>
            <Text style={styles.heroTexto}>
              Mostre quem vende mais na sua cidade. Participar é opcional e vale só venda comprovada.
            </Text>
            <Pressable
              onPress={() => setParticiparAberto(true)}
              style={({ pressed }) => [styles.heroBotao, pressed && styles.pressionado]}
              accessibilityRole="button"
            >
              <Text style={styles.heroBotaoTexto}>Quero participar</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ------------------------------------------------ o que falta para subir */}
      {participa && pendentes.length > 0 ? (
        <Pressable
          onPress={() => router.push('/(app)/vendas')}
          style={({ pressed }) => [styles.pendencias, pressed && styles.pressionado]}
          accessibilityRole="button"
        >
          <View style={styles.flex1}>
            <Text style={styles.pendenciasTitulo}>
              {pendentes.reduce((s, p) => s + p.n, 0)} venda(s) ainda não pontuam
            </Text>
            {pendentes.map((p) => (
              <Text key={p.s} style={styles.pendenciasItem}>
                • {p.n} {textoDaSituacao(p.s).curto}
              </Text>
            ))}
          </View>
          <Text style={styles.link}>Resolver</Text>
        </Pressable>
      ) : null}

      {/* ------------------------------------------------ filtros */}
      <Segmento
        opcoes={[
          { valor: 'cidade', rotulo: 'Cidade' },
          { valor: 'estado', rotulo: 'Estado' },
          { valor: 'brasil', rotulo: 'Brasil' },
        ]}
        valor={escopo}
        onMudar={(v) => setEscopo(v as Escopo)}
        style={styles.filtro}
      />
      <Segmento
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'ano', rotulo: 'Este ano' },
        ]}
        valor={periodo}
        onMudar={(v) => setPeriodo(v as Periodo)}
        style={styles.filtro}
      />

      {/* ------------------------------------------------ o placar */}
      {migracaoPendente && !linhas ? (
        <Text style={styles.aviso}>{erro}</Text>
      ) : semCidade || semEstado ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTitulo}>{semCidade ? 'Qual é a sua cidade?' : 'Qual é o seu estado?'}</Text>
          <Text style={styles.vazioTexto}>
            Informe no seu perfil onde você atua para ver o ranking {semCidade ? 'da sua cidade' : 'do seu estado'}.
          </Text>
          <Button label="Completar perfil" variant="secondary" onPress={() => router.push('/(app)/perfil')} />
        </View>
      ) : carregando ? (
        <ActivityIndicator color={colors.primary} style={styles.carregando} />
      ) : erro ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>{erro}</Text>
          <Button label="Tentar de novo" variant="secondary" onPress={() => void carregar()} />
        </View>
      ) : pontuando.length === 0 ? (
        <View style={styles.vazio}>
          <Icon name="trophy" size={40} color={OURO} strokeWidth={1.5} />
          <Text style={styles.vazioTitulo}>O 1º lugar está vago</Text>
          <Text style={styles.vazioTexto}>
            Ninguém pontuou ainda em {lugar} nesta temporada. A primeira venda comprovada leva o topo.
          </Text>
        </View>
      ) : (
        <>
          <Podio linhas={podio} onTocar={(l) => !l.eu && setContestando(l)} lugar={lugar} />
          {resto.map((l) => (
            <LinhaDaLista key={l.participante} linha={l} onTocar={() => !l.eu && setContestando(l)} />
          ))}
          <Text style={styles.rodapeLista}>
            Mais vendas comprovadas na frente; empate, vence o maior VGV.
          </Text>
        </>
      )}

      {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

      {/* ------------------------------------------------ as regras */}
      <Pressable
        onPress={() => setRegrasAbertas((v) => !v)}
        style={styles.regrasTopo}
        accessibilityRole="button"
        accessibilityState={{ expanded: regrasAbertas }}
      >
        <Text style={styles.regrasTitulo}>Como o ranking é justo</Text>
        <Text style={styles.regrasSeta}>{regrasAbertas ? '−' : '+'}</Text>
      </Pressable>
      {regrasAbertas ? (
        <View style={styles.regras}>
          {[
            ['Só venda comprovada', 'Cada venda precisa do contrato assinado ou do comprovante da comissão anexado. Só você e a auditoria do POUP abrem o arquivo.'],
            ['Dados que se conferem', 'CPF do comprador válido, empreendimento, unidade e valor reais. Venda distratada sai na hora.'],
            ['Uma unidade, um dono', 'Se duas contas registram a mesma unidade (ou o mesmo comprador no mesmo empreendimento), a venda fica em disputa e não conta para ninguém até a auditoria decidir.'],
            ['Teto de 20 por mês', 'Acima de 20 vendas no mês, as excedentes contam depois de conferidas pela auditoria.'],
            ['Com nome e CRECI', 'Para participar é preciso CPF, CRECI e cidade no perfil. Uma conta por CPF.'],
            ['Contestação e auditoria', 'Viu algo estranho? Toque na posição e conteste. Fraude comprovada tira a conta do ranking.'],
          ].map(([t, d]) => (
            <View key={t} style={styles.regra}>
              <Text style={styles.regraTitulo}>{t}</Text>
              <Text style={styles.regraTexto}>{d}</Text>
            </View>
          ))}
          {participa ? (
            <Pressable onPress={() => void sair()} hitSlop={6} style={styles.sair}>
              <Text style={styles.sairTexto}>Sair do ranking</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Participar
        visivel={participarAberto}
        onFechar={() => setParticiparAberto(false)}
        falta={faltaParaParticipar(profile, isValidCPF)}
        onCompletar={() => {
          setParticiparAberto(false);
          router.push('/(app)/perfil');
        }}
        onConfirmar={async () => {
          const r = await db.ranking.participar(true);
          if (!r.ok) return r.error;
          memoria.clear();
          await refresh();
          setParticiparAberto(false);
          void carregar();
          return null;
        }}
      />
      <Contestar alvo={contestando} onFechar={() => setContestando(null)} />
    </Screen>
  );
}

// ==========================================================================

function Avatar({ linha, tamanho, anel }: { linha: LinhaDoRanking; tamanho: number; anel?: string }) {
  const styles = useThemedStyles(makeStyles);
  const [falhou, setFalhou] = useState(false);
  const cor = corDoParticipante(linha.participante, PALETA);
  const borda = anel ? { borderWidth: 3, borderColor: anel } : null;
  if (linha.fotoUrl && !falhou) {
    return (
      <Image
        source={{ uri: linha.fotoUrl }}
        onError={() => setFalhou(true)}
        style={[{ width: tamanho, height: tamanho, borderRadius: tamanho / 2 }, borda]}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.avatar, { width: tamanho, height: tamanho, borderRadius: tamanho / 2, backgroundColor: cor }, borda]}>
      <Text style={[styles.avatarTexto, { fontSize: tamanho * 0.36 }]}>{iniciais(linha.nome)}</Text>
    </View>
  );
}

function Podio({
  linhas,
  onTocar,
  lugar,
}: {
  linhas: LinhaDoRanking[];
  onTocar: (l: LinhaDoRanking) => void;
  lugar: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const subir = useRef(new Animated.Value(0)).current;
  const chave = linhas.map((l) => `${l.participante}:${l.vendas}`).join('|');

  useEffect(() => {
    subir.setValue(0);
    Animated.spring(subir, { toValue: 1, friction: 7, tension: 60, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [chave, subir]);

  // Ordem do pódio: 2º, 1º, 3º.
  const ordem = [linhas[1], linhas[0], linhas[2]];
  const alturas = [86, 118, 66];
  const cores = [PRATA, OURO, BRONZE];

  return (
    <View style={styles.podio} accessibilityLabel={`Pódio de ${lugar}`}>
      {ordem.map((l, i) => {
        if (!l) return <View key={`vazio${i}`} style={styles.podioColuna} />;
        const primeiro = i === 1;
        return (
          <Pressable
            key={l.participante}
            onPress={() => onTocar(l)}
            style={styles.podioColuna}
            accessibilityRole="button"
            accessibilityLabel={`${l.posicao}º lugar, ${l.nome}, ${l.vendas} vendas, ${vgvCurto(l.vgv)}`}
          >
            <Animated.View
              style={{
                alignItems: 'center',
                opacity: subir,
                transform: [{ translateY: subir.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
              }}
            >
              {primeiro ? <Icon name="trophy" size={26} color={OURO} strokeWidth={1.8} /> : null}
              <Avatar linha={l} tamanho={primeiro ? 70 : 56} anel={cores[i]} />
              <Text style={[styles.podioNome, l.eu && styles.podioNomeEu]} numberOfLines={2}>
                {l.eu ? 'Você' : l.nome}
              </Text>
              <Text style={styles.podioVendas}>
                {l.vendas} venda{l.vendas === 1 ? '' : 's'}
              </Text>
              <Text style={styles.podioVgv}>{vgvCurto(l.vgv)}</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.podioBase,
                { backgroundColor: cores[i], height: alturas[i] },
                { transform: [{ scaleY: subir }] },
              ]}
            >
              <Text style={styles.podioPosicao}>{l.posicao}</Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

function LinhaDaLista({ linha, onTocar }: { linha: LinhaDoRanking; onTocar: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const sub = [linha.imobiliaria, linha.cidade && linha.uf ? `${linha.cidade}/${linha.uf}` : linha.uf]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onTocar}
      style={({ pressed }) => [styles.linha, linha.eu && styles.linhaEu, pressed && styles.pressionado]}
      accessibilityRole="button"
      accessibilityLabel={`${linha.posicao}º lugar, ${linha.eu ? 'você' : linha.nome}, ${linha.vendas} vendas`}
    >
      <Text style={[styles.linhaPosicao, linha.eu && styles.linhaPosicaoEu]}>{linha.posicao}</Text>
      <Avatar linha={linha} tamanho={42} />
      <View style={styles.flex1}>
        <View style={styles.linhaNomeLinha}>
          <Text style={styles.linhaNome} numberOfLines={1}>
            {linha.nome}
          </Text>
          {linha.eu ? <Text style={styles.tagVoce}>Você</Text> : null}
        </View>
        {sub ? (
          <Text style={styles.linhaSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={styles.linhaNumeros}>
        <Text style={styles.linhaVendas}>{linha.vendas}</Text>
        <Text style={styles.linhaVgv}>{vgvCurto(linha.vgv)}</Text>
      </View>
    </Pressable>
  );
}

function Participar({
  visivel,
  onFechar,
  falta,
  onCompletar,
  onConfirmar,
}: {
  visivel: boolean;
  onFechar: () => void;
  falta: string[];
  onCompletar: () => void;
  onConfirmar: () => Promise<string | null>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (visivel) setErro(null);
  }, [visivel]);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCartao}>
          <Icon name="trophy" size={36} color={OURO} strokeWidth={1.6} />
          <Text style={styles.modalTitulo}>Entrar no ranking</Text>
          {falta.length > 0 ? (
            <>
              <Text style={styles.modalTexto}>
                Para participar, o seu perfil precisa ter: {falta.join(', ')}. É o que dá rosto ao ranking e impede
                contas de mentira.
              </Text>
              <Button label="Completar perfil" onPress={onCompletar} />
              <Button label="Agora não" variant="ghost" onPress={onFechar} />
            </>
          ) : (
            <>
              <Text style={styles.modalTexto}>
                Os outros corretores do POUP vão ver o seu nome (primeiro e último), foto, imobiliária, cidade, número
                de vendas comprovadas e o VGV da temporada. Nada além disso — clientes, valores de cada venda e
                comprovantes continuam só seus.
              </Text>
              <Text style={styles.modalTexto}>Você pode sair quando quiser.</Text>
              {erro ? <Text style={styles.modalErro}>{erro}</Text> : null}
              <Button
                label="Participar"
                loading={enviando}
                onPress={async () => {
                  setEnviando(true);
                  const e = await onConfirmar();
                  setEnviando(false);
                  if (e) setErro(e);
                }}
              />
              <Button label="Agora não" variant="ghost" onPress={onFechar} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Contestar({ alvo, onFechar }: { alvo: LinhaDoRanking | null; onFechar: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    setMotivo('');
    setResultado(null);
  }, [alvo?.participante]);

  return (
    <Modal visible={alvo != null} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCartao}>
          <Text style={styles.modalTitulo}>Contestar a posição de {alvo?.nome}</Text>
          {resultado?.ok ? (
            <>
              <Text style={styles.modalTexto}>{resultado.texto}</Text>
              <Button label="Fechar" onPress={onFechar} />
            </>
          ) : (
            <>
              <Text style={styles.modalTexto}>
                A auditoria do POUP confere os comprovantes das vendas. Diga o que parece errado — a contestação é
                sigilosa.
              </Text>
              <TextInput
                value={motivo}
                onChangeText={setMotivo}
                multiline
                maxLength={500}
                placeholder="Ex.: a unidade 301 do Village foi vendida por mim"
                placeholderTextColor={colors.inkSubtle}
                style={styles.motivo}
                accessibilityLabel="Motivo da contestação"
              />
              {resultado && !resultado.ok ? <Text style={styles.modalErro}>{resultado.texto}</Text> : null}
              <Button
                label="Enviar contestação"
                loading={enviando}
                disabled={motivo.trim().length < 5}
                onPress={async () => {
                  if (!alvo) return;
                  setEnviando(true);
                  const r = await db.ranking.denunciar(alvo.participante, motivo);
                  setEnviando(false);
                  setResultado(
                    r.ok
                      ? { ok: true, texto: 'Contestação enviada. A auditoria vai conferir os comprovantes.' }
                      : { ok: false, texto: r.error },
                  );
                }}
              />
              <Button label="Cancelar" variant="ghost" onPress={onFechar} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    pressionado: { opacity: 0.8 },
    link: { ...typography.label, color: colors.primary },

    hero: {
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      padding: spacing.xl,
      marginBottom: spacing.lg,
      ...shadow.floating,
    },
    heroTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroMarca: { ...typography.caption, color: 'rgba(255,255,255,0.85)', fontWeight: '800', letterSpacing: 1.2 },
    heroAdmin: { ...typography.caption, color: colors.white, fontWeight: '700', textDecorationLine: 'underline' },
    heroTitulo: { ...typography.display, color: colors.white, marginTop: spacing.xs },
    prazo: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      marginTop: spacing.sm,
    },
    prazoTexto: { ...typography.caption, color: colors.white, fontWeight: '700' },
    heroTexto: { ...typography.body, color: colors.white, marginTop: spacing.lg },
    heroBotao: {
      alignSelf: 'flex-start',
      backgroundColor: colors.white,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
    },
    heroBotaoTexto: { ...typography.label, color: colors.primary, fontWeight: '800' },
    minhaPosicao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      marginTop: spacing.lg,
      backgroundColor: 'rgba(0,0,0,0.12)',
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    minhaPosicaoNumero: { fontSize: 44, lineHeight: 48, fontWeight: '900', color: colors.white },
    minhaPosicaoLugar: { ...typography.label, color: colors.white },
    minhaPosicaoDetalhe: { ...typography.caption, color: 'rgba(255,255,255,0.9)', marginTop: 2 },

    pendencias: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.warningSoft,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    pendenciasTitulo: { ...typography.label, color: colors.warning, marginBottom: 2 },
    pendenciasItem: { ...typography.caption, color: colors.ink },

    filtro: { marginBottom: spacing.md },
    carregando: { paddingVertical: spacing.xxl },
    aviso: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.sm,
      marginVertical: spacing.md,
      overflow: 'hidden',
    },
    vazio: {
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    vazioTitulo: { ...typography.heading, color: colors.ink, textAlign: 'center' },
    vazioTexto: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },

    podio: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    podioColuna: { flex: 1, alignItems: 'center', maxWidth: 140 },
    podioNome: { ...typography.label, color: colors.ink, textAlign: 'center', marginTop: spacing.sm, minHeight: 36 },
    podioNomeEu: { color: colors.primary },
    podioVendas: { ...typography.caption, color: colors.ink, fontWeight: '800' },
    podioVgv: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.sm },
    podioBase: {
      width: '100%',
      borderTopLeftRadius: radius.md,
      borderTopRightRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: spacing.sm,
      transformOrigin: 'bottom',
    },
    podioPosicao: { fontSize: 28, lineHeight: 34, fontWeight: '900', color: colors.white },

    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarTexto: { color: colors.white, fontWeight: '800' },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.sm,
    },
    linhaEu: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    linhaPosicao: { width: 28, textAlign: 'center', ...typography.heading, color: colors.inkMuted },
    linhaPosicaoEu: { color: colors.primary },
    linhaNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    linhaNome: { ...typography.body, color: colors.ink, fontWeight: '700', flexShrink: 1 },
    tagVoce: {
      ...typography.caption,
      fontSize: 11,
      color: colors.white,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 1,
      overflow: 'hidden',
      fontWeight: '800',
    },
    linhaSub: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    linhaNumeros: { alignItems: 'flex-end' },
    linhaVendas: { fontSize: 22, lineHeight: 26, fontWeight: '900', color: colors.ink },
    linhaVgv: { ...typography.caption, color: colors.inkMuted },
    rodapeLista: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center', marginTop: spacing.sm },

    regrasTopo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
      marginTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    regrasTitulo: { ...typography.label, color: colors.ink },
    regrasSeta: { fontSize: 22, lineHeight: 24, color: colors.inkMuted },
    regras: { gap: spacing.md, paddingBottom: spacing.lg },
    regra: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
    regraTitulo: { ...typography.label, color: colors.ink },
    regraTexto: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    sair: { alignSelf: 'center', marginTop: spacing.sm },
    sairTexto: { ...typography.caption, color: colors.danger, fontWeight: '700' },

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
      alignItems: 'stretch',
    },
    modalTitulo: { ...typography.heading, color: colors.ink },
    modalTexto: { ...typography.body, color: colors.inkMuted },
    modalErro: { ...typography.caption, color: colors.danger },
    motivo: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      color: colors.ink,
      backgroundColor: colors.surfaceAlt,
      fontSize: 15,
      textAlignVertical: 'top',
    },
  });
