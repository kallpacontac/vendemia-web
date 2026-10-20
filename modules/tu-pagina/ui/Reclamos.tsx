'use client';

/**
 * Las hojas del Libro de Reclamaciones que llegaron por Mi página (sql/0006).
 *
 * Lo primero que se ve es cuánto falta para responder: el plazo legal son 15
 * días hábiles improrrogables. El dueño escribe su respuesta aquí (queda en la
 * hoja, que no se borra) y la manda él por WhatsApp o por correo, con el texto
 * ya puesto: Vendemia no envía correos.
 */
import { useMemo, useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { telefonoBonito, urlWhatsApp } from '@/modules/tu-pagina/dominio/envio';
import { DEFINICION, diasParaVencer, numeroHoja, type Reclamo } from '@/modules/tu-pagina/dominio/reclamos';

const POR_PAGINA = 50;
type Filtro = 'pendiente' | 'respondido';

const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const fecha = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

function Vence({ r, hoy }: { r: Reclamo; hoy: string }) {
  if (r.estado === 'respondido') return <span className="tp-rec-vence tp-rec-vence--ok">Respondido</span>;
  const d = diasParaVencer(r.vence, hoy);
  const texto = d < 0 ? `Venció el ${fecha(r.vence)}` : d === 0 ? 'Vence hoy' : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`;
  return <span className={`tp-rec-vence${d <= 3 ? ' tp-rec-vence--pronto' : ''}`}>{texto}</span>;
}

export default function Reclamos({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const [filtro, setFiltro] = useState<Filtro>('pendiente');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const hoy = useMemo(hoyLima, []);

  const { datos, cargando, error, releer } = useCargar(async () => {
    const { data, error } = await supabase()
      .from('reclamos')
      .select('*')
      .eq('company_id', companyId)
      .eq('estado', filtro)
      .order(filtro === 'pendiente' ? 'vence' : 'creado_at', { ascending: filtro === 'pendiente' })
      .limit(limite + 1);
    if (error) throw new Error(error.message);
    return data as Reclamo[];
  }, [companyId, filtro, limite]);

  const lista = (datos ?? []).slice(0, limite);

  async function responder(r: Reclamo) {
    const texto = (borrador[r.id] ?? r.respuesta ?? '').trim();
    if (texto.length < 5) return avisar('Escribe tu respuesta antes de guardarla.', 'error');
    setGuardando(true);
    const { error } = await supabase().rpc('reclamos_responder', { p_company: companyId, p_id: r.id, p_respuesta: texto });
    setGuardando(false);
    if (error) return avisar(error.code === '42501' ? 'Esto lo responde el dueño o el administrador.' : 'No se pudo guardar la respuesta.', 'error');
    avisar('Respuesta guardada en la hoja. Ahora envíasela al cliente.');
    releer();
  }

  const mensaje = (r: Reclamo, texto: string) =>
    `Hola ${r.consumidor.nombre}, sobre tu hoja de reclamación ${numeroHoja(r.numero, r.creado_at)} del ${fecha(r.creado_at)}:\n\n${texto}\n\n${r.proveedor.razon_social}`;

  return (
    <section className="card table-card">
      <div className="card-mini-head">
        <h3>Libro de Reclamaciones</h3>
        <div className="chip-tabs">
          {(['pendiente', 'respondido'] as Filtro[]).map((f) => (
            <button key={f} className={filtro === f ? 'active' : ''} onClick={() => { setFiltro(f); setLimite(POR_PAGINA); setAbierto(null); }}>
              {f === 'pendiente' ? 'Por responder' : 'Respondidos'}
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 14px 10px' }}>
        Tienes 15 días hábiles para responder cada hoja. Escribe tu respuesta, guárdala y envíasela al cliente.
      </p>

      {error && <p className="vacio">No se pudo cargar: {error.includes('reclamos') ? 'falta aplicar la 0006 del Libro de Reclamaciones.' : error}</p>}
      {cargando && !datos && <p className="vacio">Cargando…</p>}
      {datos && lista.length === 0 && <p className="vacio">{filtro === 'pendiente' ? 'No tienes reclamos por responder.' : 'Todavía no has respondido ninguno.'}</p>}

      {lista.map((r) => {
        const texto = borrador[r.id] ?? r.respuesta ?? '';
        const abiertoEste = abierto === r.id;
        return (
          <div key={r.id}>
            <button type="button" className="tp-rec-fila" aria-expanded={abiertoEste} onClick={() => setAbierto(abiertoEste ? null : r.id)}>
              <b>{numeroHoja(r.numero, r.creado_at)}</b>
              <span>
                {r.consumidor.nombre} · {r.tipo === 'reclamo' ? 'Reclamo' : 'Queja'}
                <small>{fecha(r.creado_at)} · {r.bien.descripcion}</small>
              </span>
              <Vence r={r} hoy={hoy} />
            </button>
            {abiertoEste && (
              <div className="tp-rec-hoja">
                <h4>Consumidor</h4>
                <p>{r.consumidor.nombre} · {r.consumidor.tipo_doc} {r.consumidor.num_doc}</p>
                <p>{r.consumidor.domicilio} · {telefonoBonito(r.consumidor.telefono)}{r.consumidor.email ? ` · ${r.consumidor.email}` : ''}</p>
                {r.consumidor.menor && <p>Menor de edad. Apoderado: {r.consumidor.apoderado}</p>}
                <h4>{r.bien.tipo === 'producto' ? 'Producto' : 'Servicio'}</h4>
                <p>{r.bien.descripcion}{r.bien.monto != null ? ` · Monto reclamado: S/ ${r.bien.monto}` : ''}</p>
                <h4>{r.tipo === 'reclamo' ? 'Reclamo' : 'Queja'}</h4>
                <p className="muted" style={{ fontSize: 12 }}>{DEFINICION[r.tipo]}</p>
                <p>{r.detalle}</p>
                <h4>Lo que pide</h4>
                <p>{r.pedido}</p>
                <h4>Tu respuesta{r.respondido_at ? ` · guardada el ${fecha(r.respondido_at)}` : ''}</h4>
                <textarea
                  className="input"
                  rows={4}
                  maxLength={3000}
                  value={texto}
                  placeholder="Qué hiciste o qué le ofreces"
                  onChange={(e) => setBorrador((b) => ({ ...b, [r.id]: e.target.value }))}
                  style={{ width: '100%' }}
                />
                <div className="tp-rec-acciones">
                  <button className="btn btn-sm btn-primary" disabled={guardando} onClick={() => void responder(r)}>
                    {guardando ? 'Guardando…' : r.respuesta ? 'Actualizar respuesta' : 'Guardar respuesta'}
                  </button>
                  {texto.trim().length >= 5 && (
                    <>
                      <a className="btn btn-sm btn-ghost" href={urlWhatsApp(r.consumidor.telefono, mensaje(r, texto.trim()))} target="_blank" rel="noopener">
                        <MessageCircle size={15} /> Enviar por WhatsApp
                      </a>
                      {r.consumidor.email && (
                        <a
                          className="btn btn-sm btn-ghost"
                          href={`mailto:${r.consumidor.email}?subject=${encodeURIComponent(`Respuesta a tu hoja de reclamación ${numeroHoja(r.numero, r.creado_at)}`)}&body=${encodeURIComponent(mensaje(r, texto.trim()))}`}
                        >
                          <Mail size={15} /> Enviar por correo
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {(datos?.length ?? 0) > limite && <button className="btn btn-ghost tp-panel-mas" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más</button>}
    </section>
  );
}
