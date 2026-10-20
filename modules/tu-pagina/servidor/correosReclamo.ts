import 'server-only';
/**
 * Los tres correos del Libro de Reclamaciones (lib/correo.ts manda):
 *   · copia      al consumidor, su hoja completa, al registrarla.
 *   · aviso      a los dueños y administradores: hay una hoja y hasta cuándo.
 *   · respuesta  al consumidor, lo que el negocio contestó desde el panel.
 * Todo lo que escribió alguien va escapado.
 */
import { esc, type Correo } from '@/lib/correo';
import { telefonoBonito } from '@/modules/tu-pagina/dominio/envio';
import { AVISOS_LEGALES, DEFINICION, numeroHoja, type Reclamo } from '@/modules/tu-pagina/dominio/reclamos';

const fecha = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const p = (t: string) => `<p style="margin:2px 0;white-space:pre-wrap">${esc(t)}</p>`;
const h = (t: string) => `<h3 style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:#55555a">${esc(t)}</h3>`;
const envolver = (cuerpo: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f;max-width:600px;margin:0 auto;padding:16px">${cuerpo}<p style="margin-top:24px;font-size:12px;color:#8e8e93">Enviado con Vendemia · vendemias.com</p></div>`;

/** La hoja, en HTML y en texto, tal como la ve el consumidor. */
function hoja(r: Reclamo): { html: string; texto: string } {
  const num = numeroHoja(r.numero, r.creado_at);
  const c = r.consumidor;
  const lineas: [string, string[]][] = [
    [`Hoja de reclamación ${num}`, [`Fecha: ${fechaHora(r.creado_at)}`, `${r.proveedor.razon_social} · RUC ${r.proveedor.ruc}`, r.proveedor.direccion]],
    ['1. Identificación del consumidor reclamante', [
      `${c.nombre} · ${c.tipo_doc} ${c.num_doc}`,
      `${c.domicilio} · ${telefonoBonito(c.telefono)}${c.email ? ` · ${c.email}` : ''}`,
      ...(c.menor ? [`Menor de edad. Padre, madre o apoderado: ${c.apoderado}`] : []),
    ]],
    ['2. Identificación del bien contratado', [`${r.bien.tipo === 'producto' ? 'Producto' : 'Servicio'}: ${r.bien.descripcion}${r.bien.monto != null ? ` · Monto reclamado: S/ ${r.bien.monto}` : ''}`]],
    ['3. Detalle de la reclamación y pedido del consumidor', [`${r.tipo === 'reclamo' ? 'Reclamo' : 'Queja'} (${DEFINICION[r.tipo]})`, r.detalle, `Pedido: ${r.pedido}`]],
    ['4. Observaciones y acciones adoptadas por el proveedor', [r.respuesta ?? `Pendiente. Plazo de respuesta: hasta el ${fecha(r.vence)}.`]],
  ];
  const html = lineas.map(([t, ls], i) => (i === 0 ? `<h2 style="margin:0 0 4px;font-size:18px">${esc(t)}</h2>` : h(t)) + ls.map(p).join('')).join('')
    + AVISOS_LEGALES.map((a) => `<p style="margin:10px 0 0;font-size:12px;color:#55555a">${esc(a)}</p>`).join('');
  const texto = lineas.map(([t, ls]) => [t.toUpperCase(), ...ls].join('\n')).join('\n\n') + '\n\n' + AVISOS_LEGALES.join('\n');
  return { html, texto };
}

export function correoCopia(r: Reclamo): Correo {
  const { html, texto } = hoja(r);
  const num = numeroHoja(r.numero, r.creado_at);
  const intro = `Registraste la hoja ${num} en el Libro de Reclamaciones de ${r.proveedor.nombre_comercial || r.proveedor.razon_social}. Esta es tu copia. Te deben responder a más tardar el ${fecha(r.vence)}.`;
  return {
    para: r.consumidor.email,
    asunto: `Tu hoja de reclamación ${num}`,
    nombre: `${r.proveedor.nombre_comercial || r.proveedor.razon_social} vía Vendemia`,
    html: envolver(`<p>${esc(intro)}</p><hr style="border:0;border-top:2px solid #1d1d1f;margin:16px 0">${html}`),
    texto: `${intro}\n\n${texto}`,
  };
}

export function correoAviso(r: Reclamo, para: string[], urlPanel: string): Correo {
  const num = numeroHoja(r.numero, r.creado_at);
  const intro = `Llegó un${r.tipo === 'queja' ? 'a queja' : ' reclamo'} a tu Libro de Reclamaciones (${num}) de ${r.consumidor.nombre}. Tienes hasta el ${fecha(r.vence)} para responder (15 días hábiles, improrrogables).`;
  const { html, texto } = hoja(r);
  return {
    para,
    asunto: `Nuevo ${r.tipo} ${num}: responde antes del ${fecha(r.vence)}`,
    nombre: 'Vendemia · Libro de Reclamaciones',
    html: envolver(`<p>${esc(intro)}</p><p><a href="${esc(urlPanel)}" style="display:inline-block;background:#006BFF;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Responder en el panel</a></p><hr style="border:0;border-top:1px solid #e2e2e6;margin:16px 0">${html}`),
    texto: `${intro}\n\nResponder en el panel: ${urlPanel}\n\n${texto}`,
  };
}

export function correoRespuesta(r: Reclamo): Correo {
  const num = numeroHoja(r.numero, r.creado_at);
  const negocio = r.proveedor.nombre_comercial || r.proveedor.razon_social;
  const intro = `Hola ${r.consumidor.nombre}, ${negocio} respondió tu hoja de reclamación ${num} del ${fecha(r.creado_at)}:`;
  const { html, texto } = hoja(r);
  return {
    para: r.consumidor.email,
    asunto: `Respuesta a tu hoja de reclamación ${num}`,
    nombre: `${negocio} vía Vendemia`,
    html: envolver(`<p>${esc(intro)}</p><blockquote style="margin:12px 0;padding:12px 16px;background:#f2f2f5;border-radius:8px;white-space:pre-wrap">${esc(r.respuesta ?? '')}</blockquote><hr style="border:0;border-top:1px solid #e2e2e6;margin:16px 0">${html}`),
    texto: `${intro}\n\n${r.respuesta ?? ''}\n\n${texto}`,
  };
}
