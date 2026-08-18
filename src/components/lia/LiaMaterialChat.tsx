/**
 * MATERIAL DE VENDA POR VOZ — o mini-chat da LIA.
 *
 * ===========================================================================
 * A CONVERSA
 * ===========================================================================
 *   LIA:      Qual empreendimento?
 *   corretor: "Connect"
 *   LIA:      Connect. E o que você quer?  Book · Posts · Plantas · Vídeos
 *   corretor: "posts"
 *   LIA:      [mostra as mídias, ele toca e envia]
 *
 * ===========================================================================
 * A LIA CONTINUA SEM FALAR
 * ===========================================================================
 * Ela **escreve**. Voz sintetizada no meio de um atendimento é constrangedora:
 * o cliente está do lado, e o corretor não quer que o celular dele comece a
 * falar sozinho. Escrevendo, o fluxo funciona com o telefone na mão, no meio
 * da conversa, sem interromper ninguém — e continua sendo por voz do lado
 * dele, que é onde a rapidez importa.
 *
 * ===========================================================================
 * TODA ETAPA TEM O TOQUE COMO SAÍDA
 * ===========================================================================
 * Cada opção que a LIA lista é também um botão. Se o microfone falhar, se o
 * lugar estiver barulhento, se o nome não casar — o corretor toca e segue.
 * Uma interface só por voz é uma interface que trava quando a voz falha, e
 * numa reunião com cliente na frente isso não é aceitável.
 *
 * Por isso o casamento por voz também nunca chuta: quando fica entre dois
 * candidatos, ele devolve os dois e a LIA pergunta. Ver `materialPorVoz.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { FilePreviewModal, type FilePreviewTarget } from '@/components/FilePreviewModal';
import { LiaOrbe } from './LiaOrbe';
import { db, type Company, type Development, type StorageEntry } from '@/data';
import { CATALOG_MATERIAL_ROOT } from '@/features/catalog/material';
import { criarEscuta, type Escuta } from '@/features/lia/escuta';
import { casarPorVoz } from '@/features/lia/materialPorVoz';
import { fileKind } from '@/features/material/fileKind';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** A pasta raiz do material, igual à da tela de Material de Venda. */
const RAIZ = 'material';

/** Pausa curta: aqui a fala é uma palavra, não uma negociação. */
const PAUSA_MS = 700;

type Etapa = 'empreendimento' | 'pasta' | 'midias';

interface Fala {
  de: 'lia' | 'corretor';
  texto: string;
}

interface LiaMaterialChatProps {
  visivel: boolean;
  aoFechar: () => void;
}

export function LiaMaterialChat({ visivel, aoFechar }: LiaMaterialChatProps) {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('empreendimento');
  const [falas, setFalas] = useState<Fala[]>([
    { de: 'lia', texto: 'Qual empreendimento você quer?' },
  ]);

  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Development[]>([]);
  const [escolhido, setEscolhido] = useState<Development | null>(null);

  const [itens, setItens] = useState<StorageEntry[]>([]);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  /*
   * A visualização reaproveita o `FilePreviewModal` da tela de Material de
   * Venda. Abrir mídia tem detalhe demais para ter duas implementações — PDF e
   * vídeo abrem fora do app no celular, imagem tem fallback quando a URL
   * assinada falha, e o botão de baixar precisa do nome original. Uma segunda
   * cópia divergiria na primeira correção que só uma delas recebesse.
   */
  const [previa, setPrevia] = useState<FilePreviewTarget | null>(null);

  const escutaRef = useRef<Escuta | null>(null);
  const rolagemRef = useRef<ScrollView | null>(null);

  const empresaDo = useCallback(
    (d: Development) => empresas.find((e) => e.id === d.companyId) ?? null,
    [empresas],
  );

  const dizer = useCallback((de: Fala['de'], texto: string) => {
    setFalas((antes) => [...antes, { de, texto }]);
  }, []);

  /* ---------------------------------------------------------- carregar */

  useEffect(() => {
    if (!visivel || !user) return;
    void (async () => {
      const [emps, devs] = await Promise.all([
        db.companies.list(user.id),
        db.developments.list(user.id),
      ]);
      setEmpresas(emps);
      setEmpreendimentos(devs);
    })();
  }, [visivel, user]);

  const listarPasta = useCallback(
    async (dev: Development, subPasta: string | null) => {
      if (!user) return;
      const empresa = empresaDo(dev);
      const root = empresa?.isCatalog ? CATALOG_MATERIAL_ROOT : user.id;
      const caminho = [RAIZ, dev.companyId, dev.id, ...(subPasta ? [subPasta] : [])].join('/');

      setCarregando(true);
      const lista = await db.material.list(root, caminho);
      setItens(lista);
      setCarregando(false);

      // Miniaturas em lote: uma assinatura por arquivo seriam dezenas de idas
      // ao servidor só para desenhar a tela.
      const imagens = lista.filter((e) => !e.isFolder && e.mimeType?.startsWith('image/'));
      if (imagens.length > 0) {
        const urls = await db.material.signedUrls(imagens.map((e) => e.path));
        setMiniaturas(urls);
      }
      return lista;
    },
    [user, empresaDo],
  );

  /* ------------------------------------------------------------ passos */

  const escolherEmpreendimento = useCallback(
    async (dev: Development) => {
      setEscolhido(dev);
      setEtapa('pasta');
      dizer('lia', `${dev.name}. E o que você deseja?`);
      const lista = await listarPasta(dev, null);
      const pastas = (lista ?? []).filter((e) => e.isFolder);
      if (pastas.length === 0) {
        dizer('lia', 'Este empreendimento ainda não tem pastas de material.');
      }
    },
    [dizer, listarPasta],
  );

  const escolherPasta = useCallback(
    async (nome: string) => {
      if (!escolhido) return;
      setEtapa('midias');
      dizer('lia', `${nome}. Aqui está:`);
      const lista = await listarPasta(escolhido, nome);
      if ((lista ?? []).length === 0) dizer('lia', 'Esta pasta está vazia.');
    },
    [escolhido, dizer, listarPasta],
  );

  /* ------------------------------------------------------------- ouvir */

  const opcoesAtuais = useMemo(() => {
    if (etapa === 'empreendimento') {
      return empreendimentos.map((d) => ({ item: d as Development | string, nome: d.name }));
    }
    if (etapa === 'pasta') {
      return itens.filter((e) => e.isFolder).map((e) => ({ item: e.name as Development | string, nome: e.name }));
    }
    return [];
  }, [etapa, empreendimentos, itens]);

  const processarFala = useCallback(
    (texto: string) => {
      dizer('corretor', texto);
      const r = casarPorVoz(texto, opcoesAtuais);

      if (r.ambiguos.length > 1) {
        dizer('lia', 'Achei mais de um com esse nome. Qual deles?');
        return;
      }
      if (!r.achado) {
        dizer('lia', 'Não achei esse. Fala de novo ou toca na opção.');
        return;
      }
      if (typeof r.achado === 'string') void escolherPasta(r.achado);
      else void escolherEmpreendimento(r.achado);
    },
    [dizer, opcoesAtuais, escolherEmpreendimento, escolherPasta],
  );

  /*
   * A fala mais recente vive numa ref porque o callback da escuta é montado
   * uma vez e enxergaria para sempre o estado daquele instante — o mesmo
   * cuidado do `LiaProvider`.
   */
  const processarRef = useRef(processarFala);
  processarRef.current = processarFala;

  const alternarEscuta = useCallback(() => {
    if (ouvindo) {
      escutaRef.current?.parar();
      escutaRef.current = null;
      setOuvindo(false);
      setParcial('');
      return;
    }

    let acumulado = '';
    const escuta = criarEscuta({
      pausaMs: PAUSA_MS,
      silencioMs: PAUSA_MS * 2,
      aoOuvir: setParcial,
      aoFechar: (t) => {
        acumulado = `${acumulado} ${t}`.trim();
      },
      // Uma palavra basta: assim que ele para de falar, a LIA age. Aqui não
      // existe "juntar a conversa toda" — a resposta é curta por natureza.
      aoPausar: () => {
        if (!acumulado) return;
        const dito = acumulado;
        acumulado = '';
        setParcial('');
        processarRef.current(dito);
      },
      aoSilenciar: () => undefined,
      aoFalhar: (m) => {
        setErro(m);
        setOuvindo(false);
      },
    });
    escutaRef.current = escuta;
    escuta.iniciar();
    setOuvindo(true);
  }, [ouvindo]);

  // Fechar sem soltar o microfone deixaria a luz do aparelho acesa.
  useEffect(() => {
    if (!visivel) {
      escutaRef.current?.parar();
      escutaRef.current = null;
      setOuvindo(false);
    }
  }, [visivel]);
  useEffect(() => () => escutaRef.current?.parar(), []);

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: true });
  }, [falas]);

  function recomecar() {
    setEtapa('empreendimento');
    setEscolhido(null);
    setItens([]);
    setMiniaturas({});
    setFalas([{ de: 'lia', texto: 'Qual empreendimento você quer?' }]);
  }

  const pastas = itens.filter((e) => e.isFolder);
  const arquivos = itens.filter((e) => !e.isFolder);

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabecalho}>
            <LiaOrbe modo={ouvindo ? 'ouvindo' : 'parada'} tamanho={26} compacto />
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.titulo}>LIA · Material de venda</Text>
              <Text style={styles.subtitulo}>
                {ouvindo ? 'Pode falar' : 'Toque no microfone e diga o que quer'}
              </Text>
            </View>
            <Pressable onPress={aoFechar} hitSlop={10} accessibilityLabel="Fechar">
              <Text style={styles.fechar}>✕</Text>
            </Pressable>
          </View>

          <ScrollView ref={rolagemRef} style={styles.conversa} contentContainerStyle={styles.conversaConteudo}>
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

            {parcial ? (
              <View style={[styles.balao, styles.balaoCorretor, styles.balaoParcial]}>
                <Text style={styles.balaoTextoCorretor}>{parcial}…</Text>
              </View>
            ) : null}

            {carregando ? <ActivityIndicator style={styles.carregando} /> : null}

            {/* As opções são sempre tocáveis: voz é o caminho rápido, não o único. */}
            {etapa === 'empreendimento' && empreendimentos.length > 0 ? (
              <View style={styles.opcoes}>
                {empreendimentos.map((d) => (
                  <Pressable
                    key={d.id}
                    style={styles.opcao}
                    onPress={() => void escolherEmpreendimento(d)}
                  >
                    <Text style={styles.opcaoTexto}>{d.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {etapa === 'pasta' && pastas.length > 0 ? (
              <View style={styles.opcoes}>
                {pastas.map((p) => (
                  <Pressable key={p.path} style={styles.opcao} onPress={() => void escolherPasta(p.name)}>
                    <Text style={styles.opcaoTexto}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {etapa === 'midias' && arquivos.length > 0 ? (
              <View style={styles.grade}>
                {arquivos.map((a) => (
                  <Pressable
                    key={a.path}
                    style={styles.midia}
                    onPress={() => void abrir(a)}
                  >
                    {miniaturas[a.path] ? (
                      <Image source={{ uri: miniaturas[a.path] }} style={styles.miniatura} />
                    ) : (
                      <View style={styles.miniaturaVazia}>
                        <Text style={styles.miniaturaIcone}>
                          {a.mimeType?.includes('pdf') ? '📄' : a.mimeType?.startsWith('video') ? '🎬' : '📎'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.midiaNome} numberOfLines={2}>
                      {a.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}
          </ScrollView>

          <View style={styles.rodape}>
            <Button
              label={ouvindo ? 'Parar de ouvir' : '🎤 Falar'}
              variant={ouvindo ? 'secondary' : 'primary'}
              onPress={alternarEscuta}
            />
            {etapa !== 'empreendimento' ? (
              <Button label="Começar de novo" variant="ghost" onPress={recomecar} />
            ) : null}
          </View>
        </View>
      </View>

      <FilePreviewModal target={previa} onClose={() => setPrevia(null)} />
    </Modal>
  );

  async function abrir(entrada: StorageEntry) {
    // Abre já, com o esqueleto: a assinatura da URL leva um instante e a
    // janela aparecendo na hora é o que faz o toque parecer instantâneo.
    setPrevia({
      name: entrada.name,
      kind: fileKind(entrada.name, entrada.mimeType, false),
      url: null,
      downloadUrl: null,
      sizeLabel: tamanhoLegivel(entrada.size),
    });
    const [url, baixar] = await Promise.all([
      db.material.signedUrl(entrada.path),
      db.material.downloadUrl(entrada.path, entrada.name),
    ]);
    if (!url) {
      setPrevia(null);
      setErro('Não consegui abrir este arquivo.');
      return;
    }
    setPrevia((atual) =>
      atual && atual.name === entrada.name ? { ...atual, url, downloadUrl: baixar } : atual,
    );
  }
}

/** Bytes → "1,4 MB". Só para a etiqueta da prévia. */
function tamanhoLegivel(bytes: number | null): string {
  if (bytes == null) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

    conversa: { paddingHorizontal: spacing.lg },
    conversaConteudo: { paddingVertical: spacing.md, gap: spacing.sm },

    balao: {
      maxWidth: '86%',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
    },
    balaoLia: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: radius.sm,
    },
    balaoCorretor: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderBottomRightRadius: radius.sm,
    },
    balaoParcial: { opacity: 0.55 },
    balaoTextoLia: { ...typography.body, color: colors.ink },
    balaoTextoCorretor: { ...typography.body, color: colors.white },

    carregando: { marginVertical: spacing.md },

    opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    opcao: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    opcaoTexto: { ...typography.label, color: colors.primary },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    midia: { width: 96, gap: 4 },
    miniatura: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
    miniaturaVazia: {
      width: 96,
      height: 96,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    miniaturaIcone: { fontSize: 30 },
    midiaNome: { ...typography.caption, color: colors.inkMuted },

    erro: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      overflow: 'hidden',
    },

    rodape: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
  });
