'use client';

/**
 * La invitación a crear la tarjeta de puntos que sale al terminar de subir el comprobante de una
 * reserva, si ese celular todavía no tiene tarjeta en el club (sql/0022). Pedido por Alvaro el
 * 14-nov-2026 para The 24/7: «¿Quieres un corte gratis? Regístrate y al sexto corte…», con una
 * foto del negocio de fondo (secciones.fideliza.foto).
 *
 * Un diálogo de verdad: foco en el botón principal, Escape y el fondo lo cierran, y el foco vuelve
 * a donde estaba. Sin foto, el fondo es el color de la página.
 */
import { useEffect, useRef } from 'react';
import { Gift, X } from 'lucide-react';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';

/** «un corte clásico gratis» → «¿Quieres un corte clásico gratis?». */
export function tituloInvitacion(premio: string): string {
  const p = premio.trim().replace(/[.!¡]+$/, '');
  return p ? `¿Quieres ${p.charAt(0).toLowerCase()}${p.slice(1)}?` : '¿Tu próxima visita gratis?';
}

export function textoInvitacion(t: Pick<TarjetaPublica, 'meta' | 'premio'>, sedes = 0): string {
  const premio = t.premio.trim().replace(/[.!]+$/, '') || 'tu premio';
  const base = t.meta > 0
    ? `Crea tu tarjeta ahora: cada visita suma un sello y al completar ${t.meta} te llevas ${premio}.`
    : `Crea tu tarjeta ahora: cada visita suma puntos para ${premio}.`;
  // Una sola tarjeta para todos los locales: los sellos de cualquier sede suman en la misma.
  return sedes > 1 ? `${base} Vale en ${sedes === 2 ? 'nuestras dos sedes' : `nuestras ${sedes} sedes`}.` : base;
}

export default function InvitarTarjeta({ tarjeta, href, alCerrar, alCrear, sedes = 0 }: {
  tarjeta: TarjetaPublica;
  /** Cuántos locales tiene el negocio: con 2 o más se dice que la tarjeta vale en todos. */
  sedes?: number;
  /** El alta de Fideliza, con el nombre del cliente ya escrito. */
  href: string;
  alCerrar: () => void;
  alCrear?: () => void;
}) {
  const boton = useRef<HTMLAnchorElement>(null);
  // La función llega nueva en cada render del padre: se lee de aquí para no repetir el efecto.
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    boton.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      antes?.focus?.();
    };
  }, []);

  const casillas = Math.min(tarjeta.meta, 8);

  return (
    <div className="tp-invitar" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <section className={`tp-invitar__caja${tarjeta.foto ? ' tp-invitar__caja--foto' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tp-invitar-t" aria-describedby="tp-invitar-d"
        style={tarjeta.foto ? { backgroundImage: `url("${tarjeta.foto}")` } : undefined}>
        <button type="button" className="tp-invitar__cerrar" onClick={alCerrar} aria-label="Cerrar"><X size={20} aria-hidden="true" /></button>
        <div className="tp-invitar__contenido">
          <span className="tp-invitar__club">{tarjeta.nombre}</span>
          <h2 id="tp-invitar-t">{tituloInvitacion(tarjeta.premio)}</h2>
          <p id="tp-invitar-d">{textoInvitacion(tarjeta, sedes)}</p>
          {casillas > 0 && (
            <ol className="tp-invitar__sellos" aria-label={`${tarjeta.meta} sellos para el premio`}>
              {Array.from({ length: casillas }, (_, i) => (
                <li key={i} className={i === casillas - 1 ? 'tp-invitar__premio' : ''} aria-hidden="true">
                  {i === casillas - 1 ? <Gift size={18} /> : i + 1}
                </li>
              ))}
            </ol>
          )}
          <a ref={boton} className="tp-boton tp-invitar__crear" href={href} target="_blank" rel="noopener" onClick={() => { alCrear?.(); alCerrar(); }}>
            Crear mi tarjeta gratis
          </a>
          <button type="button" className="tp-invitar__despues" onClick={alCerrar}>Ahora no</button>
          <small>Sin app ni contraseña: queda en tu celular.</small>
        </div>
      </section>
    </div>
  );
}
