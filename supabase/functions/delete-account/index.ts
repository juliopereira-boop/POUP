/**
 * Exclusão definitiva da conta do corretor.
 *
 * ------------------------------------------------------------------
 * POR QUE ISSO EXISTE
 * ------------------------------------------------------------------
 * A App Store exige: todo app que deixa criar conta DENTRO dele precisa deixar
 * EXCLUIR a conta dentro dele também — sem e-mail para o suporte, sem link
 * escondido. É rejeição automática na revisão. E, fora da loja, é o que a LGPD
 * espera de qualquer forma.
 *
 * ------------------------------------------------------------------
 * POR QUE PRECISA DE SERVIDOR
 * ------------------------------------------------------------------
 * O app não consegue apagar o próprio usuário de `auth.users`: isso é operação
 * de administrador, e a chave que permite isso jamais pode estar no celular do
 * corretor. Por isso a exclusão mora aqui, atrás de um login válido.
 *
 * ------------------------------------------------------------------
 * A ORDEM IMPORTA
 * ------------------------------------------------------------------
 * 1. **Cancelar a assinatura no Stripe.** Se apagássemos primeiro, o cartão
 *    continuaria sendo cobrado por uma conta que não existe mais — e sem
 *    ninguém para reclamar, porque o login já teria sumido.
 * 2. **Apagar os arquivos do Storage.** Eles NÃO somem junto com o usuário:
 *    ficam ocupando espaço (e custo) para sempre.
 * 3. **Apagar o usuário.** As tabelas do app têm `on delete cascade` em
 *    `auth.users`, então leads, simulações, vendas e comissões vão junto.
 */
import Stripe from 'https://esm.sh/stripe@17.3.1?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-11-20.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

/** O corretor precisa digitar isto na tela. Nada acontece por toque errado. */
const CONFIRMACAO = 'EXCLUIR';

const BUCKET = 'uploads';

/** Teto por página do Storage. Pastas grandes são percorridas em rodadas. */
const PAGE = 1000;

type Admin = ReturnType<typeof createClient>;

/**
 * Todos os caminhos de arquivo abaixo de um prefixo, descendo nas subpastas.
 *
 * O Storage do Supabase não lista recursivamente: cada `list` devolve os
 * arquivos daquele nível e as pastas como entradas sem `id`. Daí a fila.
 */
async function listarTudo(admin: Admin, raiz: string): Promise<string[]> {
  const arquivos: string[] = [];
  const fila = [raiz];

  while (fila.length > 0) {
    const prefixo = fila.pop() as string;
    let offset = 0;

    for (;;) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefixo, { limit: PAGE, offset });
      if (error || !data || data.length === 0) break;

      for (const item of data) {
        const caminho = `${prefixo}/${item.name}`;
        // Pasta não tem `id`. Arquivo tem.
        if (item.id) arquivos.push(caminho);
        else fila.push(caminho);
      }

      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }

  return arquivos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    /*
     * DOIS clientes, de propósito.
     *
     * `comoUsuario` carrega o token do corretor e serve só para descobrir QUEM
     * está pedindo. `admin` é service role puro — sem cabeçalho `Authorization`
     * por cima, senão o token do corretor substituiria a credencial de
     * administrador e a API de exclusão de usuário recusaria o pedido.
     */
    const comoUsuario = createClient(url, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Quem está pedindo vem do token, NUNCA do corpo da requisição: senão
    // qualquer pessoa logada poderia mandar apagar a conta de outra.
    const {
      data: { user },
    } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRMACAO) {
      return json({ error: 'Confirmação inválida.' }, 400);
    }

    // 1. Assinatura: parar a cobrança antes de perder o vínculo com o cliente.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (e) {
        // Assinatura já cancelada ou inexistente não pode travar a exclusão —
        // o direito de apagar a conta não depende do Stripe responder.
        console.error('Falha ao cancelar assinatura na exclusão:', (e as Error).name);
      }
    }

    // 2. Arquivos. Ficam em uploads/<user_id>/...
    const arquivos = await listarTudo(admin, user.id);
    for (let i = 0; i < arquivos.length; i += PAGE) {
      const { error } = await admin.storage.from(BUCKET).remove(arquivos.slice(i, i + PAGE));
      if (error) console.error('Falha ao remover arquivos na exclusão:', error.message);
    }

    // 3. O usuário. O cascade leva o resto do app junto.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('Falha ao excluir usuário:', delErr.message);
      return json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, 500);
    }

    return json({ deleted: true });
  } catch (e) {
    console.error('Falha na exclusão de conta:', (e as Error).name);
    return json({ error: 'Não foi possível excluir a conta. Tente novamente.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
