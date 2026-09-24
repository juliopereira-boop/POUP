/**
 * ENTREGAR O MODELO POUP COMO ARQUIVO.
 *
 * Na web, baixa direto; no celular, grava no cache e abre a folha de
 * compartilhamento do sistema (salvar em Arquivos, mandar por WhatsApp, abrir
 * no Excel). É o mesmo caminho de `features/files/save.ts`, só que para um
 * texto gerado aqui, e não para um arquivo que já está em algum endereço.
 */
import { File as ArquivoLocal, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function baixarTexto(nome: string, conteudo: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (Platform.OS === 'web') {
    try {
      const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revogar na hora cancelaria o download que acabou de começar.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true };
    } catch {
      return { ok: false, erro: 'Não foi possível baixar o arquivo.' };
    }
  }

  try {
    const arquivo = new ArquivoLocal(Paths.cache, nome);
    if (arquivo.exists) arquivo.delete();
    arquivo.create();
    arquivo.write(conteudo);
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, erro: 'Este aparelho não permite compartilhar arquivos.' };
    }
    await Sharing.shareAsync(arquivo.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: nome,
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível gerar o arquivo.' };
  }
}
