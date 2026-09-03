'use client';

import { useState } from 'react';
import { RECLAMACIONES } from '@/lib/legal';
import { whatsappUrl } from '@/lib/content';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * HOJA DE RECLAMACIÓN — los campos los manda la ley, no el diseño
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El reglamento del Libro de Reclamaciones (Ley 29571) fija qué tiene que
 * pedir una hoja: identificación del consumidor, identificación del bien o
 * servicio contratado con el monto reclamado, y el detalle separando RECLAMO
 * de QUEJA más el pedido concreto del consumidor. Ninguno de estos campos está
 * aquí porque quede bien; quitar uno es incumplir.
 *
 * ⚠️ CÓMO SE ENVÍA HOY, Y POR QUÉ ESTO ES UN PUENTE Y NO LA SOLUCIÓN FINAL.
 *
 * No hay backend que reciba reclamaciones, así que el formulario compone la
 * hoja completa y la abre en WhatsApp. Eso resuelve dos cosas de verdad: la
 * reclamación llega, y el consumidor se queda con una copia exacta en su
 * propio teléfono, con fecha y hora, que es justo lo que un acuse de recibo
 * tiene que darle.
 *
 * Lo que NO resuelve, y es tuyo:
 *
 *  · CONSERVAR EL REGISTRO. La norma obliga al proveedor a guardar las
 *    reclamaciones. Un hilo de WhatsApp no es un registro: se pierde con el
 *    teléfono. Hay que volcarlas a una tabla en cuanto exista el backend.
 *  · RESPONDER EN PLAZO. 15 días hábiles. El formulario lo promete por
 *    escrito; cumplirlo depende de ti.
 *  · EL CORRELATIVO. El número que genera esta pantalla es local y solo sirve
 *    para que el consumidor y tú habléis del mismo caso. Cuando haya base de
 *    datos, el correlativo tiene que salir de ella.
 *
 * Mientras tanto esto es honesto: la hoja se envía y queda copia. Lo que no
 * hay que hacer es dejar el enlace muerto, que es como estaba.
 */

type Tipo = 'reclamo' | 'queja';

const CAMPOS = [
  { id: 'nombre', label: 'Nombres y apellidos', tipo: 'text', req: true },
  { id: 'documento', label: 'DNI o carné de extranjería', tipo: 'text', req: true },
  { id: 'domicilio', label: 'Domicilio', tipo: 'text', req: true },
  { id: 'telefono', label: 'Teléfono', tipo: 'tel', req: true },
  { id: 'email', label: 'Correo electrónico', tipo: 'email', req: true },
  { id: 'apoderado', label: 'Si eres menor de edad, nombre del padre, madre o apoderado', tipo: 'text', req: false },
] as const;

export default function FormularioReclamo() {
  const [tipo, setTipo] = useState<Tipo>('reclamo');
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState<string | null>(null);

  const set = (k: string, v: string) => setDatos((d) => ({ ...d, [k]: v }));

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fecha = new Date();
    // Correlativo local: fecha + hora. Ver la nota de arriba sobre por qué
    // esto es provisional y tiene que salir de la base de datos.
    const codigo =
      fecha.getFullYear().toString() +
      String(fecha.getMonth() + 1).padStart(2, '0') +
      String(fecha.getDate()).padStart(2, '0') +
      '-' +
      String(fecha.getHours()).padStart(2, '0') +
      String(fecha.getMinutes()).padStart(2, '0');

    const linea = (k: string, v: string) => `${k}: ${v || '—'}`;
    const mensaje = [
      `HOJA DE ${tipo.toUpperCase()} N.º ${codigo}`,
      `Fecha: ${fecha.toLocaleDateString('es-PE')}`,
      '',
      'IDENTIFICACIÓN DEL CONSUMIDOR',
      ...CAMPOS.map((c) => linea(c.label, datos[c.id] ?? '')),
      '',
      'BIEN O SERVICIO CONTRATADO',
      linea('Producto o servicio', datos.servicio ?? ''),
      linea('Monto reclamado (S/)', datos.monto ?? ''),
      linea('Descripción', datos.descripcion ?? ''),
      '',
      `DETALLE DE LA ${tipo.toUpperCase()}`,
      linea('Detalle', datos.detalle ?? ''),
      linea('Pedido del consumidor', datos.pedido ?? ''),
    ].join('\n');

    setEnviado(codigo);
    window.open(whatsappUrl(mensaje), '_blank', 'noopener,noreferrer');
  };

  const inputCls =
    'mt-1.5 h-11 w-full rounded-btn border bg-transparent px-3 text-[15px] outline-none focus-visible:border-[color:var(--orange-500)]';
  const inputStyle = { borderColor: 'var(--border-dark)', color: 'var(--text-hi)' } as const;

  if (enviado) {
    return (
      <div
        className="rounded-card border p-6"
        style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-800)' }}
      >
        <h2 className="text-[19px] font-semibold">Hoja N.º {enviado}</h2>
        <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
          Se ha abierto WhatsApp con tu hoja completa. Envíala y el mensaje queda en tu teléfono
          como copia, con fecha y hora.
        </p>
        <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
          {RECLAMACIONES.plazo}
        </p>
        <p className="mt-3 text-[13px]" style={{ color: 'var(--text-low)' }}>
          {RECLAMACIONES.aviso}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-8">
      <fieldset>
        <legend className="text-[19px] font-semibold">¿Es un reclamo o una queja?</legend>
        {/* No es una formalidad: la norma las distingue y el plazo y el
            tratamiento no son los mismos. Se explica cada una en su etiqueta
            en vez de dejar dos palabras sueltas que casi nadie diferencia. */}
        <div className="mt-3 space-y-3">
          {(['reclamo', 'queja'] as const).map((t) => (
            <label
              key={t}
              className="flex cursor-pointer gap-3 rounded-btn border p-3 text-[15px] leading-[1.6]"
              style={{
                borderColor: tipo === t ? 'var(--orange-500)' : 'var(--border-dark)',
                color: 'var(--text-mid)',
              }}
            >
              <input
                type="radio"
                name="tipo"
                checked={tipo === t}
                onChange={() => setTipo(t)}
                className="mt-1 shrink-0 accent-[color:var(--orange-cta)]"
              />
              <span>{RECLAMACIONES.diferencia[t]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[19px] font-semibold">Tus datos</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CAMPOS.map((c) => (
            <div key={c.id} className={c.req ? '' : 'sm:col-span-2'}>
              <label htmlFor={c.id} className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
                {c.label}
                {c.req && <span style={{ color: 'var(--orange-500)' }}> *</span>}
              </label>
              <input
                id={c.id}
                type={c.tipo}
                required={c.req}
                value={datos[c.id] ?? ''}
                onChange={(e) => set(c.id, e.currentTarget.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[19px] font-semibold">Servicio contratado</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="servicio" className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
              Producto o servicio<span style={{ color: 'var(--orange-500)' }}> *</span>
            </label>
            <input
              id="servicio"
              required
              value={datos.servicio ?? ''}
              onChange={(e) => set('servicio', e.currentTarget.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="monto" className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
              Monto reclamado (S/)
            </label>
            <input
              id="monto"
              inputMode="decimal"
              value={datos.monto ?? ''}
              onChange={(e) => set('monto', e.currentTarget.value)}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="descripcion" className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
              Descripción<span style={{ color: 'var(--orange-500)' }}> *</span>
            </label>
            <textarea
              id="descripcion"
              required
              rows={2}
              value={datos.descripcion ?? ''}
              onChange={(e) => set('descripcion', e.currentTarget.value)}
              className="mt-1.5 w-full rounded-btn border bg-transparent p-3 text-[15px] outline-none focus-visible:border-[color:var(--orange-500)]"
              style={inputStyle}
            />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[19px] font-semibold">
          Detalle de {tipo === 'reclamo' ? 'tu reclamo' : 'tu queja'}
        </legend>
        <div className="mt-3 space-y-4">
          <div>
            <label htmlFor="detalle" className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
              Qué ocurrió<span style={{ color: 'var(--orange-500)' }}> *</span>
            </label>
            <textarea
              id="detalle"
              required
              rows={4}
              value={datos.detalle ?? ''}
              onChange={(e) => set('detalle', e.currentTarget.value)}
              className="mt-1.5 w-full rounded-btn border bg-transparent p-3 text-[15px] outline-none focus-visible:border-[color:var(--orange-500)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="pedido" className="text-[13px]" style={{ color: 'var(--text-mid)' }}>
              Qué pides<span style={{ color: 'var(--orange-500)' }}> *</span>
            </label>
            <textarea
              id="pedido"
              required
              rows={3}
              value={datos.pedido ?? ''}
              onChange={(e) => set('pedido', e.currentTarget.value)}
              className="mt-1.5 w-full rounded-btn border bg-transparent p-3 text-[15px] outline-none focus-visible:border-[color:var(--orange-500)]"
              style={inputStyle}
            />
          </div>
        </div>
      </fieldset>

      <div>
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:w-auto"
          style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
        >
          Enviar mi {tipo}
        </button>
        <p className="mt-4 text-[13px] leading-[1.7]" style={{ color: 'var(--text-low)' }}>
          {RECLAMACIONES.plazo} {RECLAMACIONES.aviso}
        </p>
      </div>
    </form>
  );
}
