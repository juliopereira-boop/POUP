import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface Payload {
  brokerUserId?: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  companyId?: string;
  developmentId?: string;
  source?: string;
  consentVersao?: unknown;
  consentTexto?: unknown;
}

const ALLOWED_SOURCES = new Set(['landing', 'whatsapp']);

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_MESSAGE = 2000;
const MAX_CONSENT_TEXTO = 1000;

/**
 * Quantos envios uma pagina de captacao aceita por hora.
 *
 * 30 e generoso para uso real -- um corretor que divulgue bem recebe alguns por
 * dia, nao dezenas por hora -- e apertado para um laco automatizado, que faz
 * isso em segundos. Errar para o lado generoso e o certo: o custo de recusar um
 * lead legitimo e um cliente perdido.
 */
const TETO_POR_HORA = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, max).trim();
}

function uuidOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t : null;
}

function onlyDigits(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.slice(0, 40).replace(/\D/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const name = text(body.name, MAX_NAME + 1);
  const phoneDigits = onlyDigits(body.phone);
  const brokerUserId = uuidOrNull(body.brokerUserId);
  const email = text(body.email, MAX_EMAIL);
  const message = text(body.message, MAX_MESSAGE);

  /*
   * Consentimento: so aceito quando vem completo e coerente. Versao sem texto
   * (ou o contrario) e registro pela metade, que nao serve de prova nenhuma --
   * melhor gravar nada e saber que nao ha registro.
   */
  const consentTextoBruto = text(body.consentTexto, MAX_CONSENT_TEXTO);
  const consentVersaoBruta =
    typeof body.consentVersao === 'number' && Number.isInteger(body.consentVersao)
      ? body.consentVersao
      : null;
  const temConsentimento = Boolean(consentVersaoBruta && consentTextoBruto);
  const consentVersao = temConsentimento ? consentVersaoBruta : null;
  const consentTexto = temConsentimento ? consentTextoBruto : null;

  if (!brokerUserId) {
    return new Response(JSON.stringify({ error: 'Link de captação inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'E-mail inválido.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!name || name.length > MAX_NAME) {
    return new Response(JSON.stringify({ error: 'Informe seu nome.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    return new Response(JSON.stringify({ error: 'Informe um telefone válido (com DDD).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', brokerUserId)
    .maybeSingle();
  if (!profile) {
    return new Response(JSON.stringify({ error: 'Link de captação inválido.' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /*
   * ===================================================================
   * TRAVA DE ABUSO — o unico achado "Alto" que a auditoria de seguranca
   * deixou em aberto.
   * ===================================================================
   * O UUID do corretor esta na URL publica que ele mesmo divulga. Com ele em
   * maos, qualquer pessoa podia chamar esta funcao em laco e encher a carteira
   * dele de lixo. Nao vaza dado nenhum -- o insert e fixado no corretor ja
   * validado --, mas destroi o CRM de quem depende dele para trabalhar.
   *
   * A contagem vive no banco (`registrar_captacao`), e nao aqui, porque a Edge
   * Function nao tem memoria entre invocacoes: cada chamada e um processo novo.
   *
   * DEPOIS de validar o corretor, de proposito: um UUID inventado nao deve
   * consumir cota de ninguem, e nem criar linha para um usuario que nao existe.
   */
  const { data: cota, error: erroCota } = await admin.rpc('registrar_captacao', {
    p_broker: brokerUserId,
    p_teto: TETO_POR_HORA,
  });

  /*
   * Falha ao CONTAR nao barra o envio. E o inverso da cota de IA, e de
   * proposito: la o risco de deixar passar e uma fatura, aqui e um cliente de
   * verdade que perde o contato com o corretor. Recusar um lead legitimo por
   * um erro nosso e pior do que aceitar um a mais num ataque.
   */
  if (erroCota) {
    console.error('capture-lead: contagem falhou, seguindo assim mesmo.', erroCota.message);
  } else if ((cota as { permitido?: boolean } | null)?.permitido === false) {
    console.warn('capture-lead: teto por hora atingido para o corretor', brokerUserId);
    /*
     * 429 com uma frase neutra. Quem esta do outro lado pode ser uma pessoa de
     * verdade tentando de novo depois de um erro de rede -- ela nao precisa
     * saber que existe um teto, nem qual e.
     */
    return new Response(
      JSON.stringify({ error: 'Muitos envios agora. Tente de novo em alguns minutos.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { error } = await admin.from('leads').insert({
    user_id: brokerUserId,
    name,
    phone: phoneDigits,
    email: email || null,
    message: message || null,
    source:
      typeof body.source === 'string' && ALLOWED_SOURCES.has(body.source) ? body.source : 'landing',
    company_id: uuidOrNull(body.companyId),
    development_id: uuidOrNull(body.developmentId),
    /*
     * O CONSENTIMENTO VEM DO CLIENTE, MAS QUEM CARIMBA A HORA E O SERVIDOR.
     *
     * `consent_at` e `now()` daqui, e nao um horario mandado pelo aparelho: um
     * registro de consentimento cuja data quem prova e quem se beneficia dela
     * nao prova nada.
     *
     * O texto vai integral e congelado. Mudar o formulario amanha nao pode
     * reescrever com o que esta pessoa concordou hoje.
     */
    consent_at: consentVersao ? new Date().toISOString() : null,
    consent_versao: consentVersao,
    consent_texto: consentTexto,
  });
  if (error) {
    console.error('Erro ao inserir lead:', error.message);
    return new Response(JSON.stringify({ error: 'Não foi possível enviar. Tente novamente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
