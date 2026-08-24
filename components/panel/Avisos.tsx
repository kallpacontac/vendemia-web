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
 * contestó a tiempo (el comando sigue encolado) o si falló. Quien llama decide
 * si refresca la pantalla; lo normal es no tocar nada y esperar a que el cambio
 * vuelva por el espejo en 1-2 segundos, que es cuando existe de verdad.
 */
export function useComando() {
  const { companyId } = useSesion();
  const avisar = useAvisar();

  return useCallback(
    async <T,>(
      type: TipoComando,
      payload: Record<string, unknown>,
      exito?: string,
    ): Promise<T | undefined> => {
      if (!companyId) return undefined;
      try {
        const r = await encolar<T>(companyId, type, payload);
        if (exito) avisar(exito, 'ok');
        return r;
      } catch (e) {
        if (e instanceof BotNoResponde) {
          avisar(
            'El bot no está en línea ahora mismo. El cambio quedó encolado y se aplicará solo cuando arranque.',
            'espera',
          );
        } else {
          avisar(e instanceof Error ? e.message : 'No se pudo aplicar el cambio', 'error');
        }
        return undefined;
      }
    },
    [companyId, avisar],
  );
}
