'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL CATÁLOGO DEL EMPLEADO · solo para mirar
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lo que vende el negocio, con su precio y su duración, para que quien atiende
 * sepa qué decirle al cliente. Sin editar nada: la pantalla de Catálogo es la
 * de cambiar precios, y esa sigue siendo del dueño y del administrador.
 *
 * Es otra pantalla y no la de Catálogo en modo lectura a propósito: aquella
 * tiene altas, fotos, ocultos y huecos por todas partes, y bastaría con
 * olvidar UN botón para dejarle editar. Aquí no hay ninguno.
 *
 * Lee `catalogo_del_equipo` (lo mismo para los tres roles desde la 0043 del
 * bot). Lo oculto (`is_active` = 0) no sale: el bot tampoco lo ofrece.
 */
import { useMemo } from 'react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { soles } from '@/lib/panel/format';
import { esAppointmentFamily } from '@/lib/panel/modo';
import { vocabulario } from '@/lib/panel/vocabulario';
import { getCatalogoDelEquipo } from '@/lib/supabase/queries';

export default function MiCatalogo() {
  const { companyId, compania } = useSesion();
  const modo = compania?.business_mode;
  const v = vocabulario(modo);

  const { datos, cargando, error } = useCargar(async () => {
    if (!companyId) return null;
    return getCatalogoDelEquipo(companyId);
  }, [companyId]);

  const items = useMemo(
    () =>
      (datos ?? [])
        .filter((c) => c.is_active !== 0)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es')),
    [datos],
  );

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Catálogo" sub={`Los ${v.items} del negocio, con su precio`} />

        {error && <p className="vacio">No se pudo cargar el catálogo: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando…</p>}
        {datos && items.length === 0 && <p className="vacio">Todavía no hay {v.items} en el catálogo.</p>}

        {items.length > 0 && (
          <div className="card mia-grupo">
            {items.map((c) => (
              <div className="mia-fila mia-fila--catalogo" key={c.id}>
                <div className="mia-quien">
                  <b>{c.name}</b>
                  {c.description && <small>{c.description}</small>}
                </div>
                <div className="mia-acciones">
                  {esAppointmentFamily(modo) && c.duration_minutes ? (
                    <span className="mia-estado">{c.duration_minutes} min</span>
                  ) : null}
                  <b>{c.price != null ? soles(c.price) : '—'}</b>
                </div>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Si un precio no está bien, díselo al dueño o al administrador: ellos lo cambian.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
