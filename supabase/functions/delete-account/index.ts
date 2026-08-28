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
 *
 * ------------------------------------------------------------------
 * O PEDIDO QUE FALHOU NÃO PODE SUMIR
 * ------------------------------------------------------------------
 * Quando um passo falha, esta função aborta e devolve 503 — e continua assim,
 * porque o contrário deixaria uma cobrança viva sem dono ou um documento de
 * cliente num bucket órfão.
 *
 * O que faltava era registrar que o corretor **tentou**. Sem isso, um Stripe
 * fora do ar significava: ele recebe um erro, desiste, e ninguém jamais fica
 * sabendo que houve um pedido de exclusão — a informação morre num log que
 * ninguém lê e que rotaciona. A Apple exige que a exclusão seja possível, e a
 * LGPD trata o pedido como direito do titular, com prazo: um pedido invisível
 * não é cumprido nem é demonstrável.
 *
 * Agora, antes de cada 503, a tentativa vai para `exclusao_pendente` (migration
 * `0033`) com a etapa, o erro e o contador. Quando a exclusão conclui, a linha
 * é apagada. Ver o cabeçalho da migration para por que essa fila não tem robô.
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

/* ===========================================================================
 * A FILA DE RECONCILIACAO
 * ===========================================================================
 * Ver o cabecalho do arquivo e o da migration `0033`. Aqui ficam so as duas
 * operacoes: marcar que parou, e apagar a marca quando terminou.
 * ======================================================================== */

/** Os cinco passos. Precisa bater com o check de `exclusao_pendente.etapa`. */
type Etapa = 'stripe' | 'apple' | 'arquivos' | 'conferencia' | 'usuario';

/**
 * Registra a tentativa e devolve a resposta de aborto.
 *
 * As duas coisas juntas de proposito: separadas, seria facil acrescentar um
 * `return json(...)` novo mais tarde e esquecer o registro -- que e exatamente
 * o defeito que esta funcao veio consertar.
 *
 * `erro` e para o operador e nunca chega na tela. `mensagem` e o contrario: e o
 * que o corretor le, e por isso diz que o pedido ficou registrado. Ele
 * precisa saber que nao esta gritando para o vazio.
 */
async function pararComPendencia(
  admin: Admin,
  userId: string,
  etapa: Etapa,
  erro: string,
  mensagem: string,
  status = 503,
): Promise<Response> {
  const { error } = await admin.rpc('registrar_exclusao_pendente', {
    p_user: userId,
    p_etapa: etapa,
    p_erro: erro,
  });

  /*
   * A falha em REGISTRAR nao pode piorar a situacao de quem ja esta com a
   * exclusao travada: o corretor recebe a mesma resposta de qualquer jeito. O
   * log grita para o operador porque, se cair aqui, e sinal de que a migration
   * `0033` nao rodou no projeto -- e ai a fila inteira nao existe.
   */
  if (error) {
    console.error('ATENCAO: pendencia de exclusao NAO registrada.', etapa, error.message);
  }

  return json({ error: mensagem }, status);
}

/**
 * Some com a pendencia depois que a exclusao deu certo.
 *
 * O `on delete cascade` para `auth.users` ja faria isso sozinho um instante
 * depois. Apagar aqui e explicito por dois motivos: a fila fica limpa mesmo se
 * o passo 5 for reordenado um dia, e quem le este arquivo ve o ciclo inteiro
 * (registra, resolve) sem precisar procurar a definicao da tabela.
 */
async function limparPendencia(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin.from('exclusao_pendente').delete().eq('user_id', userId);
  if (error) console.error('Pendencia de exclusao nao foi limpa.', error.message);
}

/* ===========================================================================
 * REVOGACAO DA APPLE
 * ===========================================================================
 * A Apple exige que um app com Sign in with Apple revogue os tokens quando a
 * conta e excluida. Sem isso, a autorizacao continua valendo do lado dela e o
 * POUP fica para sempre na lista "Apps usando seu Apple ID" de alguem que ja
 * foi embora. E item de checagem na revisao.
 *
 * O `refresh_token` foi guardado no login pela funcao `apple-link` -- ele so
 * podia ser obtido la, porque o `authorizationCode` da Apple expira em cinco
 * minutos.
 *
 * ---------------------------------------------------------------------------
 * O QUE CONTA COMO SUCESSO
 * ---------------------------------------------------------------------------
 * Nao ter credencial guardada e sucesso: significa que a conta nunca entrou
 * pela Apple (entrou por e-mail ou Google), e nao ha o que revogar.
 *
 * Os segredos nao estarem configurados TAMBEM e sucesso, e isso e uma escolha
 * consciente: bloquear a exclusao de conta porque falta uma variavel de
 * ambiente seria prender o usuario numa conta que ele pediu para apagar, o que
 * e pior -- inclusive perante a LGPD -- do que uma autorizacao pendente do
 * lado da Apple. O log grita para o operador resolver.
 *
 * O que NAO e sucesso e a Apple recusar a revogacao: ai a exclusao para, porque
 * a credencial existe, da para revogar, e nao revogar seria descumprir a regra.
 * ======================================================================== */

const APPLE_TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? '';
const APPLE_KEY_ID = Deno.env.get('APPLE_KEY_ID') ?? '';
const APPLE_PRIVATE_KEY = Deno.env.get('APPLE_PRIVATE_KEY') ?? '';
const APPLE_CLIENT_ID = Deno.env.get('APPLE_CLIENT_ID') ?? '';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * O .p8 em PEM vira uma chave do Web Crypto.
 *
 * `\\n` literal e tratado porque e assim que a chave chega quando alguem cola o
 * arquivo inteiro num campo de segredo de uma linha so.
 */
async function importarChaveApple(pem: string): Promise<CryptoKey> {
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

/** O "client secret" da Apple e um JWT ES256 que assinamos na hora. */
async function clientSecretApple(): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const h = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID })));
  const p = base64url(
    enc.encode(
      JSON.stringify({
        iss: APPLE_TEAM_ID,
        iat: agora,
        exp: agora + 300,
        aud: 'https://appleid.apple.com',
        sub: APPLE_CLIENT_ID,
      }),
    ),
  );
  const chave = await importarChaveApple(APPLE_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    chave,
    enc.encode(`${h}.${p}`),
  );
  return `${h}.${p}.${base64url(new Uint8Array(sig))}`;
}

async function revogarApple(
  admin: Admin,
  userId: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { data, error } = await admin
    .from('apple_credentials')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, motivo: `leitura: ${error.message}` };
  // Nunca entrou pela Apple: nada a revogar.
  if (!data?.refresh_token) return { ok: true };

  if (!APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY || !APPLE_CLIENT_ID) {
    console.error(
      'ATENCAO: conta com Sign in with Apple sendo excluida SEM revogacao — ' +
        'os segredos APPLE_* nao estao configurados nas Edge Functions.',
    );
    return { ok: true };
  }

  try {
    const secret = await clientSecretApple();
    const resposta = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: secret,
        token: data.refresh_token,
        token_type_hint: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // A Apple responde 200 com corpo vazio quando revoga.
    if (!resposta.ok) return { ok: false, motivo: `apple ${resposta.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: (e as Error).name };
  }
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

    /*
     * TRAVA DE ADMIN.
     *
     * A conta de administrador é a que publica o catálogo do POUP. Excluí-la
     * pelo app já custou o acervo inteiro uma vez: as construtoras, os
     * empreendimentos e as adoções de todo mundo sumiram junto com ela.
     *
     * A migration 0026 conserta o dano no banco — o catálogo agora se solta do
     * dono em vez de morrer com ele. Esta trava resolve o resto: mesmo com o
     * catálogo salvo, apagar a conta apaga a linha em `app_admins`, e o app
     * fica sem ninguém capaz de editar o catálogo até alguém voltar ao SQL
     * Editor para promover outra conta. Um toque a menos de distância disso.
     *
     * Não é uma porta trancada: é uma ordem. Tire o admin primeiro, exclua
     * depois. E não afeta corretor nenhum — `app_admins` só tem o dono do app.
     */
    const { data: ehAdmin } = await admin
      .from('app_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (ehAdmin) {
      return json(
        {
          error:
            'Esta é a conta de administrador do POUP e não pode ser excluída pelo aplicativo. ' +
            'Remova o acesso de administrador antes (Supabase → SQL Editor: ' +
            "delete from public.app_admins where user_id = '" +
            user.id +
            "';) e tente de novo.",
        },
        409,
      );
    }

    /*
     * =====================================================================
     * A ORDEM IMPORTA, E O QUE PODE FALHAR TAMBEM
     * =====================================================================
     * Antes, esta funcao ignorava a falha do Stripe e a falha ao remover
     * arquivos: registrava no log e seguia excluindo. O resultado era o pior
     * de todos os mundos -- a conta sumia, e ficava para tras uma assinatura
     * cobrando de alguem que nao existe mais, ou um arquivo com documento de
     * cliente num bucket sem dono.
     *
     * Pior ainda: a politica de privacidade PROMETE cancelamento e exclusao
     * imediatos. Uma promessa que o codigo nao cumpre e um problema legal,
     * nao um detalhe de implementacao.
     *
     * Agora a regra e: o que envolve DINHEIRO ou DADO DE TERCEIRO tem que dar
     * certo antes de o usuario ser apagado. Se nao der, a exclusao para e
     * devolve um erro que o corretor entende -- ele tenta de novo, ou fala com
     * o suporte, e nesse meio tempo a conta dele continua inteira. Parar e
     * recuperavel; seguir em frente nao e.
     */

    // 1. Assinatura: parar a cobranca antes de perder o vinculo com o cliente.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (e) {
        /*
         * `resource_missing` significa que a assinatura JA nao existe na
         * Stripe -- cancelada antes, ou nunca criada. E exatamente o estado
         * que queriamos, entao seguir e correto.
         *
         * Qualquer outro erro (rede, chave invalida, Stripe fora do ar) para a
         * exclusao: continuar deixaria uma cobranca viva sem dono.
         */
        const codigo = (e as { code?: string }).code;
        if (codigo !== 'resource_missing') {
          console.error('Exclusao interrompida: Stripe nao cancelou.', (e as Error).name, codigo);
          return await pararComPendencia(
            admin,
            user.id,
            'stripe',
            `${(e as Error).name} ${codigo ?? ''}`.trim(),
            'Não foi possível cancelar sua assinatura agora, e não vamos excluir a conta ' +
              'deixando uma cobrança ativa. Seu pedido de exclusão ficou registrado e será ' +
              'retomado — tente de novo em alguns minutos; se continuar, fale com o suporte, ' +
              'que cancelamos manualmente.',
          );
        }
      }
    }

    // 2. Revogar a autorizacao da Apple, se houver.
    const revogacao = await revogarApple(admin, user.id);
    if (!revogacao.ok) {
      console.error('Exclusao interrompida: revogacao da Apple falhou.', revogacao.motivo);
      return await pararComPendencia(
        admin,
        user.id,
        'apple',
        revogacao.motivo,
        'Não foi possível concluir a exclusão agora. Seu pedido ficou registrado e será ' +
          'retomado — tente de novo em alguns minutos; se continuar, fale com o suporte.',
      );
    }

    // 3. Arquivos. Ficam em uploads/<user_id>/...
    const arquivos = await listarTudo(admin, user.id);
    for (let i = 0; i < arquivos.length; i += PAGE) {
      const { error } = await admin.storage.from(BUCKET).remove(arquivos.slice(i, i + PAGE));
      if (error) {
        /*
         * Arquivo que nao sai e documento de cliente que fica num bucket cujo
         * dono deixou de existir. Nao da para chamar isso de conta excluida.
         */
        console.error('Exclusao interrompida: arquivos nao removidos.', error.message);
        return await pararComPendencia(
          admin,
          user.id,
          'arquivos',
          error.message,
          'Não foi possível apagar todos os seus arquivos agora, e não vamos excluir a conta ' +
            'pela metade. Seu pedido ficou registrado e será retomado — tente de novo em ' +
            'alguns minutos.',
        );
      }
    }

    /*
     * 4. Conferencia: o bucket precisa estar VAZIO.
     *
     * O `remove` pode responder sem erro e mesmo assim deixar algo para tras
     * (uma pasta que apareceu entre a listagem e a remocao, por exemplo). Como
     * a promessa e "tudo apagado", vale conferir em vez de confiar.
     */
    const sobrou = await listarTudo(admin, user.id);
    if (sobrou.length > 0) {
      console.error('Exclusao interrompida: sobraram arquivos.', sobrou.length);
      return await pararComPendencia(
        admin,
        user.id,
        'conferencia',
        `sobraram ${sobrou.length} arquivos`,
        'Alguns arquivos não foram apagados, e a conta continua ativa até que tudo saia. ' +
          'Seu pedido ficou registrado e será retomado — tente de novo em alguns minutos.',
      );
    }

    // 5. O usuario. O cascade leva o resto do app junto.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error('Falha ao excluir usuário:', delErr.message);
      return await pararComPendencia(
        admin,
        user.id,
        'usuario',
        delErr.message,
        'Não foi possível excluir a conta agora. Seu pedido ficou registrado e será ' +
          'retomado — tente de novo em alguns minutos; se continuar, fale com o suporte.',
        500,
      );
    }

    /*
     * Deu certo: a pendencia sai. Depois do `deleteUser`, e nao antes -- limpar
     * primeiro e falhar no passo 5 apagaria justamente o registro que prova que
     * este corretor pediu para sair.
     */
    await limparPendencia(admin, user.id);

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
