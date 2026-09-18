import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { LiaAgendaChat } from './LiaAgendaChat';
import { LiaBotao, type HabilidadeLia } from './LiaBotao';
import { LiaMaterialChat } from './LiaMaterialChat';
import { LiaPainel } from './LiaPainel';
import { useLia } from '@/features/lia/LiaProvider';
import { liaDisponivel } from '@/features/store';
import { useFeatureAccess } from '@/features/useFeatureAccess';
import {
  AVISOS_LIA,
  aoRevogarConsentimentoLia,
  darConsentimentoLia,
  limparConsentimentoLia,
} from '@/features/lia/consentimento';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export function Lia() {
  const router = useRouter();
  const lia = useLia();
  const encerrarLia = lia.encerrar;
  const { canUse } = useFeatureAccess();
  const acessoPermitido = liaDisponivel && canUse('lia');

  const [painelAberto, setPainelAberto] = useState(false);
  const [materialAberto, setMaterialAberto] = useState(false);
  const [agendaAberta, setAgendaAberta] = useState(false);
  const [pedindoConsentimento, setPedindoConsentimento] = useState(false);
  const [habilidadePendente, setHabilidadePendente] = useState<HabilidadeLia | null>(null);

  useEffect(() => {
    if (acessoPermitido) return;
    encerrarLia();
    setPainelAberto(false);
    setMaterialAberto(false);
    setAgendaAberta(false);
    setPedindoConsentimento(false);
    setHabilidadePendente(null);
    void limparConsentimentoLia();
  }, [acessoPermitido, encerrarLia]);

  useEffect(() => {
    return aoRevogarConsentimentoLia(() => {
      encerrarLia();
      setPainelAberto(false);
      setMaterialAberto(false);
      setAgendaAberta(false);
    });
  }, [encerrarLia]);

  const abrir = useCallback((habilidade: HabilidadeLia) => {
    void limparConsentimentoLia();
    setHabilidadePendente(habilidade);
    setPedindoConsentimento(true);
  }, []);

  async function aceitar() {
    await darConsentimentoLia();
    setPedindoConsentimento(false);
    if (habilidadePendente === 'material') setMaterialAberto(true);
    else if (habilidadePendente === 'agenda') setAgendaAberta(true);
    else setPainelAberto(true);
    setHabilidadePendente(null);
  }

  function recusar() {
    setPedindoConsentimento(false);
    setHabilidadePendente(null);
    void limparConsentimentoLia();
  }

  const levarParaSimulador = useCallback(async () => {
    const completo = await lia.levarParaSimulador();
    if (completo === null) return;
    setPainelAberto(false);

    router.push(completo ? '/simulador/fluxo' : '/simulador');
  }, [lia, router]);

  if (!liaDisponivel) return null;
  if (!canUse('lia')) return null;

  return (
    <>
      <LiaBotao onAbrir={abrir} />
      <LiaPainel
        visivel={painelAberto && !pedindoConsentimento}
        aoFechar={() => {
          lia.encerrar();
          setPainelAberto(false);
        }}
        aoLevarParaSimulador={() => void levarParaSimulador()}
      />
      {materialAberto && <LiaMaterialChat visivel aoFechar={() => setMaterialAberto(false)} />}
      {agendaAberta && <LiaAgendaChat visivel aoFechar={() => setAgendaAberta(false)} />}
      <ModalConsentimento
        visivel={pedindoConsentimento}
        aoAceitar={() => void aceitar()}
        aoRecusar={recusar}
      />
    </>
  );
}

function ModalConsentimento({
  visivel,
  aoAceitar,
  aoRecusar,
}: {
  visivel: boolean;
  aoAceitar: () => void;
  aoRecusar: () => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal visible={visivel} animationType="fade" transparent onRequestClose={aoRecusar}>
      <View style={styles.fundo}>
        <View style={styles.caixa}>
          <View style={styles.topo}>
            <Logo size={30} />
            <Text style={styles.titulo}>Autorizar IA nesta sessão</Text>
          </View>

          <ScrollView style={styles.lista} contentContainerStyle={styles.listaConteudo}>
            {AVISOS_LIA.map((aviso) => (
              <View key={aviso} style={styles.item}>
                <Text style={styles.marcador}>•</Text>
                <Text style={styles.itemTexto}>{aviso}</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={styles.destaque}>
            Ao autorizar, confirmo que informei e obtive a autorização necessária das pessoas cujos
            dados serão usados nesta sessão.
          </Text>

          <Button label="Autorizar esta sessão" onPress={aoAceitar} />
          <Pressable onPress={aoRecusar} style={styles.recusar}>
            <Text style={styles.recusarTexto}>Agora não</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    caixa: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '85%',
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      gap: spacing.md,
    },
    topo: { alignItems: 'center', gap: spacing.sm },
    titulo: { ...typography.heading, color: colors.ink, textAlign: 'center' },
    lista: { maxHeight: 260 },
    listaConteudo: { gap: spacing.sm },
    item: { flexDirection: 'row', gap: spacing.sm },
    marcador: { ...typography.body, color: colors.primary },
    itemTexto: { ...typography.caption, color: colors.inkMuted, flex: 1, lineHeight: 19 },
    destaque: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    recusar: { alignItems: 'center', paddingVertical: spacing.sm },
    recusarTexto: { ...typography.label, color: colors.inkMuted },
  });
