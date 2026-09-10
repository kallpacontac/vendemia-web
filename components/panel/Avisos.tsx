'use client';

/**
 * Los avisos del panel (el "toast" de abajo a la derecha) y el envoltorio para
 * mandar comandos.
 *
 * `useComando()` existe para que ninguna pantalla tenga que acordarse de la
 * distinción que más importa de todo el contrato:
 *
 *   · Un error de verdad  → el comando no se aplicó, dilo.
 *   · BotNoResponde       → el comando SÍ está encolado. Se drena en cuanto el
 *                           bot arranque. Decir "no se guardó" sería mentira, y
 *                           el usuario volvería a darle a guardar.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { BotNoResponde, encolar, type TipoComando } from '@/lib/supabase/commands';
import { useSesion } from './Sesion';
import { useSalud } from './Salud';
import { demoActivo } from '@/lib/panel/demo';

type Tono = 'ok' | 'error' | 'espera';

interface Aviso {
  id: number;
  texto: string;
  tono: Tono;
}

const Ctx = createContext<((texto: string, tono?: Tono) => void) | null>(null);

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = useCallback((texto: string, tono: Tono = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tono }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="avisos">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso--${a.tono}`}>
            {a.tono === 'ok' && <CheckCircle size={16} />}
            {a.tono === 'error' && <AlertTriangle size={16} />}
            {a.tono === 'espera' && <Info size={16} />}
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useAvisar() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAvisar() solo se puede usar dentro de <ProveedorAvisos>');
  return v;
}

/**
 * Manda un comando y traduce el resultado a un aviso.
 *
 * Devuelve el `result` del bot cuando llega, o `undefined` si el bot no
 * contestó a tiempo (el comando sigue encolado) o si falló.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ `undefined` NO SIGNIFICA «NO PASÓ NADA». Usa `refrescar`.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ese `undefined` tapa DOS casos que no se parecen en nada:
 *
 *   · el comando falló           → no cambió nada, y está bien no refrescar;
 *   · el bot no contestó a tiempo → el comando SIGUE ENCOLADO y se aplicará.
 *
 * El segundo es común: 15 s de espera, o 3 s si ya sabemos que el bot está
 * apagado. Y el patrón `const r = await comando(...); if (r) refrescar()` —que
 * es el que había en toda la pantalla de Catálogo— trata ese caso como si no
 * hubiera pasado nada: el cambio SÍ ocurre, el espejo lo publica, y la pantalla
 * se queda con lo viejo hasta que alguien recarga a mano. Se ve exactamente
 * como «subí la foto y no aparece» o «cambié el precio y no se guardó», y lleva
 * a repetir la acción, que encola el comando dos veces.
 *
 * Por eso el refresco va AQUÍ y no en el `if` de quien llama: `refrescar()` se
 * invoca cuando el cambio va a existir —confirmado o encolado— y solo se salta
 * cuando de verdad falló. Quien llama no tiene que acordarse de distinguirlo.
 *
 * Sigue sin haber pintado optimista: `refrescar` normalmente es el `recargar()`
 * de useCargar, que vuelve a preguntar y trae lo que el bot tiene DE VERDAD.
 *
 * @param refrescar se llama cuando el cambio se aplicó o está encolado. Pásalo
 *        siempre que la pantalla tenga que reflejar el cambio.
 */
/** Cuánto esperar al bot cuando la salud dice que está apagado. */
const ESPERA_CORTA_MS = 3000;

export function useComando() {
  const { companyId } = useSesion();
  const { salud, desconocido } = useSalud();
  const avisar = useAvisar();

  /**
   * ¿Sabemos ya que el bot está apagado?
   *
   * `desconocido` es distinto de apagado: sin fila en v_instance_health no se
   * puede afirmar nada, y ahí sí toca esperar lo normal.
   */
  const botCaido = !desconocido && salud?.vivo === false;

  return useCallback(
    async <T,>(
      type: TipoComando,
      payload: Record<string, unknown>,
      exito?: string,
      refrescar?: () => void,
    ): Promise<T | undefined> => {
      if (!companyId) return undefined;
      /**
       * ══════════════════════════════════════════════════════════════════════
       * ⚠️ EN MODO DEMO NO SE ESCRIBE NADA. Este es el único portón.
       * ══════════════════════════════════════════════════════════════════════
       *
       * Todo lo que el panel puede cambiar pasa por aquí, así que basta con
       * cerrarlo en un sitio. Y hay que cerrarlo: en demo las pantallas enseñan
       * ids inventados (`demo-cita-3`, `demo-ped-12`) que el bot rechazaría, y
       * los que NO son inventados son peores — Ajustes lee la compañía real, y
       * un Guardar durante una presentación escribiría el horario de mentira en
       * el negocio de verdad.
       *
       * Se avisa en vez de fallar en silencio: quien esté enseñando el panel
       * tiene que entender por qué el botón no hizo nada.
       */
      if (demoActivo()) {
        avisar('Estás en modo demo: no se guarda nada. Sal del modo demo para cambiar algo de verdad.', 'espera');
        return undefined;
      }
      try {
        /**
         * Con el bot apagado, el comando SE ENCOLA IGUAL —es lo correcto, se
         * aplicará cuando arranque— pero no tiene sentido tener a alguien
         * mirando una rueda 15 segundos para acabar diciéndole lo que ya
         * sabíamos antes de empezar.
         */
        const r = await encolar<T>(companyId, type, payload, botCaido ? ESPERA_CORTA_MS : undefined);
        if (exito) avisar(exito, 'ok');
        refrescar?.();
        return r;
      } catch (e) {
        if (e instanceof BotNoResponde) {
          avisar(
            botCaido
              ? 'Guardado. Se está aplicando y puede tardar un poco en aparecer en la pantalla; no hace falta que lo vuelvas a escribir.'
              : 'Guardado. Se está aplicando y puede tardar un momento en aparecer en la pantalla.',
            'espera',
          );
          /**
           * ⚠️ SÍ se refresca. El comando está encolado y el bot lo aplicará;
           * lo único que se agotó es nuestra paciencia esperándolo. La ráfaga
           * de reintentos de useCargar es justo lo que recoge el cambio cuando
           * llegue, sin que nadie tenga que recargar la página.
           */
          refrescar?.();
        } else {
          // Aquí NO: el comando falló de verdad y no hay nada nuevo que leer.
          avisar(e instanceof Error ? e.message : 'No se pudo aplicar el cambio', 'error');
        }
        return undefined;
      }
    },
    [companyId, avisar, botCaido],
  );
}
