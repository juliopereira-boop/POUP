import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { LiaOrbe, type ModoOrbe } from './LiaOrbe';
import { LiaCapturaSurgindo } from './LiaCapturaSurgindo';
import { CAMPOS, CAMPOS_POR_CHAVE, GRUPO_ROTULO, type GrupoCampo } from '@/features/lia/campos';
import { useLia, type CampoCapturado } from '@/features/lia/LiaProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface LiaPainelProps {
  visivel: boolean;
  aoFechar: () => void;

  aoLevarParaSimulador: () => void;
}

const DESTAQUE_MS = 6000;

export function LiaPainel({ visivel, aoFechar, aoLevarParaSimulador }: LiaPainelProps) {
  const styles = useThemedStyles(makeStyles);
  const lia = useLia();
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (!visivel) setTexto('');
  }, [visivel]);

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
              <Text style={styles.subtitulo}>{legendaStatus(lia.status)}</Text>
            </View>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.fechar}>✕</Text>
            </Pressable>
          </View>

          <>
            <View style={styles.palcoWrap}>
              <View style={styles.palco}>
                <LiaOrbe modo={modoDoOrbe(lia.status)} tamanho={84} />
              </View>
              <LiaCapturaSurgindo capturados={lia.capturados} />
            </View>

            <ScrollView style={styles.corpo} contentContainerStyle={styles.corpoConteudo}>
              {lia.erro ? <Text style={styles.erro}>{lia.erro}</Text> : null}

              {total > 0 && lia.faltando.length > 0 ? (
                <View style={styles.faltando}>
                  <Text style={styles.faltandoTitulo}>Ainda falta preencher</Text>
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
                <VazioInicial />
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
            </ScrollView>

            <View style={styles.rodape}>
              <TextInput
                value={texto}
                onChangeText={setTexto}
                multiline
                maxLength={12000}
                editable={lia.status !== 'entendendo'}
                accessibilityLabel="Dados da simulação"
                placeholder="Digite os dados da negociação ou uma correção…"
                style={[
                  styles.vazioTexto,
                  { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 80 },
                ]}
              />
              <Button
                label="Analisar texto"
                disabled={!texto.trim()}
                loading={lia.status === 'entendendo'}
                onPress={() => {
                  void lia.enviarTexto(texto).then((ok) => {
                    if (ok) setTexto('');
                  });
                }}
              />
              <Button
                label={prontoParaSimular ? 'Conferir no simulador' : 'Continuar no simulador'}
                variant="secondary"
                onPress={aoLevarParaSimulador}
                disabled={total === 0 || !!texto.trim() || lia.status === 'entendendo'}
              />
              <Button
                label="Limpar sessão"
                variant="ghost"
                onPress={() => {
                  lia.encerrar();
                  setTexto('');
                }}
              />
            </View>
          </>
        </View>
      </View>
    </Modal>
  );
}

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
      <View style={styles.cartaoLinha}>
        <Text style={styles.cartaoValor}>{campo.exibicao}</Text>

        <Text style={styles.check}>✓</Text>
      </View>
      <Text style={styles.cartaoTrecho} numberOfLines={2}>
        “{campo.trecho}”
      </Text>
    </View>
  );
}

function VazioInicial() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.vazio}>
      <Text style={styles.vazioTitulo}>Digite os dados da negociação</Text>
      <Text style={styles.vazioTexto}>
        A LIA organiza o texto em campos da simulação. Você pode enviar correções e deve conferir os
        valores antes de gerar a proposta.
      </Text>
    </View>
  );
}

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

function modoDoOrbe(status: string): ModoOrbe {
  if (status === 'entendendo') return 'pensando';
  return 'parada';
}

function legendaStatus(status: string): string {
  if (status === 'entendendo') return 'Analisando o texto…';
  if (status === 'erro') return 'Não foi possível concluir a análise';
  return 'Assistente por texto';
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

    palcoWrap: { position: 'relative' },
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

    agendamento: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
    },
    agendamentoErro: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    agendamentoIcone: { fontSize: 18 },
    agendamentoTexto: { ...typography.caption, color: colors.ink, flex: 1, lineHeight: 18 },

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
    cartaoLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cartaoValor: { ...typography.label, color: colors.ink, fontSize: 17, flexShrink: 1 },
    check: { color: colors.success, fontSize: 15, fontWeight: '700' },
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
