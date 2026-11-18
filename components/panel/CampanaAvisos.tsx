'use client';

/**
 * La campana de la barra de arriba (18-nov-2026, The 24/7: «ponlo en notificaciones, misma
 * animación de vibrar del ícono»).
 *
 * En todas las pantallas del dueño y del administrador: el número es cuántas cosas hay por
 * hacer, y VIBRA mientras haya algo urgente (un cliente por cobrar, un pago por verificar, una
 * cita sin marcar…). Al tocarla, la misma lista del inicio (FilasPendientes); cada fila lleva a
 * donde se resuelve. Misma consulta que el inicio (usePendientes): no se pide dos veces.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, CheckCircle2, X } from 'lucide-react';
import { useSesion } from './Sesion';
import { FilasPendientes, usePendientes } from './Pendientes';
import './pendientes.css';

export default function CampanaAvisos() {
  const { companyId, rol } = useSesion();
  // El barbero tiene lo suyo en Mi agenda / Mi comisión; esto es del mostrador y del dueño.
  const ve = Boolean(companyId) && rol !== 'empleado';
  const datos = usePendientes(ve ? companyId : null);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const ruta = usePathname();

  // Se cierra al cambiar de pantalla, al tocar fuera y con Escape.
  useEffect(() => setAbierto(false), [ruta]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  if (!ve || !datos) return null;
  const urgentes = datos.filter((p) => p.tono === 'ya').length;
  const etiqueta = datos.length ? `${datos.length} ${datos.length === 1 ? 'cosa' : 'cosas'} por atender` : 'Nada pendiente';

  return (
    <div ref={caja} className={`notif${urgentes ? ' notif--ya' : ''}`}>
      <button type="button" className="icon-btn" aria-label={`Notificaciones: ${etiqueta}`} aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}>
        <Bell />
        {datos.length > 0 && <span className="dot">{datos.length > 9 ? '9+' : datos.length}</span>}
      </button>
      {abierto && (
        <div className="notif__panel" role="dialog" aria-label="Lo que necesita atención">
          <div className="dash-section-head">
            <div>
              <span className="dash-eyebrow">Notificaciones</span>
              <h3>{datos.length ? 'Lo que necesita atención' : 'Todo al día'}</h3>
            </div>
            <button type="button" className="round-link" aria-label="Cerrar" onClick={() => setAbierto(false)}>
              <X size={16} />
            </button>
          </div>
          {datos.length ? (
            <div className="notif__lista">
              <FilasPendientes datos={datos} alElegir={() => setAbierto(false)} />
            </div>
          ) : (
            <p className="pend-vacio"><CheckCircle2 size={14} style={{ verticalAlign: -2, color: '#14756F' }} /> Nada pendiente ahora. Cuando algo llegue, la campana vibra.</p>
          )}
        </div>
      )}
    </div>
  );
}
