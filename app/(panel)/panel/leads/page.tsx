'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LEADS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ La intención y el estado se ENSEÑAN, no se editan.
 *
 * El panel de muestra traía dos desplegables para cambiarlos a mano. No hay
 * forma de hacerlo: la única escritura posible es insertar un comando, y el
 * catálogo de comandos del bot no tiene ninguno que toque un lead
 * (`update_company`, `upsert_catalog_item`, `send_message`, `toggle_bot`,
 * `handoff`, `resolve_escalation`, `add_member`…). Un `update` directo sobre
 * `leads` falla por los GRANT, y si algún día no fallara, el siguiente barrido
 * del espejo lo pisaría con lo que hay en el SQLite del bot.
 *
 * Y son campos que el bot mantiene solo: los deduce de la conversación. Si
 * hiciera falta corregirlos a mano, el camino es añadir un comando en el bot,
 * no un UPDATE aquí.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, MessageCircle, Search } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import ComboPanel from '@/components/panel/ComboPanel';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { getConversaciones } from '@/lib/supabase/queries';
import { colorDe, cuando, iniciales, intent, status, STATUS, telefono } from '@/lib/panel/format';
import { ESTADOS } from '@/lib/panel/retargeting';
import type { LeadIntent, LeadStatus } from '@/lib/supabase/types';

const POR_PAGINA = 8;

export default function Leads() {
  const { companyId } = useSesion();
  /**
   * getConversaciones y no getLeads: trae el último mensaje de cada lead, que
   * es la columna «Último mensaje» (antes leía `last_message`, que no existe en
   * Supabase, y salía siempre «—»). Se reordena por alta porque esta tabla es
   * el registro de leads, no la bandeja: su orden es el de siempre.
   */
  const { datos, cargando } = useCargar(
    async () =>
      companyId
        ? (await getConversaciones(companyId)).sort(
            (a, b) => (b.creado?.getTime() ?? 0) - (a.creado?.getTime() ?? 0),
          )
        : [],
    [companyId],
  );

  const [busqueda, setBusqueda] = useState('');
  const [fIntent, setFIntent] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [pagina, setPagina] = useState(1);

  const leads = useMemo(() => datos ?? [], [datos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return leads.filter((l) => {
      if (fIntent && l.intent !== fIntent) return false;
      if (fStatus && l.status !== fStatus) return false;
      if (q && !(l.name ?? '').toLowerCase().includes(q) && !l.phone.includes(q)) return false;
      return true;
    });
  }, [leads, busqueda, fIntent, fStatus]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = filtrados.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  const calientes = leads.filter((l) => l.intent === 'purchase_ready').length;
  // `customer` = cerró al menos una vez. Antes miraba `paid`, que ya no escribe
  // nadie: la tarjeta se había quedado en 0 para siempre.
  const convertidos = leads.filter((l) => l.status === 'customer').length;

  function exportarCsv() {
    /*
      Las claves de `custom_data` las inventa quien configura las preguntas, así
      que las columnas del CSV no se pueden fijar aquí: se sacan de los leads que
      se están exportando. Un lead sin esa clave deja la celda vacía.
    */
    const claves = [...new Set(filtrados.flatMap((l) => Object.keys(l.datos)))].sort();
    const filas = [
      ['Nombre', 'Telefono', 'Intencion', 'Estado', 'Ultimo mensaje', 'Alta', ...claves],
    ].concat(
      filtrados.map((l) => [
        l.name ?? '',
        l.phone,
        intent(l.intent).label,
        status(l.status).label,
        l.ultimoMensaje.replace(/[,\n]/g, ' '),
        l.creado ? l.creado.toISOString().slice(0, 10) : '',
        ...claves.map((k) => l.datos[k] ?? ''),
      ]),
    );
    const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    // El BOM es lo que hace que Excel en Windows no destroce las tildes.
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `leads-vendemia-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="main main--leads">
      <div className="wrap">
        <Topbar titulo="Leads" sub="Todos tus contactos de WhatsApp" accionesTitulo={
          <button type="button" className="btn btn-ghost leads-exportar" onClick={exportarCsv} disabled={!filtrados.length}>
            <Download size={16} /> Exportar
          </button>
        } />

        <div className="leads-herramientas">
          <div className="leads-pulsos" role="group" aria-label="Vistas rápidas de clientes">
            <button type="button" className={!fIntent && !fStatus ? 'active' : ''} aria-pressed={!fIntent && !fStatus}
              onClick={() => { setFIntent(''); setFStatus(''); setPagina(1); }}>Todos <b>{leads.length}</b></button>
            <button type="button" className={fIntent === 'purchase_ready' && !fStatus ? 'active' : ''} aria-pressed={fIntent === 'purchase_ready' && !fStatus}
              onClick={() => { setFIntent('purchase_ready'); setFStatus(''); setPagina(1); }}>Listos <b>{calientes}</b></button>
            <button type="button" className={fStatus === 'customer' && !fIntent ? 'active' : ''} aria-pressed={fStatus === 'customer' && !fIntent}
              onClick={() => { setFIntent(''); setFStatus('customer'); setPagina(1); }}>Clientes <b>{convertidos}</b></button>
          </div>
          <div className="leads-filtros">
            <div className="search">
              <Search size={16} />
              <input
                aria-label="Buscar contacto"
                placeholder="Buscar por nombre o teléfono…"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setPagina(1);
                }}
              />
            </div>
            {/* La intención la rellena el bot desde el 9-sep-2026, y solo hacia
                adelante: los leads anteriores no tienen, y ningún filtro de
                intención los va a sacar. */}
            <ComboPanel tipo="filtro" etiqueta="Filtrar intención" tituloMenu="Intención detectada por Mia"
              value={fIntent} alCambiar={(v) => { setFIntent(v); setPagina(1); }} opciones={[
                { value: '', label: 'Toda intención' },
                { value: 'purchase_ready', label: 'Listo p/ comprar' },
                { value: 'quote', label: 'Cotizando' },
                { value: 'inquiry', label: 'Consulta' },
                { value: 'support', label: 'Soporte' },
                { value: 'other', label: 'Otro' },
              ]} />
            <ComboPanel tipo="filtro" etiqueta="Filtrar estado" tituloMenu="Estado del cliente"
              value={fStatus} alCambiar={(v) => { setFStatus(v); setPagina(1); }} opciones={[
                { value: '', label: 'Todo estado' },
                ...ESTADOS.map((k) => ({ value: k, label: STATUS[k].label })),
              ]} />
          </div>
        </div>

        <div className="table-card">
          <table className="table table--tarjeta">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Teléfono</th>
                <th>Intención</th>
                <th>Estado</th>
                <th>Último mensaje</th>
                <th>Datos recogidos</th>
                <th>Alta</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="vacio">
                      <b>Sin resultados</b>
                      {leads.length === 0
                        ? 'Cuando alguien escriba al WhatsApp del negocio, aparecerá aquí.'
                        : 'Prueba con otro filtro.'}
                    </div>
                  </td>
                </tr>
              )}
              {visibles.map((l) => {
                const it = intent(l.intent as LeadIntent);
                const st = status(l.status as LeadStatus);
                return (
                  <tr key={l.id}>
                    {/* Las clases c-* solo cuentan en el teléfono, donde la
                        fila es una tarjeta compacta (panel.css, «tarjeta»). */}
                    <td data-label="Lead" className="c-quien">
                      <div className="cell-user">
                        <div className="ava-ini" style={{ background: colorDe(l.id) }}>
                          {iniciales(l.name, l.phone)}
                        </div>
                        <div>
                          <b>{l.name || 'Sin nombre'}</b>
                          <small>{l.enManual ? '🙋 modo manual' : '🤖 automático'}</small>
                        </div>
                      </div>
                    </td>
                    <td data-label="Teléfono" className="c-fila c-sutil">{telefono(l.phone)}</td>
                    <td data-label="Intención" className="c-pill">
                      <span className={`badge-pill ${it.cls}`}>{it.label}</span>
                    </td>
                    <td data-label="Estado" className="c-pill">
                      <span className="badge-pill" style={{ color: st.color, background: `${st.color}18` }}>
                        {st.label}
                      </span>
                    </td>
                    <td
                      data-label="Último mensaje"
                      className={`muted c-fila c-recorte ${l.ultimoMensaje ? '' : 'c-vacio'}`}
                      style={{
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {l.ultimoMensaje || '—'}
                    </td>
                    {/*
                      Lo que el bot guardó por las preguntas obligatorias con
                      `field_key`. Se enseña con la clave delante porque la
                      elige el dueño: sin ella, un "3" suelto no dice nada.
                    */}
                    <td data-label="Datos" className={`c-fila ${Object.keys(l.datos).length ? '' : 'c-vacio'}`}>
                      {Object.keys(l.datos).length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="dato-pills">
                          {Object.entries(l.datos).map(([k, v]) => (
                            <span className="dato-pill" key={k} title={`${k}: ${v}`}>
                              <b>{k}</b>
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-label="Alta" className="muted c-dcha">{cuando(l.creado)}</td>
                    <td data-label="" style={{ textAlign: 'right' }}>
                      <Link className="btn btn-ghost btn-sm" href={`/panel/mensajes?lead=${l.id}`}>
                        <MessageCircle size={14} /> Ver chat
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {paginas > 1 && (
          <div className="pagination">
            <button onClick={() => setPagina(actual - 1)} disabled={actual === 1}>
              ‹
            </button>
            {Array.from({ length: paginas }, (_, i) => (
              <button
                key={i}
                className={i + 1 === actual ? 'active' : ''}
                onClick={() => setPagina(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPagina(actual + 1)} disabled={actual === paginas}>
              ›
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
