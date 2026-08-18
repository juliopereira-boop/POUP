/**
 * A LIA montada: botão, consentimento e painel num componente só.
 *
 * Fica pendurado no layout de `(app)`, e não em cada tela, por dois motivos que
 * se reforçam: a assistente precisa estar a um toque de distância de qualquer
 * lugar do aplicativo, e — mais importante — quando o microfone está aberto,
 * **o sinal de que ele está aberto tem que continuar visível** mesmo que o
 * corretor navegue para outra tela no meio da conversa.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { LiaBotao } from './LiaBotao';
import { LiaPainel } from './LiaPainel';
import { useLia } from '@/features/lia/LiaProvider';
import {
  AVISOS_LIA,
  darConsentimentoLia,
  temConsentimentoLia,
} from '@/features/lia/consentimento';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

export function Lia() {
  const router = useRouter();
  const lia = useLia();

  const [painelAberto, setPainelAberto] = useState(false);
  const [pedindoConsentimento, setPedindoConsentimento] = useState(false);
  const [jaConsentiu, setJaConsentiu] = useState<boolean | null>(null);

  useEffect(() => {
    void temConsentimentoLia().then(setJaConsentiu);
  }, []);

  const abrirSessao = useCallback(() => {
    setPainelAberto(true);
  }, []);

  /*
   * O consentimento é pedido ao ABRIR o painel, não ao tocar em "Começar a
   * ouvir".
   *
   * Parece detalhe e não é: o navegador só abre o microfone dentro do gesto do
   * usuário. Se o aviso aparecesse depois do toque em "Começar", o `iniciar()`
   * viria de um botão do modal de consentimento — o gesto certo, mas separado
   * por um `await` do consentimento gravado, e o Safari perde o gesto nesse
   * caminho. Pedindo antes, o toque em "Começar a ouvir" é sempre um gesto
   * limpo, direto no `iniciar()`.
   */
  useEffect(() => {
    if (painelAberto && jaConsentiu === false) setPedindoConsentimento(true);
  }, [painelAberto, jaConsentiu]);

  async function aceitar() {
    await darConsentimentoLia();
    setJaConsentiu(true);
    setPedindoConsentimento(false);
  }

  function recusar() {
    setPedindoConsentimento(false);
    setPainelAberto(false);
  }

  const levarParaSimulador = useCallback(async () => {
    await lia.levarParaSimulador();
    setPainelAberto(false);
    router.push('/simulador');
  }, [lia, router]);

  return (
    <>
      <LiaBotao onAbrirSessao={abrirSessao} />
      <LiaPainel
        visivel={painelAberto && !pedindoConsentimento}
        aoFechar={() => setPainelAberto(false)}
        aoLevarParaSimulador={() => void levarParaSimulador()}
      />
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
            <Text style={styles.titulo}>A LIA vai ouvir a conversa</Text>
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
            O cliente precisa saber que a conversa está sendo transcrita. Os dados são dele.
          </Text>

          <Button label="Entendi, pode ouvir" onPress={aoAceitar} />
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
