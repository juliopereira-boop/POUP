import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { limparDadosLocais } from '@/lib/limparDadosLocais';
import { supabase } from '@/lib/supabase';
import { getAppUrl } from '@/lib/appUrl';
import type { AuthChangePayload, AuthRepository } from '../repositories';
import { type AuthUser, type Result, err, ok } from '../types';
import type { User } from '@supabase/supabase-js';

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? null,
    displayName: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
  };
}

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.';
  if (m.includes('already registered')) return 'Este email já está cadastrado.';
  if (m.includes('email not confirmed')) return 'Confirme seu email antes de entrar.';
  if (m.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (m.includes('should be different')) return 'A senha nova precisa ser diferente da atual.';
  // Link de recuperação: o caso comum não é erro de código, é link velho —
  // eles duram uma hora e valem uma vez só. A frase precisa dizer o que fazer.
  if (m.includes('expired') || m.includes('invalid or has expired')) {
    return 'Este link de redefinição expirou ou já foi usado. Peça um novo.';
  }
  if (m.includes('auth session missing') || m.includes('session_not_found')) {
    return 'A sessão de redefinição não está mais válida. Peça um novo link.';
  }
  if (m.includes('password should be')) return 'A senha deve ter pelo menos 6 caracteres.';
  return message;
}

export class SupabaseAuthRepository implements AuthRepository {
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await supabase.auth.getUser();
    return mapUser(data.user);
  }

  async signInWithPassword(email: string, password: string): Promise<Result<AuthUser>> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return err(friendlyError(error.message));
    const user = mapUser(data.user);
    return user ? ok(user) : err('Não foi possível entrar.');
  }

  async signUpWithPassword(
    email: string,
    password: string,
    fullName?: string,
  ): Promise<Result<AuthUser | null>> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: fullName ? { full_name: fullName } : undefined,
        emailRedirectTo: `${getAppUrl()}/login`,
      },
    });
    if (error) return err(friendlyError(error.message));
    return ok(mapUser(data.user));
  }

  /**
   * Login social, para qualquer provedor que o Supabase suporte.
   *
   * Google e Apple compartilham exatamente este caminho — o que muda é só o
   * nome do provedor. Duplicar o fluxo para a Apple significaria manter duas
   * cópias do trecho mais delicado do login (o retorno do token pelo navegador
   * do sistema, no celular).
   *
   * Web e celular divergem por necessidade: no navegador a própria página é
   * redirecionada; no app não existe "redirecionar a página", então o link
   * abre numa sessão de navegador do sistema e os tokens voltam no fragmento
   * da URL, para serem instalados na mão.
   */
  private async signInWithProvider(
    provider: 'google' | 'apple',
    nomeAmigavel: string,
  ): Promise<Result<void>> {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: getAppUrl() },
      });
      if (error) return err(friendlyError(error.message));
      return ok(undefined);
    }

    /*
     * No celular o retorno NÃO pode ser um endereço da web.
     *
     * O iOS só devolve o controle ao app quando o navegador de autenticação
     * chega num endereço do próprio app — o esquema `poup://`, declarado em
     * `app.json`. Apontar para `https://...` (ou pior, para o
     * `http://localhost:8081` que era o valor padrão quando a variável de
     * ambiente faltava) faz o navegador abrir o site e simplesmente ficar lá:
     * o login "funciona" e o app nunca recebe a sessão.
     *
     * `Linking.createURL` monta esse endereço a partir do esquema do app, então
     * este caminho não depende de nenhuma variável de ambiente estar certa.
     */
    const redirectTo = Linking.createURL('/');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      return err(error ? friendlyError(error.message) : `Falha no ${nomeAmigavel}.`);
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return err(`Login com ${nomeAmigavel} cancelado.`);

    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.replace(/^#/, ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (sessionError) return err(friendlyError(sessionError.message));
    }
    return ok(undefined);
  }

  signInWithGoogle(): Promise<Result<void>> {
    return this.signInWithProvider('google', 'Google');
  }

  /**
   * A Apple EXIGE este login em todo app que ofereça login social de terceiros
   * (é a regra 4.8, e vale mesmo tendo só o Google). Fica disponível também na
   * web, para o corretor entrar do mesmo jeito nos dois lugares.
   */
  signInWithApple(): Promise<Result<void>> {
    return this.signInWithProvider('apple', 'Apple');
  }

  /**
   * O link do e-mail de recuperação tem que cair na tela DE TROCAR A SENHA.
   *
   * Antes ele apontava para `/login`, e o efeito era o oposto do pedido: o
   * clique no link cria uma sessão de verdade, então o `/login` via o usuário
   * autenticado, redirecionava para dentro do app e a senha continuava a
   * antiga. Quem pediu para trocar a senha era jogado na tela inicial sem
   * nunca ter trocado nada.
   *
   * `/redefinir-senha` mora FORA do grupo `(auth)` de propósito: o
   * `(auth)/_layout` manda todo mundo autenticado para `/`, e a sessão de
   * recuperação faz o visitante contar como autenticado — dentro do grupo, a
   * tela seria expulsa antes de aparecer.
   */
  private recoveryRedirect(): string {
    // No celular só um endereço do próprio app devolve o controle ao app; um
    // `https://` abriria o site no navegador e a troca aconteceria lá.
    return Platform.OS === 'web'
      ? `${getAppUrl()}/redefinir-senha`
      : Linking.createURL('/redefinir-senha');
  }

  async sendPasswordReset(email: string): Promise<Result<void>> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: this.recoveryRedirect(),
    });
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }

  /**
   * Instala a sessão de recuperação a partir da URL do deep link (celular).
   *
   * Os tokens vêm no FRAGMENTO (`#access_token=...`), não na query: é o
   * formato do fluxo implícito, que é o padrão deste cliente. Link expirado ou
   * já usado chega pelo mesmo caminho, como `#error_description=...` — e essa
   * é a resposta mais comum na prática, então ela precisa virar uma frase que
   * o corretor entenda, não um silêncio.
   */
  async applyRecoveryLink(url: string): Promise<Result<void>> {
    let params: URLSearchParams;
    try {
      const parsed = new URL(url);
      params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      // Alguns provedores de e-mail reescrevem o link e devolvem tudo na query.
      if (!params.has('access_token') && !params.has('error_description')) {
        params = new URLSearchParams(parsed.search.replace(/^\?/, ''));
      }
    } catch {
      return err('Link inválido.');
    }

    const descricao = params.get('error_description');
    if (descricao) return err(friendlyError(descricao));

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return err('Link inválido.');

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }

  async updatePassword(password: string): Promise<Result<void>> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }

  async signOut(): Promise<void> {
    const { data } = await supabase.auth.getUser();
    await supabase.auth.signOut();
    /*
     * DEPOIS do signOut, e sempre. `signOut` limpa o token e mais nada — os
     * rascunhos de simulação com renda e CPF do cliente, os consentimentos e o
     * cache da antiga prospecção ficariam no aparelho esperando o próximo
     * usuário. Ver `limparDadosLocais.ts`.
     */
    await limparDadosLocais(data.user?.id ?? null);
  }

  async deleteAccount(confirm: string): Promise<Result<void>> {
    // Lido ANTES de excluir: depois da exclusão não há mais sessão de onde
    // tirar o id, e ele é a chave dos caches locais que precisam sumir.
    const { data: sessao } = await supabase.auth.getUser();
    const usuarioId = sessao.user?.id ?? null;

    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { confirm },
    });
    if (error) return err('Não foi possível excluir a conta. Tente novamente.');
    const payload = data as { deleted?: boolean; error?: string } | null;
    if (!payload?.deleted) {
      return err(payload?.error ?? 'Não foi possível excluir a conta. Tente novamente.');
    }

    // A conta já não existe no servidor; o que resta é limpar o aparelho. Se
    // falhar, a exclusão continua valendo — daí o catch vazio.
    await supabase.auth.signOut().catch(() => undefined);
    await limparDadosLocais(usuarioId);
    return ok(undefined);
  }

  onAuthStateChange(cb: (payload: AuthChangePayload) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb({ user: mapUser(session?.user ?? null) });
    });
    return () => data.subscription.unsubscribe();
  }
}
