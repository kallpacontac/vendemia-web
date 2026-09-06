'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿HACE FALTA HACER ALGO CON EL WHATSAPP DE ESTE CLIENTE?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una sola consulta a `v_instance_health` para todo el panel.
 *
 * ── QUÉ SE ENSEÑA Y QUÉ NO ───────────────────────────────────────────────
 *
 * Esto nació para contarle al dueño si el bot estaba encendido. Ya no lo
 * hace. Que el proceso esté vivo es responsabilidad NUESTRA, no suya: corre
 * en un portátil que se reinicia, se queda sin luz o tarda en arrancar, y
 * avisarle de cada bache solo consigue dos cosas malas — que nos escriba por
 * algo que ya estamos arreglando, y que aprenda a ignorar los avisos, con lo
 * que el día que salga uno de verdad tampoco lo lea.
 *
 * Queda UNA cosa que sí es asunto del cliente: re-emparejar el WhatsApp. Eso
 * no lo podemos resolver solos —hay que quedar con él y escanear el código
 * con su teléfono delante—, así que ahí sí se avisa: arriba y en pequeño.
 *
 * ⚠️ NO pintes `diagnostico` tal cual en ninguna pantalla. Lo redacta la
 * vista del backend y entre sus textos está «La instancia no da señales»,
 * que es justo lo que no queremos que lea el cliente. Sirve para decidir, no
 * para enseñar; el texto visible lo escribimos nosotros.
 *
 * ⚠️ No uses `sync_state.last_mirror_at` para saber si los datos están al día:
 * esa tabla se eliminó. Y aunque existiera, sería peor señal — el latido y el
 * volcado del espejo salen del mismo proceso, con el mismo cliente y por la
 * misma conexión, así que si uno falla el otro ya falló. La diferencia es que
 * esta vista además dice POR QUÉ.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { getSalud } from '@/lib/supabase/queries';
import type { InstanceHealthRow } from '@/lib/supabase/types';
import { useSesion } from './Sesion';

interface EstadoSalud {
  salud: InstanceHealthRow | null;
  cargando: boolean;
  /** true cuando ya se consultó y no hay fila: compañía sin instancia registrada. */
  desconocido: boolean;
}

const Ctx = createContext<EstadoSalud>({ salud: null, cargando: true, desconocido: false });

/** El latido caduca a los 90 s; mirarlo cada 60 evita decir "conectado" un cuarto de hora de más. */
const CADA_MS = 60000;

export function ProveedorSalud({ children }: { children: React.ReactNode }) {
  const { companyId } = useSesion();
  const [estado, setEstado] = useState<EstadoSalud>({ salud: null, cargando: true, desconocido: false });

  useEffect(() => {
    if (!companyId) return;
    let vivo = true;

    const mirar = async () => {
      const s = await getSalud(companyId);
      if (!vivo) return;
      setEstado({ salud: s, cargando: false, desconocido: s === null });
    };

    void mirar();
    const t = setInterval(() => void mirar(), CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [companyId]);

  return <Ctx.Provider value={estado}>{children}</Ctx.Provider>;
}

export const useSalud = (): EstadoSalud => useContext(Ctx);

/**
 * ¿Hay que quedar con el cliente para re-emparejar el WhatsApp?
 *
 * Es lo ÚNICO que este módulo saca a pantalla. Dos caminos:
 *
 *   `needs_qr` · el backend lo afirma explícitamente: el bot está pidiendo un
 *                código. Sigue siendo cierto aunque el proceso esté apagado.
 *
 *   vivo && !wa_connected · el `vivo` va a propósito. Con el proceso caído,
 *                `wa_connected` es un dato viejo que casi siempre vale false,
 *                así que sin esa condición el cliente vería «hay que emparejar
 *                el WhatsApp» cada noche que se apaga el portátil. Falso, y
 *                además nos genera la llamada que queremos evitar. Solo cuando
 *                el proceso está en pie y dice que la sesión no está vinculada
 *                sabemos de verdad que hace falta.
 */
export const necesitaEmparejar = (s: InstanceHealthRow | null): boolean =>
  Boolean(s && (s.status === 'needs_qr' || (s.vivo && !s.wa_connected)));
