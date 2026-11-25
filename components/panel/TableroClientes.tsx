'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TABLERO DE CLIENTES · el embudo en columnas, como un CRM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las columnas y la regla que pone a cada contacto en una están en
 * lib/panel/prospectos.ts. Aquí solo se pinta: en el celular, un bloque debajo
 * de otro; desde 768 px, columnas que se desplazan a lo ancho.
 *
 * Cada tarjeta abre el chat. «Te toca a ti» va primero porque es lo único que
 * espera por una persona.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, PauseCircle, Search } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { cuando, telefono } from '@/lib/panel/format';
import { ETAPAS, getProspectos, type Etapa, type Prospecto } from '@/lib/panel/prospectos';
import './tablero-clientes.css';

export default function TableroClientes({ companyId }: { companyId: string }) {
  const { datos, cargando } = useCargar(async () => (companyId ? getProspectos(companyId) : []), [companyId]);
  const [busqueda, setBusqueda] = useState('');

  const porEtapa = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const m = new Map<Etapa, Prospecto[]>(ETAPAS.map((e) => [e.id, []]));
    for (const p of datos ?? []) {
      if (q && !p.nombre.toLowerCase().includes(q) && !p.telefono.includes(q)) continue;
      m.get(p.etapa)?.push(p);
    }
    return m;
  }, [datos, busqueda]);

  const total = datos?.length ?? 0;

  return (
    <section className="tcl" aria-label="Tablero de clientes">
      <div className="tcl__barra">
        <p className="tcl__resumen"><b>{total}</b> contactos · <b>{porEtapa.get('te_toca')?.length ?? 0}</b> esperan tu respuesta</p>
        <div className="search tcl__buscar">
          <Search size={16} />
          <input aria-label="Buscar contacto" placeholder="Buscar por nombre o teléfono…"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      {cargando && !datos ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <div className="tcl__columnas">
          {ETAPAS.map((e) => {
            const lista = porEtapa.get(e.id) ?? [];
            return (
              <div key={e.id} className={`tcl__col tcl__col--${e.id}`}>
                <h3 className="tcl__cabeza"><span>{e.titulo}</span><b>{lista.length}</b></h3>
                <p className="tcl__ayuda">{e.ayuda}</p>
                <div className="tcl__lista">
                  {lista.length === 0 ? <p className="tcl__vacia">Nadie por ahora.</p> : lista.map((p) => <Tarjeta key={p.id} p={p} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Tarjeta({ p }: { p: Prospecto }) {
  return (
    <Link href={`/panel/mensajes?lead=${p.id}`} className="tcl__tarjeta">
      <span className="tcl__fila">
        <b className="tcl__nombre">{p.nombre}</b>
        <span className="tcl__cuando">{cuando(p.ultimoAt)}</span>
      </span>
      <span className="tcl__tel">{telefono(p.telefono)}</span>
      {p.ultimoMensaje && (
        <span className="tcl__ultimo">
          {p.ultimoDeQuien === 'nosotros' ? 'Tú: ' : ''}{p.ultimoMensaje}
        </span>
      )}
      <span className="tcl__pie">
        {p.miaEnPausa && <span className="tcl__sello"><PauseCircle size={13} /> Mia en pausa</span>}
        <span className="tcl__abrir"><MessageCircle size={13} /> Ver chat</span>
      </span>
    </Link>
  );
}
