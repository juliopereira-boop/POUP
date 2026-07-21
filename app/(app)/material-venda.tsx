import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { db, type Company, type Development, type StorageEntry } from '@/data';
import { formatBytes } from '@/features/plans';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useThemedStyles } from '@/providers/ThemeProvider';
import { radius, spacing, typography, type AppColors } from '@/theme';

/** Limite por arquivo, para não estourar o armazenamento com um único upload. */
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** Repositório externo da Canopus (empresa é redirecionada pra cá). */
const CANOPUS_URL = 'https://canopus.liveprint.com.br/login';
function isCanopus(name: string | null | undefined): boolean {
  return (name ?? '').toLowerCase().includes('canopus');
}

interface PickedFile {
  name: string;
  blob: Blob;
  contentType: string;
  size: number;
}

// --- Seletor de arquivos (sem depender de tipos DOM) ---
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

  const [companies, setCompanies] = useState<Company[]>([]);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [loadingCadastros, setLoadingCadastros] = useState(true);

  // Navegação: empresa → empreendimento → pastas.
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [devsOpen, setDevsOpen] = useState(false);
  const [development, setDevelopment] = useState<Development | null>(null);
  const [folderSegs, setFolderSegs] = useState<string[]>([]);

  // Conteúdo do Storage no nível atual.
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const limitBytes = subscription?.storageLimitBytes ?? plan?.storageLimitBytes ?? 0;

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoadingCadastros(true);
    Promise.all([db.companies.list(user.id), db.developments.list(user.id)]).then(
      ([comps, devs]) => {
        if (!mounted) return;
        setCompanies(comps);
        setDevelopments(devs);
        setLoadingCadastros(false);
      },
    );
    db.billing.getStorageUsedBytes(user.id).then((b) => {
      if (mounted) setUsedBytes(b);
    });
    return () => {
      mounted = false;
    };
  }, [user]);

  /** Caminho relativo (após o userId) do nível atual dentro do Storage. */
  const relPath = useMemo(() => {
    if (!company || !development) return null;
    return ['material', company.id, development.id, ...folderSegs].join('/');
  }, [company, development, folderSegs]);

  const loadEntries = useCallback(async () => {
    if (!user || !relPath) return;
    setLoadingEntries(true);
    setEntries(await db.material.list(user.id, relPath));
    setLoadingEntries(false);
  }, [user, relPath]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const refreshUsage = useCallback(() => {
    if (user) db.billing.getStorageUsedBytes(user.id).then(setUsedBytes);
  }, [user]);

  function onSelectCompany(c: Company) {
    setError(null);
    if (isCanopus(c.name)) {
      void Linking.openURL(CANOPUS_URL);
      return;
    }
    setCompany(c);
    setDevelopment(null);
    setDevsOpen(false);
    setFolderSegs([]);
  }

  const companyDevs = useMemo(
    () => developments.filter((d) => d.companyId === company?.id),
    [developments, company],
  );

  async function onUpload() {
    if (!user || !relPath) return;
    setError(null);
    let files: PickedFile[] = [];
    try {
      files = await pickFiles();
    } catch {
      setError('Não foi possível abrir o seletor de arquivos.');
      return;
    }
    if (files.length === 0) return;

    const okFiles = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const tooBig = files.length - okFiles.length;
    if (tooBig > 0) {
      setError(`${tooBig} arquivo(s) acima do limite de ${MAX_FILE_MB}MB foram ignorados.`);
    }
    if (okFiles.length === 0) return;

    setBusy(true);
    let firstErr: string | null = null;
    for (const f of okFiles) {
      const res = await db.material.upload(user.id, relPath, f.name, f.blob, f.contentType);
      if (!res.ok && !firstErr) firstErr = res.error;
    }
    setBusy(false);
    if (firstErr) setError(firstErr);
    refreshUsage();
    void loadEntries();
  }

  async function onCreateFolder() {
    if (!user || !relPath) return;
    if (!newFolderName.trim()) return;
    setBusy(true);
    const res = await db.material.createFolder(user.id, relPath, newFolderName);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewFolderName('');
    setCreatingFolder(false);
    void loadEntries();
  }

  async function onOpenFile(entry: StorageEntry) {
    const url = await db.material.signedUrl(entry.path);
    if (url) void Linking.openURL(url);
    else setError('Não foi possível abrir o arquivo.');
  }

  function onDelete(entry: StorageEntry) {
    const doDelete = async () => {
      setBusy(true);
      const res = await db.material.remove(entry.path, entry.isFolder);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      refreshUsage();
      void loadEntries();
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

  return (
    <Screen>
      <Text style={styles.title}>Material de Vendas</Text>

      {/* Trilha de navegação */}
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

      {/* NÍVEL 1: empresas */}
      {!company ? (
        <View>
          <Button
            label={companiesOpen ? '− Empresa' : '+ Empresa'}
            variant="secondary"
            onPress={() => setCompaniesOpen((v) => !v)}
          />
          {companiesOpen ? (
            loadingCadastros ? (
              <ActivityIndicator style={styles.loader} />
            ) : companies.length === 0 ? (
              <Text style={styles.hint}>
                Nenhuma empresa cadastrada. Cadastre em Configurações › Cadastros.
              </Text>
            ) : (
              <>
                <View style={styles.chips}>
                  {companies.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      icon={isCanopus(c.name) ? '🔗' : '🏢'}
                      onPress={() => onSelectCompany(c)}
                    />
                  ))}
                </View>
                <Text style={styles.hint}>
                  Empresas com repositório externo (ex.: Canopus) abrem o site oficial.
                </Text>
              </>
            )
          ) : null}
        </View>
      ) : null}

      {/* NÍVEL 2: empreendimentos */}
      {company && !development ? (
        <View>
          <Button
            label={devsOpen ? '− Empreendimento' : '+ Empreendimento'}
            variant="secondary"
            onPress={() => setDevsOpen((v) => !v)}
          />
          {devsOpen ? (
            companyDevs.length === 0 ? (
              <Text style={styles.hint}>Nenhum empreendimento cadastrado para esta empresa.</Text>
            ) : (
              <View style={styles.chips}>
                {companyDevs.map((d) => (
                  <Chip key={d.id} label={d.name} icon="🏗️" onPress={() => setDevelopment(d)} />
                ))}
              </View>
            )
          ) : null}
        </View>
      ) : null}

      {/* NÍVEL 3+: pastas e arquivos */}
      {company && development ? (
        <View>
          <View style={styles.toolbar}>
            <Pressable
              style={({ pressed }) => [styles.toolBtn, pressed && styles.pressed]}
              onPress={onUpload}
              disabled={busy}
              accessibilityLabel="Fazer upload"
            >
              <Text style={styles.toolIcon}>⬆️</Text>
              <Text style={styles.toolLabel}>Upload</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.toolBtn, pressed && styles.pressed]}
              onPress={() => setCreatingFolder((v) => !v)}
              disabled={busy}
              accessibilityLabel="Nova pasta"
            >
              <Text style={styles.toolIcon}>📁</Text>
              <Text style={styles.toolLabel}>Nova pasta</Text>
            </Pressable>
            {busy ? <ActivityIndicator style={styles.toolLoader} /> : null}
          </View>

          <Text style={styles.usage}>
            {usedBytes == null ? '' : formatBytes(usedBytes)}
            {limitBytes > 0 ? ` de ${formatBytes(limitBytes)} · ` : ' · '}
            máx. {MAX_FILE_MB}MB por arquivo
          </Text>

          {creatingFolder ? (
            <View style={styles.newFolderRow}>
              <View style={styles.newFolderInput}>
                <Input
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Nome da pasta"
                  autoCapitalize="words"
                />
              </View>
              <Button label="Criar" onPress={onCreateFolder} loading={busy} />
            </View>
          ) : null}

          {loadingEntries ? (
            <ActivityIndicator style={styles.loader} />
          ) : entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📂</Text>
              <Text style={styles.emptyText}>
                Pasta vazia. Use “Upload” para adicionar arquivos ou “Nova pasta” para organizar.
              </Text>
            </View>
          ) : (
            entries.map((e) => (
              <EntryRow
                key={e.path}
                entry={e}
                onOpen={() =>
                  e.isFolder ? setFolderSegs([...folderSegs, e.name]) : void onOpenFile(e)
                }
                onDelete={() => onDelete(e)}
              />
            ))
          )}
        </View>
      ) : null}
    </Screen>
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

function Chip({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
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
}: {
  entry: StorageEntry;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onOpen} accessibilityRole="button">
        <Text style={styles.rowIcon}>{entry.isFolder ? '📁' : '📄'}</Text>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.rowMeta}>{entry.isFolder ? 'Pasta' : formatSize(entry.size)}</Text>
        </View>
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Excluir">
        <Text style={styles.rowDelete}>🗑️</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    title: { ...typography.title, color: colors.ink, marginBottom: spacing.md },
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
    hint: { ...typography.caption, color: colors.inkSubtle, marginTop: spacing.md },
    loader: { marginTop: spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    chipIcon: { fontSize: 16 },
    chipLabel: { ...typography.label, color: colors.ink, maxWidth: 220 },
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
    usage: { ...typography.caption, color: colors.inkSubtle, marginBottom: spacing.lg },
    newFolderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    newFolderInput: { flex: 1 },
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
    rowDelete: { fontSize: 16 },
  });
