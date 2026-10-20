import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { EntityAvatar } from '@/components/EntityAvatar';
import { Icon } from '@/components/Icon';
import { db, type CatalogCompany } from '@/data';
import {
  aoMudarAsEmpresas,
  atuaNoEstado,
  avisarQueAsEmpresasMudaram,
  chaveJaAberta,
  deveAbrirSozinha,
  detalheDaEmpresa,
  empresasDoCatalogo,
  marcadasDeInicio,
  paraSincronizar,
  quantasPendentes,
  registrarAbridorDaSincronizacao,
  resumoDoResultado,
  rotuloDoBotao,
  sincronizar,
  type AberturaDaSincronizacao,
} from '@/features/catalog/sincronizar';
import { guideSeenKey, registrarAoTerminarOGuia } from '@/features/guide';
import { depoisDeFecharJanela } from '@/lib/navegacao';
import { sessionStorage } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, shadow, spacing, typography, type AppColors } from '@/theme';

/** Voltar à tela inicial reconta as pendentes, mas não mais que uma vez a cada 30 s. */
const RECONTAR_APOS_MS = 30_000;

/**
 * SINCRONIZAR EMPRESAS — o botão flutuante da tela inicial e a janela dele.
 *
 * O corretor não quer passar por Cadastros › Empresas › Catálogo: aqui ele vê
 * o catálogo já marcado e sincroniza com um toque. A regra (o que vem marcado,
 * quando a janela abre sozinha) mora em `features/catalog/sincronizar.ts`.
 *
 * Mora no layout, e não na tela inicial, por dois motivos: a janela abre
 * sozinha no fim do guia (que também mora no layout), e o botão fica na mesma
 * altura da LIA, que se ancora acima da barra de abas.
 */
export function SincronizarEmpresas() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile, needsOnboarding, loading: carregandoPerfil } = useProfile();
  const uf = profile?.uf ?? null;
  const naInicial = pathname === '/' || pathname === '/(app)';

  const [catalogo, setCatalogo] = useState<CatalogCompany[] | null>(null);
  const lidoEm = useRef(0);
  const [visivel, setVisivel] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<{ texto: string; ok: boolean } | null>(null);
  /** O que fazer ao fechar (o guia pode ter pedido o simulador). */
  const depois = useRef<(() => void) | null>(null);
  const conferidoPara = useRef<string | null>(null);
  /** O aviso de "a conta mudou" que esta própria janela deu não relê o catálogo de novo. */
  const avisoProprio = useRef(false);

  // Outra conta no mesmo aparelho: nada da anterior.
  useEffect(() => {
    setCatalogo(null);
    lidoEm.current = 0;
  }, [user?.id]);

  const ler = useCallback(async (): Promise<CatalogCompany[]> => {
    if (!user) return [];
    const lista = empresasDoCatalogo(await db.catalog.list(user.id));
    lidoEm.current = Date.now();
    setCatalogo(lista);
    return lista;
  }, [user]);

  const abrir = useCallback(
    (opcoes?: AberturaDaSincronizacao, jaLido?: CatalogCompany[]) => {
      if (!user) {
        opcoes?.depois?.();
        return;
      }
      depois.current = opcoes?.depois ?? null;
      setResultado(null);
      setVisivel(true);
      // Abriu (pelo botão ou sozinha): não abre mais sozinha nesta conta.
      void sessionStorage.setItem(chaveJaAberta(user.id), '1');
      if (jaLido) {
        setMarcadas(new Set(marcadasDeInicio(jaLido, uf)));
        return;
      }
      setCatalogo(null);
      void ler().then((lista) => setMarcadas(new Set(marcadasDeInicio(lista, uf))));
    },
    [user, uf, ler],
  );

  /** Abre sozinha uma vez por conta, se houver o que sincronizar; senão segue o "depois". */
  const abrirSozinhaSeFizerSentido = useCallback(
    async (depoisDoGuia?: () => void) => {
      if (!user) return depoisDoGuia?.();
      const jaAberta = Boolean(await sessionStorage.getItem(chaveJaAberta(user.id)));
      if (jaAberta) return depoisDoGuia?.();
      const lista = await ler();
      if (!deveAbrirSozinha({ jaAberta, pendentes: quantasPendentes(lista, uf) })) {
        return depoisDoGuia?.();
      }
      abrir({ depois: depoisDoGuia }, lista);
    },
    [user, uf, ler, abrir],
  );

  useEffect(() => {
    registrarAbridorDaSincronizacao((o) => abrir(o));
    return () => registrarAbridorDaSincronizacao(null);
  }, [abrir]);

  // Fim do guia de boas-vindas.
  useEffect(() => {
    registrarAoTerminarOGuia((d) => void abrirSozinhaSeFizerSentido(d));
    return () => registrarAoTerminarOGuia(null);
  }, [abrirSozinhaSeFizerSentido]);

  // Quem já tinha visto o guia antes deste atalho existir: uma vez, ao abrir o
  // app. Quem ainda não viu fica para o fim do guia (o efeito acima).
  useEffect(() => {
    if (!user || carregandoPerfil || needsOnboarding) return;
    if (conferidoPara.current === user.id) return;
    conferidoPara.current = user.id;
    void sessionStorage.getItem(guideSeenKey(user.id)).then((visto) => {
      if (visto) void abrirSozinhaSeFizerSentido();
    });
  }, [user, carregandoPerfil, needsOnboarding, abrirSozinhaSeFizerSentido]);

  // O número do botão: recontado ao voltar para a tela inicial.
  useEffect(() => {
    if (!user || !naInicial) return;
    if (Date.now() - lidoEm.current < RECONTAR_APOS_MS) return;
    void ler();
  }, [user, naInicial, ler]);

  // Adotou ou removeu em Cadastros › Empresas: o número muda junto.
  useEffect(
    () =>
      aoMudarAsEmpresas(() => {
        if (!avisoProprio.current) void ler();
      }),
    [ler],
  );

  const pendentes = useMemo(() => {
    // As do estado do corretor primeiro; as de fora ficam no fim, desmarcadas.
    const lista = paraSincronizar(catalogo ?? []);
    return [...lista.filter((e) => atuaNoEstado(e, uf)), ...lista.filter((e) => !atuaNoEstado(e, uf))];
  }, [catalogo, uf]);
  const jaNoApp = useMemo(() => (catalogo ?? []).filter((e) => e.adopted), [catalogo]);
  const contagem = catalogo ? quantasPendentes(catalogo, uf) : 0;

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  const todasMarcadas = pendentes.length > 0 && pendentes.every((e) => marcadas.has(e.company.id));

  function fechar(destino?: 'simulador' | 'empresas') {
    setVisivel(false);
    const acao =
      destino === 'simulador'
        ? () => router.push('/(app)/simuladores')
        : destino === 'empresas'
          ? () => router.push('/(app)/cadastros/empresas')
          : depois.current;
    depois.current = null;
    if (acao) depoisDeFecharJanela(acao);
  }

  async function sincronizarMarcadas() {
    if (!user || marcadas.size === 0 || sincronizando) return;
    setSincronizando(true);
    setResultado(null);
    const nomes = new Map((catalogo ?? []).map((e) => [e.company.id, e.company.name]));
    const r = await sincronizar([...marcadas], (id) => db.catalog.adopt(user.id, id));
    await ler();
    // O que falhou continua marcado: tocar de novo tenta só ele.
    setMarcadas(new Set(r.falhas.map((f) => f.id)));
    setSincronizando(false);
    setResultado({ texto: resumoDoResultado(r, nomes), ok: r.falhas.length === 0 });
    if (r.sincronizadas.length > 0) {
      avisoProprio.current = true;
      avisarQueAsEmpresasMudaram();
      avisoProprio.current = false;
    }
  }

  return (
    <>
      {naInicial && user ? (
        <View
          pointerEvents="box-none"
          style={[styles.ancora, { bottom: 74 + Math.max(insets.bottom, spacing.sm) }]}
        >
          {/* Discreto de propósito: só o ícone, e o número quando há o que
              sincronizar. O nome vai para o leitor de tela. */}
          <Pressable
            onPress={() => abrir()}
            hitSlop={6}
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            accessibilityRole="button"
            accessibilityLabel={
              contagem > 0
                ? `Sincronizar empresas: ${contagem} para sincronizar`
                : 'Sincronizar empresas'
            }
          >
            <Icon name="sync" size={20} color={colors.primary} strokeWidth={1.9} />
            {contagem > 0 ? (
              <View style={styles.fabSelo}>
                <Text style={styles.fabSeloTexto}>{contagem}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      <Modal visible={visivel} transparent animationType="slide" onRequestClose={() => fechar()}>
        <View style={styles.fundo}>
          <View style={styles.janela}>
            <View style={styles.cabecalho}>
              <View style={styles.cabecalhoIcone}>
                <Icon name="sync" size={22} color={colors.primary} strokeWidth={2} />
              </View>
              <Text style={styles.titulo}>Sincronizar empresas</Text>
              <Pressable onPress={() => fechar()} hitSlop={10} accessibilityLabel="Fechar">
                <Text style={styles.fechar}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.intro}>
              Marque as construtoras que você vende. Elas entram prontas na sua conta: regra de
              comissão, empreendimentos e material de venda.
            </Text>

            {resultado ? (
              <View style={[styles.aviso, resultado.ok ? styles.avisoOk : styles.avisoErro]}>
                <Text style={[styles.avisoTexto, resultado.ok ? styles.avisoTextoOk : styles.avisoTextoErro]}>
                  {resultado.texto}
                </Text>
              </View>
            ) : null}

            <ScrollView style={styles.rolagem} showsVerticalScrollIndicator={false}>
              {catalogo === null ? (
                <Text style={styles.apagado}>Carregando o catálogo...</Text>
              ) : catalogo.length === 0 ? (
                <View style={styles.vazio}>
                  <Text style={styles.vazioTitulo}>Nenhuma construtora publicada ainda</Text>
                  <Text style={styles.vazioTexto}>
                    Quando o POUP publicar construtoras no catálogo, elas aparecem aqui. Enquanto isso,
                    cadastre a sua em Cadastros › Empresas.
                  </Text>
                </View>
              ) : (
                <>
                  {pendentes.length > 0 ? (
                    <>
                      <View style={styles.secaoLinha}>
                        <Text style={styles.secao}>Para sincronizar</Text>
                        {pendentes.length > 1 ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() =>
                              setMarcadas(
                                todasMarcadas ? new Set() : new Set(pendentes.map((e) => e.company.id)),
                              )
                            }
                          >
                            <Text style={styles.link}>
                              {todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {pendentes.map((e) => {
                        const marcada = marcadas.has(e.company.id);
                        return (
                          <Pressable
                            key={e.company.id}
                            onPress={() => alternar(e.company.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: marcada }}
                            // No navegador, só o `aria-checked` chega ao leitor de tela.
                            aria-checked={marcada}
                            accessibilityLabel={e.company.name}
                            style={({ pressed }) => [
                              styles.linha,
                              marcada && styles.linhaMarcada,
                              pressed && styles.linhaPressionada,
                            ]}
                          >
                            <View style={[styles.caixa, marcada && styles.caixaMarcada]}>
                              {marcada ? (
                                <Icon name="check" size={16} color={colors.white} strokeWidth={2.6} />
                              ) : null}
                            </View>
                            <EntityAvatar photoUrl={e.company.photoUrl} name={e.company.name} size={40} />
                            <View style={styles.linhaTextos}>
                              <Text style={styles.nome}>{e.company.name}</Text>
                              <Text style={styles.detalhe}>{detalheDaEmpresa(e, uf)}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  ) : (
                    <View style={styles.vazio}>
                      <Text style={styles.vazioTitulo}>Tudo em dia</Text>
                      <Text style={styles.vazioTexto}>
                        Você já usa todas as construtoras do catálogo. As que o POUP publicar depois
                        aparecem aqui.
                      </Text>
                    </View>
                  )}

                  {jaNoApp.length > 0 ? (
                    <>
                      <Text style={[styles.secao, styles.secaoSeguinte]}>Já no seu app</Text>
                      {jaNoApp.map((e) => (
                        <View key={e.company.id} style={styles.linhaFeita}>
                          <EntityAvatar photoUrl={e.company.photoUrl} name={e.company.name} size={32} />
                          <Text style={[styles.nome, styles.flex1]} numberOfLines={1}>
                            {e.company.name}
                          </Text>
                          <Icon name="check" size={18} color={colors.success} strokeWidth={2.4} />
                        </View>
                      ))}
                    </>
                  ) : null}

                  {/* O aceite em lote é o mesmo vínculo do aceite um a um: o
                      corretor precisa saber o que está autorizando. */}
                  <View style={styles.explica}>
                    <Text style={styles.explicaTexto}>
                      • Ficam <Text style={styles.forte}>somente leitura</Text>: quem mantém os dados
                      é o POUP, e as atualizações chegam sozinhas.
                    </Text>
                    <Text style={styles.explicaTexto}>
                      • Seu histórico não muda. Para tirar uma construtora da sua lista: Cadastros ›
                      Empresas.
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.rodape}>
              {resultado?.ok ? (
                <>
                  <Button label="Fazer uma simulação" onPress={() => fechar('simulador')} />
                  <Button label="Fechar" variant="ghost" onPress={() => fechar()} />
                </>
              ) : catalogo !== null && catalogo.length === 0 ? (
                <>
                  <Button label="Cadastrar minha empresa" onPress={() => fechar('empresas')} />
                  <Button label="Fechar" variant="ghost" onPress={() => fechar()} />
                </>
              ) : catalogo !== null && pendentes.length === 0 ? (
                <Button label="Fechar" onPress={() => fechar()} />
              ) : (
                <>
                  <Button
                    label={rotuloDoBotao(marcadas.size)}
                    onPress={() => void sincronizarMarcadas()}
                    loading={sincronizando}
                    disabled={catalogo === null || marcadas.size === 0}
                  />
                  <Button label="Agora não" variant="ghost" onPress={() => fechar()} disabled={sincronizando} />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    // Mesma altura da LIA (`LiaBotao`), do lado oposto.
    ancora: { position: 'absolute', left: spacing.lg, zIndex: 40 },
    // 44 px, centrado na altura dos 58 px da LIA: (58 - 44) / 2 = 7.
    fab: {
      width: 44,
      height: 44,
      marginBottom: 7,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.card,
    },
    fabPressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
    fabSelo: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabSeloTexto: { color: colors.white, fontSize: 10, lineHeight: 12, fontWeight: '700' },

    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    janela: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing.lg,
    },
    cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    cabecalhoIcone: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titulo: { ...typography.heading, color: colors.ink, flex: 1 },
    fechar: { ...typography.heading, color: colors.inkMuted },
    intro: { ...typography.caption, color: colors.inkMuted, marginBottom: spacing.md },

    aviso: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
    avisoOk: { backgroundColor: colors.successSoft, borderColor: colors.success },
    avisoErro: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
    avisoTexto: { ...typography.caption },
    avisoTextoOk: { color: colors.success },
    avisoTextoErro: { color: colors.danger },

    rolagem: { flexGrow: 0, flexShrink: 1 },
    apagado: { ...typography.body, color: colors.inkSubtle, paddingVertical: spacing.lg },
    secaoLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    secao: {
      ...typography.label,
      color: colors.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    secaoSeguinte: { marginTop: spacing.lg, marginBottom: spacing.sm },
    link: { ...typography.label, color: colors.primary },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    linhaMarcada: { borderColor: colors.primary },
    linhaPressionada: { opacity: 0.75 },
    caixa: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    caixaMarcada: { backgroundColor: colors.primary, borderColor: colors.primary },
    linhaTextos: { flex: 1 },
    nome: { ...typography.body, color: colors.ink, fontWeight: '600' },
    detalhe: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    flex1: { flex: 1 },

    linhaFeita: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },

    vazio: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    vazioTitulo: { ...typography.label, color: colors.ink },
    vazioTexto: { ...typography.caption, color: colors.inkMuted },

    explica: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      marginTop: spacing.lg,
    },
    explicaTexto: { ...typography.caption, color: colors.inkMuted },
    forte: { color: colors.ink, fontWeight: '700' },

    rodape: { gap: spacing.sm, paddingTop: spacing.md },
  });
