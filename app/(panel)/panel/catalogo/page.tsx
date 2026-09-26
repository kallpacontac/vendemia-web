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
 * 2 · NO HAY "ELIMINAR DE PLANO", Y NO ES UNA DECISIÓN DE ESTA PANTALLA.
 *     `delete_catalog_item` hace borrado LÓGICO: pone `is_active` a 0. Y no hay
 *     otra vía — comprobado contra producción, un DELETE directo sobre
 *     `catalog` responde "permission denied for table catalog", igual que el
 *     UPDATE. La única escritura posible es la cola de comandos.
 *
 *     Por eso el botón se llama "Ocultar" y no "Eliminar": llamarlo Eliminar
 *     sería el mismo comando con la etiqueta cambiada, y mentir en la etiqueta
 *     de un botón destructivo es peor que no tenerlo.
 *
 *     Lo que sí se hace es quitarlos de en medio: la lista NO los enseña salvo
 *     que se pidan. Para un borrado real hace falta un comando nuevo en el bot
 *     (ver el filtro `verOcultos` de abajo, donde se conecta en dos líneas).
 *
 * 3 · LO QUE EL BOT DECIDE, EL PANEL LO CUENTA. Máximo dos adjuntos por
 *     mensaje, la foto manda sobre el vídeo, y el pie lo escribe el bot con el
 *     precio de la fila. Si la pantalla no lo dijera, el dueño subiría cinco
 *     fotos y creería que salen las cinco. Ver <Medios>.
 *
 * 4 · SE GUARDA SIN ESPERAR AL BOT, Y SE VE AL MOMENTO. El bot vive en un
 *     portátil: esperar su confirmación dejaba el botón girando y la pantalla
 *     con lo viejo. Ahora el cambio entra en la cola (useGuardar) y se pinta
 *     encima leyendo la propia cola (lib/panel/pendientes.ts), así que
 *     sobrevive a recargas y se retira solo cuando llega de verdad. Al cliente
 *     se le promete un máximo de 15 min; con el bot encendido son segundos.
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
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  HelpCircle,
  ImagePlus,
  Package,
  Plus,
  Search,
  Star,
  Trash2,
  Video,
  Clock,
} from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useGuardar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { useVocabulario } from '@/components/panel/useVocabulario';
import { cap } from '@/lib/panel/vocabulario';
import {
  getCatalogo,
  getCompania,
  getComandosCatalogo,
  getHuecos,
  getMediosDeVarios,
  type ItemCatalogo,
} from '@/lib/supabase/queries';
import { esPendiente, superponer } from '@/lib/panel/pendientes';
import { hoyLima, textoVigencia } from '@/lib/panel/inscripciones';
import { agruparHuecos, type GrupoHueco } from '@/lib/panel/huecos';
import { PRESETS, rangoDe } from '@/lib/panel/serie';
import {
  DIAS_DEL_MES,
  borradorVigencia,
  construirVigencia,
  describirVentana,
  errorVigencia,
  vigenteHoy,
  type BorradorVigencia,
  type ModoVigencia,
} from '@/lib/panel/vigencia';
import { b01, bool } from '@/lib/supabase/parse';
import type { BusinessMode, CatalogMediaRow } from '@/lib/supabase/types';

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

/**
 * ⚠️ Las dos funciones de abajo dan por hecho que `medios` llega en el ORDEN
 * DEL BOT: marcada primero, y entre las demás por orden de subida. De eso se
 * encargan los dos `.order()` de getMediosDeVarios(). Si alguien reordena la
 * lista en pantalla sin tocarlas, esto empieza a mentir en silencio.
 */

/** ¿Hay alguna marcada? `is_primary` es 0/1, no boolean: ver CatalogMediaRow. */
const hayPrincipal = (medios: CatalogMediaRow[]): boolean =>
  medios.some((m) => bool(m.is_primary));

/**
 * Cuál se enviaría AHORA MISMO si nadie ha marcado nada.
 *
 * Es la mitad importante de esta pantalla, y la que evita que el bug vuelva. El
 * problema original no fue que el dueño no pudiera elegir: fue que no sabía
 * cuál salía. Un botón para marcar solo sirve a quien ya sospecha que la foto
 * está mal.
 *
 * ⚠️ Sin ninguna marcada NO se marca ninguna automáticamente. Sin marca, el bot
 * hace lo de siempre, y esa compatibilidad es deliberada: escribir en la base
 * de datos del cliente por el simple hecho de que abrió una pantalla es de las
 * cosas que luego nadie sabe explicar.
 *
 * ⚠️ Y hay que recalcularlo tras BORRAR, no solo al cargar: borrar la principal
 * no asciende a ninguna otra —el bot solo borra—, así que el producto se queda
 * sin marca y vuelve al orden de subida sin decírselo a nadie. Aquí sale gratis
 * porque se deriva de `medios` en cada render y `borrar()` refresca.
 */
const laQueSaldria = (medios: CatalogMediaRow[]): string | null =>
  (medios.find((m) => m.media_type === 'image') ?? medios[0])?.id ?? null;

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
  /** Solo negocios recurrentes. Ver CatalogRow.vigencia_meses. */
  vigencia_meses: string;
  /**
   * CUÁNDO se puede ofrecer. ⚠️ No es `vigencia_meses`, que es cuánto dura lo
   * comprado: se guardan los dos y no tienen nada que ver. Ver lib/panel/vigencia.ts.
   */
  promo: BorradorVigencia;
  /** Solo negocios de citas. Vacío = usa la del trabajador. Ver lib/panel/comisiones.ts. */
  comision_pct: string;
  comision_monto: string;
}

/** Lo que admite el bot para `vigencia_meses`: meses enteros, de 1 a 24. */
const VIGENCIA_MAX = 24;

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
    vigencia_meses: String(it.vigencia_meses ?? 1),
    promo: borradorVigencia(it.promo_vigencia),
    comision_pct: it.comision_pct == null ? '' : String(it.comision_pct),
    comision_monto: it.comision_monto == null ? '' : String(it.comision_monto),
  };
}

export default function Catalogo() {
  // «servicio» en una barbería, «clase» en una academia, «producto» en una tienda.
  const v = useVocabulario();
  const { companyId } = useSesion();
  const guardar = useGuardar();
  const avisar = useAvisar();

  const [busqueda, setBusqueda] = useState('');
  /**
   * Los ocultos NO se enseñan por defecto. Un producto que el dueño quitó no
   * tiene por qué seguir estorbando en la lista cada vez que entra — que es
   * justo la sensación de "no puedo eliminarlo".
   *
   * Pero tampoco se esconden del todo: sin una forma de verlos, un producto
   * ocultado por error queda inalcanzable y no hay manera de recuperarlo.
   */
  const [verOcultos, setVerOcultos] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');

  /**
   * La pestaña de «Lo que no supe contestar» va aparte y no encima de la
   * lista: es una lista que crece con cada conversación, y lo que hoy son
   * tres filas en un año es una pantalla entera de scroll delante de los
   * productos, que es a lo que se entra normalmente.
   */
  const [tab, setTab] = useState<'catalogo' | 'huecos'>('catalogo');

  const { datos, cargando, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [empresa, itemsBase, comandos] = await Promise.all([
      getCompania(companyId),
      getCatalogo(companyId),
      getComandosCatalogo(companyId),
    ]);
    const mediosBase = await getMediosDeVarios(itemsBase.map((i) => i.id));
    return {
      modo: (empresa?.business_mode ?? 'appointment') as BusinessMode,
      itemsBase,
      mediosBase,
      comandos,
    };
  }, [companyId]);

  /**
   * Lo que hay en la base, CON lo guardado encima aunque el bot no lo haya
   * aplicado todavía. Ver lib/panel/pendientes.ts: sin esto, un cambio en cola
   * desaparecería al recargar la página hasta que el bot lo recogiese.
   */
  const vista = useMemo(
    () => superponer(datos?.itemsBase ?? [], datos?.mediosBase ?? {}, datos?.comandos ?? []),
    [datos],
  );

  /**
   * Mientras quede algo en la cola, se vuelve a mirar cada 20 s: para enterarse
   * de cuándo llega de verdad, y para contar si el bot lo rechazó.
   *
   * `releer` y no `recargar`: una consulta por vuelta y no una ráfaga de ocho.
   * Con el bot apagado horas y la pestaña abierta, la diferencia importa. Y se
   * para sola en cuanto no queda nada en vuelo.
   */
  useEffect(() => {
    if (!vista.enVuelo) return;
    const reloj = setInterval(releer, 20000);
    return () => clearInterval(reloj);
  }, [vista.enVuelo, releer]);

  const items = vista.items;
  const modo = datos?.modo ?? 'appointment';

  const ocultos = items.filter((i) => !i.activo).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((i) => {
      if (!verOcultos && !i.activo) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q);
    });
  }, [items, busqueda, verOcultos]);

  const activos = items.filter((i) => i.activo).length;
  const sinFoto = items.filter((i) => i.activo && !(vista.medios[i.id]?.length)).length;

  /**
   * «Lo que no supe contestar». Aparte del useCargar de arriba a propósito:
   * cambiar el periodo no tiene por qué disparar la ráfaga de reintentos del
   * catálogo, y si esta consulta falla —la tabla es nueva— el resto de la
   * pantalla sigue funcionando igual.
   */
  const [periodoHuecos, setPeriodoHuecos] = useState('30d');
  const desdeHuecos = useMemo(
    () => rangoDe(PRESETS.find((p) => p.clave === periodoHuecos)?.dias ?? 30).desde,
    [periodoHuecos],
  );
  const { datos: huecos, cargando: cargandoHuecos } = useCargar(async () => {
    if (!companyId) return null;
    return getHuecos(companyId, desdeHuecos);
  }, [companyId, desdeHuecos]);

  const gruposHuecos = useMemo(() => agruparHuecos(huecos ?? []), [huecos]);

  /** Nombre → producto del catálogo, para el botón «editar ficha» de un grupo. */
  const itemPorNombre = useMemo(() => {
    const mapa = new Map<string, ItemCatalogo>();
    for (const it of items) mapa.set(it.name.trim().toLowerCase(), it);
    return mapa;
  }, [items]);

  /**
   * Con el id del producto ya resuelto: así <Huecos> sabe si el botón «editar
   * ficha» tiene a dónde ir sin tener que conocer el catálogo entero. Un
   * grupo sin id es un producto que se renombró o se borró desde que se hizo
   * la pregunta — sigue siendo útil saber que se preguntó, pero no hay ficha
   * que abrir.
   */
  const gruposHuecosVista = useMemo(
    () =>
      gruposHuecos.map((g) => ({
        ...g,
        itemId: g.producto ? (itemPorNombre.get(g.producto.trim().toLowerCase())?.id ?? null) : null,
      })),
    [gruposHuecos, itemPorNombre],
  );

  /** Abre la ficha de ESE producto, deshaciendo cualquier filtro que la esconda. */
  function irAFicha(producto: string) {
    const it = itemPorNombre.get(producto.trim().toLowerCase());
    if (!it) return;
    setBusqueda('');
    if (!it.activo) setVerOcultos(true);
    setAbierto(it.id);
    setTab('catalogo');
    requestAnimationFrame(() => {
      document.getElementById(`cat-item-${it.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function crear() {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    if (items.some((i) => i.name.trim().toLowerCase() === nombre.toLowerCase())) {
      avisar(`Ya tienes ${v.aItem === 'a' ? 'una' : 'un'} ${v.item} con ese nombre. Mia los pide por nombre: dos iguales la confunden.`, 'error');
      return;
    }
    /* Cerrar el formulario va en el mismo callback que el refresco, no en un
       `if (r)`: si el producto se va a crear, dejar el nombre escrito y el
       formulario abierto invita a darle otra vez y crear un duplicado — y Mia
       pide los productos por nombre, así que dos iguales la confunden. */
    await guardar(
      'upsert_catalog_item',
      { item: { name: nombre, price: 0, is_active: 1, currency: 'PEN' } },
      `${cap(v.item)} añadid${v.aItem}`,
      () => {
        setCreando(false);
        setNombreNuevo('');
        releer();
      },
    );
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Catálogo" sub="Lo único que Mia puede vender" />

        {/*
          El número va en la pestaña a propósito, igual que en Agenda: lo que
          no se ve, se olvida. Va aparte de la lista de productos porque crece
          con cada conversación — ver el aviso de arriba.
        */}
        <div className="view-toggle tabs-agenda">
          <button className={tab === 'catalogo' ? 'active' : ''} onClick={() => setTab('catalogo')}>
            <Package size={15} /> Catálogo
          </button>
          <button className={tab === 'huecos' ? 'active' : ''} onClick={() => setTab('huecos')}>
            <HelpCircle size={15} /> Lo que no supe contestar
            {(huecos?.length ?? 0) > 0 ? ` (${huecos?.length})` : ''}
          </button>
        </div>

        {tab === 'huecos' ? (
          <Huecos
            grupos={gruposHuecosVista}
            cargando={cargandoHuecos}
            periodo={periodoHuecos}
            alCambiarPeriodo={setPeriodoHuecos}
            alEditarFicha={irAFicha}
          />
        ) : (
          <>
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
              {/* Solo aparece si hay alguno oculto: un interruptor que nunca cambia
                  nada es ruido en la barra. */}
              {ocultos > 0 && (
                <button
                  className={`btn btn-sm ${verOcultos ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setVerOcultos((v) => !v)}
                >
                  {verOcultos ? <EyeOff size={15} /> : <Eye size={15} />}
                  {verOcultos ? 'Esconder ocultos' : `Ver ocultos (${ocultos})`}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setCreando((v) => !v)}>
                <Plus size={15} /> Añadir {v.item}
              </button>
            </div>
    
            {creando && (
              <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <label className="field-label">
                  {v.item === 'producto' ? 'Nombre del producto' : `Nombre de${v.laItem === 'la' ? ' la' : 'l'} ${v.item} o producto`}
                </label>
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
                <b>
                  {!items.length
                    ? 'El catálogo está vacío'
                    : ocultos === items.length && !verOcultos
                      ? 'Todo está oculto para Mia'
                      : 'Sin resultados'}
                </b>
                {!items.length
                  ? `Mia no puede vender lo que no está aquí: añade tus ${v.item === 'producto' ? 'productos' : v.items + ' o productos'}.`
                  : ocultos === items.length && !verOcultos
                    ? `Tienes ${ocultos} ${ocultos === 1 ? v.item : v.items}, pero ningun${v.aItem} visible. Mia no puede vender nada ahora mismo.`
                    : 'Prueba con otra búsqueda.'}
              </p>
            )}
    
            {/*
              Un cambio que el bot RECHAZÓ. Como se guarda sin esperarle, el rechazo
              llega después del clic, y no se puede dejar pintado como guardado.
            */}
            {vista.fallidos.length > 0 && (
              <p className="aviso-fallo">
                No se pudo aplicar{' '}
                {vista.fallidos.length === 1 ? 'un cambio' : vista.fallidos.length + ' cambios'}
                {vista.fallidos[0].error ? ': ' + vista.fallidos[0].error : ''}. Revisa {v.laItem} {v.item} y
                vuelve a guardarlo.
              </p>
            )}
    
            {visibles.map((it) => (
              <Ficha
                key={it.id}
                item={it}
                modo={modo}
                todos={items}
                medios={vista.medios[it.id] ?? []}
                companyId={companyId}
                abierta={abierto === it.id}
                // Un producto recién creado aún no tiene id real: no se abre hasta
                // que llegue, o sus cambios irían contra un id que la base no conoce.
                alAbrir={() => {
                  if (!esPendiente(it.id)) setAbierto((a) => (a === it.id ? null : it.id));
                }}
                aplicandose={vista.aplicandose.has(it.id)}
                alCambiar={releer}
              />
            ))}
          </>
        )}
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
  aplicandose,
}: {
  item: ItemCatalogo;
  modo: BusinessMode;
  todos: ItemCatalogo[];
  medios: CatalogMediaRow[];
  companyId: string | null;
  abierta: boolean;
  alAbrir: () => void;
  alCambiar: () => void;
  /** Tiene cambios guardados en la cola que el bot aún no ha aplicado. */
  aplicandose: boolean;
}) {
  // «servicio» en una barbería, «clase» en una academia, «producto» en una tienda.
  const v = useVocabulario();
  const enviar = useGuardar();
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
  const esRecurrente = modo === 'recurring_appointment';
  const vigencia = Number(f.vigencia_meses);
  const vigenciaValida = Number.isInteger(vigencia) && vigencia >= 1 && vigencia <= VIGENCIA_MAX;

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setF((x) => ({ ...x, [k]: v }));
  const setPromo = (v: Partial<BorradorVigencia>) => set('promo', { ...f.promo, ...v });

  /**
   * La ventana de la promo, tal como quedaría al guardar.
   *
   * El estado se calcula sobre el BORRADOR y no sobre la fila: quien mueve los
   * días quiere ver ahí mismo si eso deja la promo dentro o fuera. Pero solo se
   * dice lo que el bot está haciendo —«no la está ofreciendo»— cuando lo de la
   * pantalla es ya lo que hay guardado; si no, sería hablar de un cambio que
   * todavía no ha salido de aquí.
   */
  const promoTexto = construirVigencia(f.promo);
  const promoGuardada = promoTexto === (item.promo_vigencia ?? '');
  const promoVigente = vigenteHoy(promoTexto, hoyLima());
  /** Lo que impediría guardar. Se enseña al escribir, no solo al darle al botón. */
  const avisoVentana = errorVigencia(f.promo);

  /**
   * Lo mismo pero de la FILA, no del borrador: es lo que Mia está haciendo
   * ahora mismo, y por eso se puede decir en la cabecera con la ficha cerrada.
   *
   * Solo sale cuando hay ventana configurada y hoy queda fuera — `vigenteHoy`
   * devuelve true para un producto sin ventana, que son casi todos. Un «vigente»
   * en cada fila sería ruido; el caso que hay que ver sin abrir nada es el
   * contrario: el producto que existe, está activo, y aun así no se ofrece.
   */
  const fueraDeVentana = !vigenteHoy(item.promo_vigencia, hoyLima());

  async function guardar() {
    if (!f.name.trim()) {
      avisar(`${cap(v.laItem)} ${v.item} necesita un nombre: es como Mia l${v.aItem} pide.`, 'error');
      return;
    }
    if (esRecurrente && !vigenciaValida) {
      avisar(`La duración va en meses enteros, de 1 a ${VIGENCIA_MAX}.`, 'error');
      return;
    }
    /**
     * La ventana se valida AQUÍ porque el bot no se va a quejar: un
     * `promo_vigencia` que no entiende lo deja VIGENTE, no apagado (a propósito
     * — ver lib/panel/vigencia.ts). O sea que una errata no salta por ningún
     * lado: simplemente la ventana no se aplicaría y la promo caducada seguiría
     * ofreciéndose, que es justo el fallo que este campo viene a cerrar.
     */
    const malaVentana = errorVigencia(f.promo);
    if (malaVentana) {
      avisar(malaVentana, 'error');
      return;
    }
    /* Porcentaje de 0 a 100 («45» es 45 %), monto en soles y no negativo. Un
       0,45 como porcentaje pagaría céntimos donde tocaban soles, y no revienta
       en ningún sitio: se nota a fin de mes. */
    if (esCita) {
      const pct = f.comision_pct.trim() === '' ? null : Number(f.comision_pct.replace(',', '.'));
      if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
        avisar('La comisión en % va de 0 a 100 (45 = 45 %). Vacía = la del trabajador.', 'error');
        return;
      }
      const monto = f.comision_monto.trim() === '' ? null : Number(f.comision_monto.replace(',', '.'));
      if (monto != null && (!Number.isFinite(monto) || monto < 0)) {
        avisar('La comisión fija tiene que ser un importe de 0 o más.', 'error');
        return;
      }
    }
    setGuardando(true);
    /**
     * Desde el 11-sep-2026 `upsert_catalog_item` es un PATCH: lo que se manda
     * manda —también un `null` explícito—, y lo que NO se manda se conserva.
     * Antes reemplazaba la fila entera, y como este formulario no manda
     * `schedule_slots` ni `start_date`, guardar un nivel de un negocio
     * recurrente le habría borrado todos sus grupos. Ya no puede pasar.
     *
     * Por eso se siguen mandando todos los campos del formulario, y SOLO esos:
     * los que la pantalla no enseña los conserva el bot.
     *
     * Los números vacíos van como `null` a propósito: null en `stock` significa
     * "sin control de stock", que no es lo mismo que 0 — con 0 el bot diría que
     * está agotado.
     */
    const num = (v: string) => (v.trim() === '' ? null : Number(v));
    await enviar(
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
          // Cadena, no objeto. `''` en «Siempre», y va explícito: el upsert es
          // un PATCH, así que es lo único que limpia una ventana anterior.
          promo_vigencia: promoTexto,
          // Solo donde el formulario la enseña: en otros modos no significa nada.
          ...(esRecurrente ? { vigencia_meses: vigencia } : {}),
          // La comisión solo tiene sentido donde hay personal que atiende. Va
          // `null` explícito cuando se vacía: es lo que devuelve el servicio a
          // «usa la del trabajador» (el upsert es un PATCH).
          ...(esCita
            ? {
                comision_pct: num(f.comision_pct.replace(',', '.')),
                comision_monto: num(f.comision_monto.replace(',', '.')),
              }
            : {}),
        },
      },
      `${cap(v.item)} guardad${v.aItem}`,
      alCambiar,
    );
    setGuardando(false);
  }

  async function alternarVisible() {
    /**
     * `delete_catalog_item` es un borrado LÓGICO: pone is_active a 0. Para
     * volver a mostrarlo se usa el upsert con is_active 1 — no hay comando de
     * "restaurar".
     */
    if (item.activo) {
      await enviar('delete_catalog_item', { id: item.id }, `${cap(v.item)} ocult${v.aItem} para Mia`, alCambiar);
    } else {
      await enviar(
        'upsert_catalog_item',
        { item: { id: item.id, name: item.name, is_active: 1 } },
        `${cap(v.item)} visible otra vez`,
        alCambiar,
      );
    }
  }

  const precio = item.price == null ? '—' : `${item.currency || 'PEN'} ${item.price}`;

  return (
    <div id={`cat-item-${item.id}`} className={`cat-item ${item.activo ? '' : 'oculto'}`}>
      <div className="cat-head" onClick={alAbrir}>
        <Miniaturas medios={medios} salen={salen} />
        <div className="cat-id">
          <b>{item.name}</b>
          <small>
            {precio}
            {esCita && item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
            {!esCita && item.stock != null ? ` · ${item.stock} en stock` : ''}
            {item.paquete.length ? ` · pack de ${item.paquete.length}` : ''}
            {esRecurrente && (item.vigencia_meses ?? 1) > 1 ? ` · ${item.vigencia_meses} meses` : ''}
          </small>
        </div>

        {/*
          Guardado, y dice que lo está: el matiz es para que nadie se extrañe si
          Mia sigue usando el valor viejo un rato, no para que parezca pendiente.
        */}
        {aplicandose && (
          <span
            className="badge-pill aplicandose"
            title="Guardado en la cola. Mia lo verá en un máximo de 15 minutos; si el bot está apagado, se aplica en cuanto vuelva."
          >
            <Clock size={12} /> Guardado · aplicándose
          </span>
        )}

        {/*
          Va ANTES que «Queda poco» y «Sin foto»: esas dos dicen que el producto
          se vende peor, esta que no se vende nada. Y un producto activo, con
          foto y con stock que no aparece en ninguna conversación no tiene otra
          explicación a la vista.
        */}
        {fueraDeVentana && (
          <span
            className="badge-pill"
            style={{ color: 'var(--warm)', background: '#FEF6E7' }}
            title={`${describirVentana(item.promo_vigencia)} Hoy queda fuera, así que Mia no lo está ofreciendo.`}
          >
            ⏸ Fuera de ventana
          </span>
        )}

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

            {/*
              Solo en recurrentes —niveles y packs—. Decide cuánto tiempo ocupa
              el alumno su plaza, así que se explica en la propia ficha: un
              «3» suelto no dice si son meses, clases o semanas.
            */}
            {esRecurrente && (
              <div className="full">
                <label className="field-label">Duración (meses)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={VIGENCIA_MAX}
                  step={1}
                  style={{ maxWidth: 140 }}
                  value={f.vigencia_meses}
                  onChange={(e) => set('vigencia_meses', e.target.value)}
                />
                <small className="muted" style={{ fontSize: 11.5 }}>
                  {vigenciaValida ? (
                    <>
                      <b>Duración:</b> {textoVigencia(vigencia)}
                    </>
                  ) : (
                    `Meses enteros, de 1 a ${VIGENCIA_MAX}. 1 para un nivel mensual, 3 para una promo trimestral.`
                  )}
                </small>
              </div>
            )}

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
                <div>
                  <label className="field-label">Comisión (%)</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="vacío = la del trabajador"
                    value={f.comision_pct}
                    onChange={(e) => set('comision_pct', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Comisión fija ({f.currency || 'PEN'})</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="gana al %"
                    value={f.comision_monto}
                    onChange={(e) => set('comision_monto', e.target.value)}
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

            {/*
              CUÁNDO SE PUEDE OFRECER. Tres opciones y sus controles: nunca un
              textarea de JSON — quien rellena esto es el dueño de una barbería.

              El estado de hoy se enseña al lado a propósito. Sin él, se
              configura una ventana, se ve que Mia no menciona la promo, y se
              cree que Mia está rota: un ticket de soporte en lugar de una
              función que se entiende sola.
            */}
            <div className="full">
              <label className="field-label">Disponibilidad</label>

              <div className="opciones" style={{ gridTemplateColumns: '1fr', marginTop: 0, gap: 8 }}>
                {(
                  [
                    ['siempre', 'Siempre'],
                    ['mensual', 'Todos los meses, del'],
                    ['rango', 'Solo entre'],
                  ] as [ModoVigencia, string][]
                ).map(([modo, rotulo]) => (
                  <label
                    key={modo}
                    className={`opcion ${f.promo.modo === modo ? 'on' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
                  >
                    {/* Los controles van DENTRO del label: tocar un día elige
                        también su opción, que es lo que cualquiera espera. */}
                    <input
                      type="radio"
                      name={`promo-${item.id}`}
                      checked={f.promo.modo === modo}
                      onChange={() => setPromo({ modo })}
                      style={{ accentColor: 'var(--brand)', cursor: 'pointer' }}
                    />
                    <b style={{ fontWeight: 700, fontSize: 13 }}>{rotulo}</b>

                    {modo === 'mensual' && (
                      <>
                        {/* Desplegables y no texto libre: a mano se teclea un 0 o un 32. */}
                        <select
                          className="select"
                          style={{ width: 'auto', minWidth: 72, padding: '7px 10px' }}
                          value={f.promo.dia_desde}
                          onChange={(e) => setPromo({ modo, dia_desde: e.target.value })}
                        >
                          {DIAS_DEL_MES.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <b style={{ fontWeight: 700, fontSize: 13 }}>al</b>
                        <select
                          className="select"
                          style={{ width: 'auto', minWidth: 72, padding: '7px 10px' }}
                          value={f.promo.dia_hasta}
                          onChange={(e) => setPromo({ modo, dia_hasta: e.target.value })}
                        >
                          {DIAS_DEL_MES.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    {modo === 'rango' && (
                      <>
                        <input
                          className="input"
                          type="date"
                          style={{ width: 'auto', minWidth: 150, padding: '7px 10px' }}
                          value={f.promo.desde}
                          onChange={(e) => setPromo({ modo, desde: e.target.value })}
                        />
                        <b style={{ fontWeight: 700, fontSize: 13 }}>y</b>
                        <input
                          className="input"
                          type="date"
                          style={{ width: 'auto', minWidth: 150, padding: '7px 10px' }}
                          value={f.promo.hasta}
                          onChange={(e) => setPromo({ modo, hasta: e.target.value })}
                        />
                      </>
                    )}

                    {modo === 'siempre' && <span className="opcion__def">por defecto</span>}
                  </label>
                ))}
              </div>

              {/*
                Con el rango a medio rellenar no se enseña el estado: sin las
                dos fechas la ventana no dice nada todavía, y un «vigente hoy»
                ahí sería una respuesta a una pregunta que aún no está hecha.
                Se enseña lo que falta, y lo mismo que impediría guardar.
              */}
              {avisoVentana ? (
                <small
                  style={{
                    display: 'block',
                    marginTop: 8,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--warm)',
                  }}
                >
                  {avisoVentana}
                </small>
              ) : (
                <div
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  {promoVigente ? (
                    <span className="badge-pill" style={{ color: 'var(--new)', background: '#E8FBF2' }}>
                      ✅ Vigente hoy
                    </span>
                  ) : (
                    <span className="badge-pill" style={{ color: 'var(--warm)', background: '#FEF6E7' }}>
                      ⏸ Fuera de ventana
                      {promoGuardada ? ' — Mia no la está ofreciendo' : ' con estas fechas'}
                    </span>
                  )}
                  <small className="muted" style={{ fontSize: 11.5 }}>
                    {describirVentana(promoTexto)}
                  </small>
                </div>
              )}

              <small className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 6 }}>
                Es CUÁNDO SE OFRECE, no cuánto dura lo que se compra
                {esRecurrente ? ' (eso es «Duración (meses)», aquí arriba)' : ''}. Del 28 al 3
                también vale: se entiende como fin de mes y principio del siguiente.
              </small>
            </div>
          </div>

          <Paquete
            item={item}
            todos={todos}
            seleccion={f.package_services}
            alCambiar={(v) => set('package_services', v)}
          />

          {modo === 'recurring_appointment' && (
            <div className="desfase" style={{ background: 'var(--bg-soft)', borderColor: 'var(--line-2)', color: 'var(--ink-soft)', marginTop: 14 }}>
              Las <b>franjas semanales</b> de {v.laItem === 'la' ? 'esta' : 'este'} {v.item} (días, horas y aforo) no se editan desde
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
              {item.activo ? (
                <>
                  <EyeOff size={15} /> Ocultar para Mia
                </>
              ) : (
                <>
                  <Eye size={15} /> Volver a mostrar
                </>
              )}
            </button>
            <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
              <Check size={16} /> {guardando ? 'Guardando…' : `Guardar ${v.item}`}
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
  // «servicio» en una barbería, «clase» en una academia, «producto» en una tienda.
  const v = useVocabulario();
  const guardar = useGuardar();
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
        await guardar(
          'upsert_catalog_media',
          {
            catalog_id: item.id,
            url: subida.secure_url,
            media_type: esVideo ? 'video' : 'image',
            ...(idExistente ? { id: idExistente } : {}),
          },
          idExistente ? 'Foto sustituida' : 'Foto añadida',
          alCambiar,
        );
      } catch (e) {
        avisar(e instanceof Error ? e.message : 'No se pudo subir el fichero', 'error');
      } finally {
        setSubiendo(false);
        setSustituyendo(null);
        if (entrada.current) entrada.current.value = '';
      }
    },
    [companyId, item.id, guardar, avisar, alCambiar],
  );

  async function borrar(m: CatalogMediaRow) {
    await guardar('delete_catalog_media', { id: m.id }, 'Foto eliminada', alCambiar);
  }

  /**
   * Marcar la que se envía. El bot desmarca las demás en la misma operación,
   * así que NO se encola un segundo comando para desmarcar.
   *
   * La estrella se mueve al momento: el cambio se pinta encima desde la cola
   * (ver lib/panel/pendientes.ts), que desmarca las demás igual que hace el
   * bot, así que nunca hay dos ★ a la vista. Si el bot rechazara el cambio,
   * la estrella vuelve a su sitio y la pantalla lo cuenta.
   */
  async function marcar(m: CatalogMediaRow) {
    await guardar(
      'set_primary_media',
      { id: m.id },
      m.media_type === 'video' ? 'Vídeo principal cambiado' : 'Ya es la que se envía',
      alCambiar,
    );
  }

  /* Se derivan de `medios` en cada render a propósito: así se recalculan
     solos tras borrar, que es el caso donde el bug se cuela — borrar la
     principal no asciende a ninguna otra. Ver laQueSaldria(). */
  const marcada = hayPrincipal(medios);
  const porDefecto = laQueSaldria(medios);

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
        las que saldrían. <b>Tú eliges cuál</b>: pulsa la estrella de una foto y esa será la que
        Mia enseñe al presentar el producto. Si no marcas ninguna sale la primera que subiste, y la
        pantalla te dice cuál es. <b>La foto manda sobre el vídeo</b>: el vídeo solo sale si el
        cliente lo pide o si no hay ninguna foto, y ocupa el mensaje entero. El <b>pie lo escribe
        Mia</b> con el nombre y el precio de arriba — no se edita aquí a propósito: un precio
        inventado en el pie de una foto es justo donde más se lo cree el cliente.
      </div>

      {medios.length === 0 && (
        <p className="vacio" style={{ marginTop: 12 }}>
          <b>Sin fotos</b>
          Un producto con foto se vende mucho mejor por WhatsApp que uno descrito con palabras.
        </p>
      )}

      <div className="medios-grid">
        {medios.map((m) => {
          const principal = bool(m.is_primary);
          /* Solo cuando NADIE está marcado: el dueño tiene que poder saber cuál
             sale sin haber tocado nada. Con una marcada, esta etiqueta sobra. */
          const pordefecto = !marcada && m.id === porDefecto;
          const esVideo = m.media_type === 'video';

          return (
            <div key={m.id} className={`medio ${principal || pordefecto ? 'sale' : salen.has(m.id) ? 'sale' : ''}${esPendiente(m.id) ? ' pendiente' : ''}`}>
              {esVideo ? (
                <div className="medio__video">
                  <Video size={22} />
                  <span>vídeo</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" loading="lazy" />
              )}

              {/*
                Una sola etiqueta por foto, en este orden. Tres insignias
                compitiendo en una miniatura de 120px no informan: decoran.
              */}
              {principal ? (
                <span className="medio__sale" title={`Es la que Mia enseña al presentar ${v.laItem} ${v.item}.`}>
                  <Star size={12} /> Principal
                </span>
              ) : pordefecto ? (
                <span
                  className="medio__sale medio__sale--defecto"
                  title="Nadie ha elegido, así que sale esta por ser la primera que se subió. Pulsa la estrella de otra para cambiarlo."
                >
                  Se enviará esta
                </span>
              ) : salen.has(m.id) ? (
                <span
                  className="medio__sale medio__sale--extra"
                  title={`Sale como «otra vista», detrás de la principal, cuando el cliente pregunta solo por ${v.laItem === 'la' ? 'esta' : 'este'} ${v.item}.`}
                >
                  también sale
                </span>
              ) : null}

              {/*
                La estrella va fuera de la barra de acciones y siempre visible:
                dentro serían tres botones en 120px, y escondida tras el hover
                no la encuentra quien no sabe que existe — que es justo el dueño
                al que esta pantalla tiene que servir.
              */}
              {!principal && (
                <button
                  type="button"
                  className="medio__estrella"
                  disabled={subiendo || esPendiente(m.id)}
                  onClick={() => void marcar(m)}
                  title={
                    esVideo
                      ? 'Marcarlo elige QUÉ vídeo se manda, pero el vídeo solo sale si el cliente pide verlo en movimiento. Para lo que Mia enseña de entrada, marca una foto.'
                      : `Que sea esta la que Mia enseñe al presentar ${v.laItem} ${v.item}.`
                  }
                >
                  <Star size={13} />
                </button>
              )}

              <div className="medio__acciones">
                <button
                  type="button"
                  onClick={() => {
                    setSustituyendo(m.id);
                    entrada.current?.click();
                  }}
                  disabled={subiendo || esPendiente(m.id)}
                >
                  Cambiar
                </button>
                <button type="button" className="del" onClick={() => void borrar(m)} disabled={subiendo || esPendiente(m.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}

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
          se envían: pulsa la estrella de la que quieras que Mia enseñe, sin borrar ni volver a
          subir nada.
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

/* ═══════════════════════════════════════════════════════════════════════ */

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE NO SUPE CONTESTAR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No es «errores del bot»: Mia no se equivocó, acertó al no inventarse un
 * dato. Lo que falta es información del negocio, y por eso NO hay botón que
 * rellene la ficha con IA — sería exactamente el fallo que esta pantalla
 * viene a arreglar, un piso más arriba.
 *
 * Tampoco hay nombre de cliente ni enlace a su conversación: lo útil aquí es
 * el agregado. Un hueco preguntado por siete personas no es de ninguna de
 * ellas.
 */
interface GrupoHuecoVista extends GrupoHueco {
  /** null = el producto se renombró u ocultó desde que se hizo la pregunta. */
  itemId: string | null;
}

function Huecos({
  grupos,
  cargando,
  periodo,
  alCambiarPeriodo,
  alEditarFicha,
}: {
  grupos: GrupoHuecoVista[];
  cargando: boolean;
  periodo: string;
  alCambiarPeriodo: (v: string) => void;
  alEditarFicha: (producto: string) => void;
}) {
  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
        Cada vez que Mia admite que no sabe algo en vez de inventárselo, queda aquí. Ordenado por
        cuántas veces se lo han preguntado: eso es lo que más ventas te está costando.
      </p>

      <div className="rango">
        <span className="etq">Periodo</span>
        <select className="select" value={periodo} onChange={(e) => alCambiarPeriodo(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {cargando && (
        <div className="cargando">
          <div className="spin" />
          Cargando…
        </div>
      )}

      {!cargando && grupos.length === 0 && (
        <p className="vacio">
          <b>Nada pendiente</b>
          El bot pudo contestar todo lo que le preguntaron en este periodo.
        </p>
      )}

      {grupos.map((g) => (
        <GrupoDeProducto key={g.producto || '·negocio·'} grupo={g} alEditarFicha={alEditarFicha} />
      ))}
    </div>
  );
}

function GrupoDeProducto({
  grupo,
  alEditarFicha,
}: {
  grupo: GrupoHuecoVista;
  alEditarFicha: (producto: string) => void;
}) {
  // «servicio» en una barbería, «clase» en una academia, «producto» en una tienda.
  const v = useVocabulario();
  const esNegocio = grupo.producto === '';

  return (
    <div className="cat-item">
      <div className="cat-head" style={{ cursor: 'default' }}>
        <div className="cat-id">
          <b>{esNegocio ? 'Del negocio (no van en una ficha)' : grupo.producto}</b>
          {esNegocio && (
            <small>Se arreglan en las reglas del negocio, no en una ficha de {v.item}.</small>
          )}
        </div>
        <span className="badge-pill" style={{ color: 'var(--warm)', background: '#FEF6E7' }}>
          {grupo.veces} {grupo.veces === 1 ? 'vez' : 'veces'}
        </span>
      </div>

      <div className="cat-body" style={{ paddingTop: 4 }}>
        {grupo.preguntas.map((v, i) => (
          <VariantePregunta key={i} variante={v} />
        ))}

        <div className="nav-btns" style={{ marginTop: 14 }}>
          {esNegocio ? (
            <Link href="/panel/configuracion?paso=3" className="btn btn-ghost btn-sm">
              Editar reglas del negocio <ArrowRight size={14} />
            </Link>
          ) : grupo.itemId ? (
            <button className="btn btn-ghost btn-sm" onClick={() => alEditarFicha(grupo.producto)}>
              Editar ficha <ArrowRight size={14} />
            </button>
          ) : (
            <small className="muted" style={{ fontSize: 11.5 }}>
              Este producto ya no está en el catálogo con ese nombre — puede que se renombrara u
              ocultara después de la pregunta.
            </small>
          )}
        </div>
      </div>
    </div>
  );
}

/** Una pregunta agrupada por parecido. Las variantes se ven al desplegar. */
function VariantePregunta({ variante }: { variante: GrupoHueco['preguntas'][number] }) {
  const [abierta, setAbierta] = useState(false);
  const otras = variante.variantes.filter((t) => t !== variante.pregunta);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13.5, flex: 1 }}>
          · «{variante.pregunta}»
          <span className="muted" style={{ marginLeft: 6, fontSize: 12.5 }}>
            ({variante.veces})
          </span>
        </span>
        {otras.length > 0 && (
          <button
            type="button"
            className="q-icon"
            aria-label={abierta ? 'Ocultar variantes' : 'Ver variantes'}
            onClick={() => setAbierta((a) => !a)}
          >
            {abierta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {abierta && otras.length > 0 && (
        <ul style={{ margin: '4px 0 0 22px', padding: 0, listStyle: 'none' }}>
          {otras.map((t, i) => (
            <li key={i} className="muted" style={{ fontSize: 12.5 }}>
              «{t}»
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
