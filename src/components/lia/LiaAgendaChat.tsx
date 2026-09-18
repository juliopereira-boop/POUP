import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { LiaOrbe } from './LiaOrbe';
import { db } from '@/data';
import { agendarPorVoz, type CatalogoAgendamento } from '@/features/lia/agendamento';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

interface Fala {
  de: 'lia' | 'corretor';
  texto: string;
}

const PRIMEIRA_FALA: Fala = {
  de: 'lia',
  texto: 'O que você quer agendar? Digite o dia, a hora e o que é.',
};

interface LiaAgendaChatProps {
  visivel: boolean;
  aoFechar: () => void;
}

export function LiaAgendaChat({ visivel, aoFechar }: LiaAgendaChatProps) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user } = useAuth();

  const [falas, setFalas] = useState<Fala[]>([PRIMEIRA_FALA]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoAgendamento>({
    empreendimentos: [],
    clientes: [],
    empresaDoEmpreendimento: {},
  });

  const envioRef = useRef(false);
  const ativaRef = useRef(true);
  useEffect(() => {
    ativaRef.current = true;
    return () => {
      ativaRef.current = false;
    };
  }, []);
  const rolagemRef = useRef<ScrollView | null>(null);

  const dizer = useCallback((de: Fala['de'], texto: string) => {
    setFalas((antes) => [...antes, { de, texto }]);
  }, []);

  useEffect(() => {
    if (!visivel || !user) return;
    let atual = true;
    void (async () => {
      const [devs, leads] = await Promise.all([
        db.developments.list(user.id),
        db.leads.list(user.id),
      ]);
      if (!atual) return;
      setCatalogo({
        empreendimentos: devs.map((d) => ({ id: d.id, nome: d.name })),
        clientes: leads.map((l) => ({ id: l.id, nome: l.name })),
        empresaDoEmpreendimento: Object.fromEntries(devs.map((d) => [d.id, d.companyId])),
      });
    })().catch(() => {
      if (atual) setErro('Não foi possível carregar os cadastros. Feche e tente novamente.');
    });
    return () => {
      atual = false;
    };
  }, [visivel, user]);

  const processarFala = useCallback(
    async (texto: string) => {
      if (!user) return;
      dizer('corretor', texto);
      setPensando(true);
      const r = await agendarPorVoz(user.id, texto, catalogo, () => ativaRef.current);
      if (!ativaRef.current) return;
      setPensando(false);

      dizer('lia', r.ok ? `✅ Agendado: ${r.resumo}` : r.motivo);
    },
    [user, catalogo, dizer],
  );

  useEffect(() => {
    if (!visivel) {
      setTexto('');
      setErro(null);
      setFalas([PRIMEIRA_FALA]);
    }
  }, [visivel]);

  const enviar = async () => {
    const mensagem = texto.trim();
    if (!mensagem || envioRef.current) return;
    envioRef.current = true;
    setErro(null);
    try {
      await processarFala(mensagem);
      setTexto('');
    } catch {
      setErro('Não foi possível concluir. Tente novamente.');
    } finally {
      envioRef.current = false;
      setPensando(false);
    }
  };

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: true });
  }, [falas]);

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabecalho}>
            <LiaOrbe modo={pensando ? 'pensando' : 'parada'} tamanho={26} compacto />
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.titulo}>LIA · Agenda</Text>
              <Text style={styles.subtitulo}>Digite sua mensagem ou selecione uma opção</Text>
            </View>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.fechar}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={rolagemRef}
            style={styles.conversa}
            contentContainerStyle={styles.conversaConteudo}
          >
            {falas.map((f, i) => (
              <View
                key={`${i}-${f.texto}`}
                style={[styles.balao, f.de === 'lia' ? styles.balaoLia : styles.balaoCorretor]}
              >
                <Text style={f.de === 'lia' ? styles.balaoTextoLia : styles.balaoTextoCorretor}>
                  {f.texto}
                </Text>
              </View>
            ))}

            {pensando ? <ActivityIndicator style={styles.carregando} /> : null}

            {falas.length === 1 ? (
              <View style={styles.exemplos}>
                <Text style={styles.exemplosTitulo}>Por exemplo</Text>
                <Text style={styles.exemplo}>
                  "dia 25 às 10 horas, apresentar o Connect para a Fulana"
                </Text>
                <Text style={styles.exemplo}>"amanhã às 15h, reunião de assinatura"</Text>
                <Text style={styles.exemplo}>"sexta às 9, visita ao Parque das Águas"</Text>
              </View>
            ) : null}

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <Text style={styles.aviso}>
              O texto que você enviar é enviado a um serviço de inteligência artificial (Anthropic)
              para interpretar o compromisso.
            </Text>
          </ScrollView>

          <View style={styles.rodape}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={2000}
              editable={!pensando}
              accessibilityLabel="Compromisso para agendar"
              placeholder="Digite o dia, horário e compromisso…"
              style={[
                styles.subtitulo,
                { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 52 },
              ]}
            />
            <Button
              label="Enviar"
              onPress={() => void enviar()}
              disabled={!texto.trim() || pensando}
            />

            <Button
              label="Abrir o calendário"
              variant="ghost"
              onPress={() => {
                aoFechar();
                router.push('/(app)/calendario');
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
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
    titulo: { ...typography.heading, color: colors.primary },
    subtitulo: { ...typography.caption, color: colors.inkMuted },
    fechar: { ...typography.heading, color: colors.inkMuted },

    conversa: { maxHeight: 420 },
    conversaConteudo: { padding: spacing.lg, gap: spacing.sm },
    balao: {
      maxWidth: '86%',
      padding: spacing.md,
      borderRadius: radius.md,
    },
    balaoLia: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    balaoCorretor: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
    balaoParcial: { opacity: 0.6 },
    balaoTextoLia: { ...typography.body, color: colors.ink },
    balaoTextoCorretor: { ...typography.body, color: colors.primary },

    carregando: { marginVertical: spacing.md },

    exemplos: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      gap: 4,
    },
    exemplosTitulo: { ...typography.caption, color: colors.inkSubtle, textTransform: 'uppercase' },
    exemplo: { ...typography.caption, color: colors.inkMuted, fontStyle: 'italic' },

    erro: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
    aviso: {
      ...typography.caption,
      color: colors.inkSubtle,
      marginTop: spacing.lg,
      lineHeight: 17,
      fontSize: 11.5,
    },

    rodape: { padding: spacing.lg, gap: spacing.sm },
  });
