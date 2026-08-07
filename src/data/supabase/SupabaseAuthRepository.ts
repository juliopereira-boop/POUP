import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

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

  async signInWithGoogle(): Promise<Result<void>> {
    const redirectTo = `${getAppUrl()}`;

    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) return err(friendlyError(error.message));
      return ok(undefined);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return err(error ? friendlyError(error.message) : 'Falha no Google.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return err('Login com Google cancelado.');

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

  async sendPasswordReset(email: string): Promise<Result<void>> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/login`,
    });
    if (error) return err(friendlyError(error.message));
    return ok(undefined);
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async deleteAccount(confirm: string): Promise<Result<void>> {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { confirm },
    });
    if (error) return err('Não foi possível excluir a conta. Tente novamente.');
    const payload = data as { deleted?: boolean; error?: string } | null;
    if (!payload?.deleted) {
      return err(payload?.error ?? 'Não foi possível excluir a conta. Tente novamente.');
    }

    // A conta já não existe no servidor; o `signOut` só limpa o que sobrou no
    // aparelho. Se falhar, a exclusão continua valendo — daí o catch vazio.
    await supabase.auth.signOut().catch(() => undefined);
    return ok(undefined);
  }

  onAuthStateChange(cb: (payload: AuthChangePayload) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb({ user: mapUser(session?.user ?? null) });
    });
    return () => data.subscription.unsubscribe();
  }
}
