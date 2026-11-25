'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TABLERO DE CLIENTES · el embudo en columnas, como un CRM
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las columnas y la regla que pone a cada contacto en una están en
 * lib/panel/prospectos.ts. Aquí se pinta: en el celular, un bloque debajo
 * de otro; desde 768 px, columnas que se desplazan a lo ancho.
 *
 * Cada tarjeta abre el chat. «Te toca a ti» va primero porque es lo único que
 * espera por una persona.
 *
 * ARRASTRAR (datos 0035, 25-nov-2026). Depende de cómo atiende el negocio
 * (`regla`, la decide la base): con «Cierra la venta» no se arrastra; en el
 * híbrido, solo a «Demo agendada» y «Cliente»; sin bot, a cualquier columna.
 *  · Ratón: se arrastra la tarjeta entera; un clic sin mover sigue abriendo el chat.
 *  · Dedo: desde el asa (⠿), para que deslizar siga desplazando la página.
 *  · Un toque en el asa (o Enter con teclado) abre «Mover a…»: en el teléfono,
 *    con las columnas una debajo de otra, es lo cómodo.
 * Se guarda al soltar; si la base lo rechaza, la tarjeta vuelve a su sitio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { GripVertical, Hand, MessageCircle, PauseCircle, Search } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { useAvisar } from '@/components/panel/Avisos';
import { cuando, telefono } from '@/lib/panel/format';
import {
  ETAPAS,
  getProspectos,
  ponerEtapa,
  sePuedePoner,
  type Etapa,
  type Prospecto,
  type ReglaCrm,
} from '@/lib/panel/prospectos';
import './tablero-clientes.css';
import './crm-arrastre.css';

const TITULO = new Map(ETAPAS.map((e) => [e.id, e.titulo]));

/** Lo que dice el tablero sobre arrastrar, según la regla. */
const AYUDA_REGLA: Record<ReglaCrm, string> = {
  auto: 'Las columnas las mueve Mia según lo que pasa en cada conversación.',
  hibrido: 'Mia lleva la conversación. Tú mueves a «Demo agendada» y a «Cliente»: arrastra la tarjeta o toca ⠿.',
  manual: 'Arrastra cada tarjeta a su columna, o toca ⠿. Lo que pongas se queda así.',
};

interface Arrastre {
  p: Prospecto;
  x: number;
  y: number;
  /** Desde dónde se agarró, dentro de la tarjeta: la copia flotante no salta. */
  dx: number;
  dy: number;
  ancho: number;
}

export default function TableroClientes({ companyId }: { companyId: string }) {
  const { datos, cargando, recargar } = useCargar(async () => (companyId ? getProspectos(companyId) : null), [companyId]);
  const avisar = useAvisar();
  const [busqueda, setBusqueda] = useState('');
  /** Lo movido aquí y aún no releído de la base. */
  const [movidos, setMovidos] = useState<Map<string, { etapa: Etapa; aMano: boolean }>>(new Map());
  // Al llegar datos nuevos, lo que dice la base manda.
  useEffect(() => setMovidos(new Map()), [datos]);

  const regla: ReglaCrm = datos?.regla ?? 'auto';
  const lista = useMemo(
    () =>
      (datos?.prospectos ?? []).map((p) => {
        const m = movidos.get(p.id);
        return m ? { ...p, ...m } : p;
      }),
    [datos, movidos],
  );

  const porEtapa = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const m = new Map<Etapa, Prospecto[]>(ETAPAS.map((e) => [e.id, []]));
    for (const p of lista) {
      if (q && !p.nombre.toLowerCase().includes(q) && !p.telefono.includes(q)) continue;
      m.get(p.etapa)?.push(p);
    }
    return m;
  }, [lista, busqueda]);

  const total = lista.length;

  /** Mueve y guarda. `null` = que lo decida Mia. */
  async function moverA(p: Prospecto, etapa: Etapa | null) {
    const destino = etapa ?? p.etapaAuto;
    if (etapa !== null && etapa === p.etapa && p.aMano) return;
    if (etapa !== null && etapa === p.etapa && !p.aMano && etapa === p.etapaAuto) return;
    setMovidos((m) => new Map(m).set(p.id, { etapa: destino, aMano: etapa !== null }));
    const error = await ponerEtapa(companyId, p.id, etapa);
    if (error) {
      setMovidos((m) => {
        const n = new Map(m);
        n.delete(p.id);
        return n;
      });
      avisar(error, 'error');
      return;
    }
    avisar(etapa ? `${p.nombre} → ${TITULO.get(etapa)}` : `${p.nombre}: vuelve a decidirlo Mia`, 'ok');
    recargar();
  }

  /* ── Arrastrar ───────────────────────────────────────────────────────── */
  const columnasRef = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [encima, setEncima] = useState<Etapa | null>(null);
  /** Tras un arrastre con ratón, el clic que llega al soltar no abre el chat. */
  const sinClic = useRef(false);

  function columnaEn(x: number, y: number): Etapa | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-etapa]');
    return el && columnasRef.current?.contains(el) ? (el.dataset.etapa as Etapa) : null;
  }

  function cajaQueDesplaza(): HTMLElement | null {
    let el = columnasRef.current?.parentElement ?? null;
    while (el) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  }

  function empezar(e: React.PointerEvent, p: Prospecto) {
    if (regla === 'auto') return;
    const objetivo = e.target as HTMLElement;
    const desdeAsa = Boolean(objetivo.closest('.tcl__asa'));
    if (e.pointerType !== 'mouse' && !desdeAsa) return; // con el dedo, solo desde el asa
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (objetivo.closest('.tcl__menu')) return;

    const tarjeta = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let empezado = false;
    let ultimo = { x: x0, y: y0 };
    let rueda: number | null = null;
    const caja = cajaQueDesplaza();
    const cols = columnasRef.current;
    if (e.pointerType === 'mouse') e.preventDefault(); // sin seleccionar texto ni arrastrar el enlace

    // Cerca de un borde, la página (o las columnas, a lo ancho) siguen solas.
    const desplazar = () => {
      const alto = caja ? caja.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const dy = ultimo.y < alto.top + 70 ? -12 : ultimo.y > alto.bottom - 70 ? 12 : 0;
      if (dy) {
        if (caja) caja.scrollTop += dy;
        else window.scrollBy(0, dy);
      }
      if (cols && cols.scrollWidth > cols.clientWidth) {
        const r = cols.getBoundingClientRect();
        const dx = ultimo.x < r.left + 60 ? -14 : ultimo.x > r.right - 60 ? 14 : 0;
        if (dx) cols.scrollLeft += dx;
      }
      if (dy) setEncima(columnaEn(ultimo.x, ultimo.y));
      rueda = requestAnimationFrame(desplazar);
    };

    const mover = (ev: PointerEvent) => {
      ultimo = { x: ev.clientX, y: ev.clientY };
      if (!empezado) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; // un toque o un clic, no un arrastre
        empezado = true;
        rueda = requestAnimationFrame(desplazar);
      }
      setArrastre({ p, x: ev.clientX, y: ev.clientY, dx: x0 - tarjeta.left, dy: y0 - tarjeta.top, ancho: tarjeta.width });
      setEncima(columnaEn(ev.clientX, ev.clientY));
    };
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      if (rueda !== null) cancelAnimationFrame(rueda);
      if (!empezado) return; // fue un toque: el asa abre su menú con su propio clic
      sinClic.current = true;
      setTimeout(() => (sinClic.current = false), 0);
      const col = ev.type === 'pointerup' ? columnaEn(ev.clientX, ev.clientY) : null;
      setArrastre(null);
      setEncima(null);
      if (col && col !== p.etapa && sePuedePoner(regla, col)) void moverA(p, col);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

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
      {datos && <p className="tcl__regla">{AYUDA_REGLA[regla]}</p>}

      {cargando && !datos ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <div ref={columnasRef} className={`tcl__columnas ${arrastre ? 'tcl__columnas--arrastrando' : ''}`}>
          {ETAPAS.map((e) => {
            const enCol = porEtapa.get(e.id) ?? [];
            const admite = arrastre ? e.id !== arrastre.p.etapa && sePuedePoner(regla, e.id) : false;
            return (
              <div
                key={e.id}
                data-etapa={e.id}
                className={`tcl__col tcl__col--${e.id} ${arrastre ? (admite ? 'tcl__col--admite' : 'tcl__col--no') : ''} ${admite && encima === e.id ? 'tcl__col--encima' : ''}`}
              >
                <h3 className="tcl__cabeza"><span>{e.titulo}</span><b>{enCol.length}</b></h3>
                <p className="tcl__ayuda">{e.ayuda}</p>
                <div className="tcl__lista">
                  {enCol.length === 0 ? (
                    <p className="tcl__vacia">{admite ? 'Suéltalo aquí.' : 'Nadie por ahora.'}</p>
                  ) : (
                    enCol.map((p) =>
                      regla === 'auto' ? (
                        <Tarjeta key={p.id} p={p} />
                      ) : (
                        <TarjetaMovible
                          key={p.id}
                          p={p}
                          regla={regla}
                          enVuelo={arrastre?.p.id === p.id}
                          alEmpezar={(ev) => empezar(ev, p)}
                          alMover={(etapa) => void moverA(p, etapa)}
                          sinClic={sinClic}
                        />
                      ),
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {arrastre && (
        <div
          className="tcl__fantasma"
          style={{ width: arrastre.ancho, transform: `translate(${arrastre.x - arrastre.dx}px, ${arrastre.y - arrastre.dy}px)` }}
          aria-hidden
        >
          <b>{arrastre.p.nombre}</b>
          <span>{encima && sePuedePoner(regla, encima) && encima !== arrastre.p.etapa ? `→ ${TITULO.get(encima)}` : 'Suelta en una columna'}</span>
        </div>
      )}
    </section>
  );
}

function Tarjeta({ p, sinClic }: { p: Prospecto; sinClic?: React.MutableRefObject<boolean> }) {
  return (
    <Link
      href={`/panel/mensajes?lead=${p.id}`}
      className="tcl__tarjeta"
      draggable={false}
      onClick={(e) => {
        if (sinClic?.current) e.preventDefault();
      }}
    >
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
        {p.aMano && <span className="tcl__sello tcl__sello--mano"><Hand size={13} /> Puesto a mano</span>}
        <span className="tcl__abrir"><MessageCircle size={13} /> Ver chat</span>
      </span>
    </Link>
  );
}

/** La tarjeta con su asa: se arrastra, y un toque en el asa abre «Mover a…». */
function TarjetaMovible({
  p,
  regla,
  enVuelo,
  alEmpezar,
  alMover,
  sinClic,
}: {
  p: Prospecto;
  regla: ReglaCrm;
  enVuelo: boolean;
  alEmpezar: (e: React.PointerEvent) => void;
  alMover: (etapa: Etapa | null) => void;
  sinClic: React.MutableRefObject<boolean>;
}) {
  const [menu, setMenu] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const destinos = ETAPAS.filter((e) => e.id !== p.etapa && sePuedePoner(regla, e.id));

  // Se cierra al tocar fuera o con Escape.
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setMenu(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [menu]);

  return (
    <div ref={caja} className={`tcl__caja ${enVuelo ? 'tcl__caja--en-vuelo' : ''}`} onPointerDown={alEmpezar}>
      <button
        type="button"
        className="tcl__asa"
        aria-label={`Mover a ${p.nombre} de columna`}
        aria-expanded={menu}
        onClick={() => {
          if (!sinClic.current) setMenu((v) => !v);
        }}
      >
        <GripVertical size={16} />
      </button>
      <Tarjeta p={p} sinClic={sinClic} />
      {menu && (
        <div className="tcl__menu" role="menu" aria-label="Mover a">
          <p className="tcl__menu-titulo">Mover a…</p>
          {destinos.map((e) => (
            <button
              key={e.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                alMover(e.id);
              }}
            >
              {e.titulo}
            </button>
          ))}
          {p.aMano && (
            <button
              type="button"
              role="menuitem"
              className="tcl__menu-mia"
              onClick={() => {
                setMenu(false);
                alMover(null);
              }}
            >
              Que lo decida Mia ({ETAPAS.find((e) => e.id === p.etapaAuto)?.titulo})
            </button>
          )}
          {destinos.length === 0 && !p.aMano && <p className="tcl__menu-titulo">No hay otra columna a la que moverlo.</p>}
        </div>
      )}
    </div>
  );
}
