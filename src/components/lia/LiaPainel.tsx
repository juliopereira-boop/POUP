/**
 * O painel da sessão de escuta.
 *
 * ===========================================================================
 * A DECISÃO DE DESIGN QUE SUSTENTA TUDO: MOSTRAR O TRECHO
 * ===========================================================================
 * Cada campo capturado aparece com **o pedaço da conversa que o produziu**.
 *
 * Isso não é enfeite. Uma assistente que preenche campos sozinha só é útil se o
 * corretor confiar nela, e ninguém confia numa caixa-preta que escreve
 * "R$ 2.800,00" sem dizer de onde tirou. Vendo `"ela ganha dois e oitocentos"`
 * embaixo do valor, ele confere num piscar de olhos — e, quando estiver errado,
 * sabe na hora **por que** errou. É a diferença entre uma ferramenta que o
 * corretor usa de olho fechado numa reunião e uma que ele para de usar na
 * segunda vez que ela erra sem explicação.
 *
 * ===========================================================================
 * O QUE FALTA É COBRADO NA PAUSA, NÃO O TEMPO TODO
 * ===========================================================================
 * Durante a fala, cobrar seria ruído — o corretor está olhando o cliente, não a
 * tela. Na pausa de três segundos, a lista do que falta sobe em destaque: é o
 * instante em que ele tem atenção sobrando e o assunto ainda está na mesa.
 * Voltou a falar, a cobrança some sozinha.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { LiaOrbe, type ModoOrbe } from './LiaOrbe';
import {
  CAMPOS,
  CAMPOS_POR_CHAVE,
  GRUPO_ROTULO,
  dinheiroParaCampo,
  type GrupoCampo,
} from '@/features/lia/campos';
import { useLia, type CampoCapturado } from '@/features/lia/LiaProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface LiaPainelProps {
  visivel: boolean;
  aoFechar: () => void;
  /** Abre o simulador já preenchido. */
  aoLevarParaSimulador: () => void;
}

/** Quanto tempo um campo fica marcado como recém-mudado. */
const DESTAQUE_MS = 6000;

export function LiaPainel({ visivel, aoFechar, aoLevarParaSimulador }: LiaPainelProps) {
  const styles = useThemedStyles(makeStyles);
  const lia = useLia();

  const grupos = agrupar(lia.capturados);
  const total = Object.keys(lia.capturados).length;
  const prontoParaSimular = lia.faltando.length === 0 && total > 0;

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabecalho}>
            <Logo size={26} />
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.titulo}>LIA · Simulação de poupança</Text>
              <Text style={styles.subtitulo}>{legendaStatus(lia.status, lia.suporte)}</Text>
            </View>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.fechar}>✕</Text>
            </Pressable>
          </View>

          {lia.suporte !== 'ok' ? (
            <IndisponivelAqui suporte={lia.suporte} />
          ) : (
            <>
              <View style={styles.palco}>
                <LiaOrbe modo={modoDoOrbe(lia.status)} nivel={lia.nivelDeVoz} tamanho={84} />
              </View>

              <ScrollView style={styles.corpo} contentContainerStyle={styles.corpoConteudo}>
                {lia.erro ? <Text style={styles.erro}>{lia.erro}</Text> : null}

                {lia.cobrando && lia.faltando.length > 0 ? (
                  <View style={styles.faltando}>
                    <Text style={styles.faltandoTitulo}>Ainda falta perguntar</Text>
                    {lia.faltando.map((chave) => (
                      <Text key={chave} style={styles.faltandoItem}>
                        • {CAMPOS_POR_CHAVE[chave]?.rotulo ?? chave}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {lia.observacao ? (
                  <View style={styles.observacao}>
                    <Text style={styles.observacaoTexto}>{lia.observacao}</Text>
                  </View>
                ) : null}

                {total === 0 ? (
                  <VazioInicial ouvindo={lia.status !== 'desligada'} />
                ) : (
                  grupos.map(({ grupo, itens }) => (
                    <View key={grupo} style={styles.grupo}>
                      <Text style={styles.grupoTitulo}>{GRUPO_ROTULO[grupo]}</Text>
                      {itens.map((c) => (
                        <CartaoCampo key={c.chave} campo={c} aoDescartar={lia.descartar} />
                      ))}
                    </View>
                  ))
                )}

                {lia.parcial ? (
                  <Text style={styles.parcial} numberOfLines={2}>
                    {lia.parcial}…
                  </Text>
                ) : null}
              </ScrollView>

              <View style={styles.rodape}>
                {lia.status === 'desligada' ? (
                  <Button label="Começar a ouvir" onPress={() => void lia.iniciar()} />
                ) : (
                  <>
                    <Button
                      label={
                        prontoParaSimular
                          ? 'Gerar a simulação'
                          : `Gerar mesmo assim (${lia.faltando.length} sem preencher)`
                      }
                      variant={prontoParaSimular ? 'primary' : 'secondary'}
                      onPress={aoLevarParaSimulador}
                      disabled={total === 0}
                    />
                    <View style={styles.rodapeLinha}>
                      <Button label="Encerrar" variant="ghost" onPress={lia.encerrar} />
                      <Button
                        label="Reler agora"
                        variant="ghost"
                        onPress={lia.entenderAgora}
                        loading={lia.status === 'entendendo'}
                      />
                    </View>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ pedaços */

function CartaoCampo({
  campo,
  aoDescartar,
}: {
  campo: CampoCapturado;
  aoDescartar: (chave: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const spec = CAMPOS_POR_CHAVE[campo.chave];
  const recente = Date.now() - campo.em < DESTAQUE_MS;

  return (
    <View style={[styles.cartao, campo.corrigido && recente && styles.cartaoCorrigido]}>
      <View style={styles.cartaoTopo}>
        <Text style={styles.cartaoRotulo}>{spec?.rotulo ?? campo.chave}</Text>
        {campo.corrigido && recente ? <Text style={styles.selo}>corrigido</Text> : null}
        {campo.confianca !== 'alta' ? (
          <Text style={[styles.selo, styles.seloDuvida]}>
            {campo.confianca === 'media' ? 'deduzido' : 'confira'}
          </Text>
        ) : null}
        <Pressable onPress={() => aoDescartar(campo.chave)} hitSlop={8}>
          <Text style={styles.descartar}>remover</Text>
        </Pressable>
      </View>
      <Text style={styles.cartaoValor}>{exibir(campo)}</Text>
      <Text style={styles.cartaoTrecho} numberOfLines={2}>
        “{campo.trecho}”
      </Text>
    </View>
  );
}

function VazioInicial({ ouvindo }: { ouvindo: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.vazio}>
      <Text style={styles.vazioTitulo}>
        {ouvindo ? 'Pode conversar normalmente.' : 'Pronta para ouvir.'}
      </Text>
      <Text style={styles.vazioTexto}>
        A LIA não fala e não interrompe. Ela ouve a negociação inteira, na ordem que ela acontecer,
        e vai preenchendo a simulação. Se você corrigir um valor no meio da conversa, ela troca.
      </Text>
      <Text style={styles.vazioTexto}>
        Quando vocês pararem de falar por alguns segundos, ela mostra aqui o que ainda falta
        perguntar.
      </Text>
    </View>
  );
}

function IndisponivelAqui({ suporte }: { suporte: 'sem-api-no-navegador' | 'precisa-build-nativo' }) {
  const styles = useThemedStyles(makeStyles);
  const nativo = suporte === 'precisa-build-nativo';
  return (
    <View style={styles.vazio}>
      <Text style={styles.vazioTitulo}>
        {nativo ? 'Ainda não neste aplicativo' : 'Este navegador não transcreve fala'}
      </Text>
      <Text style={styles.vazioTexto}>
        {nativo
          ? 'A escuta ao vivo depende de transcrição de voz, que o app precisa trazer embutido — e o Expo Go não carrega esse módulo. Ela funciona hoje pelo POUP no navegador (Chrome ou Edge), inclusive no celular.'
          : 'Abra o POUP no Chrome ou no Edge para usar a escuta ao vivo. O Safari não oferece transcrição contínua de forma confiável.'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ apoio */

function agrupar(
  capturados: Record<string, CampoCapturado>,
): { grupo: GrupoCampo; itens: CampoCapturado[] }[] {
  const ordem: GrupoCampo[] = ['imovel', 'cliente', 'segundo', 'financiamento', 'pagamento'];
  // A ordem dos campos segue a de `CAMPOS`, não a de chegada: uma lista que se
  // reordena a cada frase seria impossível de acompanhar de relance.
  const posicao = new Map(CAMPOS.map((c, i) => [c.chave, i]));
  return ordem
    .map((grupo) => ({
      grupo,
      itens: Object.values(capturados)
        .filter((c) => CAMPOS_POR_CHAVE[c.chave]?.grupo === grupo)
        .sort((a, b) => (posicao.get(a.chave) ?? 0) - (posicao.get(b.chave) ?? 0)),
    }))
    .filter((g) => g.itens.length > 0);
}

/** Mostra o valor do jeito que o corretor lê, não do jeito que o modelo devolve. */
function exibir(campo: CampoCapturado): string {
  const spec = CAMPOS_POR_CHAVE[campo.chave];
  if (!spec) return campo.valor;
  if (spec.tipo === 'dinheiro') return dinheiroParaCampo(campo.valor) ?? campo.valor;
  if (spec.tipo === 'sim_nao') return campo.valor === 'sim' ? 'Sim' : 'Não';
  if (spec.tipo === 'empreendimento' || spec.tipo === 'correspondente') {
    // O valor é um id; quem sabe o nome é o trecho falado, logo abaixo.
    return 'identificado ✓';
  }
  return campo.valor;
}

/** O status da sessão traduzido para o vocabulário visual do orbe. */
function modoDoOrbe(status: string): ModoOrbe {
  if (status === 'ouvindo') return 'ouvindo';
  if (status === 'entendendo') return 'pensando';
  return 'parada';
}

function legendaStatus(status: string, suporte: string): string {
  if (suporte !== 'ok') return 'Indisponível nesta plataforma';
  if (status === 'ouvindo') return 'Ouvindo a negociação';
  if (status === 'entendendo') return 'Entendendo o que foi dito…';
  if (status === 'erro') return 'A escuta parou';
  return 'Desligada';
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    folha: {
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingBottom: spacing.lg,
    },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    cabecalhoTextos: { flex: 1 },
    titulo: { ...typography.label, color: colors.ink },
    subtitulo: { ...typography.caption, color: colors.inkMuted },
    fechar: { ...typography.heading, color: colors.inkMuted },

    /*
     * O orbe tem 2,6x o diâmetro do núcleo em caixa (a fumaça precisa de espaço
     * para orbitar). O palco recorta essa caixa com altura fixa para o painel
     * não crescer: a fumaça pode vazar por cima, e vazar é o efeito.
     */
    palco: { height: 176, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

    corpo: { paddingHorizontal: spacing.lg },
    corpoConteudo: { paddingVertical: spacing.md, gap: spacing.md },

    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      overflow: 'hidden',
    },

    faltando: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.warningSoft,
      borderWidth: 1,
      borderColor: colors.warning,
      gap: 2,
    },
    faltandoTitulo: { ...typography.label, color: colors.warning },
    faltandoItem: { ...typography.body, color: colors.ink },

    observacao: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    observacaoTexto: { ...typography.caption, color: colors.inkMuted },

    grupo: { gap: spacing.sm },
    grupoTitulo: { ...typography.caption, color: colors.inkSubtle, textTransform: 'uppercase' },

    cartao: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    cartaoCorrigido: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cartaoRotulo: { ...typography.caption, color: colors.inkMuted, flex: 1 },
    selo: {
      ...typography.caption,
      fontSize: 11,
      color: colors.primary,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    seloDuvida: { color: colors.warning, backgroundColor: colors.warningSoft },
    descartar: { ...typography.caption, fontSize: 11, color: colors.inkSubtle },
    cartaoValor: { ...typography.label, color: colors.ink, fontSize: 17 },
    cartaoTrecho: { ...typography.caption, color: colors.inkSubtle, fontStyle: 'italic' },

    parcial: { ...typography.caption, color: colors.inkSubtle, textAlign: 'center' },

    vazio: { padding: spacing.lg, gap: spacing.sm },
    vazioTitulo: { ...typography.label, color: colors.ink },
    vazioTexto: { ...typography.caption, color: colors.inkMuted, lineHeight: 19 },

    rodape: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    rodapeLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  });
