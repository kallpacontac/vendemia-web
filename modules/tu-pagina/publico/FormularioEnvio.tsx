'use client';

/**
 * El formulario de envío. Una sola pantalla, en el orden en que la persona lo
 * piensa: a quién va, qué es, cuándo lo recogemos, quién lo manda.
 *
 * · Lo de quien envía se recuerda en ESTE navegador (no en nuestra base): el
 *   emprendedor que manda todos los días no lo vuelve a escribir.
 * · Los errores salen en su campo, antes de enviar.
 * · Un doble toque no crea dos envíos: `idem` es el mismo hasta que sale bien.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageCircle, Minus, Plus } from 'lucide-react';
import {
  FRANJAS,
  fechaCorta,
  mensajeEnvio,
  sumarDias,
  urlWhatsApp,
  validarEnvio,
  type DatosEnvio,
  type Errores,
} from '@/modules/tu-pagina/dominio/envio';

const CLAVE_REMITENTE = 'tu_pagina:remitente';
const DIAS_A_LA_VISTA = 14;

const nuevoIdem = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function vacio(hoy: string): DatosEnvio {
  return {
    remitente_nombre: '',
    remitente_telefono: '',
    destinatario_nombre: '',
    destinatario_telefono: '',
    direccion: '',
    distrito: '',
    referencia: '',
    contenido: '',
    bultos: 1,
    peso_kg: '',
    contra_entrega: '',
    recojo_fecha: hoy,
    recojo_franja: 'manana',
  };
}

const ETIQUETA_DIA = (fecha: string, hoy: string) =>
  fecha === hoy ? 'Hoy' : fecha === sumarDias(hoy, 1) ? 'Mañana' : fechaCorta(fecha).split(' ')[0];

export default function FormularioEnvio({ slug, whatsapp, distritos, hoy }: { slug: string; whatsapp: string; distritos: string[]; hoy: string }) {
  const [d, setD] = useState<DatosEnvio>(() => vacio(hoy));
  const [errores, setErrores] = useState<Errores>({});
  const [cobrar, setCobrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [hecho, setHecho] = useState<{ codigo: string; mensaje: string } | null>(null);
  const idem = useRef(nuevoIdem());
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(CLAVE_REMITENTE) ?? 'null') as { nombre?: string; telefono?: string } | null;
      if (r) setD((x) => ({ ...x, remitente_nombre: r.nombre ?? '', remitente_telefono: r.telefono ?? '' }));
    } catch {
      /* sin almacenamiento: se escribe a mano, nada más */
    }
  }, []);

  const dias = useMemo(() => Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(hoy, i)), [hoy]);
  const poner = <K extends keyof DatosEnvio>(k: K, v: DatosEnvio[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errores[k]) setErrores((e) => ({ ...e, [k]: undefined }));
  };

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const datos = { ...d, contra_entrega: cobrar ? d.contra_entrega : '' };
    const e = validarEnvio(datos, { distritos, hoy });
    setErrores(e);
    setFallo('');
    if (Object.keys(e).length) {
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('.tp-campo--error input, .tp-campo--error select')?.focus());
      return;
    }
    setEnviando(true);
    try {
      const trampa = (formulario.current?.elements.namedItem('web') as HTMLInputElement | null)?.value ?? '';
      const r = await fetch('/api/tu-pagina/publico/envio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, idem: idem.current, web: trampa, datos }),
      });
      const j = (await r.json().catch(() => ({}))) as { status?: string; codigo?: string; errores?: Errores };
      if (j.status === 'ok' && j.codigo) {
        try {
          localStorage.setItem(CLAVE_REMITENTE, JSON.stringify({ nombre: datos.remitente_nombre, telefono: datos.remitente_telefono }));
        } catch {
          /* no pasa nada */
        }
        setHecho({ codigo: j.codigo, mensaje: mensajeEnvio(j.codigo, datos) });
        window.scrollTo({ top: 0 });
        return;
      }
      if (j.errores) setErrores(j.errores);
      setFallo(
        j.status === 'demasiados'
          ? 'Hiciste muchos envíos seguidos. Espera un momento o escríbenos por WhatsApp.'
          : j.status === 'distrito_invalido'
            ? 'Ese distrito no lo atendemos.'
            : j.status === 'fecha_invalida'
              ? 'Elige un día de recojo desde hoy.'
              : 'No pudimos guardar el envío. Revisa los datos o escríbenos por WhatsApp.',
      );
    } catch {
      setFallo('Sin conexión. Revisa tu internet y vuelve a intentarlo.');
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <section className="tp-hecho" aria-live="polite">
        <div className="tp-hecho__marca"><Check size={36} aria-hidden="true" /></div>
        <h2 className="tp-h1">¡Envío agendado!</h2>
        <p className="tp-lead">Tu código es</p>
        <div className="tp-codigo">{hecho.codigo}</div>
        <p className="tp-resumen">{hecho.mensaje}</p>
        <a className="tp-boton tp-boton--wsp" href={urlWhatsApp(whatsapp, hecho.mensaje)} rel="noopener">
          <MessageCircle size={20} aria-hidden="true" /> Enviar por WhatsApp
        </a>
        <button
          type="button"
          className="tp-boton tp-boton--suave"
          onClick={() => {
            idem.current = nuevoIdem();
            setD((x) => ({ ...vacio(hoy), remitente_nombre: x.remitente_nombre, remitente_telefono: x.remitente_telefono }));
            setCobrar(false);
            setHecho(null);
          }}
        >
          Agendar otro envío
        </button>
      </section>
    );
  }

  const campo = (k: keyof DatosEnvio, etiqueta: string, hijo: React.ReactNode, ayuda?: string) => (
    <div className={`tp-campo${errores[k] ? ' tp-campo--error' : ''}`}>
      <label htmlFor={`tp-${k}`}>{etiqueta}</label>
      {hijo}
      {errores[k] ? <span className="tp-error">{errores[k]}</span> : ayuda ? <small>{ayuda}</small> : null}
    </div>
  );
  const texto = (k: keyof DatosEnvio, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input id={`tp-${k}`} value={String(d[k])} onChange={(e) => poner(k, e.target.value as never)} {...extra} />
  );

  return (
    <form ref={formulario} onSubmit={enviar} noValidate>
      <input className="tp-trampa" name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {fallo && <p className="tp-aviso" role="alert">{fallo}</p>}

      <section className="tp-bloque">
        <h2>¿A quién va?</h2>
        {campo('destinatario_nombre', 'Nombre', texto('destinatario_nombre', { autoComplete: 'off' }))}
        {campo('destinatario_telefono', 'Celular', texto('destinatario_telefono', { inputMode: 'tel', placeholder: '987 654 321' }))}
        {campo('direccion', 'Dirección', texto('direccion', { placeholder: 'Av. Primavera 123, dpto 402' }))}
        {campo(
          'distrito',
          'Distrito',
          distritos.length ? (
            <select id="tp-distrito" value={d.distrito} onChange={(e) => poner('distrito', e.target.value)}>
              <option value="">Elige…</option>
              {distritos.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : (
            texto('distrito', { placeholder: 'Surco' })
          ),
        )}
        {campo('referencia', 'Referencia', texto('referencia', { placeholder: 'Frente al parque, portón negro' }), 'Opcional, pero ayuda mucho')}
      </section>

      <section className="tp-bloque">
        <h2>¿Qué va?</h2>
        {campo('contenido', 'Qué es', texto('contenido', { placeholder: 'Ropa, documentos, una caja…' }), 'Opcional')}
        <div className={`tp-campo${errores.bultos ? ' tp-campo--error' : ''}`}>
          <label id="tp-bultos-l">Cuántos paquetes</label>
          <div className="tp-contador" role="group" aria-labelledby="tp-bultos-l">
            <button type="button" aria-label="Uno menos" onClick={() => poner('bultos', Math.max(1, d.bultos - 1))}><Minus size={18} /></button>
            <output aria-live="polite">{d.bultos}</output>
            <button type="button" aria-label="Uno más" onClick={() => poner('bultos', Math.min(50, d.bultos + 1))}><Plus size={18} /></button>
          </div>
        </div>
        <div className="tp-campo">
          <label id="tp-cobrar-l">¿Cobramos algo al entregar?</label>
          <div className="tp-opciones" role="group" aria-labelledby="tp-cobrar-l">
            <button type="button" className="tp-opcion" aria-pressed={!cobrar} onClick={() => setCobrar(false)}>No</button>
            <button type="button" className="tp-opcion" aria-pressed={cobrar} onClick={() => setCobrar(true)}>Sí, contra entrega</button>
          </div>
        </div>
        {cobrar && campo('contra_entrega', 'Monto a cobrar (S/)', texto('contra_entrega', { inputMode: 'decimal', placeholder: '45.00' }))}
      </section>

      <section className="tp-bloque">
        <h2>¿Cuándo lo recogemos?</h2>
        <div className={`tp-campo${errores.recojo_fecha ? ' tp-campo--error' : ''}`}>
          <label id="tp-dia-l">Día</label>
          <div className="tp-dias" role="group" aria-labelledby="tp-dia-l">
            {dias.map((f) => (
              <button key={f} type="button" className="tp-opcion" aria-pressed={d.recojo_fecha === f} onClick={() => poner('recojo_fecha', f)}>
                {ETIQUETA_DIA(f, hoy)}
                <small>{fechaCorta(f).split(' ').slice(1).join(' ')}</small>
              </button>
            ))}
          </div>
          {errores.recojo_fecha && <span className="tp-error">{errores.recojo_fecha}</span>}
        </div>
        <div className="tp-campo">
          <label id="tp-franja-l">Horario</label>
          <div className="tp-opciones" role="group" aria-labelledby="tp-franja-l">
            {FRANJAS.map((f) => (
              <button key={f.id} type="button" className="tp-opcion" aria-pressed={d.recojo_franja === f.id} onClick={() => poner('recojo_franja', f.id)}>
                {f.nombre}
                <small>{f.horas}</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="tp-bloque">
        <h2>¿Quién lo envía?</h2>
        {campo('remitente_nombre', 'Tu nombre', texto('remitente_nombre', { autoComplete: 'name' }))}
        {campo('remitente_telefono', 'Tu celular', texto('remitente_telefono', { inputMode: 'tel', autoComplete: 'tel', placeholder: '987 654 321' }), 'Lo recordamos en este celular para la próxima')}
      </section>

      <button className="tp-boton" type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Agendar envío'}
      </button>
    </form>
  );
}
