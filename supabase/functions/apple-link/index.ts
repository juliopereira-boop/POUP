/**
 * GUARDA A CREDENCIAL DA APPLE PARA PODER REVOGA-LA DEPOIS.
 *
 * ===========================================================================
 * POR QUE ESTA FUNCAO EXISTE
 * ===========================================================================
 * A Apple exige que um app com Sign in with Apple **revogue os tokens** quando
 * a conta e excluida. Revogar precisa de um `refresh_token`, e o refresh_token
 * so pode ser obtido trocando o `authorizationCode` -- que a Apple devolve no
 * login e que **expira em cinco minutos**.
 *
 * Ou seja: a troca tem que acontecer no login, mesmo que a exclusao venha
 * meses depois. E dai esta funcao: recebe o codigo logo apos o login nativo,
 * troca com a Apple e guarda o refresh_token em `apple_credentials`.
 *
 * ===========================================================================
 * POR QUE NO SERVIDOR, E NAO NO APARELHO
 * ===========================================================================
 * A troca exige assinar um JWT com a **chave privada .p8** da conta de
 * desenvolvedor. Essa chave da acesso a autenticacao de todos os usuarios do
 * app -- ela nao pode nem chegar perto do aparelho de ninguem.
 *
 * ===========================================================================
 * FALHAR AQUI NAO PODE DERRUBAR O LOGIN
 * ===========================================================================
 * O login permanece válido em caso de falha, mas o cliente verifica a resposta
 * e avisa o usuário. Na exclusão, pode pedir um novo código da MESMA identidade.
 * Nunca devolvemos o refresh token ao cliente.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? '';
const KEY_ID = Deno.env.get('APPLE_KEY_ID') ?? '';
const PRIVATE_KEY = Deno.env.get('APPLE_PRIVATE_KEY') ?? '';
const CLIENT_ID = Deno.env.get('APPLE_CLIENT_ID') ?? '';
const SERVICES_ID = Deno.env.get('APPLE_SERVICES_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? '';
const CALLBACK = `${SUPABASE_URL}/functions/v1/apple-link/callback`;

/** O authorization code da Apple e curto; qualquer coisa maior e lixo. */
const MAX_CODE = 512;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Transforma o conteudo do arquivo .p8 numa chave utilizavel pelo Web Crypto.
 *
 * O .p8 vem em PEM (base64 entre as linhas BEGIN/END). O Web Crypto quer os
 * bytes crus em PKCS#8, entao e preciso tirar o cabecalho, as quebras de linha
 * e decodificar.
 *
 * `\\n` literal e tratado porque e assim que a chave chega quando alguem cola o
 * arquivo num campo de segredo de uma linha so -- acontece toda vez.
 */
async function importarChave(pem: string): Promise<CryptoKey> {
  const limpo = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bin, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

/**
 * O "client secret" da Apple e um JWT ES256 assinado por nos.
 *
 * Diferente de quase todo OAuth, onde o segredo e uma string fixa: aqui ele e
 * gerado a cada uso e tem validade propria. Cinco minutos bastam para a troca
 * e e o menor tempo util -- um segredo de vida curta que vaze ja nasceu
 * vencido.
 */
export async function clientSecretApple(clientId = CLIENT_ID): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID };
  const payload = {
    iss: TEAM_ID,
    iat: agora,
    exp: agora + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };

  const enc = new TextEncoder();
  const h = base64url(enc.encode(JSON.stringify(header)));
  const p = base64url(enc.encode(JSON.stringify(payload)));
  const chave = await importarChave(PRIVATE_KEY);
  const assinatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    enc.encode(`${h}.${p}`),
  );
  return `${h}.${p}.${base64url(new Uint8Array(assinatura))}`;
}

/** Os quatro segredos precisam existir; sem um deles nao da para nem tentar. */
export function appleConfigurada(clientId = CLIENT_ID): boolean {
  return Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY && clientId);
}

type Admin = ReturnType<typeof createClient>;
async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
function webConfigured(): boolean {
  try {
    return appleConfigurada(SERVICES_ID) && new URL(APP_URL).protocol === 'https:';
  } catch {
    return false;
  }
}
function callbackRedirect(platform: string, status: string): Response {
  const destination =
    platform === 'android'
      ? `poup://apple-reauth?status=${status}`
      : `${APP_URL.replace(/\/$/, '')}/excluir-conta?apple=${status}`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
async function browserCallback(req: Request, admin: Admin): Promise<Response> {
  if (!webConfigured()) return json({ error: 'Confirmação Apple indisponível.' }, 503);
  const raw = await req.text();
  if (raw.length > 16384) return json({ error: 'Requisição inválida.' }, 400);
  const form = new URLSearchParams(raw);
  const state = form.get('state') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return json({ error: 'Confirmação inválida.' }, 400);
  // DELETE RETURNING: nem dois callbacks simultâneos podem consumir o mesmo state.
  const { data: challenge, error } = await admin
    .from('apple_reauth_challenges')
    .delete()
    .eq('state_hash', await hash(state))
    .gt('expires_at', new Date().toISOString())
    .select('user_id, nonce, platform')
    .maybeSingle();
  if (error || !challenge)
    return json(
      { error: 'Confirmação expirada ou já utilizada. Volte ao POUP e tente novamente.' },
      400,
    );
  if (form.has('error')) return callbackRedirect(challenge.platform, 'cancelled');
  const code = form.get('code') ?? '';
  if (!code || code.length > MAX_CODE) return callbackRedirect(challenge.platform, 'failed');
  try {
    const {
      data: { user },
    } = await admin.auth.admin.getUserById(challenge.user_id);
    const sub = user?.identities?.find((identity) => identity.provider === 'apple')?.identity_data
      ?.sub;
    if (!user || !sub) return callbackRedirect(challenge.platform, 'failed');
    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SERVICES_ID,
        client_secret: await clientSecretApple(SERVICES_ID),
        code,
        grant_type: 'authorization_code',
        redirect_uri: CALLBACK,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return callbackRedirect(challenge.platform, 'failed');
    const tokens = await response.json();
    if (!tokens.id_token || !tokens.refresh_token)
      return callbackRedirect(challenge.platform, 'failed');
    const encoded = tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    // Resposta direta da Apple via TLS; o código nunca é aceito como prova sozinho.
    if (
      claims.iss !== 'https://appleid.apple.com' ||
      claims.aud !== SERVICES_ID ||
      claims.sub !== sub ||
      claims.nonce !== challenge.nonce ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now() / 1000
    ) {
      return callbackRedirect(challenge.platform, 'failed');
    }
    const { error: saveError } = await admin.from('apple_credentials').upsert(
      {
        user_id: user.id,
        refresh_token: tokens.refresh_token,
        client_id: SERVICES_ID,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    return callbackRedirect(challenge.platform, saveError ? 'failed' : 'confirmed');
  } catch {
    return callbackRedirect(challenge.platform, 'failed');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    // Este callback recebe form_post da Apple, sem JWT Supabase. A autorização
    // é o state de uso único + nonce + comparação da identidade Apple acima.
    if (new URL(req.url).pathname.endsWith('/apple-link/callback')) {
      const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return await browserCallback(req, admin);
    }
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const {
      data: { user },
    } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const appleIdentity = user.identities?.find((identity) => identity.provider === 'apple');
    if (!appleIdentity) return json({ vinculado: false, motivo: 'identidade_ausente' }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      authorizationCode?: unknown;
      action?: unknown;
      platform?: unknown;
    };
    if (body.action === 'status') {
      const { data, error } = await admin
        .from('apple_credentials')
        .select('user_id, client_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return json({ error: 'Não foi possível verificar o vínculo Apple.' }, 503);
      const clientId = data?.client_id || CLIENT_ID;
      return json({
        configurado: data
          ? [CLIENT_ID, SERVICES_ID].filter(Boolean).includes(clientId) &&
            appleConfigurada(clientId)
          : body.platform === 'ios' || !body.platform
            ? appleConfigurada()
            : webConfigured(),
        vinculado: Boolean(data),
      });
    }
    if (body.action === 'reauthorize') {
      if (!webConfigured())
        return json(
          {
            error:
              'A confirmação Apple no navegador ainda não está configurada. Fale com o suporte.',
          },
          503,
        );
      if (body.platform !== 'web' && body.platform !== 'android')
        return json({ error: 'Plataforma inválida.' }, 400);
      const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
      const now = new Date();
      await admin.from('apple_reauth_challenges').delete().lt('expires_at', now.toISOString());
      const { error } = await admin
        .from('apple_reauth_challenges')
        .upsert(
          {
            user_id: user.id,
            state_hash: await hash(state),
            nonce,
            platform: body.platform,
            created_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 600000).toISOString(),
          },
          { onConflict: 'user_id' },
        );
      if (error) return json({ error: 'Não foi possível iniciar a confirmação Apple.' }, 503);
      const query = new URLSearchParams({
        client_id: SERVICES_ID,
        redirect_uri: CALLBACK,
        response_type: 'code',
        response_mode: 'form_post',
        scope: 'name email',
        state,
        nonce,
      });
      return json({ url: `https://appleid.apple.com/auth/authorize?${query}` });
    }

    if (!appleConfigurada()) {
      console.error('apple-link: segredos da Apple ausentes; revogação ficará indisponível.');
      return json({ vinculado: false, motivo: 'nao_configurado' });
    }

    const code = typeof body.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
    if (!code || code.length > MAX_CODE) {
      return json({ vinculado: false, motivo: 'codigo_invalido' });
    }

    const secret = await clientSecretApple();
    const resposta = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: secret,
        code,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resposta.ok) {
      // O corpo do erro da Apple nao vai para o log inteiro: pode conter o
      // codigo, que ainda esta valido por alguns minutos.
      console.error('apple-link: troca recusada pela Apple', resposta.status);
      return json({ vinculado: false, motivo: 'troca_recusada' });
    }

    const dados = (await resposta.json()) as { refresh_token?: string; id_token?: string };
    if (!dados.refresh_token || !dados.id_token) {
      return json({ vinculado: false, motivo: 'sem_refresh_token' });
    }

    // Token recebido diretamente do endpoint TLS da Apple (não do cliente).
    // Vincular o código à identidade já autenticada evita sobrescrever a
    // credencial de A com um código de B, o que quebraria a futura revogação.
    const payload = dados.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    if (
      claims.iss !== 'https://appleid.apple.com' ||
      claims.aud !== CLIENT_ID ||
      claims.sub !== appleIdentity.identity_data?.sub ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now() / 1000
    ) {
      return json({ vinculado: false, motivo: 'identidade_divergente' }, 403);
    }

    const { error } = await admin.from('apple_credentials').upsert(
      {
        user_id: user.id,
        refresh_token: dados.refresh_token,
        client_id: CLIENT_ID,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.error('apple-link: falha ao guardar a credencial', error.message);
      return json({ vinculado: false, motivo: 'falha_ao_guardar' });
    }

    return json({ vinculado: true });
  } catch (e) {
    console.error('apple-link: falha inesperada', (e as Error).name);
    return json({ vinculado: false, motivo: 'erro' });
  }
});
