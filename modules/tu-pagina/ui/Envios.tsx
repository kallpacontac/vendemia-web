'use client';

/**
 * Los recojos que piden por «Agendar un envío» de la página (tabla envios).
 * Se ven en Pedidos, con lo demás que piden los clientes; hasta el 27-oct-2026
 * vivían en una pestaña de Mi página.
 *
 * `codigo`: el QR de la etiqueta abre /panel/pedidos?envio=CODIGO (las etiquetas
 * ya impresas traen /panel/tu-pagina?envio=, que redirige aquí).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import {
  ESTADOS,
  fechaCorta,
  nombreEstado,
  nombreFranja,
  telefonoBonito,
  type Envio,
  type EstadoEnvio,
} from '@/modules/tu-pagina/dominio/envio';
import { hojaEtiquetas, imprimir, type Formato } from '@/modules/tu-pagina/ui/etiquetas';

const POR_PAGINA = 50;

const FILTROS: { id: EstadoEnvio | 'todos'; nombre: string }[] = [
  { id: 'por_recoger', nombre: 'Por recoger' },
  { id: 'impreso', nombre: 'Impresos' },
  { id: 'recogido', nombre: 'En camino' },
  { id: 'entregado', nombre: 'Entregados' },
  { id: 'todos', nombre: 'Todos' },
];

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export default function Envios({ companyId, nombre, codigo, activos }: {
  companyId: string; nombre: string; codigo: string | null;
  /** La página está publicada con «Agendar un envío» encendido. */
  activos: boolean;
}) {
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<EstadoEnvio | 'todos'>(codigo ? 'todos' : 'por_recoger');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);

  const { datos, cargando, error, releer } = useCargar(async () => {
    let q = supabase().from('envios').select('*').eq('company_id', companyId).order('creado_at', { ascending: false }).limit(limite + 1);
    if (codigo) q = q.eq('codigo', codigo.toUpperCase());
    else if (filtro !== 'todos') q = q.eq('estado', filtro);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Envio[];
  }, [companyId, filtro, limite, codigo]);

  const lista = useMemo(() => (datos ?? []).slice(0, limite), [datos, limite]);
  const hayMas = (datos?.length ?? 0) > limite;
  const elegidos = lista.filter((e) => marcados.has(e.id));
  useEffect(() => setMarcados(new Set()), [filtro, codigo]);

  async function cambiarEstado(ids: string[], estado: EstadoEnvio) {
    const { error } = await supabase().rpc('envios_estado', { p_company: companyId, p_ids: ids, p_estado: estado });
    if (error) throw new Error(error.message);
  }

  async function etiquetas(formato: Formato) {
    if (!elegidos.length) return;
    setOcupado(true);
    try {
      const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      const ok = await imprimir(() => hojaEtiquetas(elegidos, nombre, formato, base));
      if (!ok) return avisar('El navegador bloqueó la ventana. Permite ventanas emergentes para vendemias.com.', 'error');
      const porRecoger = elegidos.filter((e) => e.estado === 'por_recoger').map((e) => e.id);
      if (porRecoger.length) await cambiarEstado(porRecoger, 'impreso');
      releer();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  async function marcar(estado: EstadoEnvio) {
    setOcupado(true);
    try {
      await cambiarEstado(elegidos.map((e) => e.id), estado);
      avisar(`${elegidos.length} ${elegidos.length === 1 ? 'envío' : 'envíos'}: ${nombreEstado(estado).toLowerCase()}`);
      setMarcados(new Set());
      releer();
    } catch (e) {
      avisar(mensajeDe(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  if (!activos) {
    return (
      <section className="card">
        <p className="vacio">
          Todavía no recibes envíos. Publica tu página con «Agendar un envío» encendido y comparte el enlace.
        </p>
        <Link className="btn btn-primary" href="/panel/tu-pagina">Configurar mi página</Link>
      </section>
    );
  }

  const todos = lista.length > 0 && elegidos.length === lista.length;

  return (
    <section className="card table-card">
      <div className="tp-panel-barra">
        {codigo ? (
          <p className="muted">Buscando el envío <b>{codigo}</b> · <Link href="/panel/pedidos?ver=envios">ver todos</Link></p>
        ) : (
          <div className="chip-tabs">
            {FILTROS.map((f) => (
              <button key={f.id} className={filtro === f.id ? 'active' : ''} onClick={() => { setFiltro(f.id); setLimite(POR_PAGINA); }}>
                {f.nombre}
              </button>
            ))}
          </div>
        )}
        {elegidos.length > 0 && (
          <div className="tp-panel-acciones">
            <span className="muted">{elegidos.length} elegidos</span>
            <button className="btn btn-sm btn-primary" disabled={ocupado} onClick={() => void etiquetas('a4')}><Printer size={14} /> Etiquetas A4</button>
            <button className="btn btn-sm" disabled={ocupado} onClick={() => void etiquetas('termica')}><Printer size={14} /> Térmica 10×15</button>
            <select
              className="input tp-panel-estado"
              value=""
              disabled={ocupado}
              onChange={(e) => e.target.value && void marcar(e.target.value as EstadoEnvio)}
              aria-label="Marcar como"
            >
              <option value="">Marcar como…</option>
              {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <p className="vacio">No se pudieron cargar los envíos: {error}</p>}
      {cargando && !datos && <p className="vacio">Cargando envíos…</p>}
      {datos && lista.length === 0 && <p className="vacio">{codigo ? 'No hay ningún envío con ese código.' : 'No hay envíos aquí.'}</p>}

      {lista.length > 0 && (
        <ul className="tp-panel-lista">
          <li className="tp-panel-fila tp-panel-fila--cab">
            <label>
              <input type="checkbox" checked={todos} onChange={() => setMarcados(todos ? new Set() : new Set(lista.map((e) => e.id)))} aria-label="Elegir todos" />
            </label>
            <span className="muted">{lista.length} {lista.length === 1 ? 'envío' : 'envíos'}</span>
          </li>
          {lista.map((e) => (
            <li key={e.id} className={`tp-panel-fila${marcados.has(e.id) ? ' tp-panel-fila--sel' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={marcados.has(e.id)}
                  onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}
                  aria-label={`Elegir ${e.codigo}`}
                />
              </label>
              <div className="tp-panel-fila__cuerpo">
                <div className="tp-panel-fila__linea">
                  <b className="tp-panel-codigo">{e.codigo}</b>
                  <span className={`tp-panel-pill tp-panel-pill--${e.estado}`}>{nombreEstado(e.estado)}</span>
                </div>
                <div>
                  <b>{e.destinatario_nombre}</b> · {e.distrito}
                  <span className="muted"> · {telefonoBonito(e.destinatario_telefono)}</span>
                </div>
                <small className="muted">
                  {e.direccion}{e.referencia ? ` (${e.referencia})` : ''} · Recojo {fechaCorta(e.recojo_fecha)}, {nombreFranja(e.recojo_franja).toLowerCase()} ·{' '}
                  {e.bultos} {e.bultos === 1 ? 'bulto' : 'bultos'}
                  {e.contra_entrega ? ` · cobrar S/ ${Number(e.contra_entrega).toFixed(2)}` : ''} · de {e.remitente_nombre}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hayMas && (
        <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>
      )}
    </section>
  );
}
