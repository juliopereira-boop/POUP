import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { FilePreviewModal, type FilePreviewTarget } from '@/components/FilePreviewModal';
import { FileThumb } from '@/components/FileThumb';
import { Screen } from '@/components/Screen';
import { db, type Company, type Development, type StorageEntry } from '@/data';
import { useIsAdmin } from '@/features/admin';
import { CATALOG_MATERIAL_ROOT, canEditMaterial, materialRoot } from '@/features/catalog/material';
import { fileKind, KIND_BADGE } from '@/features/material/fileKind';
import { formatBytes } from '@/features/plans';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { layout, radius, spacing, typography, type AppColors } from '@/theme';

const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_DEPTH = 5;
const ROOT = 'material';

interface PickedFile {
  name: string;
  blob: Blob;
  contentType: string;
  size: number;
}

interface WebFile {
  name: string;
  type: string;
  size: number;
}
interface WebInput {
  type: string;
  multiple: boolean;
  onchange: (() => void) | null;
  click: () => void;
  files: ArrayLike<WebFile> | null;
}

function pickFilesWeb(): Promise<PickedFile[]> {
  const doc = (globalThis as unknown as { document?: { createElement: (t: string) => WebInput } })
    .document;
  if (!doc) return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => {
      const list = input.files ? Array.from(input.files as ArrayLike<WebFile>) : [];
      resolve(
        list.map((f) => ({
          name: f.name,
          blob: f as unknown as Blob,
          contentType: f.type || 'application/octet-stream',
          size: f.size,
        })),
      );
    };
    input.click();
  });
}

async function pickFilesNative(): Promise<PickedFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (res.canceled) return [];
  const out: PickedFile[] = [];
  for (const a of res.assets) {
    const r = await fetch(a.uri);
    const blob = await r.blob();
    out.push({
      name: a.fileName ?? `arquivo-${Date.now()}.jpg`,
      blob,
      contentType: blob.type || 'image/jpeg',
      size: blob.size,
    });
  }
  return out;
}

function pickFiles(): Promise<PickedFile[]> {
  return Platform.OS === 'web' ? pickFilesWeb() : pickFilesNative();
}

export default function MaterialVendaScreen() {
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { subscription, plan } = useSubscription();
  const { isAdmin } = useIsAdmin();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [driveUrls, setDriveUrls] = useState<Record<string, string | null>>({});
  const [loadingCadastros, setLoadingCadastros] = useState(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [development, setDevelopment] = useState<Development | null>(null);
  const [folderSegs, setFolderSegs] = useState<string[]>([]);

  const [generalFiles, setGeneralFiles] = useState<StorageEntry[]>([]);
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [generalNonce, setGeneralNonce] = useState(0);

  const [configOpen, setConfigOpen] = useState(false);
  const [linkVisible, setLinkVisible] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');

  const [entries, setEntries] = useState<StorageEntry[]>([]);
  /**
   * URL assinada por caminho, para as miniaturas de imagem.
   * Pedidas em LOTE quando a lista carrega — uma assinatura por arquivo seriam
   * dezenas de idas ao servidor só para desenhar a tela.
   */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<FilePreviewTarget | null>(null);

  /** Assina só as IMAGENS: são as únicas que viram miniatura de verdade. */
  const loadThumbs = useCallback(async (list: StorageEntry[]) => {
    const paths = list
      .filter((e) => !e.isFolder && fileKind(e.name, e.mimeType, false) === 'image')
      .map((e) => e.path);
    if (paths.length === 0) return;
    const urls = await db.material.signedUrls(paths);
    setThumbs((prev) => ({ ...prev, ...urls }));
  }, []);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const limitBytes = subscription?.storageLimitBytes ?? plan?.storageLimitBytes ?? 0;

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoadingCadastros(true);
    void (async () => {
      const [comps, devs, roots, catalogRoots] = await Promise.all([
        db.companies.list(user.id),
        db.developments.list(user.id),
        db.material.list(user.id, ROOT),
        // O material das empresas do catálogo mora na raiz do POUP
        // (`catalog/material/<empresa>`), não na do corretor: sem olhar as duas
        // raízes, a empresa adotada apareceria sempre "sem material".
        db.material.list(CATALOG_MATERIAL_ROOT, ROOT),
      ]);
      const mats = await Promise.all(
        comps.map((c) => db.material.getCompanyMaterial(user.id, c.id)),
      );
      if (!mounted) return;
      const links: Record<string, string | null> = {};
      for (const m of mats) {
        if (m) links[m.companyId] = m.driveUrl;
      }
      const folderIds = new Set(roots.filter((e) => e.isFolder).map((e) => e.name));
      const catalogFolderIds = new Set(catalogRoots.filter((e) => e.isFolder).map((e) => e.name));
      setCompanies(comps);
      setDevelopments(devs);
      setDriveUrls(links);
      setAddedIds(
        comps
          .filter((c) => {
            const hasFolder = c.isCatalog ? catalogFolderIds.has(c.id) : folderIds.has(c.id);
            return hasFolder || c.id in links;
          })
          .map((c) => c.id),
      );
      setLoadingCadastros(false);
    })();
    db.billing.getStorageUsedBytes(user.id).then((b) => {
      if (mounted) setUsedBytes(b);
    });
    return () => {
      mounted = false;
    };
  }, [user]);

  const refreshUsage = useCallback(() => {
    if (user) db.billing.getStorageUsedBytes(user.id).then(setUsedBytes);
  }, [user]);

  const addedCompanies = useMemo(
    () => companies.filter((c) => addedIds.includes(c.id)),
    [companies, addedIds],
  );
  const availableCompanies = useMemo(
    () => companies.filter((c) => !addedIds.includes(c.id)),
    [companies, addedIds],
  );
  const companyDevs = useMemo(
    () => developments.filter((d) => d.companyId === company?.id),
    [developments, company],
  );
  const driveUrl = company ? (driveUrls[company.id] ?? null) : null;

  /**
   * A raiz do material da empresa aberta: a pasta do corretor, ou a do catálogo
   * quando a empresa vem do POUP. Nunca montar esse caminho na mão.
   */
  const root = useMemo(() => materialRoot(company, user?.id ?? ''), [company, user]);
  /** Material do catálogo é mantido pelo POUP: para os outros, só leitura. */
  const canEdit = canEditMaterial(company, isAdmin);
  const readOnlyCatalog = !!company?.isCatalog && !isAdmin;

  useEffect(() => {
    if (!user || !company) {
      setGeneralFiles([]);
      return;
    }
    let mounted = true;
    setLoadingGeneral(true);
    db.material.list(materialRoot(company, user.id), `${ROOT}/${company.id}`).then((list) => {
      if (!mounted) return;
      const files = list.filter((e) => !e.isFolder);
      setGeneralFiles(files);
      void loadThumbs(files);
      setLoadingGeneral(false);
    });
    return () => {
      mounted = false;
    };
  }, [user, company, generalNonce, loadThumbs]);

  const relPath = useMemo(() => {
    if (!company || !development) return null;
    return [ROOT, company.id, development.id, ...folderSegs].join('/');
  }, [company, development, folderSegs]);

  const loadEntries = useCallback(async () => {
    if (!user || !relPath) return;
    setLoadingEntries(true);
    const list = await db.material.list(root, relPath);
    setEntries(list);
    void loadThumbs(list);
    setLoadingEntries(false);
  }, [user, relPath, root, loadThumbs]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function onAddCompany(c: Company) {
    if (!user) return;
    setError(null);
    setPickerOpen(false);
    // Empresa do catálogo: quem não é admin não escreve nada na pasta do POUP
    // (a policy do Storage recusaria). Só entra na lista para consultar.
    if (!canEditMaterial(c, isAdmin)) {
      setAddedIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
      return;
    }
    setBusy(true);
    const folder = await db.material.createFolder(materialRoot(c, user.id), ROOT, c.id);
    if (!folder.ok && !/já existe/i.test(folder.error)) {
      setBusy(false);
      setError(folder.error);
      return;
    }
    const existing = await db.material.getCompanyMaterial(user.id, c.id);
    if (!existing) {
      const saved = await db.material.saveCompanyMaterial(user.id, c.id, null);
      if (!saved.ok) {
        setBusy(false);
        setError(saved.error);
        return;
      }
    }
    setBusy(false);
    setDriveUrls((prev) => ({ ...prev, [c.id]: existing?.driveUrl ?? null }));
    setAddedIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]));
  }

  function onOpenCompany(c: Company) {
    setError(null);
    setCompany(c);
    setDevelopment(null);
    setFolderSegs([]);
  }

  function openConfig() {
    if (!company) return;
    const current = driveUrls[company.id] ?? '';
    setLinkDraft(current);
    setLinkVisible(Boolean(current));
    setConfigOpen(true);
  }

  async function onSaveConfig() {
    if (!user || !company) return;
    setBusy(true);
    const res = await db.material.saveCompanyMaterial(
      user.id,
      company.id,
      linkDraft.trim() || null,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDriveUrls((prev) => ({ ...prev, [company.id]: res.data.driveUrl }));
    setConfigOpen(false);
  }



  async function uploadTo(path: string): Promise<boolean> {
    if (!user) return false;
    setError(null);
    let files: PickedFile[] = [];
    try {
      files = await pickFiles();
    } catch {
      setError('Não foi possível abrir o seletor de arquivos.');
      return false;
    }
    if (files.length === 0) return false;

    const okFiles = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const tooBig = files.length - okFiles.length;
    if (tooBig > 0) {
      setError(`${tooBig} arquivo(s) acima do limite de ${MAX_FILE_MB} MB foram ignorados.`);
    }
    if (okFiles.length === 0) return false;

    setBusy(true);
    let firstErr: string | null = null;
    for (const f of okFiles) {
      const res = await db.material.upload(root, path, f.name, f.blob, f.contentType);
      if (!res.ok && !firstErr) firstErr = res.error;
    }
    setBusy(false);
    if (firstErr) setError(firstErr);
    refreshUsage();
    return true;
  }

  async function onUploadGeneral() {
    if (!company) return;
    const done = await uploadTo(`${ROOT}/${company.id}`);
    if (done) setGeneralNonce((n) => n + 1);
  }

  async function onUpload() {
    if (!relPath) return;
    const done = await uploadTo(relPath);
    if (done) void loadEntries();
  }

  async function onCreateFolder() {
    if (!user || !relPath) return;
    if (!newFolderName.trim()) return;
    setBusy(true);
    const res = await db.material.createFolder(root, relPath, newFolderName);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewFolderName('');
    setFolderModalOpen(false);
    void loadEntries();
  }

  /**
   * Abre o preview por cima da lista.
   *
   * O modal aparece na hora, com o indicador de carregando, e as URLs chegam
   * depois: esperar a assinatura antes de abrir dava a impressão de que o toque
   * não tinha funcionado.
   */
  async function onOpenFile(entry: StorageEntry) {
    const kind = fileKind(entry.name, entry.mimeType, entry.isFolder);
    setPreview({
      name: entry.name,
      kind,
      url: null,
      downloadUrl: null,
      sizeLabel: formatSize(entry.size),
    });
    const [url, download] = await Promise.all([
      db.material.signedUrl(entry.path),
      db.material.downloadUrl(entry.path, entry.name),
    ]);
    if (!url) {
      setPreview(null);
      setError('Não foi possível abrir o arquivo.');
      return;
    }
    setPreview((cur) =>
      cur && cur.name === entry.name ? { ...cur, url, downloadUrl: download } : cur,
    );
  }

  function onDelete(entry: StorageEntry, after: () => void) {
    const doDelete = async () => {
      setBusy(true);
      const res = await db.material.remove(entry.path, entry.isFolder);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refreshUsage();
      after();
    };
    const msg = entry.isFolder
      ? `Excluir a pasta "${entry.name}" e todo o seu conteúdo?`
      : `Excluir "${entry.name}"?`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(msg)) void doDelete();
    } else {
      Alert.alert('Excluir', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  }

  const atMaxDepth = folderSegs.length >= MAX_DEPTH;

  return (
    <Screen>
      <Text style={styles.title}>Material de Vendas</Text>

      <View style={styles.breadcrumb}>
        <Crumb
          label="Empresas"
          active={!company}
          onPress={() => {
            setCompany(null);
            setDevelopment(null);
            setFolderSegs([]);
          }}
        />
        {company ? (
          <View style={styles.crumbRow}>
            <Text style={styles.crumbSep}>›</Text>
            <Crumb
              label={company.name}
              active={!development}
              onPress={() => {
                setDevelopment(null);
                setFolderSegs([]);
              }}
            />
          </View>
        ) : null}
        {development ? (
          <View style={styles.crumbRow}>
            <Text style={styles.crumbSep}>›</Text>
            <Crumb
              label={development.name}
              active={folderSegs.length === 0}
              onPress={() => setFolderSegs([])}
            />
          </View>
        ) : null}
        {folderSegs.map((seg, i) => (
          <View key={`${seg}-${i}`} style={styles.crumbRow}>
            <Text style={styles.crumbSep}>›</Text>
            <Crumb
              label={seg}
              active={i === folderSegs.length - 1}
              onPress={() => setFolderSegs(folderSegs.slice(0, i + 1))}
            />
          </View>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!company ? (
        <View>
          <Button label="+ Empresa" variant="secondary" onPress={() => setPickerOpen(true)} />
          {busy ? <ActivityIndicator style={styles.loader} /> : null}
          {loadingCadastros ? (
            <ActivityIndicator style={styles.loader} />
          ) : addedCompanies.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏢</Text>
              <Text style={styles.emptyText}>
                Nenhuma empresa na lista. Use “+ Empresa” para adicionar.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {addedCompanies.map((c) => (
                <NavRow
                  key={c.id}
                  icon="🏢"
                  label={c.name}
                  meta={
                    c.isCatalog
                      ? 'Material mantido pelo POUP'
                      : driveUrls[c.id]
                        ? 'Material online configurado'
                        : 'Toque para configurar'
                  }
                  onPress={() => onOpenCompany(c)}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {company && !development ? (
        <View>
          {readOnlyCatalog ? <CatalogNotice /> : null}

          {driveUrl ? (
            <Button
              label="🔗 Abrir material online"
              onPress={() => void Linking.openURL(driveUrl)}
              style={styles.topAction}
            />
          ) : null}
          {canEdit ? (
            <Button
              label="⚙️ Configurar material da empresa"
              variant="secondary"
              onPress={openConfig}
            />
          ) : null}

          {/* A cota de armazenamento só vale para o material do próprio corretor:
              o do catálogo ocupa espaço na conta do POUP. */}
          {canEdit ? (
            <Text style={styles.usage}>
              {usedBytes == null ? '' : formatBytes(usedBytes)}
              {limitBytes > 0 ? ` de ${formatBytes(limitBytes)} · ` : ' · '}
              máx. {MAX_FILE_MB} MB por arquivo
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>Empreendimentos</Text>
          {companyDevs.length === 0 ? (
            <Text style={styles.hint}>Nenhum empreendimento cadastrado para esta empresa.</Text>
          ) : (
            <View style={styles.list}>
              {companyDevs.map((d) => (
                <NavRow
                  key={d.id}
                  icon="🏗️"
                  label={d.name}
                  onPress={() => {
                    setDevelopment(d);
                    setFolderSegs([]);
                  }}
                />
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Arquivos gerais</Text>
          {loadingGeneral ? (
            <ActivityIndicator style={styles.loader} />
          ) : generalFiles.length === 0 ? (
            <Text style={styles.hint}>
              {canEdit
                ? 'Nenhum arquivo geral. Adicione em “Configurar material da empresa”.'
                : 'Nenhum arquivo geral publicado pelo POUP nesta empresa.'}
            </Text>
          ) : (
            <View style={styles.list}>
              {generalFiles.map((e) => (
                <EntryRow
                  key={e.path}
                  entry={e}
                  canDelete={canEdit}
                  thumbUrl={thumbs[e.path]}
                  onOpen={() => void onOpenFile(e)}
                  onDelete={() => onDelete(e, () => setGeneralNonce((n) => n + 1))}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {company && development ? (
        <View>
          {/* Subir, criar pasta e apagar só existem para quem pode escrever
              nesta raiz. A trava real é a policy do Storage — esconder o botão
              serve para não oferecer uma ação que ia falhar. */}
          {canEdit ? (
            <View style={styles.toolbar}>
              <Pressable
                style={({ pressed }) => [styles.toolBtn, pressed && styles.pressed]}
                onPress={onUpload}
                disabled={busy}
                accessibilityLabel="Fazer upload"
              >
                <Text style={styles.toolIcon}>⬆️</Text>
                <Text style={styles.toolLabel}>Fazer Upload</Text>
              </Pressable>
              {atMaxDepth ? null : (
                <Pressable
                  style={({ pressed }) => [styles.toolBtn, pressed && styles.pressed]}
                  onPress={() => {
                    setNewFolderName('');
                    setFolderModalOpen(true);
                  }}
                  disabled={busy}
                  accessibilityLabel="Adicionar pasta"
                >
                  <Text style={styles.toolIcon}>📁</Text>
                  <Text style={styles.toolLabel}>Adicionar Pasta</Text>
                </Pressable>
              )}
              {busy ? <ActivityIndicator style={styles.toolLoader} /> : null}
            </View>
          ) : (
            <CatalogNotice />
          )}

          {canEdit ? (
            <Text style={styles.usage}>
              {usedBytes == null ? '' : formatBytes(usedBytes)}
              {limitBytes > 0 ? ` de ${formatBytes(limitBytes)} · ` : ' · '}
              máx. {MAX_FILE_MB} MB por arquivo
            </Text>
          ) : null}

          {atMaxDepth && canEdit ? (
            <Text style={styles.notice}>
              Limite de {MAX_DEPTH} níveis de pastas atingido. Aqui só é possível enviar arquivos.
            </Text>
          ) : null}

          {folderSegs.length > 0 ? (
            <Button
              label="← Voltar"
              variant="ghost"
              onPress={() => setFolderSegs(folderSegs.slice(0, -1))}
            />
          ) : null}

          {loadingEntries ? (
            <ActivityIndicator style={styles.loader} />
          ) : entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📂</Text>
              <Text style={styles.emptyText}>
                {canEdit
                  ? `Pasta vazia. Use “Fazer Upload” para adicionar arquivos${
                      atMaxDepth ? '.' : ' ou “Adicionar Pasta” para organizar.'
                    }`
                  : 'O POUP ainda não publicou material para este empreendimento.'}
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {entries.map((e) => (
                <EntryRow
                  key={e.path}
                  entry={e}
                  canDelete={canEdit}
                  thumbUrl={thumbs[e.path]}
                  onOpen={() =>
                    e.isFolder ? setFolderSegs([...folderSegs, e.name]) : void onOpenFile(e)
                  }
                  onDelete={() => onDelete(e, () => void loadEntries())}
                />
              ))}
            </View>
          )}
        </View>
      ) : null}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Adicionar Empresa</Text>
            {loadingCadastros ? (
              <ActivityIndicator style={styles.loader} />
            ) : companies.length === 0 ? (
              <Text style={styles.hint}>
                Nenhuma empresa cadastrada. Cadastre em Configurações › Cadastros.
              </Text>
            ) : availableCompanies.length === 0 ? (
              <Text style={styles.hint}>Todas as suas empresas já estão na lista.</Text>
            ) : (
              <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
                {availableCompanies.map((c) => (
                  <NavRow
                    key={c.id}
                    icon="🏢"
                    label={c.name}
                    onPress={() => void onAddCompany(c)}
                  />
                ))}
              </ScrollView>
            )}
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setPickerOpen(false)}
              style={styles.sheetAction}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={configOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setConfigOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{company?.name ?? 'Empresa'}</Text>
            <Text style={styles.sheetSubtitle}>
              Configure o material desta empresa: um link online e arquivos gerais.
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Adicionar link"
                variant={linkVisible ? 'primary' : 'secondary'}
                onPress={() => setLinkVisible(true)}
                style={styles.modalAction}
              />
              <Button
                label="Adicionar Arquivo Geral"
                variant="secondary"
                onPress={() => void onUploadGeneral()}
                loading={busy}
                style={styles.modalAction}
              />
            </View>

            {linkVisible ? (
              <Input
                label="Link do material online"
                value={linkDraft}
                onChangeText={setLinkDraft}
                placeholder="https://drive.google.com/..."
                autoCapitalize="none"
                keyboardType="url"
              />
            ) : null}

            <Text style={styles.hint}>
              {generalFiles.length === 0
                ? 'Nenhum arquivo geral enviado ainda.'
                : `${generalFiles.length} arquivo(s) geral(is) nesta empresa.`}
            </Text>

            <Button
              label="Salvar"
              onPress={() => void onSaveConfig()}
              loading={busy}
              style={styles.sheetAction}
            />
            <Button label="Fechar" variant="ghost" onPress={() => setConfigOpen(false)} />
          </View>
        </View>
      </Modal>


      <Modal
        visible={folderModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFolderModalOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Adicionar Pasta</Text>
            <Input
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Nome da pasta"
              autoCapitalize="words"
            />
            <Button label="Salvar" onPress={() => void onCreateFolder()} loading={busy} />
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => setFolderModalOpen(false)}
              style={styles.sheetAction}
            />
          </View>
        </View>
      </Modal>

      <FilePreviewModal target={preview} onClose={() => setPreview(null)} />
    </Screen>
  );
}

/**
 * Deixa explícito de quem é o material quando ele vem do catálogo: sem isso o
 * corretor só vê os botões de subir/apagar desaparecerem e acha que quebrou.
 */
function CatalogNotice() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.catalogNotice}>
      📚 Material mantido pelo POUP. Esta empresa vem do catálogo do sistema: os arquivos são
      atualizados pela equipe e ficam disponíveis apenas para consulta.
    </Text>
  );
}

function Crumb({ label, onPress, active }: { label: string; onPress: () => void; active: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={[styles.crumb, active && styles.crumbActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function NavRow({
  icon,
  label,
  meta,
  onPress,
}: {
  icon: string;
  label: string;
  meta?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {label}
          </Text>
          {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
        </View>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

function formatSize(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function EntryRow({
  entry,
  onOpen,
  onDelete,
  canDelete,
  thumbUrl,
}: {
  entry: StorageEntry;
  onOpen: () => void;
  onDelete: () => void;
  /** `false` no material do catálogo: só o POUP apaga o que o POUP publicou. */
  canDelete: boolean;
  /** URL assinada da imagem, quando o arquivo é uma. */
  thumbUrl?: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  const kind = fileKind(entry.name, entry.mimeType, entry.isFolder);
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onOpen} accessibilityRole="button">
        <FileThumb kind={kind} previewUrl={thumbUrl} size={44} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.rowMeta}>
            {entry.isFolder ? 'Pasta' : `${KIND_BADGE[kind].label} · ${formatSize(entry.size)}`}
          </Text>
        </View>
      </Pressable>
      {canDelete ? (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Excluir">
          <Text style={styles.rowDelete}>🗑️</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.primary, marginBottom: spacing.md },
    breadcrumb: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    crumbRow: { flexDirection: 'row', alignItems: 'center' },
    crumb: { ...typography.label, color: colors.primary, maxWidth: 160 },
    crumbActive: { color: colors.inkMuted },
    crumbSep: { ...typography.label, color: colors.inkSubtle, marginHorizontal: spacing.xs },
    error: {
      ...typography.caption,
      color: colors.danger,
      backgroundColor: colors.dangerSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    notice: {
      ...typography.caption,
      color: colors.warning,
      backgroundColor: colors.warningSoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
    catalogNotice: {
      ...typography.caption,
      color: colors.primary,
      backgroundColor: colors.primarySoft,
      padding: spacing.md,
      borderRadius: 8,
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    loader: { marginTop: spacing.lg },
    list: { marginTop: spacing.lg },
    sectionTitle: { ...typography.heading, color: colors.ink, marginTop: spacing.xl },
    topAction: { marginBottom: spacing.md },
    pressed: { opacity: 0.6 },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    toolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    toolIcon: { fontSize: 16 },
    toolLabel: { ...typography.label, color: colors.ink },
    toolLoader: { marginLeft: spacing.sm },
    usage: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
    empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
    emptyEmoji: { fontSize: 40 },
    emptyText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
    rowIcon: { fontSize: 20 },
    rowInfo: { flex: 1 },
    rowName: { ...typography.body, color: colors.ink, fontWeight: '600' },
    rowMeta: { ...typography.caption, color: colors.inkSubtle, marginTop: 1 },
    rowChevron: { ...typography.body, color: colors.inkSubtle },
    rowDelete: { fontSize: 16 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxContentWidth,
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
    },
    sheetTitle: { ...typography.title, color: colors.primary, marginBottom: spacing.xs },
    sheetSubtitle: { ...typography.body, color: colors.inkMuted, marginBottom: spacing.lg },
    sheetScroll: { maxHeight: 320, marginTop: spacing.md },
    sheetAction: { marginTop: spacing.md },
    modalActions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
    modalAction: { flex: 1 },
  });
