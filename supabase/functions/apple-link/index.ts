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
 * Quem chama nao espera a resposta para deixar o corretor entrar. Se a Apple
 * estiver fora do ar, ou se os segredos nao estiverem configurados, o login
 * continua valendo -- o que se perde e a capacidade de revogar automaticamente
 * na exclusao, e isso e um problema de conformidade, nao de acesso.
 *
 * Por isso todo caminho de erro responde 200 com `{ vinculado: false }`.
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
  return crypto.subtle.importKey(
    'pkcs8',
    bin,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * O "client secret" da Apple e um JWT ES256 assinado por nos.
 *
 * Diferente de quase todo OAuth, onde o segredo e uma string fixa: aqui ele e
 * gerado a cada uso e tem validade propria. Cinco minutos bastam para a troca
 * e e o menor tempo util -- um segredo de vida curta que vaze ja nasceu
 * vencido.
 */
export async function clientSecretApple(): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: KEY_ID };
  const payload = {
    iss: TEAM_ID,
    iat: agora,
    exp: agora + 300,
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
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
export function appleConfigurada(): boolean {
  return Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY && CLIENT_ID);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await admin.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    if (!appleConfigurada()) {
      console.error('apple-link: segredos da Apple ausentes; revogação ficará indisponível.');
      return json({ vinculado: false, motivo: 'nao_configurado' });
    }

    const body = (await req.json().catch(() => ({}))) as { authorizationCode?: unknown };
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

    const dados = (await resposta.json()) as { refresh_token?: string };
    if (!dados.refresh_token) {
      return json({ vinculado: false, motivo: 'sem_refresh_token' });
    }

    const { error } = await admin.from('apple_credentials').upsert(
      {
        user_id: user.id,
        refresh_token: dados.refresh_token,
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
