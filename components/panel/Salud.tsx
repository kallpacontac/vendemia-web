'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ¿ESTÁ FUNCIONANDO EL BOT DE ESTE CLIENTE?
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una sola consulta a `v_instance_health` para todo el panel: la píldora de la
 * barra superior y el aviso flotante beben de aquí. Antes cada uno consultaba
 * por su cuenta y podían contradecirse durante un minuto.
 *
 * ── TRES ESTADOS, NO DOS ─────────────────────────────────────────────────
 *
 *   cargando     · todavía no se sabe. No enseñes nada rojo.
 *   desconocido  · la consulta no devolvió fila: esta compañía aún no tiene
 *                  instancia registrada. Eso NO es "el bot está caído" — es
 *                  que no hay nada que mirar. Una alarma permanente aquí es
 *                  peor que el silencio: se aprende a ignorarla.
 *   con datos    · `vivo` y `wa_connected` son cosas DISTINTAS. El proceso
 *                  puede estar perfectamente vivo con la sesión de WhatsApp
 *                  caída: dos problemas con dos arreglos distintos.
 *
 * `diagnostico` viene ya redactado desde la vista ("Hay que ir a re-emparejar
 * el WhatsApp"). Se enseña tal cual; no lo reescribas aquí.
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

/** Atajo: ¿el bot está funcionando de verdad, proceso Y WhatsApp? */
export const botOperativo = (s: InstanceHealthRow | null): boolean =>
  Boolean(s?.vivo && s?.wa_connected);
