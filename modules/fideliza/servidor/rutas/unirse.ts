/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ALTA · fideliza.vendemias.com/n/<slug>/unirse
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Primero el beneficio, luego un solo botón. Sin contraseña, sin teléfono
 * obligatorio, sin casillas: el nombre es opcional y el consentimiento
 * comercial se pide DESPUÉS, en la tarjeta, por separado y sin premarcar.
 *
 * Es un <form> normal: funciona sin JavaScript. El POST crea la tarjeta y
 * redirige (303) a /m/<token>. El token solo aparece en esa redirección.
 */
import { randomBytes } from 'crypto';
import { fraseRegla } from '@/modules/fideliza/dominio/formato';
import { codigoDe, mensajeDe } from '@/modules/fideliza/dominio/errores';
import { esc, noDisponible, pagina, type Negocio } from '@/modules/fideliza/servidor/html';
import { huellaIp, limitar, log, NO_CACHE } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';


const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function formulario(n: Negocio, slug: string, placa: string | null, aviso?: string) {
  const p = n.program!;
  return pagina({
    titulo: `${p.name} · ${n.brand.display_name}`,
    marca: n.brand,
    cuerpo: `
<section class="caja">
  <p class="nota">${esc(p.name)}</p>
  <p class="premio">${esc(fraseRegla(p))}</p>
  ${p.description ? `<p class="nota">${esc(p.description)}</p>` : ''}
</section>
<p id="ya" class="caja" hidden><a class="btn" id="ya-a" href="#">Ya tienes una tarjeta aquí: ábrela</a></p>
<form class="caja" method="post" action="/n/${esc(slug)}/unirse" id="f">
  ${aviso ? `<p class="nota" role="alert"><b>${esc(aviso)}</b></p>` : ''}
  <input type="hidden" name="k" value="${randomBytes(16).toString('base64url')}">
  ${placa ? `<input type="hidden" name="d" value="${esc(placa)}">` : ''}
  <label for="alias">¿Cómo te llamamos? <span class="nota">(opcional)</span></label>
  <input type="text" id="alias" name="alias" maxlength="40" autocomplete="given-name">
  <button class="btn prim" type="submit" id="b">Crear mi tarjeta</button>
  <p class="nota">Sin contraseña. Tu tarjeta queda en este teléfono y puedes guardarla en Google Wallet o en tu pantalla de inicio.</p>
</form>
<script>
try{var t=localStorage.getItem('fz:card:${esc(slug)}');if(t&&/^[A-Za-z0-9_-]{30,64}$/.test(t)){document.getElementById('ya').hidden=false;document.getElementById('ya-a').href='/m/'+t;}}catch(e){}
document.getElementById('f').addEventListener('submit',function(){var b=document.getElementById('b');b.disabled=true;b.textContent='Creando…';});
</script>`,
  });
}

async function negocio(slug: string, evento: string | null) {
  return rpc<Negocio>(servidor(), 'loyalty_srv_business', { p_slug: slug, p_event: evento });
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!SLUG.test(slug)) return noDisponible(null, 404);
  const placa = new URL(req.url).searchParams.get('d');
  try {
    if (!(await limitar(`ip:${huellaIp(req)}:jv`, 60, 60))) return new Response('Demasiadas peticiones', { status: 429 });
    const n = await negocio(slug, 'join_view');
    if (n.status !== 'ok') return noDisponible(null, 404);
    if (!n.program) return noDisponible(n.brand);
    return formulario(n, slug, placa && /^[A-Za-z0-9_-]{22,64}$/.test(placa) ? placa : null);
  } catch (e) {
    log('join_view_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return noDisponible(null, 503);
  }
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!SLUG.test(slug)) return noDisponible(null, 404);
  let n: Negocio | null = null;
  try {
    // 10 tarjetas por IP cada 10 minutos: una familia en la misma wifi cabe,
    // un script que llena la base de miembros falsos no.
    if (!(await limitar(`ip:${huellaIp(req)}:join`, 10, 600))) {
      n = await negocio(slug, null);
      return n.status === 'ok' && n.program ? formulario(n, slug, null, mensajeDe('rate_limited')) : noDisponible(null, 429);
    }
    const f = await req.formData();
    const k = String(f.get('k') ?? '');
    const d = String(f.get('d') ?? '');
    const alias = String(f.get('alias') ?? '').trim().slice(0, 40);
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(k)) return noDisponible(null, 400);
    const r = await rpc<{ card_token: string; public_code: string }>(servidor(), 'loyalty_srv_join', {
      p_slug: slug,
      p_alias: alias || null,
      p_device_token: /^[A-Za-z0-9_-]{22,64}$/.test(d) ? d : null,
      p_creation_key: k,
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/m/${r.card_token}?nueva=1`, ...NO_CACHE, 'Referrer-Policy': 'no-referrer' },
    });
  } catch (e) {
    const codigo = codigoDe(e instanceof Error ? e.message : '');
    if (!codigo) log('join_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    try {
      n = n ?? (await negocio(slug, null));
      if (n.status === 'ok' && n.program) {
        return formulario(
          n,
          slug,
          null,
          codigo === 'join_replayed'
            ? 'Tu tarjeta ya se creó. Si no se abrió, pide ayuda en el local para recuperarla.'
            : mensajeDe(codigo),
        );
      }
    } catch {
      /* cae al genérico */
    }
    return noDisponible(null, 503);
  }
}
