import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getAppUrl } from './appUrl';

/** Vincular exige uma sessão existente e prova de posse da segunda identidade. */
export async function linkAccountProvider(provider: 'google' | 'apple'): Promise<string> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user)
    throw new Error('Entre na conta que deseja manter antes de vincular outro acesso.');
  if (user.identities?.some((identity) => identity.provider === provider))
    return 'Este método já está vinculado.';
  if (provider === 'apple' && Platform.OS === 'ios') {
    const nonce = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const credential = await AppleAuthentication.signInAsync({
      nonce: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce),
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    });
    if (!credential.identityToken) throw new Error('A Apple não devolveu a confirmação.');
    const { error } = await supabase.auth.linkIdentity({
      provider: 'apple',
      token: credential.identityToken,
      nonce,
    });
    if (error) throw new Error(linkError(error.message));
    if (credential.authorizationCode) {
      const { data, error: saveError } = await supabase.functions.invoke('apple-link', {
        body: { authorizationCode: credential.authorizationCode },
      });
      if (saveError || !data?.vinculado)
        return 'Apple vinculada. Pode ser necessário confirmar sua identidade novamente ao excluir a conta.';
    }
  } else {
    const redirectTo =
      Platform.OS === 'web' ? `${getAppUrl()}/acesso-conta` : Linking.createURL('/acesso-conta');
    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
    });
    if (error) throw new Error(linkError(error.message));
    if (Platform.OS === 'web') return 'Continue a confirmação no provedor.';
    if (!data?.url) throw new Error('Não foi possível abrir a confirmação.');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error('Vinculação cancelada.');
    const params = new URLSearchParams(new URL(result.url).hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token)
      throw new Error('Vinculação não concluída. Volte à conta original e tente novamente.');
    const { data: checked, error: checkError } = await supabase.auth.getUser(access_token);
    if (checkError || checked.user?.id !== user.id)
      throw new Error('A conta retornada não é a conta original. Nenhuma sessão foi substituída.');
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError)
      throw new Error(
        'Não foi possível guardar a sessão. Entre novamente com seu método original.',
      );
  }
  const { data: verified } = await supabase.auth.getUser();
  if (verified.user?.id !== user.id)
    throw new Error('A sessão mudou. Entre novamente na conta original.');
  return 'Método vinculado à mesma conta. Seus dados e seu plano foram preservados.';
}

function linkError(message: string): string {
  if (/already|exists|linked/i.test(message))
    return 'Esse acesso já pertence a uma conta. Não vamos mesclar contas nem transferir dados automaticamente. Entre pelo método original ou fale com o suporte.';
  if (/disabled|not enabled/i.test(message))
    return 'A vinculação ainda precisa ser habilitada no servidor. Use seu método original e fale com o suporte.';
  return 'Não foi possível vincular o acesso. Tente novamente usando a conta correta.';
}
