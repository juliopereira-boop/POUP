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
import { LiaBotao, type HabilidadeLia } from './LiaBotao';
import { LiaMaterialChat } from './LiaMaterialChat';
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
  const [materialAberto, setMaterialAberto] = useState(false);
  const [pedindoConsentimento, setPedindoConsentimento] = useState(false);
  const [jaConsentiu, setJaConsentiu] = useState<boolean | null>(null);

  useEffect(() => {
    void temConsentimentoLia().then(setJaConsentiu);
  }, []);

  const abrir = useCallback((habilidade: HabilidadeLia) => {
    /*
     * O material NÃO pede o consentimento da escuta.
     *
     * São duas coisas diferentes: a simulação abre o microfone numa conversa
     * com o CLIENTE e manda o texto para um serviço de IA — daí o aviso. O
     * material é o corretor falando sozinho uma palavra para navegar na
     * própria pasta, sem nada saindo do aparelho. Pedir o mesmo aviso aqui
     * seria treinar o corretor a aceitar sem ler, e é justamente na simulação
     * que ele precisa ler.
     */
    if (habilidade === 'material') setMaterialAberto(true);
    else setPainelAberto(true);
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
    const completo = await lia.levarParaSimulador();
    setPainelAberto(false);
    /*
     * Com tudo capturado, a LIA entrega o corretor DIRETO no botão de gerar o
     * PDF — que mora na última etapa do simulador. O objetivo é esse: ele fala,
     * ela preenche, ele confere e gera. Passar pelas cinco etapas de novo seria
     * pedir que refizesse à mão o trabalho que ela acabou de fazer.
     *
     * Faltando alguma coisa, cai na primeira etapa: aí ele PRECISA passar pelo
     * formulário, e começar do fim o obrigaria a voltar procurando o buraco.
     */
    router.push(completo ? '/simulador/fluxo' : '/simulador');
  }, [lia, router]);

  return (
    <>
      <LiaBotao onAbrir={abrir} />
      <LiaPainel
        visivel={painelAberto && !pedindoConsentimento}
        aoFechar={() => setPainelAberto(false)}
        aoLevarParaSimulador={() => void levarParaSimulador()}
      />
      <LiaMaterialChat visivel={materialAberto} aoFechar={() => setMaterialAberto(false)} />
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
