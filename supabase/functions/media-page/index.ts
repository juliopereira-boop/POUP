import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const BUCKET = 'uploads';
const SIGNED_TTL = 60 * 60 * 24 * 7;
const MAX_FILES = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v']);

interface MediaRow {
  titulo: string | null;
  subtitulo: string | null;
  mensagem: string | null;
  paths: string[] | null;
  expires_at: string;
  user_id: string;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = (url.searchParams.get('k') ?? url.pathname.split('/').pop() ?? '').trim();

  if (!UUID_RE.test(key)) return page(notFoundHtml(), 404);

  const { data, error } = await admin
    .from('media_links')
    .select('titulo, subtitulo, mensagem, paths, expires_at, user_id')
    .eq('id', key)
    .maybeSingle();

  if (error || !data) return page(notFoundHtml(), 404);

  const row = data as MediaRow;
  if (new Date(row.expires_at).getTime() < Date.now()) return page(expiredHtml(), 410);

  const paths = (row.paths ?? []).slice(0, MAX_FILES);
  const files = await signAll(paths);

  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, agency, phone')
    .eq('id', row.user_id)
    .maybeSingle();

  await admin.rpc('register_media_link_view', { link_id: key }).then(
    () => undefined,
    () => undefined,
  );

  return page(renderHtml(row, files, profile ?? null), 200);
});

async function signAll(paths: string[]): Promise<{ url: string; name: string; kind: string }[]> {
  if (paths.length === 0) return [];
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
  if (!data) return [];
  return data
    .filter((d) => d.signedUrl)
    .map((d, i) => {
      const path = paths[i] ?? '';
      const name = path.split('/').pop() ?? 'arquivo';
      return { url: d.signedUrl as string, name, kind: kindOf(name) };
    });
}

function kindOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'file';
}

function esc(value: string | null | undefined): string {
  return (value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function page(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}

const SHELL_CSS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
       background:#F3F4F6;color:#111827;-webkit-font-smoothing:antialiased}
  .wrap{max-width:680px;margin:0 auto;padding:22px 16px 56px}
  .card{background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 26px rgba(17,24,39,.07)}
  h1{font-size:25px;line-height:1.2;letter-spacing:-.4px}
  .sub{margin-top:7px;font-size:16px;color:#6B7280;line-height:1.4}
  .msg{margin-top:16px;font-size:16px;line-height:1.55;color:#374151;white-space:pre-wrap}
  .grid{margin-top:18px;display:grid;gap:12px}
  .media{width:100%;border-radius:14px;display:block;background:#E5E7EB}
  .filerow{display:flex;align-items:center;gap:12px;padding:15px 16px;border:1px solid #E5E7EB;
           border-radius:14px;text-decoration:none;color:#111827;font-weight:600;font-size:15px}
  .filerow span{color:#FF751F}
  .cta{display:block;margin-top:20px;background:#25D366;color:#fff;text-align:center;
       padding:16px;border-radius:14px;font-weight:700;font-size:17px;text-decoration:none}
  .broker{margin-top:22px;text-align:center;font-size:14px;color:#6B7280;line-height:1.5}
  .brand{margin-top:26px;text-align:center;font-size:12px;letter-spacing:2px;color:#9CA3AF}
  .brand b{color:#FF751F}
  .empty{text-align:center;padding:60px 20px;color:#6B7280;font-size:16px;line-height:1.5}
`;

function renderHtml(
  row: MediaRow,
  files: { url: string; name: string; kind: string }[],
  profile: { full_name?: string | null; agency?: string | null; phone?: string | null } | null,
): string {
  const titulo = row.titulo?.trim() || 'Confira este imóvel';
  const subtitulo = row.subtitulo?.trim() || '';
  const capa = files.find((f) => f.kind === 'image')?.url ?? '';
  const broker = profile?.full_name?.trim() ?? '';
  const agency = profile?.agency?.trim() ?? '';
  const phone = (profile?.phone ?? '').replace(/\D/g, '');
  const ogDesc = subtitulo || (row.mensagem ?? '').slice(0, 160) || 'Fotos e detalhes do imóvel.';

  const blocos = files
    .map((f) => {
      if (f.kind === 'image') {
        return `<img class="media" src="${esc(f.url)}" alt="" loading="lazy">`;
      }
      if (f.kind === 'video') {
        return `<video class="media" src="${esc(f.url)}" controls playsinline preload="metadata"></video>`;
      }
      return `<a class="filerow" href="${esc(f.url)}" target="_blank" rel="noopener"><span>&#8681;</span>${esc(f.name)}</a>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(ogDesc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(ogDesc)}">
${capa ? `<meta property="og:image" content="${esc(capa)}">\n<meta property="og:image:width" content="1200">` : ''}
<meta name="twitter:card" content="${capa ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#FF751F">
<style>${SHELL_CSS}</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${esc(titulo)}</h1>
      ${subtitulo ? `<div class="sub">${esc(subtitulo)}</div>` : ''}
      ${row.mensagem ? `<div class="msg">${esc(row.mensagem)}</div>` : ''}
      ${blocos ? `<div class="grid">${blocos}</div>` : ''}
      ${
        phone
          ? `<a class="cta" href="https://wa.me/55${esc(phone)}" target="_blank" rel="noopener">Falar com ${esc(broker || 'o corretor')} no WhatsApp</a>`
          : ''
      }
      ${
        broker || agency
          ? `<div class="broker">${esc(broker)}${agency ? `<br>${esc(agency)}` : ''}</div>`
          : ''
      }
    </div>
    <div class="brand">FEITO NO <b>POUP</b></div>
  </div>
</body>
</html>`;
}

function notFoundHtml(): string {
  return simpleHtml('Link não encontrado', 'Este link não existe ou foi removido pelo corretor.');
}

function expiredHtml(): string {
  return simpleHtml('Link expirado', 'Peça ao corretor para enviar os materiais novamente.');
}

function simpleHtml(titulo: string, texto: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title><style>${SHELL_CSS}</style></head>
<body><div class="wrap"><div class="card"><div class="empty"><b>${esc(titulo)}</b><br>${esc(texto)}</div></div>
<div class="brand">FEITO NO <b>POUP</b></div></div></body></html>`;
}
