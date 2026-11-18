'use client';
/**
 * Emitir una boleta o una factura. Los precios se escriben CON IGV, como los
 * conoce el negocio; el IGV se separa solo (dominio/montos.ts, el mismo cálculo
 * que usa el servidor).
 *
 * La «clave» se genera al abrir: si el botón se pulsa dos veces o la red corta
 * y se reintenta, Postgres devuelve el mismo comprobante en vez de otro número.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Plus, Trash2, XCircle } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { getCatalogo } from '@/lib/supabase/queries';
import { calcular, leyendasDe } from '../dominio/montos';
import { erroresCliente, erroresLineas, soloDigitos, TOPE_BOLETA_SIN_DOCUMENTO } from '../dominio/validar';
import type { ComprobanteGuardado, RegimenIgv, TipoComprobante, TipoDocCliente } from '../dominio/tipos';
import { emitir, nuevaClave, soles2 as soles, tasaTexto, type Ajustes } from './api';
import CompartirBoleta from './CompartirBoleta';
import { EstadoPill } from './EstadoPill';

interface LineaForm {
  descripcion: string;
  cantidad: string;
  precio: string;
}

export interface Prellenado {
  tipo?: TipoComprobante;
  concepto?: string;
  monto?: number;
  ref?: { tipo: string; id: string };
  /** Desde Caja: el detalle del cobro, línea por línea. */
  lineas?: { descripcion: string; cantidad: number; precio: number }[];
  /** Desde Caja: la del cobro (claveDeCobro), para no sacar dos boletas del mismo. */
  clave?: string;
  /** Desde Caja: el celular del cliente, para mandarle la boleta a su WhatsApp. */
  telefono?: string;
}

const num = (s: string) => Number(String(s).replace(',', '.'));

/** Con la leyenda «ambas» (Amazonía): qué se vendió en ESTE comprobante. */
type Vendido = 'servicio' | 'producto' | 'los_dos';
const LEYENDAS_DE: Record<Vendido, ('2001' | '2002')[]> = {
  servicio: ['2002'],
  producto: ['2001'],
  los_dos: ['2001', '2002'],
};

export default function NuevoComprobante({
  companyId,
  ajustes,
  unidad,
  prellenado,
  alCerrar,
  alEmitir,
}: {
  companyId: string;
  ajustes: Ajustes;
  /** ZZ en negocios de servicios (citas), NIU en tiendas y restaurantes. */
  unidad: 'NIU' | 'ZZ';
  prellenado?: Prellenado;
  alCerrar: () => void;
  alEmitir: (c: ComprobanteGuardado) => void;
}) {
  const [clave] = useState(() => prellenado?.clave ?? nuevaClave());
  const [tipo, setTipo] = useState<TipoComprobante>(prellenado?.tipo ?? 'boleta');
  const [tipoDoc, setTipoDoc] = useState<TipoDocCliente>(prellenado?.tipo === 'factura' ? 'ruc' : 'sin_documento');
  const [numDoc, setNumDoc] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>(() =>
    prellenado?.lineas?.length
      ? prellenado.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: String(l.cantidad), precio: String(l.precio) }))
      : [{ descripcion: prellenado?.concepto ?? '', cantidad: '1', precio: prellenado?.monto ? String(prellenado.monto) : '' }],
  );
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<ComprobanteGuardado | null>(null);
  /** null = lo que digan las líneas (catálogo); se fija en cuanto la persona elige. */
  const [vendidoElegido, setVendidoElegido] = useState<Vendido | null>(null);

  const { datos: catalogo } = useCargar(() => getCatalogo(companyId).catch(() => []), [companyId]);
  const precios = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of catalogo ?? []) if (c.activo && c.price) m.set(c.name, Number(c.price));
    return m;
  }, [catalogo]);
  const esProducto = useMemo(() => {
    const m = new Map<string, boolean>();
    // Sin tipo, vale lo del negocio: servicio en uno de citas (ZZ), producto en una tienda.
    for (const c of catalogo ?? []) m.set(c.name, c.tipo ? c.tipo === 'producto' : unidad === 'NIU');
    return m;
  }, [catalogo, unidad]);

  const regimen: RegimenIgv = {
    tipo: ajustes.igv_tipo === 'exonerado' ? 'exonerado' : 'gravado',
    porcentaje: ajustes.igv_tasa_hoy,
    leyendaAmazonia: ajustes.igv_tipo === 'exonerado' ? ajustes.leyenda_amazonia : null,
  };
  const ambas = regimen.tipo === 'exonerado' && regimen.leyendaAmazonia === 'ambas';
  const vendidoSugerido: Vendido = (() => {
    const tipos = new Set(
      lineas.filter((l) => l.descripcion.trim()).map((l) => esProducto.get(l.descripcion) ?? unidad === 'NIU'),
    );
    return tipos.size === 2 ? 'los_dos' : tipos.has(true) ? 'producto' : 'servicio';
  })();
  const vendido = vendidoElegido ?? vendidoSugerido;
  const leyendas = leyendasDe(regimen, ambas ? LEYENDAS_DE[vendido] : []) as ('2001' | '2002')[];
  const entrada = lineas.map((l) => ({ descripcion: l.descripcion, cantidad: num(l.cantidad), precio: num(l.precio), unidad }));
  const { totales } = calcular(entrada.map((l) => ({ ...l, cantidad: l.cantidad || 0, precio: l.precio || 0 })), regimen);
  const cliente = { tipoDoc, numDoc: tipoDoc === 'ce' ? numDoc.trim() : soloDigitos(numDoc), nombre, direccion };
  const problemas = [...erroresLineas(entrada), ...erroresCliente(tipo, cliente, totales.total)];

  const cambiarTipo = (t: TipoComprobante) => {
    setTipo(t);
    if (t === 'factura') setTipoDoc('ruc');
    else if (tipoDoc === 'ruc' && !numDoc) setTipoDoc('sin_documento');
  };

  const ponerLinea = (i: number, cambio: Partial<LineaForm>) =>
    setLineas((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const nueva = { ...l, ...cambio };
        // Elegido del catálogo: trae su precio si la línea aún no tiene uno.
        if (cambio.descripcion !== undefined && !l.precio && precios.has(cambio.descripcion)) {
          nueva.precio = String(precios.get(cambio.descripcion));
        }
        return nueva;
      }),
    );

  async function enviar() {
    setIntentado(true);
    setError('');
    if (problemas.length) return;
    setEnviando(true);
    try {
      const c = await emitir({ companyId, clave, tipo, cliente, lineas: entrada, leyendas: ambas ? leyendas : undefined, ref: prellenado?.ref });
      setHecho(c);
      alEmitir(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={enviando ? undefined : alCerrar}>
      <div
        className="modal fe-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tipo === 'factura' ? 'Nueva factura' : 'Nueva boleta'}
      >
        <div className="modal__cab">
          <FileText size={18} />
          <b>{hecho ? `${hecho.serie}-${hecho.numero}` : tipo === 'factura' ? 'Nueva factura' : 'Nueva boleta'}</b>
          {ajustes.ambiente !== 'produccion' || ajustes.proveedor === 'simulado' ? (
            <span className="badge-pill fe-prueba">Pruebas</span>
          ) : null}
        </div>

        {hecho ? (
          <div className="modal__cuerpo fe-hecho">
            <div className={`fe-hecho__icono fe-hecho__icono--${hecho.estado}`}>
              {hecho.estado === 'aceptado' ? <CheckCircle2 size={40} /> : hecho.estado === 'pendiente' ? <FileText size={40} /> : <XCircle size={40} />}
            </div>
            <p>
              <EstadoPill estado={hecho.estado} /> <b>{soles(hecho.totales.total)}</b>
            </p>
            {hecho.mensaje && <p className="muted">{hecho.mensaje}</p>}
            {hecho.estado === 'pendiente' && (
              <p className="muted">SUNAT aún no contesta. Queda en la lista: pulsa «Consultar» en unos minutos.</p>
            )}
            {(hecho.estado === 'error' || hecho.estado === 'rechazado') && (
              <p className="muted">
                {hecho.estado === 'error'
                  ? 'No llegó a SUNAT. Corrige lo que diga arriba y pulsa «Reintentar» en la lista (mismo número).'
                  : 'SUNAT no lo aceptó: este número no vale. Emite uno nuevo con los datos corregidos.'}
              </p>
            )}
          </div>
        ) : (
          <div className="modal__cuerpo fe-form">
            <div className="filters" style={{ marginBottom: 12 }}>
              {(['boleta', 'factura'] as const).map((t) => (
                <div key={t} className={`fpill ${tipo === t ? 'active' : ''}`} onClick={() => cambiarTipo(t)}>
                  {t === 'boleta' ? 'Boleta' : 'Factura'}
                </div>
              ))}
            </div>

            <span className="field-label">Cliente</span>
            <div className="fe-cliente">
              <select
                className="select"
                value={tipoDoc}
                onChange={(e) => setTipoDoc(e.target.value as TipoDocCliente)}
                disabled={tipo === 'factura'}
                aria-label="Documento del cliente"
              >
                {tipo === 'boleta' && <option value="sin_documento">Sin documento</option>}
                {tipo === 'boleta' && <option value="dni">DNI</option>}
                <option value="ruc">RUC</option>
                {tipo === 'boleta' && <option value="ce">Carné de extranjería</option>}
              </select>
              {tipoDoc !== 'sin_documento' && (
                <input
                  className="input"
                  inputMode={tipoDoc === 'ce' ? 'text' : 'numeric'}
                  maxLength={tipoDoc === 'ruc' ? 11 : tipoDoc === 'dni' ? 8 : 12}
                  placeholder={tipoDoc === 'ruc' ? '11 dígitos' : tipoDoc === 'dni' ? '8 dígitos' : 'Número'}
                  value={numDoc}
                  onChange={(e) => setNumDoc(tipoDoc === 'ce' ? e.target.value : soloDigitos(e.target.value))}
                  aria-label="Número de documento"
                />
              )}
            </div>
            {tipoDoc !== 'sin_documento' && (
              <>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  placeholder={tipoDoc === 'ruc' ? 'Razón social' : 'Nombre y apellido'}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-label="Nombre del cliente"
                />
                {tipo === 'factura' && (
                  <input
                    className="input"
                    style={{ marginTop: 8 }}
                    placeholder="Dirección (opcional)"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    aria-label="Dirección del cliente"
                  />
                )}
              </>
            )}
            {tipo === 'boleta' && tipoDoc === 'sin_documento' && (
              <small className="muted">Hasta S/{TOPE_BOLETA_SIN_DOCUMENTO} la boleta puede ir sin documento.</small>
            )}

            <span className="field-label" style={{ marginTop: 14 }}>Detalle (precios con IGV)</span>
            <datalist id={`fe-catalogo-${clave}`}>
              {[...precios.keys()].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="fe-lineas">
              {lineas.map((l, i) => (
                <div className="fe-linea" key={i}>
                  <input
                    className="input fe-linea__desc"
                    list={`fe-catalogo-${clave}`}
                    placeholder="Descripción"
                    value={l.descripcion}
                    onChange={(e) => ponerLinea(i, { descripcion: e.target.value })}
                    aria-label={`Descripción de la línea ${i + 1}`}
                  />
                  <input
                    className="input fe-linea__cant"
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => ponerLinea(i, { cantidad: e.target.value })}
                    aria-label={`Cantidad de la línea ${i + 1}`}
                  />
                  <input
                    className="input fe-linea__precio"
                    inputMode="decimal"
                    placeholder="S/"
                    value={l.precio}
                    onChange={(e) => ponerLinea(i, { precio: e.target.value })}
                    aria-label={`Precio de la línea ${i + 1}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                    disabled={lineas.length === 1}
                    aria-label={`Quitar la línea ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLineas((ls) => [...ls, { descripcion: '', cantidad: '1', precio: '' }])}
            >
              <Plus size={14} /> Otra línea
            </button>

            {ambas && (
              <>
                <span className="field-label" style={{ marginTop: 14 }}>Qué vendiste (va como leyenda de la Amazonía)</span>
                <div className="filters">
                  {(
                    [
                      ['servicio', 'Servicio'],
                      ['producto', 'Producto'],
                      ['los_dos', 'Los dos'],
                    ] as const
                  ).map(([v, texto]) => (
                    <div key={v} className={`fpill ${vendido === v ? 'active' : ''}`} onClick={() => setVendidoElegido(v)}>
                      {texto}
                    </div>
                  ))}
                </div>
              </>
            )}

            <table className="fe-totales">
              <tbody>
                {regimen.tipo === 'gravado' ? (
                  <>
                    <tr><td>Op. gravada</td><td>{soles(totales.opGravadas)}</td></tr>
                    <tr><td>IGV {tasaTexto(regimen.porcentaje)} %</td><td>{soles(totales.igv)}</td></tr>
                  </>
                ) : (
                  <tr><td>Op. exonerada (Amazonía)</td><td>{soles(totales.opExoneradas)}</td></tr>
                )}
                <tr className="fe-totales__total"><td>Total</td><td>{soles(totales.total)}</td></tr>
              </tbody>
            </table>

            {intentado && problemas.length > 0 && (
              <ul className="fe-problemas">
                {problemas.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        {error && <p className="fe-error">{error}</p>}

        <div className="modal__pie">
          {hecho ? (
            <>
              <CompartirBoleta c={hecho} ancho={ajustes.ticket_ancho} telefono={prellenado?.telefono} alError={setError} />
              <button className="btn btn-primary" onClick={alCerrar}>Listo</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={alCerrar} disabled={enviando}>Cancelar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando a SUNAT…' : `Emitir ${tipo === 'factura' ? 'factura' : 'boleta'} · ${soles(totales.total)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
