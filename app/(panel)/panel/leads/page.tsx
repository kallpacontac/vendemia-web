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
import { CheckCircle, Download, Flame, MessageCircle, Search, Users } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { getLeads } from '@/lib/supabase/queries';
import { colorDe, cuando, iniciales, intent, status, telefono } from '@/lib/panel/format';
import type { LeadIntent, LeadStatus } from '@/lib/supabase/types';

const POR_PAGINA = 8;

export default function Leads() {
  const { companyId } = useSesion();
  const { datos, cargando } = useCargar(async () => (companyId ? getLeads(companyId) : []), [companyId]);

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
  const convertidos = leads.filter((l) => l.status === 'paid').length;

  function exportarCsv() {
    const filas = [['Nombre', 'Telefono', 'Intencion', 'Estado', 'Ultimo mensaje', 'Alta']].concat(
      filtrados.map((l) => [
        l.name ?? '',
        l.phone,
        intent(l.intent).label,
        status(l.status).label,
        (l.last_message ?? '').replace(/[,\n]/g, ' '),
        l.creado ? l.creado.toISOString().slice(0, 10) : '',
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
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Leads" sub="Todos tus contactos de WhatsApp" />

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: '#FFF1E6', color: '#F58220' }}>
              <Users size={20} />
            </div>
            <div>
              <b>{leads.length}</b>
              <small>Total leads</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#FFECEC', color: '#FF4757' }}>
              <Flame size={20} />
            </div>
            <div>
              <b>{calientes}</b>
              <small>Calientes 🔥</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#E9FBF3', color: '#00C48C' }}>
              <CheckCircle size={20} />
            </div>
            <div>
              <b>{convertidos}</b>
              <small>Convertidos ✓</small>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre o teléfono…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <select
            className="select"
            value={fIntent}
            onChange={(e) => {
              setFIntent(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Toda intención</option>
            <option value="purchase_ready">Listo p/ comprar</option>
            <option value="quote">Cotizando</option>
            <option value="inquiry">Consulta</option>
            <option value="support">Soporte</option>
            <option value="other">Otro</option>
          </select>
          <select
            className="select"
            value={fStatus}
            onChange={(e) => {
              setFStatus(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todo estado</option>
            <option value="new">Nuevo</option>
            <option value="contacted">Contactado</option>
            <option value="paid">Pagado</option>
            <option value="closed">Cerrado</option>
          </select>
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={exportarCsv} disabled={!filtrados.length}>
            <Download size={16} /> Exportar
          </button>
        </div>

        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Teléfono</th>
                <th>Intención</th>
                <th>Estado</th>
                <th>Último mensaje</th>
                <th>Alta</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={7}>
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
                    <td>
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
                    <td>{telefono(l.phone)}</td>
                    <td>
                      <span className={`badge-pill ${it.cls}`}>{it.label}</span>
                    </td>
                    <td>
                      <span className="badge-pill" style={{ color: st.color, background: `${st.color}18` }}>
                        {st.label}
                      </span>
                    </td>
                    <td
                      className="muted"
                      style={{
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {l.last_message || '—'}
                    </td>
                    <td className="muted">{cuando(l.creado)}</td>
                    <td style={{ textAlign: 'right' }}>
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
