/**
 * "USAR TABELA DE PREÇO": EMPREENDIMENTO → BLOCO → UNIDADE, E PRONTO.
 *
 * Abre do bloco de valores do simulador. O corretor escolhe o empreendimento
 * (só aparecem os que têm tabela), o bloco (com a faixa de preço de cada um) e
 * a unidade — desenhada como o prédio, com o preço em cada apartamento. Ao
 * tocar na unidade, a escolha volta inteira para a simulação: o valor de venda
 * é preenchido, e construtora, empreendimento, bloco e unidade já chegam
 * prontos no bloco 2.
 *
 * Unidade sem preço na tabela não pode ser escolhida aqui: o objetivo do botão
 * é preencher o valor pela tabela, e uma unidade sem preço não tem o que
 * preencher. Ela continua podendo ser escolhida no bloco 2, com o valor
 * digitado.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { Segmento } from '@/components/Segmento';
import { GradeDeUnidades, precoCurto } from '@/components/tabelaPreco/GradeDeUnidades';
import { db, type Company, type Development, type Vaga } from '@/data';
import type { EscolhaDaTabela } from '@/features/simulador/estado';
import { faixaDoBloco } from '@/features/tabelaPreco/preco';
import { detalheDe, useUnidadesComPreco, type UnidadeComPreco } from '@/features/tabelaPreco/useUnidadesComPreco';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme, useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Props {
  visivel: boolean;
  onFechar: () => void;
  onEscolher: (escolha: EscolhaDaTabela, construtora: Company | undefined) => void;
  /** Abre direto neste empreendimento, se ele tiver tabela. */
  developmentIdInicial: string | null;
  unitIdAtual: string | null;
}

type Passo = 'empreendimento' | 'bloco' | 'unidade';
const TODAS = 'todas';

export function EscolherUnidadeDaTabela({ visivel, onFechar, onEscolher, developmentIdInicial, unitIdAtual }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [carregando, setCarregando] = useState(true);
  const [empreendimentos, setEmpreendimentos] = useState<(Development & { referencia: string })[]>([]);
  const [construtoras, setConstrutoras] = useState<Company[]>([]);
  const [passo, setPasso] = useState<Passo>('empreendimento');
  const [devId, setDevId] = useState<string | null>(null);
  const [blocoId, setBlocoId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>(TODAS);

  // A lista é relida a cada abertura: a tabela pode ter chegado agora mesmo.
  useEffect(() => {
    if (!visivel || !user) return;
    let vivo = true;
    setCarregando(true);
    void Promise.all([db.developments.list(user.id), db.tabelaPreco.referencias(), db.companies.list(user.id)]).then(
      ([devs, refs, comps]) => {
        if (!vivo) return;
        const comTabela = devs
          .filter((d) => refs.has(d.id))
          .map((d) => ({ ...d, referencia: refs.get(d.id) ?? '' }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        setEmpreendimentos(comTabela);
        setConstrutoras(comps);
        const inicial =
          comTabela.find((d) => d.id === developmentIdInicial) ?? (comTabela.length === 1 ? comTabela[0] : null);
        setDevId(inicial?.id ?? null);
        setBlocoId(null);
        setFiltro(TODAS);
        setPasso(inicial ? 'bloco' : 'empreendimento');
        setCarregando(false);
      },
    );
    return () => {
      vivo = false;
    };
  }, [visivel, user, developmentIdInicial]);

  const dev = empreendimentos.find((d) => d.id === devId) ?? null;
  const unidades = useUnidadesComPreco(visivel ? devId : null);
  const bloco = unidades.blocos.find((b) => b.id === blocoId) ?? null;
  const faixas = useMemo(
    () => new Map(unidades.blocos.map((b) => [b.id, faixaDoBloco(b)])),
    [unidades.blocos],
  );

  function escolherEmpreendimento(id: string) {
    setDevId(id);
    setBlocoId(null);
    setPasso('bloco');
  }

  function escolherBloco(id: string) {
    setBlocoId(id);
    setPasso('unidade');
  }

  function escolherUnidade(u: UnidadeComPreco) {
    if (!dev || !bloco) return;
    const detalhe = detalheDe(u, dev.name, unidades.tabela);
    if (!detalhe) return;
    onEscolher(
      {
        companyId: dev.companyId,
        developmentId: dev.id,
        blockId: bloco.id,
        blockName: bloco.nome,
        blockOrdem: bloco.ordem,
        unitId: u.id,
        codigo: u.codigo,
        detalhe,
      },
      construtoras.find((c) => c.id === dev.companyId),
    );
  }

  function voltar() {
    if (passo === 'unidade') setPasso('bloco');
    else if (passo === 'bloco') setPasso('empreendimento');
  }

  const titulo =
    passo === 'empreendimento' ? 'Escolha o empreendimento' : passo === 'bloco' ? 'Escolha o bloco' : 'Escolha a unidade';
  const trilha = [dev?.name, passo === 'unidade' ? bloco?.nome : null].filter(Boolean).join(' › ');
  const podeVoltar = passo === 'unidade' || (passo === 'bloco' && empreendimentos.length > 1);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabeca}>
            {podeVoltar ? (
              <Pressable onPress={voltar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Voltar">
                <Text style={styles.voltar}>‹</Text>
              </Pressable>
            ) : null}
            <View style={styles.flex1}>
              <Text style={styles.titulo}>{titulo}</Text>
              {trilha && passo !== 'empreendimento' ? (
                <Text style={styles.trilha} numberOfLines={2}>
                  {trilha}
                  {dev?.referencia ? ` · tabela de ${dev.referencia}` : ''}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onFechar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar">
              <Text style={styles.fechar}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.corpo} contentContainerStyle={styles.corpoConteudo}>
            {carregando || (passo !== 'empreendimento' && unidades.carregando) ? (
              <ActivityIndicator color={colors.primary} style={styles.carregando} />
            ) : passo === 'empreendimento' ? (
              empreendimentos.length === 0 ? (
                <View style={styles.vazio}>
                  <Text style={styles.vazioTitulo}>Nenhum empreendimento com tabela de preço</Text>
                  <Text style={styles.vazioTexto}>
                    Envie o PDF da tabela no cadastro do empreendimento. Depois disso, ele aparece aqui.
                  </Text>
                  <Pressable
                    onPress={() => {
                      onFechar();
                      router.push('/(app)/cadastros/empreendimentos');
                    }}
                    hitSlop={6}
                  >
                    <Text style={styles.link}>Ir para Empreendimentos</Text>
                  </Pressable>
                </View>
              ) : (
                empreendimentos.map((d) => (
                  <Pressable
                    key={d.id}
                    onPress={() => escolherEmpreendimento(d.id)}
                    style={({ pressed }) => [styles.itemLista, pressed && styles.pressionado]}
                    accessibilityRole="button"
                  >
                    <View style={styles.flex1}>
                      <Text style={styles.itemNome}>{d.name}</Text>
                      <Text style={styles.itemDetalhe}>
                        {[d.companyName, d.referencia ? `tabela de ${d.referencia}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={18} color={colors.inkSubtle} />
                  </Pressable>
                ))
              )
            ) : passo === 'bloco' ? (
              unidades.blocos.length === 0 ? (
                <View style={styles.vazio}>
                  <Text style={styles.vazioTitulo}>Sem blocos cadastrados</Text>
                  <Text style={styles.vazioTexto}>
                    A tabela chegou, mas os blocos e as unidades deste empreendimento ainda não foram cadastrados.
                  </Text>
                  {dev && !dev.isCatalog ? (
                    <Pressable
                      onPress={() => {
                        onFechar();
                        router.push({ pathname: '/(app)/cadastros/unidades', params: { developmentId: dev.id } });
                      }}
                      hitSlop={6}
                    >
                      <Text style={styles.link}>Cadastrar os blocos</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.blocos}>
                  {unidades.blocos.map((b) => {
                    const faixa = faixas.get(b.id);
                    return (
                      <Pressable
                        key={b.id}
                        onPress={() => escolherBloco(b.id)}
                        style={({ pressed }) => [styles.bloco, pressed && styles.pressionado]}
                        accessibilityRole="button"
                        accessibilityLabel={`${b.nome}${faixa ? `, de ${precoCurto(faixa.min)} a ${precoCurto(faixa.max)}` : ', sem preço'}`}
                      >
                        <Text style={styles.blocoNome} numberOfLines={1}>
                          {b.nome}
                        </Text>
                        <Text style={styles.blocoFaixa} numberOfLines={1}>
                          {faixa
                            ? faixa.min === faixa.max
                              ? precoCurto(faixa.min)
                              : `${precoCurto(faixa.min).replace(' mil', '')}–${precoCurto(faixa.max)}`
                            : 'sem preço'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : bloco ? (
              <>
                <Segmento
                  opcoes={[
                    { valor: TODAS, rotulo: 'Todas' },
                    { valor: 'carro', rotulo: 'Carro' },
                    { valor: 'moto', rotulo: 'Moto' },
                  ]}
                  valor={filtro}
                  onMudar={setFiltro}
                  style={styles.filtro}
                />
                <GradeDeUnidades
                  unidades={bloco.unidades}
                  selecionadaId={unitIdAtual}
                  onEscolher={escolherUnidade}
                  filtroVaga={filtro === TODAS ? null : (filtro as Vaga)}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    folha: {
      width: '100%',
      maxWidth: 560,
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    cabeca: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    voltar: { fontSize: 30, lineHeight: 30, color: colors.primary, paddingRight: spacing.xs },
    titulo: { ...typography.heading, color: colors.ink },
    trilha: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },
    fechar: { fontSize: 28, lineHeight: 28, color: colors.inkSubtle },
    corpo: { flexGrow: 0 },
    corpoConteudo: { padding: spacing.lg, gap: spacing.sm },
    carregando: { paddingVertical: spacing.xxl },
    pressionado: { opacity: 0.75 },

    vazio: { paddingVertical: spacing.lg, gap: spacing.sm },
    vazioTitulo: { ...typography.label, color: colors.ink },
    vazioTexto: { ...typography.caption, color: colors.inkMuted },
    link: { ...typography.label, color: colors.primary, marginTop: spacing.xs },

    itemLista: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemNome: { ...typography.body, color: colors.ink, fontWeight: '600' },
    itemDetalhe: { ...typography.caption, color: colors.inkMuted, marginTop: 2 },

    blocos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    bloco: {
      flexGrow: 1,
      flexBasis: 96,
      maxWidth: 170,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    blocoNome: { ...typography.label, color: colors.ink },
    blocoFaixa: { ...typography.caption, fontSize: 11, color: colors.primary, marginTop: 2 },
    filtro: { marginBottom: spacing.md },
  });
