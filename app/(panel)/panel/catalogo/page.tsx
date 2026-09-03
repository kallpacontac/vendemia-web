'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CATÁLOGO · lo único que Mia puede vender
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Se lee de la tabla `catalog` y se escribe SOLO encolando comandos. Nunca un
 * update directo: el espejo relee la fila del SQLite del bot y se la comería
 * sin error ni aviso. Ver lib/supabase/commands.ts.
 *
 * Tres cosas de esta pantalla que conviene no deshacer:
 *
 * 1 · `name` ES LA CLAVE. El modelo pide los productos por nombre exacto, así
 *     que renombrar uno cambia lo que hay que decirle a Mia para pedirlo. Por
 *     eso el campo avisa en vez de comportarse como un campo más.
 *
 * 2 · DESACTIVAR ES EL BORRADO DE VERDAD. `delete_catalog_item` hace borrado
 *     lógico: pone `is_active` a 0. Un producto desactivado desaparece del
 *     catálogo del bot pero sigue en las citas y pedidos viejos, que es
 *     justo lo que se quiere. Aquí se llama "Ocultar" porque es lo que hace.
 *
 * 3 · LO QUE EL BOT DECIDE, EL PANEL LO CUENTA. Máximo dos adjuntos por
 *     mensaje, la foto manda sobre el vídeo, y el pie lo escribe el bot con el
 *     precio de la fila. Si la pantalla no lo dijera, el dueño subiría cinco
 *     fotos y creería que salen las cinco. Ver <Medios>.
 *
 * NO se ofrece `image_url`: es un campo muerto que el bot no envía nunca. Las
 * fotos viven en `catalog_media`.
 *
 * NO se editan las franjas de los negocios recurrentes (`schedule_slots`). Es
 * un JSON con días, horas y aforos del que dependen las reservas: un editor a
 * medias rompe agendas en silencio, y merece su propia pantalla. Se avisa en
 * lugar de fingir que no existe.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Package,
  Plus,
  Search,
  Star,
  Trash2,
  Video,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import {
  getCatalogo,
  getCompania,
  getMediosDeVarios,
  type ItemCatalogo,
} from '@/lib/supabase/queries';
import { b01 } from '@/lib/supabase/parse';
import type { BusinessMode, CatalogMediaRow } from '@/lib/supabase/types';
import type { ResultadoCatalogMedia } from '@/lib/supabase/commands';

/** El bot manda como mucho dos adjuntos por mensaje. No es configurable. */
const TOPE_ADJUNTOS = 2;

/** Con este stock o menos, el bot mete urgencia en el prompt. */
const STOCK_URGENTE = 5;

/**
 * Cuáles de las fotos saldrían DE VERDAD.
 *
 * El bot coge hasta dos adjuntos y la imagen manda sobre el vídeo: el vídeo
 * solo sale si el cliente lo pide o si no hay ninguna foto. Esto reproduce esa
 * decisión para poder marcarla en la lista — sin ella, subir la quinta foto
 * parece que hace algo.
 */
function losQueSalen(medios: CatalogMediaRow[]): Set<string> {
  const fotos = medios.filter((m) => m.media_type === 'image');
  if (fotos.length) return new Set(fotos.slice(0, TOPE_ADJUNTOS).map((m) => m.id));
  return new Set(medios.slice(0, 1).map((m) => m.id));
}

/** Lo que el formulario de un ítem edita. Todo lo demás de la fila no se toca. */
interface Borrador {
  name: string;
  description: string;
  price: string;
  currency: string;
  stock: string;
  max_discount: string;
  duration_minutes: string;
  capacity: string;
  package_services: string[];
}

function borradorDe(it: ItemCatalogo): Borrador {
  return {
    name: it.name ?? '',
    description: it.description ?? '',
    price: it.price == null ? '' : String(it.price),
    currency: it.currency || 'PEN',
    stock: it.stock == null ? '' : String(it.stock),
    max_discount: it.max_discount == null ? '' : String(it.max_discount),
    duration_minutes: it.duration_minutes == null ? '' : String(it.duration_minutes),
    capacity: it.capacity == null ? '' : String(it.capacity),
    package_services: it.paquete,
  };
}

export default function Catalogo() {
  const { companyId } = useSesion();
  const comando = useComando();
  const avisar = useAvisar();

  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');

  const { datos, cargando, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, items] = await Promise.all([getCompania(companyId), getCatalogo(companyId)]);
    const medios = await getMediosDeVarios(items.map((i) => i.id));
    return { modo: (empresa?.business_mode ?? 'appointment') as BusinessMode, items, medios };
  }, [companyId]);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const modo = datos?.modo ?? 'appointment';

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q),
    );
  }, [items, busqueda]);

  const activos = items.filter((i) => i.activo).length;
  const sinFoto = items.filter((i) => i.activo && !(datos?.medios[i.id]?.length)).length;

  async function crear() {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    if (items.some((i) => i.name.trim().toLowerCase() === nombre.toLowerCase())) {
      avisar('Ya tienes un producto con ese nombre. Mia los pide por nombre: dos iguales la confunden.', 'error');
      return;
    }
    const r = await comando(
      'upsert_catalog_item',
      { item: { name: nombre, price: 0, is_active: 1, currency: 'PEN' } },
      'Producto añadido',
    );
    if (r) {
      setCreando(false);
      setNombreNuevo('');
      recargar();
    }
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Catálogo" sub="Lo único que Mia puede vender" />

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand-txt)' }}>
              <Package size={20} />
            </div>
            <div>
              <b>{items.length}</b>
              <small>En el catálogo</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#E8FBF2', color: 'var(--new)' }}>
              <Check size={20} />
            </div>
            <div>
              <b>{activos}</b>
              <small>Visibles para Mia</small>
            </div>
          </div>
          {/* Sin foto no es un error, pero es la razón número uno de que un
              producto se venda peor. Se cuenta solo entre los activos: avisar
              de que un producto oculto no tiene foto no sirve de nada. */}
          <div className="mini">
            <div className="ic" style={{ background: '#FEF6E7', color: 'var(--warm)' }}>
              <ImagePlus size={20} />
            </div>
            <div>
              <b>{sinFoto}</b>
              <small>Activos sin foto</small>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Buscar por nombre o descripción…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setCreando((v) => !v)}>
            <Plus size={15} /> Añadir producto
          </button>
        </div>

        {creando && (
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <label className="field-label">Nombre del producto o servicio</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="input"
                autoFocus
                placeholder="Corte de cabello"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void crear()}
              />
              <button className="btn btn-primary" onClick={() => void crear()}>
                Crear
              </button>
              <button className="btn btn-ghost" onClick={() => setCreando(false)}>
                Cancelar
              </button>
            </div>
            <small className="muted" style={{ fontSize: 11.5 }}>
              Se crea con precio 0 y visible. El resto se rellena abajo.
            </small>
          </div>
        )}

        {cargando && (
          <div className="cargando">
            <div className="spin" />
            Cargando el catálogo…
          </div>
        )}

        {!cargando && visibles.length === 0 && (
          <p className="vacio">
            <b>{items.length ? 'Sin resultados' : 'El catálogo está vacío'}</b>
            {items.length
              ? 'Prueba con otra búsqueda.'
              : 'Mia no puede vender lo que no está aquí: añade tus servicios o productos.'}
          </p>
        )}

        {visibles.map((it) => (
          <Ficha
            key={it.id}
            item={it}
            modo={modo}
            todos={items}
            medios={datos?.medios[it.id] ?? []}
            companyId={companyId}
            abierta={abierto === it.id}
            alAbrir={() => setAbierto((a) => (a === it.id ? null : it.id))}
            alCambiar={recargar}
          />
        ))}
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

function Ficha({
  item,
  modo,
  todos,
  medios,
  companyId,
  abierta,
  alAbrir,
  alCambiar,
}: {
  item: ItemCatalogo;
  modo: BusinessMode;
  todos: ItemCatalogo[];
  medios: CatalogMediaRow[];
  companyId: string | null;
  abierta: boolean;
  alAbrir: () => void;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const [f, setF] = useState<Borrador>(() => borradorDe(item));
  const [guardando, setGuardando] = useState(false);

  // El borrador se rehace SOLO al abrir: si se repintara con cada recarga del
  // espejo, borraría lo que alguien está escribiendo.
  useEffect(() => {
    if (abierta) setF(borradorDe(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, item.id]);

  const salen = useMemo(() => losQueSalen(medios), [medios]);
  const esCita = modo === 'appointment';

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setF((x) => ({ ...x, [k]: v }));

  async function guardar() {
    if (!f.name.trim()) {
      avisar('El producto necesita un nombre: es como Mia lo pide.', 'error');
      return;
    }
    setGuardando(true);
    /**
     * Se manda el ítem entero y no solo lo cambiado, al revés que en Ajustes:
     * `upsert_catalog_item` es un upsert de la fila, no un patch de campos, y
     * omitir un campo puede leerse como "ponlo a null".
     *
     * Los números vacíos van como `null` a propósito: null en `stock` significa
     * "sin control de stock", que no es lo mismo que 0 — con 0 el bot diría que
     * está agotado.
     */
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    const r = await comando(
      'upsert_catalog_item',
      {
        item: {
          id: item.id,
          name: f.name.trim(),
          description: f.description.trim() || null,
          price: num(f.price) ?? 0,
          currency: f.currency.trim() || 'PEN',
          is_active: b01(item.activo),
          stock: esCita ? null : num(f.stock),
          max_discount: esCita ? null : num(f.max_discount),
          duration_minutes: esCita ? num(f.duration_minutes) : null,
          capacity: esCita ? num(f.capacity) : null,
          // ⚠️ text, no jsonb. Y son ids, no nombres.
          package_services: JSON.stringify(f.package_services),
        },
      },
      'Producto guardado',
    );
    setGuardando(false);
    if (r) alCambiar();
  }

  async function alternarVisible() {
    /**
     * `delete_catalog_item` es un borrado LÓGICO: pone is_active a 0. Para
     * volver a mostrarlo se usa el upsert con is_active 1 — no hay comando de
     * "restaurar".
     */
    const r = item.activo
      ? await comando('delete_catalog_item', { id: item.id }, 'Producto oculto para Mia')
      : await comando(
          'upsert_catalog_item',
          { item: { id: item.id, name: item.name, is_active: 1 } },
          'Producto visible otra vez',
        );
    if (r) alCambiar();
  }

  const precio = item.price == null ? '—' : `${item.currency || 'PEN'} ${item.price}`;

  return (
    <div className={`cat-item ${item.activo ? '' : 'oculto'}`}>
      <div className="cat-head" onClick={alAbrir}>
        <Miniaturas medios={medios} salen={salen} />
        <div className="cat-id">
          <b>{item.name}</b>
          <small>
            {precio}
            {esCita && item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
            {!esCita && item.stock != null ? ` · ${item.stock} en stock` : ''}
            {item.paquete.length ? ` · pack de ${item.paquete.length}` : ''}
          </small>
        </div>

        {!esCita && item.stock != null && item.stock <= STOCK_URGENTE && (
          <span className="badge-pill" style={{ color: 'var(--warm)', background: '#FEF6E7' }}>
            Queda poco
          </span>
        )}
        {!medios.length && item.activo && (
          <span className="badge-pill" style={{ color: 'var(--ink-soft)', background: 'var(--bg-soft)' }}>
            Sin foto
          </span>
        )}
        {!item.activo && (
          <span className="badge-pill" style={{ color: 'var(--ink-soft)', background: 'var(--bg-soft)' }}>
            Oculto para Mia
          </span>
        )}

        <button
          type="button"
          className="q-icon"
          aria-label={abierta ? 'Cerrar' : 'Editar'}
          onClick={(e) => {
            e.stopPropagation();
            alAbrir();
          }}
        >
          {abierta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {abierta && (
        <div className="cat-body">
          <div className="grid-form">
            <div className="full">
              <label className="field-label">Nombre</label>
              <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
              <small className="muted" style={{ fontSize: 11.5 }}>
                ⚠️ Mia pide los productos por su nombre exacto. Si lo cambias, cambia también lo que
                el cliente tiene que decir para pedirlo.
              </small>
            </div>

            <div className="full">
              <label className="field-label">Descripción</label>
              <textarea
                className="textarea"
                style={{ minHeight: 64 }}
                value={f.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Precio</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={f.price}
                onChange={(e) => set('price', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Moneda</label>
              <input className="input" value={f.currency} onChange={(e) => set('currency', e.target.value)} />
            </div>

            {esCita ? (
              <>
                <div>
                  <label className="field-label">Duración (minutos)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={f.duration_minutes}
                    onChange={(e) => set('duration_minutes', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Cuántos a la vez</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={f.capacity}
                    onChange={(e) => set('capacity', e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="field-label">Stock</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    placeholder="vacío = sin control"
                    value={f.stock}
                    onChange={(e) => set('stock', e.target.value)}
                  />
                  <small className="muted" style={{ fontSize: 11.5 }}>
                    Vacío no es lo mismo que 0: vacío es «no lo controlo», 0 es «agotado». Con{' '}
                    {STOCK_URGENTE} o menos, Mia mete prisa.
                  </small>
                </div>
                <div>
                  <label className="field-label">Descuento máximo por unidad</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0 = sin descuento"
                    value={f.max_discount}
                    onChange={(e) => set('max_discount', e.target.value)}
                  />
                  <small className="muted" style={{ fontSize: 11.5 }}>
                    Hasta aquí puede bajar Mia si el cliente regatea. Nunca más.
                  </small>
                </div>
              </>
            )}
          </div>

          <Paquete
            item={item}
            todos={todos}
            seleccion={f.package_services}
            alCambiar={(v) => set('package_services', v)}
          />

          {modo === 'recurring_appointment' && (
            <div className="desfase" style={{ background: 'var(--bg-soft)', borderColor: 'var(--line-2)', color: 'var(--ink-soft)', marginTop: 14 }}>
              Las <b>franjas semanales</b> de este producto (días, horas y aforo) no se editan desde
              aquí todavía. De ellas dependen las reservas, y un editor a medias rompería agendas sin
              avisar. Dínoslo y las ajustamos.
            </div>
          )}

          <Medios
            item={item}
            medios={medios}
            salen={salen}
            companyId={companyId}
            alCambiar={alCambiar}
          />

          <div className="nav-btns" style={{ marginTop: 18 }}>
            <button className="btn btn-ghost" onClick={() => void alternarVisible()}>
              {item.activo ? 'Ocultar para Mia' : 'Volver a mostrar'}
            </button>
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
              <Check size={16} /> {guardando ? 'Guardando…' : 'Guardar producto'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

function Miniaturas({ medios, salen }: { medios: CatalogMediaRow[]; salen: Set<string> }) {
  if (!medios.length) {
    return (
      <div className="cat-thumb cat-thumb--vacia">
        <ImagePlus size={16} />
      </div>
    );
  }
  return (
    <div className="cat-thumbs">
      {medios.slice(0, 3).map((m) => (
        <div key={m.id} className={`cat-thumb ${salen.has(m.id) ? 'sale' : ''}`}>
          {m.media_type === 'video' ? (
            <div className="cat-thumb--video">
              <Video size={15} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt="" loading="lazy" />
          )}
        </div>
      ))}
      {medios.length > 3 && <span className="cat-mas">+{medios.length - 3}</span>}
    </div>
  );
}

/**
 * Los packs. `package_services` es un array de **ids** del propio catálogo.
 *
 * Se ofrecen solo los OTROS ítems: un pack que se contiene a sí mismo es una
 * recursión que nadie quiere depurar a las once de la noche.
 */
function Paquete({
  item,
  todos,
  seleccion,
  alCambiar,
}: {
  item: ItemCatalogo;
  todos: ItemCatalogo[];
  seleccion: string[];
  alCambiar: (v: string[]) => void;
}) {
  const otros = todos.filter((t) => t.id !== item.id);
  if (!otros.length) return null;

  return (
    <div className="sec" style={{ marginTop: 4 }}>
      <h4>
        <Boxes /> ¿Es un pack?
      </h4>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
        Marca lo que incluye. Si no marcas nada, es un producto suelto.
      </p>
      <div className="pack-grid">
        {otros.map((o) => {
          const dentro = seleccion.includes(o.id);
          return (
            <button
              type="button"
              key={o.id}
              className={`pack-chip ${dentro ? 'sel' : ''}`}
              onClick={() =>
                alCambiar(dentro ? seleccion.filter((x) => x !== o.id) : [...seleccion, o.id])
              }
            >
              {dentro && <Check size={13} />}
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * Las fotos y vídeos de un producto.
 *
 * El fichero va del navegador DIRECTO a Cloudinary; por el servidor solo pasa
 * una firma. Ver app/api/cloudinary/firma/route.ts para el porqué — resumen: el
 * límite de 4,5 MB de una función de Vercel es menor que muchas fotos de móvil,
 * y fallaría solo con las grandes.
 *
 * Después se encola `upsert_catalog_media`, que lo aplica el bot. Con el bot
 * apagado la foto queda en `pending` y no aparece hasta que arranque, igual que
 * cualquier otro cambio. Por eso aquí NO se pinta la foto de forma optimista:
 * lo que se ve es lo que el bot tiene de verdad.
 */
function Medios({
  item,
  medios,
  salen,
  companyId,
  alCambiar,
}: {
  item: ItemCatalogo;
  medios: CatalogMediaRow[];
  salen: Set<string>;
  companyId: string | null;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  /** Si se está sustituyendo una foto concreta, su id. Ver `sustituir`. */
  const [sustituyendo, setSustituyendo] = useState<string | null>(null);

  const subir = useCallback(
    async (file: File, idExistente: string | null) => {
      if (!companyId) return;
      const esVideo = file.type.startsWith('video');
      if (!esVideo && !file.type.startsWith('image')) {
        avisar('Solo fotos y vídeos. Los PDF no tienen camino todavía.', 'error');
        return;
      }
      setSubiendo(true);
      try {
        const sesion = (await supabase().auth.getSession()).data.session;
        if (!sesion) throw new Error('Tu sesión caducó. Vuelve a entrar.');

        const firma = await fetch('/api/cloudinary/firma', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${sesion.access_token}`,
          },
          body: JSON.stringify({ companyId }),
        }).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error ?? 'No se pudo firmar la subida');
          return j as { timestamp: number; signature: string; folder: string; apiKey: string; cloudName: string };
        });

        const fd = new FormData();
        fd.append('file', file);
        fd.append('api_key', firma.apiKey);
        fd.append('timestamp', String(firma.timestamp));
        fd.append('folder', firma.folder);
        fd.append('signature', firma.signature);

        const subida = await fetch(
          `https://api.cloudinary.com/v1_1/${firma.cloudName}/${esVideo ? 'video' : 'image'}/upload`,
          { method: 'POST', body: fd },
        ).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error?.message ?? 'Cloudinary rechazó el fichero');
          return j as { secure_url: string };
        });

        /**
         * Con `id`, el bot SUSTITUYE el fichero conservando la posición. Es lo
         * que hay que usar para "cambiar esta foto": borrar y volver a añadir
         * la mandaría al final, y con el tope de dos adjuntos podría dejar de
         * enviarse sin que nadie relacione una cosa con la otra.
         */
        const r = await comando<ResultadoCatalogMedia>(
          'upsert_catalog_media',
          {
            catalog_id: item.id,
            url: subida.secure_url,
            media_type: esVideo ? 'video' : 'image',
            ...(idExistente ? { id: idExistente } : {}),
          },
          idExistente ? 'Foto sustituida' : 'Foto añadida',
        );
        if (r) alCambiar();
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'No se pudo subir el fichero', 'error');
      } finally {
        setSubiendo(false);
        setSustituyendo(null);
        if (entrada.current) entrada.current.value = '';
      }
    },
    [companyId, item.id, comando, avisar, alCambiar],
  );

  async function borrar(m: CatalogMediaRow) {
    const r = await comando('delete_catalog_media', { id: m.id }, 'Foto eliminada');
    if (r) alCambiar();
  }

  return (
    <div className="sec" style={{ marginTop: 4 }}>
      <h4>
        <ImagePlus /> Fotos y vídeo
      </h4>

      {/*
        Estas cuatro reglas las decide el bot y el panel no las controla. Si no
        se dicen, el dueño sube seis fotos y da por hecho que salen las seis.
      */}
      <div className="desfase" style={{ background: 'var(--brand-soft)', borderColor: '#FFD9C7', color: 'var(--brand-txt)' }}>
        Mia manda <b>como mucho {TOPE_ADJUNTOS} adjuntos</b> por mensaje, y las marcadas con ⭐ son
        las que saldrían. <b>La foto manda sobre el vídeo</b>: el vídeo solo sale si el cliente lo
        pide o si no hay ninguna foto, y ocupa el mensaje entero. El <b>pie lo escribe Mia</b> con el
        nombre y el precio de arriba — no se edita aquí a propósito: un precio inventado en el pie de
        una foto es justo donde más se lo cree el cliente.
      </div>

      {medios.length === 0 && (
        <p className="vacio" style={{ marginTop: 12 }}>
          <b>Sin fotos</b>
          Un producto con foto se vende mucho mejor por WhatsApp que uno descrito con palabras.
        </p>
      )}

      <div className="medios-grid">
        {medios.map((m) => (
          <div key={m.id} className={`medio ${salen.has(m.id) ? 'sale' : ''}`}>
            {m.media_type === 'video' ? (
              <div className="medio__video">
                <Video size={22} />
                <span>vídeo</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" loading="lazy" />
            )}

            {salen.has(m.id) && (
              <span className="medio__sale" title="Esta sí se envía">
                <Star size={12} /> se envía
              </span>
            )}

            <div className="medio__acciones">
              <button
                type="button"
                onClick={() => {
                  setSustituyendo(m.id);
                  entrada.current?.click();
                }}
                disabled={subiendo}
              >
                Cambiar
              </button>
              <button type="button" className="del" onClick={() => void borrar(m)} disabled={subiendo}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="medio medio--add"
          onClick={() => {
            setSustituyendo(null);
            entrada.current?.click();
          }}
          disabled={subiendo}
        >
          {subiendo ? (
            <>
              <div className="spin" style={{ width: 22, height: 22, borderWidth: 2 }} />
              <span>Subiendo…</span>
            </>
          ) : (
            <>
              <Plus size={20} />
              <span>Añadir</span>
            </>
          )}
        </button>
      </div>

      {medios.length > TOPE_ADJUNTOS && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10, display: 'flex', gap: 6 }}>
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          Tienes {medios.length} y solo salen {TOPE_ADJUNTOS}. Las de más siguen guardadas, pero no
          se envían: si quieres cambiar cuál sale, usa «Cambiar» sobre una de las marcadas en vez de
          borrar y volver a subir.
        </p>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void subir(file, sustituyendo);
        }}
      />
    </div>
  );
}
