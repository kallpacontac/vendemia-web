'use client';

/**
 * Ajustes › Orden del menú (datos 0020). El dueño o el administrador ponen primero lo que más
 * usan —Kallpa, 18-nov-2026: «Fideliza es lo que usan, lo primero luego del Dashboard»— y mandan
 * a «Más» lo que no tocan. Vale para todo el equipo del negocio.
 *
 * Enseña la lista que sale en la barra (useMenuDelPanel, el mismo cálculo), así que lo que se ve
 * aquí es lo que se ve allí. El Dashboard va primero y Ajustes al final, antes de «Más»: no se mueven.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import { useMenuDelPanel } from './Sidebar';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { demoActivo } from '@/lib/panel/demo';
import { FIJAS, RUTA_INICIO, SIEMPRE_A_LA_VISTA, SIN_ORDEN, guardarOrdenMenu, ordenar, type OrdenMenu } from '@/lib/panel/menu';

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
  const [borrador, setBorrador] = useState<OrdenMenu | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setBorrador(null), [companyId]);

  const vista = borrador ?? actual;
  const lista = ordenar(nav, vista);
  const cambio = borrador !== null && JSON.stringify(borrador) !== JSON.stringify(actual);

  function mover(i: number, d: -1 | 1) {
    const hrefs = lista.map((n) => n.href);
    const j = i + d;
    // El Dashboard (primero) y Ajustes (último) no se mueven, ni nadie pasa por encima de ellos.
    if (j < 0 || j >= hrefs.length || FIJAS.includes(hrefs[i]) || FIJAS.includes(hrefs[j])) return;
    [hrefs[i], hrefs[j]] = [hrefs[j], hrefs[i]];
    setBorrador({ ...vista, orden: hrefs });
  }

  function alternar(href: string) {
    const enMas = vista.enMas.includes(href) ? vista.enMas.filter((h) => h !== href) : [...vista.enMas, href];
    setBorrador({ orden: lista.map((n) => n.href), enMas });
  }

  async function guardar(o: OrdenMenu, texto: string) {
    if (demoActivo()) {
      avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
      return;
    }
    if (!companyId) return;
    setGuardando(true);
    const error = await guardarOrdenMenu(companyId, o);
    setGuardando(false);
    if (error) {
      avisar(error, 'error');
      return;
    }
    setBorrador(null);
    avisar(texto, 'ok');
  }

  return (
    <details className="cfg-advanced cfg-advanced--section">
      <summary>Orden del menú</summary>
      <div className="menu-orden">
        <p className="muted">
          Pon arriba lo que más usas. Lo que mandes a «Más» sigue ahí, a un toque. Vale para todo tu equipo.
        </p>
        <ol className="menu-orden__lista">
          {lista.map((n, i) => {
            const fijo = FIJAS.includes(n.href);
            const enMas = vista.enMas.includes(n.href) && !SIEMPRE_A_LA_VISTA.includes(n.href);
            const Icono = n.icon;
            return (
              <li key={n.href} className={`menu-orden__fila ${enMas ? 'menu-orden__fila--mas' : ''}`}>
                <span className="menu-orden__ico"><Icono size={16} /></span>
                <span className="menu-orden__txt">
                  {etiqueta(n)}
                  {fijo && <small>{n.href === RUTA_INICIO ? ' · siempre primero' : ' · siempre al final, antes de «Más»'}</small>}
                </span>
                {!fijo && (
                  <span className="menu-orden__btns">
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Subir ${etiqueta(n)}`} disabled={i <= 0 || FIJAS.includes(lista[i - 1].href)} onClick={() => mover(i, -1)}>
                      <ArrowUp size={15} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Bajar ${etiqueta(n)}`} disabled={i >= lista.length - 1 || FIJAS.includes(lista[i + 1].href)} onClick={() => mover(i, 1)}>
                      <ArrowDown size={15} />
                    </button>
                    {!SIEMPRE_A_LA_VISTA.includes(n.href) && (
                      <button
                        type="button"
                        className={`btn btn-sm menu-orden__vis ${enMas ? 'btn-ghost' : ''}`}
                        aria-pressed={!enMas}
                        onClick={() => alternar(n.href)}
                      >
                        {enMas ? <EyeOff size={14} /> : <Eye size={14} />} {enMas ? 'En «Más»' : 'A la vista'}
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="menu-orden__pie">
          {personalizado && !cambio && (
            <button type="button" className="btn btn-ghost" disabled={guardando} onClick={() => void guardar(SIN_ORDEN, 'El menú volvió al orden de siempre.')}>
              Volver al de siempre
            </button>
          )}
          {cambio && (
            <>
              <button type="button" className="btn btn-ghost" disabled={guardando} onClick={() => setBorrador(null)}>
                Descartar
              </button>
              <button type="button" className="btn btn-primary" disabled={guardando} onClick={() => void guardar(vista, 'Orden del menú guardado.')}>
                {guardando ? 'Guardando…' : 'Guardar orden'}
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
