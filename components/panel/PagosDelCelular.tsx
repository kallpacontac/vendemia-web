'use client';

/**
 * «Pagos del celular de cobros» en Caja › Cierre del día (lector 0001/0002). Alvaro, 24-nov: si el
 * emparejamiento es seguro no se pone nada en ningún lado; lo que haya que revisar va en UN sitio,
 * con toda la información, dentro de lo que ya existe: el cierre del día, donde se cuadra.
 *
 *   · Plegada: una línea con cuántos llegaron, el total y cuántos se asignaron solos.
 *   · Si alguno quedó por asignar (raro), sale arriba, abierto, con sus citas posibles.
 *   · Abierta, para CORROBORAR (piloto): el cuadre por app (Yape, Plin, Sip, banco) para compararlo con
 *     los movimientos de cada app, los avisos que no se pudieron leer, cada pago con su cita y POR QUÉ
 *     se asignó («por orden» en ámbar: cuál Yape fue de cuál cliente es una suposición), y «Copiar
 *     cuadre» para pegarlo en WhatsApp o Excel.
 *   · Tocar un pago enseña el detalle y «No era de esta cita».
 * Dueño y administrador. Sin celular conectado ni pagos ese día, no sale.
 */
import { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { hora12, soles } from '@/lib/panel/format';
import './lector-de-pagos.css';
import './yape-por-asignar.css';

export interface PagoLeido {
  id: number;
  centimos: number | null;
  nombre: string;
  origen: string;
  cuando: string;
  cita_id?: string | null;
  cliente?: string | null;
  servicio?: string | null;
  slot?: string | null;
  resultado?: string | null;
  asignado?: string | null;
  motivo?: string | null;
  por_asignar?: boolean;
  /** lector 0003: el barbero que lo eligió al cobrar, lo que sobró y cómo quedó la foto. */
  quien?: string | null;
  sobra?: number | null;
  foto_ok?: string | null;
  foto_url?: string | null;
}
export interface Opcion { cita_id: string; cliente: string; servicio: string; slot: string; falta: number; exacto: boolean }
/** Un cobro con evidencia (foto del barbero o captura de la página) que todavía no tiene su Yape. */
export interface Esperando { tipo: 'ticket' | 'captura'; cita_id: string; cliente: string; servicio: string; slot: string; monto: number | null; hora: string; url: string }
export interface PorAsignar { id: number; centimos: number; nombre: string; origen: string; cuando: string; opciones: Opcion[] }

const RESULTADO: Record<string, string> = {
  cobrada: 'cobrada', confirmada: 'reserva confirmada', a_cuenta: 'a cuenta', parcial: 'a cuenta', cotejado: 'comprobante cotejado',
};
/** Por qué se asignó (lector 0002, columna motivo). */
const MOTIVO: Record<string, string> = {
  unico: 'única cita con ese monto',
  aviso: 'el cliente avisó que pagó',
  foto: 'el barbero subió el comprobante',
  nombre: 'por el nombre',
  orden: 'por orden: compruébalo',
  partes: 'pago en partes, por el nombre',
  elegido: 'lo elegiste tú',
  barbero: 'lo eligió el barbero al cobrar',
};
/** Lo que hay que mirar de un Yape que eligió el barbero (lector 0003). '' = nada. */
export function ojoDelBarbero(a: PagoLeido): string {
  if (a.motivo !== 'barbero') return '';
  const partes: string[] = [];
  if (a.foto_ok === 'sin_foto') partes.push('sin foto');
  else if (a.foto_ok === 'sin_leer') partes.push('la foto no se pudo leer');
  else if (a.foto_ok === 'revisar') partes.push('la foto parece editada');
  if (Number(a.sobra ?? 0) > 0) partes.push(`${soles(Number(a.sobra))} de más`);
  return partes.length ? `${partes.join(' · ')}: compruébalo` : '';
}
const porQue = (a: PagoLeido) =>
  a.motivo === 'barbero' && a.quien ? `lo eligió ${a.quien} al cobrar` : MOTIVO[a.motivo ?? ''] ?? '';
// «7:49 pm», como el resto del panel (el «p. m.» del navegador se parte en dos líneas en el celular).
const horaLima = (iso: string) =>
  hora12(new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }));
const diaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const bonito = (s: string) => s.trim().toLowerCase().replace(/\b\p{L}/gu, (l) => l.toUpperCase());

export default function PagosDelCelular({ companyId, dia, recarga }: { companyId: string; dia: string; recarga?: unknown }) {
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(0);
  const { datos, releer } = useCargar(async () => {
    const desde = new Date(`${dia}T00:00:00-05:00`).toISOString();
    const [estado, dudas, esperando] = await Promise.all([
      supabase().rpc('lector_estado', { p_company: companyId, p_desde: desde }),
      supabase().rpc('lector_por_asignar', { p_company: companyId }),
      supabase().rpc('lector_esperando', { p_company: companyId, p_dia: dia }),
    ]);
    if (estado.error) return null;
    const e = estado.data as { dispositivos: unknown[]; avisos: PagoLeido[] };
    const delDia = e.avisos.filter((a) => diaLima(a.cuando) === dia);
    return {
      conectado: e.dispositivos.length > 0,
      pagos: delDia.filter((a) => a.centimos !== null),
      sinLeer: delDia.filter((a) => a.centimos === null).length,
      dudas: ((dudas.data ?? []) as PorAsignar[]).filter((d) => diaLima(d.cuando) === dia),
      esperando: (esperando.data ?? []) as Esperando[],
    };
  }, [companyId, dia, recarga]);
  // Sin celular conectado no se vuelve a preguntar (The 24/7 y todo negocio sin lector: ni una consulta de más).
  useSondeo(releer, 30_000, !!datos?.conectado);

  if (!datos || (!datos.conectado && !datos.pagos.length)) return null;

  async function asignar(p: PorAsignar, o: Opcion) {
    setOcupado(p.id);
    const { error } = await supabase().rpc('lector_asignar', { p_company: companyId, p_aviso: p.id, p_cita: o.cita_id });
    setOcupado(0);
    if (error) return avisar(error.message, 'error');
    avisar(`Listo: ${soles(p.centimos / 100)} a la cita de ${o.cliente || 'ese cliente'}.`, 'ok');
    releer();
  }

  async function quitar(a: PagoLeido) {
    if (!window.confirm(`¿Quitar este pago de la cita de ${a.cliente || 'ese cliente'}? La cita vuelve a quedar por cobrar.`)) return;
    const { error } = await supabase().rpc('lector_desasignar', { p_company: companyId, p_aviso: a.id });
    if (error) return avisar(error.message, 'error');
    avisar('Listo: la cita vuelve a quedar por cobrar.', 'ok');
    releer();
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      avisar('Cuadre copiado: pégalo en WhatsApp o Excel.', 'ok');
    } catch {
      avisar('No se pudo copiar en este navegador.', 'error');
    }
  }

  return (
    <PagosDelCelularVista dia={dia} pagos={datos.pagos} sinLeer={datos.sinLeer} dudas={datos.dudas} esperando={datos.esperando} ocupado={ocupado}
      alAsignar={asignar} alQuitar={quitar} alCopiar={copiar} />
  );
}

/** El texto de «Copiar cuadre»: una línea por pago, separada por tabuladores (se pega bien en Excel). */
export function textoCuadre(dia: string, pagos: PagoLeido[]): string {
  const filas = [...pagos].reverse().map((a) => [
    horaLima(a.cuando), a.origen, bonito(a.nombre) || 'Sin nombre', ((a.centimos ?? 0) / 100).toFixed(2),
    a.cita_id ? a.cliente || 'cita' : a.por_asignar ? 'POR ASIGNAR' : 'sin cita',
    a.cita_id ? RESULTADO[a.resultado ?? ''] ?? 'asignado' : '',
    a.cita_id ? [porQue(a), ojoDelBarbero(a)].filter(Boolean).join(' · ') : '',
  ].join('\t'));
  return [`Pagos del celular de cobros · ${dia}`, ['Hora', 'App', 'Pagó', 'Monto', 'Cita', 'Quedó', 'Por qué'].join('\t'), ...filas].join('\n');
}

/** La sección sin la base (también la usa la vista previa de /dev). */
export function PagosDelCelularVista({ dia, pagos, sinLeer = 0, dudas, esperando = [], ocupado = 0, alAsignar, alQuitar, alCopiar }: {
  dia: string; pagos: PagoLeido[]; sinLeer?: number; dudas: PorAsignar[]; esperando?: Esperando[]; ocupado?: number;
  alAsignar: (p: PorAsignar, o: Opcion) => void; alQuitar: (a: PagoLeido) => void; alCopiar: (texto: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);
  const total = pagos.reduce((t, a) => t + (a.centimos ?? 0), 0) / 100;
  const solos = pagos.filter((a) => a.cita_id && a.asignado === 'auto').length;
  const sinCita = pagos.filter((a) => !a.cita_id && !a.por_asignar).length;
  const porOrden = pagos.filter((a) => a.cita_id && a.motivo === 'orden').length;
  const delBarbero = pagos.filter((a) => a.cita_id && ojoDelBarbero(a)).length;
  // El cuadre por app: lo que hay que ver igual en los movimientos de Yape, Plin, Sip o el banco.
  const porApp = Object.entries(pagos.reduce<Record<string, { n: number; total: number }>>((m, a) => {
    const k = a.origen || 'Otro';
    m[k] = { n: (m[k]?.n ?? 0) + 1, total: (m[k]?.total ?? 0) + (a.centimos ?? 0) / 100 };
    return m;
  }, {}));

  return (
    <section className="card ldp ldp-caja" aria-label="Pagos del celular de cobros">
      <button type="button" className="ldp-caja__cab" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
        <span>
          <b>Pagos del celular de cobros</b>
          <small className="muted">
            {pagos.length
              ? `${pagos.length} ${pagos.length === 1 ? 'pago' : 'pagos'} · ${soles(total)}${solos ? ` · ${solos} ${solos === 1 ? 'asignado solo' : 'asignados solos'}` : ''}${sinCita ? ` · ${sinCita} sin cita` : ''}`
              : 'Ninguno este día'}
          </small>
          {porOrden > 0 && <small className="ldp-ambar">{porOrden === 1 ? '1 asignado por orden: compruébalo' : `${porOrden} asignados por orden: compruébalos`}</small>}
          {delBarbero > 0 && <small className="ldp-ambar">{delBarbero === 1 ? '1 Yape elegido por el barbero: compruébalo' : `${delBarbero} Yapes elegidos por el barbero: compruébalos`}</small>}
          {esperando.length > 0 && <small className="ldp-ambar">{esperando.length === 1 ? '1 cobro esperando su Yape' : `${esperando.length} cobros esperando su Yape`}</small>}
        </span>
        <ChevronDown size={18} aria-hidden="true" style={{ transform: abierta ? 'rotate(180deg)' : undefined, flex: 'none' }} />
      </button>

      {/* Lo único que pide una decisión: siempre a la vista, aunque la sección esté plegada. */}
      {dudas.map((p) => (
        <article key={p.id} className="ypa ypa--en-caja">
          <p className="ypa__pago">
            <b>¿De qué cita es?</b> {soles(p.centimos / 100)} de {bonito(p.nombre) || 'alguien sin nombre'} · {horaLima(p.cuando)}
          </p>
          <div className="ypa__opciones">
            {p.opciones.map((o) => (
              <button key={o.cita_id} type="button" className="ypa__opcion" disabled={ocupado === p.id} onClick={() => alAsignar(p, o)}>
                <b>{o.cliente || 'Cliente'}</b>
                <span>{o.servicio} · {hora12(o.slot.slice(11, 16))}{!o.exacto ? ` · le faltan ${soles(o.falta)}` : ''}</span>
              </button>
            ))}
          </div>
        </article>
      ))}

      {abierta && (
        <div className="ldp-cuadre">
          <div className="ldp-cuadre__apps">
            {porApp.map(([app, v]) => (
              <span key={app}><b>{app}</b> {v.n} · {soles(v.total)}</span>
            ))}
          </div>
          <small className="muted">Compáralo con los movimientos de este día en cada app.</small>
          {sinLeer > 0 && (
            <small className="ldp-ambar">
              {sinLeer === 1 ? '1 aviso llegó y no se pudo leer: míralo' : `${sinLeer} avisos llegaron y no se pudieron leer: míralos`} en el celular de cobros.
            </small>
          )}
          {pagos.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm ldp-cuadre__copiar" onClick={() => alCopiar(textoCuadre(dia, pagos))}>
              <Copy size={14} aria-hidden="true" /> Copiar cuadre
            </button>
          )}
        </div>
      )}

      {/* Cobros con evidencia que aún no tienen su Yape: se emparejan solos en cuanto llega. */}
      {abierta && esperando.length > 0 && (
        <div className="ldp-esperando">
          <small className="muted">Esperando su Yape · se emparejan solos al llegar</small>
          <ul className="ldp-lista">
            {esperando.map((x) => (
              <li key={`${x.tipo}-${x.cita_id}`}>
                <div className="ldp-fila">
                  <span className="ldp-hora">{horaLima(x.hora)}</span>
                  <span className="ldp-quien">
                    <b>{x.cliente || 'Cliente'}</b>
                    <small>
                      {x.servicio} · {x.tipo === 'ticket' ? 'foto del barbero' : 'captura de la página'}
                      {x.url && <> · <a href={x.url} target="_blank" rel="noopener">ver</a></>}
                    </small>
                  </span>
                  <span className="ldp-monto">{x.monto !== null ? soles(Number(x.monto)) : '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {abierta && pagos.length > 0 && (
        <ul className="ldp-lista">
          {pagos.map((a) => {
            const destino = a.cita_id
              ? `${a.cliente || 'Una cita'} · ${RESULTADO[a.resultado ?? ''] ?? 'asignado'}`
              : a.por_asignar ? 'Elige su cita arriba' : 'Sin cita · venta suelta';
            const ordenado = !!a.cita_id && a.motivo === 'orden';
            const ojo = a.cita_id ? ojoDelBarbero(a) : '';
            return (
              <li key={a.id}>
                <button type="button" className="ldp-fila" disabled={!a.cita_id} aria-expanded={a.cita_id ? detalle === a.id : undefined}
                  onClick={() => setDetalle((x) => (x === a.id ? null : a.id))}>
                  <span className="ldp-hora">{horaLima(a.cuando)}</span>
                  <span className="ldp-quien">
                    <b>{bonito(a.nombre) || 'Sin nombre'}</b>
                    <small>{a.cita_id && <Check size={12} aria-hidden="true" />} {a.origen} · {destino}</small>
                    {ordenado && <small className="ldp-ambar">Por orden: compruébalo</small>}
                    {a.cita_id && a.motivo === 'barbero' && (
                      <small className={ojo ? 'ldp-ambar' : undefined}>Lo eligió {a.quien || 'el barbero'}{ojo ? ` · ${ojo}` : ''}</small>
                    )}
                  </span>
                  <span className="ldp-monto">{soles((a.centimos ?? 0) / 100)}</span>
                </button>
                {detalle === a.id && a.cita_id && (
                  <div className="ldp-detalle">
                    <span>
                      {a.servicio}{a.slot ? ` · ${hora12(a.slot.slice(11, 16))}` : ''} · {porQue(a) || (a.asignado === 'auto' ? 'asignado solo' : 'lo asignaste tú')}
                      {a.foto_url && <> · <a href={a.foto_url} target="_blank" rel="noopener">ver foto</a></>}
                    </span>
                    <button type="button" className="ldp-quitar" onClick={() => alQuitar(a)}>No era de esta cita</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
