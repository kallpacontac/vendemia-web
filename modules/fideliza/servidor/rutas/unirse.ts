/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ALTA · fideliza.vendemias.com/n/<slug>/unirse
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Primero el beneficio, luego un solo botón. Sin contraseña ni casillas.
 * 13-nov-2026 (Alvaro): NOMBRE y CELULAR obligatorios, para que el negocio sepa
 * quién es y pueda encontrarlo por su número en la caja. El celular queda como
 * contacto sin verificar (srv_card_action 'contact').
 * 24-nov-2026 (Alvaro): y un CORREO opcional, para avisarle de sus premios y pedirle su opinión
 * (fideliza 0026). Solo aquí: la Caja no lo pide.
 *
 * Avisos al registrarse: el toque en «Crear mi tarjeta» pide el permiso de
 * notificaciones del navegador (la única forma: exige un toque). La tarjeta, al
 * abrirse con el permiso ya dado, se suscribe sola (Tarjeta.tsx). En iPhone sin
 * instalar no existe: allí se ofrece después, al instalarla.
 *
 * «Ya tienes una tarjeta aquí» sale solo si la que recuerda este teléfono
 * (localStorage `fz:card:<slug>`) SIGUE EXISTIENDO: tras reiniciar el negocio o
 * borrar la tarjeta, el teléfono la olvida y se ve el alta como la primera vez.
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
import { entorno } from '@/modules/fideliza/servidor/entorno';


const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Celular de Perú (9 dígitos que empiezan por 9) o uno con código de país (10 a 15
 * dígitos). Más estricto que loyalty_norm_phone, que también aceptaría 8: aquí un
 * dígito de menos es un error al escribir, no un número de otro país.
 */
/** Un correo con forma de correo. Vacío vale: es opcional. */
export const correoValido = (v: string) => v === '' || /^[^@\s<>"']{1,64}@[^@\s<>"']+\.[^@\s<>"']{2,}$/.test(v);

export function celularValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  return (d.length === 9 && d.startsWith('9')) || (d.length >= 10 && d.length <= 15);
}

function formulario(n: Negocio, slug: string, placa: string | null, aviso?: string, nombre = '', telefono = '', correo = '') {
  const conAvisos = Boolean(entorno.vapidPublica());
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
  <label for="alias">Tu nombre</label>
  <input type="text" id="alias" name="alias" maxlength="40" minlength="2" required autocomplete="name"${nombre ? ` value="${esc(nombre)}"` : ''}>
  <label for="tel">Tu celular</label>
  <input type="tel" id="tel" name="tel" maxlength="20" required inputmode="tel" autocomplete="tel" placeholder="987 654 321" pattern="[+0-9 ()-]{8,20}"${telefono ? ` value="${esc(telefono)}"` : ''}>
  <label for="correo">Tu correo <span class="opcional">(opcional)</span></label>
  <input type="email" id="correo" name="correo" maxlength="120" inputmode="email" autocomplete="email" placeholder="para avisarte de tus premios"${correo ? ` value="${esc(correo)}"` : ''}>
  <button class="btn prim" type="submit" id="b">Crear mi tarjeta</button>
  <p class="nota">Sin contraseña. Con tu celular te encuentran en caja.${conAvisos ? ' Te pediremos permiso para avisarte cuando ganes un premio.' : ''} Tu tarjeta queda en este teléfono y puedes guardarla en Google Wallet o en tu pantalla de inicio.</p>
</form>
<script>
try{var kc='fz:card:${esc(slug)}',t=localStorage.getItem(kc);if(t&&/^[A-Za-z0-9_-]{30,64}$/.test(t)){fetch('/api/fideliza/publico/tarjeta',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accion:'ver',token:t})}).then(function(r){return r.ok?r.json():null}).then(function(d){if(!d)return;if(d.status==='ok'){if(!/[?&]nueva=1(&|$)/.test(location.search)){location.replace('/m/'+t);return;}document.getElementById('ya').hidden=false;document.getElementById('ya-a').href='/m/'+t;}else{localStorage.removeItem(kc);}}).catch(function(){});}}catch(e){}
(function(){var f=document.getElementById('f'),b=document.getElementById('b'),pide=${conAvisos ? 'true' : 'false'},ya=false;
function enviar(){if(ya)return;ya=true;b.disabled=true;b.textContent='Creando…';f.submit();}
f.addEventListener('submit',function(e){
  /* Avisos: el permiso se pide en ESTE toque (el navegador lo exige). Diga lo que diga, la tarjeta se crea. */
  var puede=pide&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window&&Notification.permission==='default';
  if(!puede){b.disabled=true;b.textContent='Creando…';return;}
  e.preventDefault();b.disabled=true;b.textContent='Creando…';
  try{var p=Notification.requestPermission();if(p&&p.then){p.then(enviar,enviar);setTimeout(enviar,20000);}else enviar();}catch(x){enviar();}
});})();
</script>`,
  });
}

async function negocio(slug: string, evento: string | null) {
  return rpc<Negocio>(servidor(), 'loyalty_srv_business', { p_slug: slug, p_event: evento });
}

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  if (!SLUG.test(slug)) return noDisponible(null, 404);
  const consulta = new URL(req.url).searchParams;
  const placa = consulta.get('d');
  // ?nombre=: viene de «Crear mi tarjeta» al terminar una reserva en Mi página. Solo rellena
  // el campo; la tarjeta no se crea hasta que la clienta pulsa el botón.
  const nombre = (consulta.get('nombre') ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
  try {
    if (!(await limitar(`ip:${huellaIp(req)}:jv`, 60, 60))) return new Response('Demasiadas peticiones', { status: 429 });
    const n = await negocio(slug, 'join_view');
    if (n.status !== 'ok') return noDisponible(null, 404);
    if (!n.program) return noDisponible(n.brand);
    return formulario(n, slug, placa && /^[A-Za-z0-9_-]{22,64}$/.test(placa) ? placa : null, undefined, nombre);
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
    const alias = String(f.get('alias') ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
    const tel = String(f.get('tel') ?? '').trim().slice(0, 20);
    const correo = String(f.get('correo') ?? '').trim().toLowerCase().slice(0, 120);
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(k)) return noDisponible(null, 400);
    // Obligatorios (el navegador ya lo exige; esto cubre al que no lo hace).
    if (alias.length < 2 || !celularValido(tel) || !correoValido(correo)) {
      n = await negocio(slug, null);
      if (n.status !== 'ok' || !n.program) return noDisponible(null, 404);
      return formulario(
        n,
        slug,
        /^[A-Za-z0-9_-]{22,64}$/.test(d) ? d : null,
        alias.length < 2 ? 'Escribe tu nombre.' : !celularValido(tel) ? 'Revisa tu celular: 9 dígitos, por ejemplo 987 654 321.' : 'Revisa tu correo, o déjalo vacío: es opcional.',
        alias,
        tel,
        correo,
      );
    }
    const r = await rpc<{ card_token: string; public_code: string }>(servidor(), 'loyalty_srv_join', {
      p_slug: slug,
      p_alias: alias,
      p_device_token: /^[A-Za-z0-9_-]{22,64}$/.test(d) ? d : null,
      p_creation_key: k,
    });
    // El celular (y el correo, si lo dio), como contactos sin verificar. Si fallara, la tarjeta ya existe: se sigue.
    await rpc(servidor(), 'loyalty_srv_card_action', {
      p_card_token: r.card_token,
      p_action: 'contact',
      p_args: { phone: tel, ...(correo ? { email: correo } : {}) },
    }).catch((e) => log('join_phone_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' }));
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
