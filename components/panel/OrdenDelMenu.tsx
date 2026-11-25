'use client';

/**
 * Ajustes › Orden del menú (datos 0020). El dueño o el administrador ponen primero lo que más
 * usan —Kallpa, 18-nov-2026: «Fideliza es lo que usan, lo primero luego del Dashboard»— y mandan
 * a «Más» lo que no tocan. Vale para todo el equipo del negocio.
 *
 * Enseña la lista que sale en la barra (useMenuDelPanel, el mismo cálculo), así que lo que se ve
 * aquí es lo que se ve allí. El Dashboard va primero y Ajustes al final, antes de «Más»: no se mueven.
 *
 * 25-nov-2026 (Alvaro: «no veo que funcione al guardar; debería ser drag and drop»):
 *  · Se ARRASTRA (MenuArrastrable): dentro de «A la vista», y hacia «Más» o desde «Más».
 *  · Se GUARDA SOLO al soltar, como los interruptores de al lado. Antes había un botón «Guardar
 *    orden» al pie de la lista, que no era el «Guardar» grande de Ajustes y no se veía; y tras
 *    guardar, la lista volvía un momento al orden viejo (la caché del navegador, ver menu.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMenuDelPanel } from './Sidebar';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { useCargar } from './useCargar';
import MenuArrastrable, { igualZonas, type FilaMenu, type Zonas } from './MenuArrastrable';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { demoActivo } from '@/lib/panel/demo';
import { esCita } from '@/lib/panel/modo';
import {
  FIJAS,
  RUTA_AJUSTES,
  RUTA_INICIO,
  SIEMPRE_A_LA_VISTA,
  SIN_ORDEN,
  guardarFidelizaEquipo,
  guardarOrdenMenu,
  ordenar,
  pestanasArriba,
  useOrdenMenu,
  type OrdenMenu,
} from '@/lib/panel/menu';

/** Lo que espera tras soltar antes de guardar: dos arrastres seguidos son un solo guardado. */
const ESPERA_GUARDAR_MS = 500;

export default function OrdenDelMenu() {
  const { companyId, compania } = useSesion();
  const avisar = useAvisar();
  const modo = compania?.business_mode;
  const { nav, rail, railExtra, etiqueta, personalizado } = useMenuDelPanel({ modo });

  // Lo que hay ahora en la barra, como punto de partida.
  const actual = useMemo<OrdenMenu>(
    () => ({ orden: [...rail, ...railExtra].map((n) => n.href), enMas: railExtra.map((n) => n.href) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rail.map((n) => n.href).join(), railExtra.map((n) => n.href).join()],
  );
  /** Lo que se está moviendo o guardando. null = lo de la barra. */
  const [borrador, setBorrador] = useState<Zonas | null>(null);
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto');
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => setBorrador(null), [companyId]);
  // ¿El equipo ve Fideliza? (datos 0022). null = como siempre (sí).
  const guardadoFideliza = useOrdenMenu(companyId ?? null).equipoFideliza ?? null;
  const [veFideliza, setVeFideliza] = useState<boolean | null>(null);
  useEffect(() => setVeFideliza(null), [companyId, guardadoFideliza]);
  const equipoVeFideliza = veFideliza ?? guardadoFideliza !== false;

  async function cambiarFideliza(ve: boolean) {
    if (demoActivo()) {
      avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
      return;
    }
    if (!companyId) return;
    setVeFideliza(ve);
    const error = await guardarFidelizaEquipo(companyId, ve);
    if (error) {
      setVeFideliza(null);
      avisar(error, 'error');
      return;
    }
    avisar(ve ? '✓ Tu equipo ya ve Fideliza.' : '✓ Listo: tu equipo ya no ve Fideliza.', 'ok');
  }

  /** Nombre e icono de cada entrada, como en la barra. */
  const filas = useMemo(
    () => new Map<string, FilaMenu>(nav.map((n) => [n.href, { nombre: etiqueta(n), Icono: n.icon }])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nav.map((n) => n.href).join(), modo],
  );

  /** Lo de la barra, partido en las dos zonas. */
  const deLaBarra = useMemo<Zonas>(() => {
    const lista = ordenar(nav, actual).map((n) => n.href).filter((h) => !FIJAS.includes(h));
    const mas = new Set(actual.enMas.filter((h) => !SIEMPRE_A_LA_VISTA.includes(h)));
    return { vista: lista.filter((h) => !mas.has(h)), mas: lista.filter((h) => mas.has(h)) };
  }, [nav, actual]);
  const zonas = borrador ?? deLaBarra;
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;
  const barraRef = useRef(deLaBarra);
  barraRef.current = deLaBarra;

  /** Las dos zonas, como las guarda la base: Dashboard, lo de la vista, Ajustes y luego «Más». */
  const aOrden = ({ vista, mas }: Zonas): OrdenMenu => ({
    orden: [
      ...(filas.has(RUTA_INICIO) ? [RUTA_INICIO] : []),
      ...vista,
      ...(filas.has(RUTA_AJUSTES) ? [RUTA_AJUSTES] : []),
      ...mas,
    ],
    enMas: mas,
  });

  /* ── Guardar solo, un momento después del último cambio ─────────────── */
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef(false);
  const otraVez = useRef(false);

  async function guardarYa() {
    if (!companyId) return;
    if (enVuelo.current) {
      // Llegó otro cambio mientras se guardaba: se guarda al terminar, con lo último.
      otraVez.current = true;
      return;
    }
    enVuelo.current = true;
    setEstado('guardando');
    const error = await guardarOrdenMenu(companyId, aOrden(zonasRef.current));
    enVuelo.current = false;
    if (error) {
      otraVez.current = false;
      avisar(error, 'error');
      setBorrador(null); // vuelve a lo que de verdad tiene la barra
      setEstado('quieto');
      return;
    }
    if (otraVez.current) {
      otraVez.current = false;
      void guardarYa();
      return;
    }
    setEstado('guardado');
  }

  function cambiar(z: Zonas) {
    zonasRef.current = z;
    setBorrador(z);
    setEstado('quieto');
  }

  function programarGuardado() {
    if (demoActivo()) {
      avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
      setBorrador(null);
      return;
    }
    // Soltada donde estaba (o devuelta a su sitio): no hay nada que guardar.
    if (!enVuelo.current && !reloj.current && igualZonas(zonasRef.current, barraRef.current)) {
      setBorrador(null);
      return;
    }
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => {
      reloj.current = null;
      void guardarYa();
    }, ESPERA_GUARDAR_MS);
  }
  useEffect(
    () => () => {
      if (reloj.current) clearTimeout(reloj.current);
    },
    [],
  );

  // Cuando la barra ya enseña lo guardado —y no hay nada más a medias—, el borrador sobra.
  useEffect(() => {
    if (!borrador || arrastrando || estado === 'guardando' || reloj.current || enVuelo.current) return;
    if (igualZonas(borrador, deLaBarra)) setBorrador(null);
  }, [borrador, deLaBarra, estado, arrastrando]);

  // «✓ Guardado» se queda un rato y se va.
  useEffect(() => {
    if (estado !== 'guardado') return;
    const t = setTimeout(() => setEstado('quieto'), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  async function volverAlDeSiempre() {
    if (demoActivo()) {
      avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
      return;
    }
    if (!companyId) return;
    setEstado('guardando');
    const error = await guardarOrdenMenu(companyId, SIN_ORDEN);
    setEstado('quieto');
    if (error) {
      avisar(error, 'error');
      return;
    }
    setBorrador(null);
    avisar('El menú volvió al orden de siempre.', 'ok');
  }

  return (
    <details className="cfg-advanced cfg-advanced--section">
      <summary>Orden del menú</summary>
      <div className="menu-orden">
        {/* 25-nov-2026 (The 24/7): lo de Fideliza para el equipo, junto y plegable. */}
        <details className="menu-fz" open>
          <summary>Fideliza y tu equipo</summary>
          <label className="toggle-row">
            <span className="t">
              <b>Tu equipo ve Fideliza</b>
              <small>Apagado, tus empleados (barberos) no lo ven en su menú. Tú y el administrador sí.</small>
            </span>
            <input type="checkbox" checked={equipoVeFideliza} onChange={(e) => void cambiarFideliza(e.target.checked)} />
          </label>
          {equipoVeFideliza && companyId && <SoloQrEquipo companyId={companyId} />}
        </details>
        <div className="menu-orden__cabeza">
          <p className="muted">
            Arrastra para ordenar. Las {pestanasArriba(esCita(modo))} primeras salen también en las pestañas de arriba
            (marcadas «Pestaña»). Lo que pongas en «Más» sigue ahí, a un toque. Se guarda solo y vale para todo tu equipo.
          </p>
          <span className={`menu-orden__estado menu-orden__estado--${estado}`} role="status" aria-live="polite">
            {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? '✓ Guardado' : ''}
          </span>
        </div>
        <MenuArrastrable
          zonas={zonas}
          filas={filas}
          alCambiar={cambiar}
          alSoltar={programarGuardado}
          alArrastrar={setArrastrando}
          enPestanas={personalizado || borrador ? pestanasArriba(esCita(modo)) : 0}
        />
        {personalizado && borrador === null && estado === 'quieto' && (
          <div className="menu-orden__pie">
            <button type="button" className="btn btn-ghost" onClick={() => void volverAlDeSiempre()}>
              Volver al de siempre
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * «Tu equipo solo suma escaneando el QR» (fideliza page_style.caja_solo_qr, 25-nov-2026). Antes
 * estaba en Fideliza › Tu club; Alvaro lo quiso aquí, con el resto de lo del equipo. El servidor
 * lo exige en caja.buscar para el rol de caja. Sin club de Fideliza no sale.
 */
function SoloQrEquipo({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const { datos, recargar } = useCargar(() => lecturas.ajustes(companyId), [companyId]);
  const [guardando, setGuardando] = useState(false);
  if (!datos) return null;
  const estilo = (datos.page_style ?? {}) as Record<string, unknown>;
  const on = estilo.caja_solo_qr === true;

  async function cambiar(v: boolean) {
    if (demoActivo()) {
      avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
      return;
    }
    setGuardando(true);
    try {
      // page_style se guarda entero: se relee justo antes para no pisar lo de Mi club ni Mis enlaces.
      const fresco = ((await lecturas.ajustes(companyId))?.page_style ?? {}) as Record<string, unknown>;
      await accion('estilo.guardar', { companyId, estilo: { plantilla: 'clasica', ...fresco, caja_solo_qr: v } });
      recargar();
      avisar(v ? '✓ Tu equipo ahora suma solo escaneando el QR.' : '✓ Tu equipo vuelve a poder buscar por nombre o celular.', 'ok');
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <label className="toggle-row">
      <span className="t">
        <b>Solo suman escaneando el QR</b>
        <small>Tus empleados no buscan por nombre, celular ni código, ni crean tarjetas: el cliente enseña la suya. Tú y el administrador buscan como siempre.</small>
      </span>
      <input type="checkbox" checked={on} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} />
    </label>
  );
}
