'use client';

/**
 * El tablero del día con los datos reales del negocio (ver lib/panel/tablero-canchas.ts).
 * Cobrar, mover o cancelar sigue en las pestañas de siempre: aquí se abre la reserva
 * y se lleva allí, para no tener dos sitios que hagan lo mismo.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { armarTablero, type CanchaTablero, type EstadoCobro, type ReservaTablero } from '@/lib/panel/tablero-canchas';
import { useCargar } from '@/components/panel/useCargar';
import TableroCanchasVista from '@/components/panel/TableroCanchasVista';
import ValidarPago from '@/components/panel/ValidarPago';
import { supabase } from '@/lib/supabase/client';
import { getCitasDelPeriodo, getPagosDeCitas, getServiciosDeCitas, type ItemCatalogo, type Lead } from '@/lib/supabase/queries';
import type { Horario } from '@/lib/supabase/types';
import { sumarDias, sumarMin } from '@/modules/tu-pagina/dominio/agenda';
import { hoyLima } from '@/modules/tu-pagina/dominio/envio';
import type { ConfigCanchas } from '@/modules/tu-pagina/dominio/canchas';

const ahoraEnLima = () =>
  new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima', hour12: false }).slice(0, 16);

const conFranjas = (raw: string | null) => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) && v.length > 0;
  } catch {
    return false;
  }
};

export default function TableroCanchas({ companyId, catalogo, leads, horario, paso, recarga, alLibre, alGestionar }: {
  companyId: string;
  catalogo: ItemCatalogo[];
  leads: Lead[];
  horario: Horario;
  paso: number;
  /** Cambia cuando la agenda recarga: una reserva nueva tiene que salir aquí también. */
  recarga: unknown;
  alLibre: (cancha: string, inicio: string) => void;
  alGestionar: (pasada: boolean) => void;
}) {
  const hoy = hoyLima();
  const [fecha, setFecha] = useState(hoy);

  const canchas = useMemo((): CanchaTablero[] => catalogo
    .filter((k) => k.activo && k.tipo !== 'producto' && !conFranjas(k.schedule_slots))
    .map((k) => ({ id: k.id, nombre: k.name, familia: ((k as ItemCatalogo & { familia?: string | null }).familia ?? '').trim(), precio: k.price === null ? null : Number(k.price) })), [catalogo]);

  const { datos, cargando, error, recargar } = useCargar(async () => {
    // Hasta el día siguiente: un horario que cierra a la 01:00 sigue en sus filas de madrugada.
    const citas = (await getCitasDelPeriodo(companyId, fecha, sumarDias(fecha, 1))).filter((c) => c.status !== 'cancelled');
    const [lineas, pagos, pagina] = await Promise.all([
      getServiciosDeCitas(citas.map((c) => c.id)),
      getPagosDeCitas(companyId, citas).catch(() => null),
      supabase().from('tu_pagina').select('secciones').eq('company_id', companyId).maybeSingle(),
    ]);
    const cfg = ((pagina.data as { secciones?: { canchas?: ConfigCanchas } } | null)?.secciones?.canchas ?? {}) as ConfigCanchas;
    return { citas, lineas, pagos, cfg };
  }, [companyId, fecha, recarga]);

  const tablero = useMemo(() => {
    const clientes = new Map(leads.map((l) => [l.id, l] as const));
    const ids = new Set(canchas.map((c) => c.id));
    const reservas: ReservaTablero[] = [];
    for (const c of datos?.citas ?? []) {
      const suyas = (datos?.lineas ?? []).filter((l) => l.appointment_id === c.id);
      // Las reservas antiguas pueden no llevar el id en su línea: entonces, por el nombre.
      const cancha = suyas.find((l) => l.catalog_item_id && ids.has(l.catalog_item_id))?.catalog_item_id
        ?? canchas.find((k) => k.nombre === c.service)?.id;
      if (!cancha) continue;
      const total = suyas.reduce((s, l) => s + Number(l.price ?? 0), 0);
      const pagado = c.pagado_por ? total : datos?.pagos?.get(c.id)?.pagado ?? 0;
      const estado: EstadoCobro = c.status === 'no_show' ? 'no_vino'
        : c.pagado_por || (total > 0 && pagado >= total) ? 'cobrada'
        : c.status === 'pending_payment' ? 'esperando_pago'
        : pagado > 0 ? 'a_cuenta' : 'por_cobrar';
      const lead = clientes.get(c.lead_id);
      const inicio = c.slot_start.slice(0, 16);
      reservas.push({
        id: c.id,
        cancha,
        cliente: lead?.name || lead?.phone || 'Cliente',
        telefono: lead?.phone,
        inicio,
        fin: (c.slot_end || sumarMin(inicio, c.slot_minutes || paso)).slice(0, 16),
        total,
        pagado,
        estado,
        apartadaDesde: c.status === 'pending_payment' && c.created_at ? c.created_at : undefined,
      });
    }
    return armarTablero({ canchas, reservas, horario, paso, fecha, ahora: ahoraEnLima(), cfg: datos?.cfg ?? {} });
  }, [datos, canchas, leads, horario, paso, fecha]);

  if (error && !datos) return <p className="tc__vacio">No se pudieron cargar las reservas de este día. Vuelve a intentarlo.</p>;

  return (
    <TableroCanchasVista
      tablero={tablero}
      fecha={fecha}
      hoy={hoy}
      alFecha={setFecha}
      alLibre={alLibre}
      alRefrescar={() => recargar()}
      cargando={cargando}
      enlaceCaja={<Link href="/panel/caja">Ver Caja</Link>}
      acciones={(r, cerrar) => (
        <>
          <ValidarPago companyId={companyId} reserva={r} adelanto={Number(datos?.cfg.adelanto) || 0} alValidar={() => { cerrar(); recargar(); }} />
          <button type="button" className="tc__accion tc__accion--suave" onClick={() => { cerrar(); alGestionar(r.fin <= ahoraEnLima()); }}>
            Mover, cancelar o ver detalle
          </button>
          {r.telefono && <a className="tc__accion tc__accion--suave" href={`https://wa.me/${r.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener">Escribirle por WhatsApp</a>}
        </>
      )}
    />
  );
}
