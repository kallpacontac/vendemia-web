'use client';

/**
 * La hoja de reclamación. Una pantalla, en el orden del formato oficial:
 * quién reclama, qué contrató, qué pasó y qué pide. Sin casillas de aceptación
 * obligatoria (lo prohíbe el reglamento).
 *
 * Al terminar se enseña la hoja completa, con su número, para imprimirla o
 * guardarla como PDF: es la copia del consumidor. Un doble toque no crea dos
 * hojas: `idem` es el mismo hasta que sale bien.
 */
import { useRef, useState } from 'react';
import { Check, MessageCircle, Printer } from 'lucide-react';
import { urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import {
  AVISOS_LEGALES,
  DEFINICION,
  TIPOS_DOC,
  numeroHoja,
  validarHoja,
  type ErroresHoja,
  type HojaNueva,
  type Proveedor,
} from '@/modules/tu-pagina/dominio/reclamos';

const nuevoIdem = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const VACIA: HojaNueva = {
  tipo: 'reclamo',
  consumidor: { nombre: '', tipo_doc: 'DNI', num_doc: '', domicilio: '', telefono: '', email: '', menor: false, apoderado: '' },
  bien: { tipo: 'producto', descripcion: '', monto: '' },
  detalle: '',
  pedido: '',
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fecha = (d: string) => d.split('-').reverse().join('/');

export default function FormularioReclamo({ slug, whatsapp, titulo, proveedor }: { slug: string; whatsapp: string; titulo: string; proveedor: Proveedor }) {
  const [h, setH] = useState<HojaNueva>(VACIA);
  const [errores, setErrores] = useState<ErroresHoja>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [hecho, setHecho] = useState<{ numero: number; fecha: string; vence: string; copia: boolean } | null>(null);
  const idem = useRef(nuevoIdem());
  const formulario = useRef<HTMLFormElement>(null);

  const c = h.consumidor;
  const ponerC = <K extends keyof HojaNueva['consumidor']>(k: K, v: HojaNueva['consumidor'][K]) => {
    setH((x) => ({ ...x, consumidor: { ...x.consumidor, [k]: v } }));
    setErrores((e) => ({ ...e, [k]: undefined }));
  };
  const ponerB = <K extends keyof HojaNueva['bien']>(k: K, v: HojaNueva['bien'][K]) => {
    setH((x) => ({ ...x, bien: { ...x.bien, [k]: v } }));
    setErrores((e) => ({ ...e, [k]: undefined }));
  };

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validarHoja(h);
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) {
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('.tp-campo--error input, .tp-campo--error textarea')?.focus());
      return;
    }
    setEnviando(true);
    try {
      const trampa = (formulario.current?.elements.namedItem('web') as HTMLInputElement | null)?.value ?? '';
      const r = await fetch('/api/tu-pagina/publico/reclamo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, idem: idem.current, web: trampa, hoja: h }),
      });
      const j = (await r.json().catch(() => ({}))) as { status?: string; numero?: number; fecha?: string; vence?: string; copia?: boolean; errores?: ErroresHoja };
      if (j.status === 'ok' && j.numero && j.fecha && j.vence) {
        setHecho({ numero: j.numero, fecha: j.fecha, vence: j.vence, copia: Boolean(j.copia) });
        window.scrollTo({ top: 0 });
        return;
      }
      if (j.errores) setErrores(j.errores);
      setFallo(
        j.status === 'demasiados'
          ? 'Ya registraste varias hojas hoy. Si es urgente, escríbenos por WhatsApp.'
          : 'No pudimos registrar tu hoja. Revisa los datos e inténtalo otra vez.',
      );
    } catch {
      setFallo('Sin conexión. Revisa tu internet y vuelve a intentarlo.');
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    const num = numeroHoja(hecho.numero, hecho.fecha);
    const aviso = `Hola, registré la hoja de reclamación ${num} en su Libro de Reclamaciones.`;
    return (
      <section aria-live="polite">
        <div className="tp-hecho tp-no-imprimir">
          <div className="tp-hecho__marca"><Check size={36} aria-hidden="true" /></div>
          <h2 className="tp-h1">Hoja registrada</h2>
          <p className="tp-lead">
            Tienes respuesta a más tardar el <b>{fecha(hecho.vence)}</b>.{' '}
            {hecho.copia ? <>Te enviamos una copia a <b>{c.email}</b>. También puedes guardarla aquí:</> : 'Guarda tu copia:'}
          </p>
          <button type="button" className="tp-boton" onClick={() => window.print()}>
            <Printer size={20} aria-hidden="true" /> Imprimir o guardar en PDF
          </button>
          <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, aviso)} rel="noopener">
            <MessageCircle size={20} aria-hidden="true" /> Avisar por WhatsApp
          </a>
        </div>

        <article className="tp-hoja-reclamo">
          <header>
            <h2>Hoja de reclamación {num}</h2>
            <p>Fecha: {fechaHora(hecho.fecha)}</p>
            <p><b>{proveedor.razon_social}</b> ({titulo}) · RUC {proveedor.ruc}</p>
            <p>{proveedor.direccion}</p>
          </header>
          <h3>1. Identificación del consumidor reclamante</h3>
          <p>{c.nombre} · {c.tipo_doc} {c.num_doc}</p>
          <p>{c.domicilio} · {c.telefono}{c.email ? ` · ${c.email}` : ''}</p>
          {c.menor && <p>Menor de edad. Padre, madre o apoderado: {c.apoderado}</p>}
          <h3>2. Identificación del bien contratado</h3>
          <p>{h.bien.tipo === 'producto' ? 'Producto' : 'Servicio'}: {h.bien.descripcion}{h.bien.monto ? ` · Monto reclamado: S/ ${h.bien.monto}` : ''}</p>
          <h3>3. Detalle de la reclamación y pedido del consumidor</h3>
          <p><b>{h.tipo === 'reclamo' ? 'Reclamo' : 'Queja'}</b> ({DEFINICION[h.tipo]})</p>
          <p>{h.detalle}</p>
          <p><b>Pedido:</b> {h.pedido}</p>
          <h3>4. Observaciones y acciones adoptadas por el proveedor</h3>
          <p>Pendiente. Plazo de respuesta: hasta el {fecha(hecho.vence)}.</p>
          {AVISOS_LEGALES.map((a) => <p key={a} className="tp-legal">{a}</p>)}
        </article>
      </section>
    );
  }

  const campo = (k: keyof ErroresHoja, etiqueta: string, hijo: React.ReactNode, ayuda?: string) => (
    <div className={`tp-campo${errores[k] ? ' tp-campo--error' : ''}`}>
      <label htmlFor={`tp-r-${k}`}>{etiqueta}</label>
      {hijo}
      {errores[k] ? <span className="tp-error">{errores[k]}</span> : ayuda ? <small>{ayuda}</small> : null}
    </div>
  );

  return (
    <form ref={formulario} onSubmit={enviar} noValidate>
      <input className="tp-trampa" name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}

      <section className="tp-bloque">
        <h2>Tus datos</h2>
        {campo('nombre', 'Nombre completo', <input id="tp-r-nombre" value={c.nombre} autoComplete="name" maxLength={120} onChange={(e) => ponerC('nombre', e.target.value)} />)}
        <div className="tp-campo">
          <label htmlFor="tp-r-tipo_doc">Documento</label>
          <select id="tp-r-tipo_doc" value={c.tipo_doc} onChange={(e) => ponerC('tipo_doc', e.target.value as HojaNueva['consumidor']['tipo_doc'])}>
            {TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {campo('num_doc', 'Número de documento', <input id="tp-r-num_doc" value={c.num_doc} inputMode={c.tipo_doc === 'DNI' || c.tipo_doc === 'RUC' ? 'numeric' : 'text'} maxLength={15} onChange={(e) => ponerC('num_doc', e.target.value)} />)}
        {campo('domicilio', 'Domicilio', <input id="tp-r-domicilio" value={c.domicilio} autoComplete="street-address" maxLength={200} onChange={(e) => ponerC('domicilio', e.target.value)} />)}
        {campo('telefono', 'Celular', <input id="tp-r-telefono" value={c.telefono} inputMode="tel" autoComplete="tel" placeholder="987 654 321" onChange={(e) => ponerC('telefono', e.target.value)} />)}
        {campo('email', 'Correo', <input id="tp-r-email" value={c.email} type="email" autoComplete="email" maxLength={120} onChange={(e) => ponerC('email', e.target.value)} />, 'Opcional: te llega una copia de tu hoja y la respuesta')}
        <div className="tp-campo">
          <label id="tp-r-menor-l">¿Eres menor de edad?</label>
          <div className="tp-opciones" role="group" aria-labelledby="tp-r-menor-l">
            <button type="button" className="tp-opcion" aria-pressed={!c.menor} onClick={() => ponerC('menor', false)}>No</button>
            <button type="button" className="tp-opcion" aria-pressed={c.menor} onClick={() => ponerC('menor', true)}>Sí</button>
          </div>
        </div>
        {c.menor && campo('apoderado', 'Nombre del padre, madre o apoderado', <input id="tp-r-apoderado" value={c.apoderado} maxLength={120} onChange={(e) => ponerC('apoderado', e.target.value)} />)}
      </section>

      <section className="tp-bloque">
        <h2>Qué contrataste</h2>
        <div className="tp-campo">
          <label id="tp-r-bien-l">Es un</label>
          <div className="tp-opciones" role="group" aria-labelledby="tp-r-bien-l">
            <button type="button" className="tp-opcion" aria-pressed={h.bien.tipo === 'producto'} onClick={() => ponerB('tipo', 'producto')}>Producto</button>
            <button type="button" className="tp-opcion" aria-pressed={h.bien.tipo === 'servicio'} onClick={() => ponerB('tipo', 'servicio')}>Servicio</button>
          </div>
        </div>
        {campo('descripcion', 'Cuál', <input id="tp-r-descripcion" value={h.bien.descripcion} maxLength={300} onChange={(e) => ponerB('descripcion', e.target.value)} />)}
        {campo('monto', 'Monto reclamado (S/)', <input id="tp-r-monto" value={h.bien.monto} inputMode="decimal" maxLength={12} onChange={(e) => ponerB('monto', e.target.value)} />, 'Opcional')}
      </section>

      <section className="tp-bloque">
        <h2>Qué pasó</h2>
        <div className="tp-campo">
          <label id="tp-r-tipo-l">Es un</label>
          <div className="tp-opciones" role="group" aria-labelledby="tp-r-tipo-l">
            <button type="button" className="tp-opcion" aria-pressed={h.tipo === 'reclamo'} onClick={() => setH((x) => ({ ...x, tipo: 'reclamo' }))}>Reclamo</button>
            <button type="button" className="tp-opcion" aria-pressed={h.tipo === 'queja'} onClick={() => setH((x) => ({ ...x, tipo: 'queja' }))}>Queja</button>
          </div>
          <small>{DEFINICION[h.tipo]}</small>
        </div>
        {campo('detalle', 'Detalle', <textarea id="tp-r-detalle" rows={5} value={h.detalle} maxLength={3000} onChange={(e) => { setH((x) => ({ ...x, detalle: e.target.value })); setErrores((x) => ({ ...x, detalle: undefined })); }} />)}
        {campo('pedido', 'Qué pides', <textarea id="tp-r-pedido" rows={3} value={h.pedido} maxLength={1500} onChange={(e) => { setH((x) => ({ ...x, pedido: e.target.value })); setErrores((x) => ({ ...x, pedido: undefined })); }} />, 'La solución que esperas')}
      </section>

      {AVISOS_LEGALES.map((a) => <p key={a} className="tp-legal">{a}</p>)}

      <button type="submit" className="tp-boton" disabled={enviando}>
        {enviando ? 'Registrando…' : 'Registrar mi hoja'}
      </button>
    </form>
  );
}
