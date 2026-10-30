'use client';

/**
 * Mi página → Agregar funciones → «Canchas por horas» (dominio/canchas.ts).
 *
 * Las canchas son lo que el negocio ya tiene en Catálogo y se reserva con hora:
 * aquí no se crean, solo se les pone el precio de noche. Lo de cada página va
 * en `secciones.canchas`, que se guarda con el resto al pulsar «Guardar cambios».
 */
import { useState } from 'react';
import Link from 'next/link';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { PLAZOS, plazoDe, type ConfigCanchas } from '@/modules/tu-pagina/dominio/canchas';

const POR_PAGINA = 12;

const soles = (n: number | null) => (n === null ? 'a consultar' : `S/ ${Number.isInteger(n) ? n : n.toFixed(2)}`);

export function ConfigDeCanchas({ companyId, valor, alCambiar }: { companyId: string; valor: ConfigCanchas; alCambiar: (c: ConfigCanchas) => void }) {
  const [limite, setLimite] = useState(POR_PAGINA);
  const { datos, cargando, error } = useCargar(async () => {
    const { data, error } = await supabase()
      .from('catalog')
      .select('id, name, price, duration_minutes, familia, schedule_slots, is_active')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(error.message);
    type Fila = { id: string; name: string; price: number | null; duration_minutes: number | null; familia: string | null; schedule_slots: string | null; is_active: number | null };
    return ((data ?? []) as Fila[])
      // Lo que va por grupos (clases) no es una cancha.
      .filter((k) => k.is_active !== 0 && !conFranjas(k.schedule_slots))
      .map((k) => ({ id: k.id, nombre: k.name, precio: k.price === null ? null : Number(k.price), duracion: k.duration_minutes, familia: (k.familia ?? '').trim() }));
  }, [companyId]);
  const items = datos ?? [];
  const noche = valor.noche ?? {};

  const ponerNoche = (id: string, texto: string) => {
    const resto = { ...noche };
    const n = Number(texto.replace(',', '.'));
    if (texto.trim() === '' || !Number.isFinite(n) || n < 0) delete resto[id];
    else resto[id] = n;
    alCambiar({ ...valor, noche: resto });
  };

  return (
    <>
      <small className="muted">
        Tus clientes ven una tabla del día con cada cancha en una columna, las horas en filas y el precio en cada casilla.
        Cada cancha es un servicio de tu <Link href="/panel/catalogo">Catálogo</Link> con su precio de día y su duración (por ejemplo, «Cancha 1», 60 min, S/ 135).
        Pon el tipo («Fútbol 7», «Vóley») en la familia para que puedan filtrar.
      </small>
      <div className="tp-panel-canchas-noche">
        <label className="tp-panel-campo">
          <span>Precio de noche desde</span>
          <input className="input" type="time" step={1800} value={valor.desde ?? '18:00'} onChange={(e) => alCambiar({ ...valor, desde: e.target.value })} />
        </label>
        <label className="tp-panel-check">
          <input type="checkbox" checked={Boolean(valor.finde)} onChange={(e) => alCambiar({ ...valor, finde: e.target.checked })} />
          <span><b>Sábado y domingo, todo el día a precio de noche</b></span>
        </label>
      </div>
      <div className="tp-panel-campo">
        <span>Precio de noche de cada cancha <small className="muted">(vacío = el mismo de día)</small></span>
        {cargando && !datos && <small className="muted">Cargando tu catálogo…</small>}
        {error && <small className="tp-panel-mal">No se pudo cargar tu catálogo.</small>}
        {datos && items.length === 0 && <small className="muted">Aún no tienes canchas. Agrégalas en <Link href="/panel/catalogo">Catálogo</Link>.</small>}
        <div className="tp-panel-reserva">
          {items.slice(0, limite).map((k) => (
            <div key={k.id} className="tp-panel-reserva__fila tp-panel-canchas-fila">
              <span>{k.nombre}{k.familia && <small className="muted"> · {k.familia}</small>}</span>
              <small className="muted">Día {soles(k.precio)}{k.duracion ? ` · ${k.duracion} min` : ''}</small>
              <label className="tp-panel-canchas-precio">
                <span className="sr-only">Precio de noche de {k.nombre}</span>
                <span aria-hidden="true">S/</span>
                <input className="input" inputMode="decimal" placeholder="Noche" defaultValue={noche[k.id] ?? ''} onChange={(e) => ponerNoche(k.id, e.target.value)} />
              </label>
            </div>
          ))}
        </div>
        {items.length > limite && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLimite((n) => n + POR_PAGINA * 4)}>Ver más ({items.length - limite})</button>
        )}
      </div>
      <label className="tp-panel-campo">
        <span>Si piden adelanto, cuánto se guarda la cancha sin pagar</span>
        <select className="input" value={plazoDe(valor)} onChange={(e) => alCambiar({ ...valor, plazo: Number(e.target.value) })}>
          {PLAZOS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos` : m < 1440 ? `${m / 60} ${m === 60 ? 'hora' : 'horas'}` : '24 horas'}</option>)}
        </select>
        <small className="muted">Con «Requerir pago para confirmar» encendido en Configuración. Pasado ese tiempo sin pagar, la cancha se vuelve a ofrecer.</small>
      </label>
      <small className="muted">
        ¿Cierras pasada la medianoche? En tu horario pon la hora de cierre tal cual (por ejemplo, de 18:00 a 01:00): cuenta como el mismo día.
      </small>
    </>
  );
}

const conFranjas = (raw: string | null) => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
};
