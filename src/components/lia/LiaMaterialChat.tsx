import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { FilePreviewModal, type FilePreviewTarget } from '@/components/FilePreviewModal';
import { LiaOrbe } from './LiaOrbe';
import { db, type Company, type Development, type StorageEntry } from '@/data';
import { CATALOG_MATERIAL_ROOT } from '@/features/catalog/material';
import { casarPorVoz } from '@/features/lia/materialPorVoz';
import { fileKind } from '@/features/material/fileKind';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

const RAIZ = 'material';

type Etapa = 'empresa' | 'empreendimento' | 'pasta' | 'midias';

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
  const [falas, setFalas] = useState<Fala[]>([]);

  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Development[]>([]);
  const [empresaEscolhida, setEmpresaEscolhida] = useState<Company | null>(null);
  const [escolhido, setEscolhido] = useState<Development | null>(null);

  const [itens, setItens] = useState<StorageEntry[]>([]);
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const [previa, setPrevia] = useState<FilePreviewTarget | null>(null);

  const envioRef = useRef(false);
  const rolagemRef = useRef<ScrollView | null>(null);

  const empresaDo = useCallback(
    (d: Development) => empresas.find((e) => e.id === d.companyId) ?? null,
    [empresas],
  );

  const dizer = useCallback((de: Fala['de'], texto: string) => {
    setFalas((antes) => [...antes, { de, texto }]);
  }, []);

  const iniciarConversa = useCallback((emps: Company[]) => {
    setEmpresaEscolhida(null);
    setEscolhido(null);
    setItens([]);
    setMiniaturas({});
    if (emps.length > 1) {
      setEtapa('empresa');
      setFalas([{ de: 'lia', texto: 'Qual empresa?' }]);
    } else {
      setEtapa('empreendimento');
      setFalas([{ de: 'lia', texto: 'Qual empreendimento você quer?' }]);
    }
  }, []);

  useEffect(() => {
    if (!visivel || !user) return;
    let atual = true;
    void (async () => {
      const [emps, devs] = await Promise.all([
        db.companies.list(user.id),
        db.developments.list(user.id),
      ]);
      if (!atual) return;
      setEmpresas(emps);
      setEmpreendimentos(devs);
      iniciarConversa(emps);
    })().catch(() => {
      if (atual) setErro('Não foi possível carregar os materiais. Feche e tente novamente.');
    });
    return () => {
      atual = false;
    };
  }, [visivel, user, iniciarConversa]);

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

  const escolherEmpresa = useCallback(
    (empresa: Company) => {
      setEmpresaEscolhida(empresa);
      setEtapa('empreendimento');
      dizer('lia', `${empresa.name}. Qual empreendimento?`);
    },
    [dizer],
  );

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

  const empreendimentosDaEmpresa = useMemo(
    () =>
      empresaEscolhida
        ? empreendimentos.filter((d) => d.companyId === empresaEscolhida.id)
        : empreendimentos,
    [empreendimentos, empresaEscolhida],
  );

  const opcoesAtuais = useMemo(() => {
    if (etapa === 'empresa') {
      return empresas.map((e) => ({ item: e as Company | Development | string, nome: e.name }));
    }
    if (etapa === 'empreendimento') {
      return empreendimentosDaEmpresa.map((d) => ({
        item: d as Company | Development | string,
        nome: d.name,
      }));
    }
    if (etapa === 'pasta') {
      return itens
        .filter((e) => e.isFolder)
        .map((e) => ({ item: e.name as Company | Development | string, nome: e.name }));
    }
    return [];
  }, [etapa, empresas, empreendimentosDaEmpresa, itens]);

  const processarFala = useCallback(
    async (texto: string) => {
      dizer('corretor', texto);
      const r = casarPorVoz(texto, opcoesAtuais);

      if (r.ambiguos.length > 1) {
        dizer('lia', 'Achei mais de um com esse nome. Qual deles?');
        return;
      }
      if (!r.achado) {
        dizer('lia', 'Não achei esse. Digite novamente ou toque na opção.');
        return;
      }
      if (typeof r.achado === 'string') await escolherPasta(r.achado);
      // `Development` tem `companyId`; `Company` não. É o que separa os dois
      // sem precisar de um discriminante próprio no casamento por voz.
      else if ('companyId' in r.achado) await escolherEmpreendimento(r.achado);
      else void escolherEmpresa(r.achado);
    },
    [dizer, opcoesAtuais, escolherEmpresa, escolherEmpreendimento, escolherPasta],
  );

  useEffect(() => {
    if (!visivel) {
      setTexto('');
      setErro(null);
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
      setCarregando(false);
    }
  };

  useEffect(() => {
    rolagemRef.current?.scrollToEnd({ animated: true });
  }, [falas]);

  function recomecar() {
    iniciarConversa(empresas);
  }

  const pastas = itens.filter((e) => e.isFolder);
  const arquivos = itens.filter((e) => !e.isFolder);

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={aoFechar}>
      <View style={styles.fundo}>
        <View style={styles.folha}>
          <View style={styles.cabecalho}>
            <LiaOrbe modo="parada" tamanho={26} compacto />
            <View style={styles.cabecalhoTextos}>
              <Text style={styles.titulo}>LIA · Material de venda</Text>
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

            {carregando ? <ActivityIndicator style={styles.carregando} /> : null}

            {etapa === 'empresa' && empresas.length > 0 ? (
              <View style={styles.opcoes}>
                {empresas.map((e) => (
                  <Pressable key={e.id} style={styles.opcao} onPress={() => escolherEmpresa(e)}>
                    <Text style={styles.opcaoTexto}>{e.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {etapa === 'empreendimento' && empreendimentosDaEmpresa.length > 0 ? (
              <View style={styles.opcoes}>
                {empreendimentosDaEmpresa.map((d) => (
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
                  <Pressable
                    key={p.path}
                    style={styles.opcao}
                    onPress={() => void escolherPasta(p.name)}
                  >
                    <Text style={styles.opcaoTexto}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {etapa === 'midias' && arquivos.length > 0 ? (
              <View style={styles.grade}>
                {arquivos.map((a) => (
                  <Pressable key={a.path} style={styles.midia} onPress={() => void abrir(a)}>
                    {miniaturas[a.path] ? (
                      <Image source={{ uri: miniaturas[a.path] }} style={styles.miniatura} />
                    ) : (
                      <View style={styles.miniaturaVazia}>
                        <Text style={styles.miniaturaIcone}>
                          {a.mimeType?.includes('pdf')
                            ? '📄'
                            : a.mimeType?.startsWith('video')
                              ? '🎬'
                              : '📎'}
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
            <TextInput
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={2000}
              accessibilityLabel="Buscar material"
              placeholder="Digite o nome ou selecione uma opção…"
              style={[
                styles.subtitulo,
                { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 52 },
              ]}
            />
            <Button
              label="Enviar"
              onPress={() => void enviar()}
              disabled={!texto.trim() || carregando}
            />

            {(empresas.length > 1 ? etapa !== 'empresa' : etapa !== 'empreendimento') ? (
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
    miniatura: {
      width: 96,
      height: 96,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
    },
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
