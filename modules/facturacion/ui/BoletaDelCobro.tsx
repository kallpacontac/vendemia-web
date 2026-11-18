'use client';
/**
 * La boleta de un cobro hecho en Caja («Cobrar ticket», «Listos para cobrar»).
 *
 * Según Ajustes › Boletas y facturas › «Al cobrar» (sql/0003):
 *   automatico → sale sola, sin documento, hasta S/700. Más, o con DNI: el botón.
 *   preguntar  → botón «Emitir boleta», con el detalle del cobro ya puesto.
 *   no         → no se pinta nada (tampoco si están apagadas o quien cobra no es dueño/admin).
 *
 * La clave sale del cobro (claveDeCobro): si se emite dos veces, Postgres devuelve la misma
 * boleta en vez de otro número. Hecha, salen los botones de siempre (CompartirBoleta).
 */
import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { ComprobanteGuardado } from '../dominio/tipos';
import { TOPE_BOLETA_SIN_DOCUMENTO } from '../dominio/validar';
import { ajustesParaCobro, claveDeCobro, emitir, type Ajustes } from './api';
import CompartirBoleta from './CompartirBoleta';
import { EstadoPill } from './EstadoPill';
import NuevoComprobante from './NuevoComprobante';
import '../estilos/facturacion.css';

export interface LineaCobro {
  descripcion: string;
  cantidad: number;
  /** Con IGV, como en la carta. */
  precio: number;
  /** Producto (bien) o servicio: decide la unidad y, en la Amazonía, la leyenda. */
  producto?: boolean;
}

export default function BoletaDelCobro({
  companyId,
  refCobro,
  lineas,
  telefono,
  servicios = true,
  abrir = false,
}: {
  companyId: string;
  /** De dónde sale: { tipo: 'cita', id }. Es también la clave de la boleta. */
  refCobro: { tipo: string; id: string };
  lineas: LineaCobro[];
  telefono?: string;
  /** Negocio de servicios (citas): unidad ZZ. Una tienda: NIU. */
  servicios?: boolean;
  /** Ya se eligió «Boleta electrónica» (ComprobanteDelCobro): el formulario se abre solo. */
  abrir?: boolean;
}) {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [hecha, setHecha] = useState<ComprobanteGuardado | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState(abrir);
  const intentada = useRef('');

  const total = lineas.reduce((t, l) => t + l.cantidad * l.precio, 0);
  const validas = lineas.filter((l) => l.descripcion.trim() && l.cantidad > 0 && l.precio > 0);

  useEffect(() => {
    let vivo = true;
    ajustesParaCobro(companyId).then((a) => vivo && setAjustes(a));
    return () => {
      vivo = false;
    };
  }, [companyId]);

  // Nuevo cobro, nueva boleta.
  useEffect(() => {
    setHecha(null);
    setError('');
  }, [refCobro.id]);

  const auto = ajustes?.al_cobrar === 'automatico' && total > 0 && total <= TOPE_BOLETA_SIN_DOCUMENTO;

  useEffect(() => {
    if (!ajustes || !auto || !validas.length || intentada.current === refCobro.id) return;
    intentada.current = refCobro.id;
    const conProducto = validas.some((l) => l.producto);
    const conServicio = validas.some((l) => !l.producto);
    setEmitiendo(true);
    emitir({
      companyId,
      clave: claveDeCobro(refCobro.tipo, refCobro.id),
      tipo: 'boleta',
      cliente: { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' },
      lineas: validas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio: l.precio,
        unidad: l.producto ? 'NIU' : servicios ? 'ZZ' : 'NIU',
      })),
      leyendas: [...(conProducto ? (['2001'] as const) : []), ...(conServicio ? (['2002'] as const) : [])],
      ref: refCobro,
    })
      .then(setHecha)
      .catch((e: Error) => setError(e.message))
      .finally(() => setEmitiendo(false));
  }, [ajustes, auto, refCobro, companyId, servicios, validas]);

  if (!ajustes || !validas.length) return null;

  return (
    <div className="fe-cobro" role="status">
      {hecha ? (
        <>
          <span className="fe-cobro__que">
            <FileText size={14} /> Boleta <b>{hecha.serie}-{hecha.numero}</b> <EstadoPill estado={hecha.estado} />
          </span>
          <span className="fe-cobro__acciones">
            <CompartirBoleta c={hecha} ancho={ajustes.ticket_ancho} telefono={telefono} alError={setError} />
          </span>
          {hecha.estado === 'error' || hecha.estado === 'rechazado' ? (
            <small className="fe-cobro__error">{hecha.mensaje || 'No salió. Revísala en Boletas y facturas.'}</small>
          ) : null}
        </>
      ) : emitiendo ? (
        <span className="fe-cobro__que">
          <Loader2 size={14} className="fe-girar" /> Emitiendo la boleta…
        </span>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierta(true)}>
          <FileText size={14} /> Emitir boleta
        </button>
      )}
      {error && <small className="fe-cobro__error">{error}</small>}

      {abierta && (
        <NuevoComprobante
          companyId={companyId}
          ajustes={ajustes}
          unidad={servicios ? 'ZZ' : 'NIU'}
          prellenado={{
            tipo: 'boleta',
            lineas: validas,
            clave: claveDeCobro(refCobro.tipo, refCobro.id),
            telefono,
            ref: refCobro,
          }}
          alCerrar={() => setAbierta(false)}
          alEmitir={(c) => {
            setHecha(c);
            setError('');
          }}
        />
      )}
    </div>
  );
}
