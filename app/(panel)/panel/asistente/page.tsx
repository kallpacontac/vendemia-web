'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ASISTENTE · el dueño le pregunta a Mia por su negocio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta página solo decide CUÁL de estas cosas se ve:
 *
 *   · la tarjeta de «no es para ti», si quien entra es un empleado;
 *   · la tarjeta de «confirma que eres tú», si lleva 10 minutos sin tocarse;
 *   · la tarjeta de «no disponible», si el bot dijo que este negocio no tiene
 *     asistente;
 *   · la conversación.
 *
 * Y por eso la conversación es un componente aparte con `key`: cuando esta
 * página deja de pintarla —bloqueo, cambio de negocio, salir— React la
 * desmonta, y con ella se van las burbujas, los audios y el micrófono. Borrar
 * la conversación de la pantalla no es una función que haya que acordarse de
 * llamar: es que ya no está.
 *
 * ⚠️ Quien decide si hay asistente es EL BOT, no el plan: puede estar regalado
 * a un negocio fuera de Best Seller, o apagado en uno que lo tiene. Así que se
 * enseña siempre el chat, y solo si el bot contesta que no está activo se
 * cambia por la tarjeta. El plan se mira después, y solo para elegir el texto.
 *
 * El contrato con el bot, en lib/panel/asistente.ts. El porqué del bloqueo, en
 * components/panel/asistente/useBloqueo.ts.
 */
import '@/components/panel/asistente/asistente.css';
import { useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import Bloqueo from '@/components/panel/asistente/Bloqueo';
import Conversacion from '@/components/panel/asistente/Conversacion';
import { useBloqueo } from '@/components/panel/asistente/useBloqueo';
import { puedeUsarAsistente } from '@/lib/panel/asistente';
import { rolDeNegocio } from '@/lib/panel/roles';
import { getCompania } from '@/lib/supabase/queries';
import { whatsappUrl } from '@/lib/content';

export default function Asistente() {
  const { session, companyId, compania, esDueno, salir } = useSesion();
  const { bloqueado, desbloquear } = useBloqueo(session);
  /** Solo mientras dure la visita: al recargar vuelve apagado. */
  const [conVoz, setConVoz] = useState(false);
  /**
   * Los negocios en los que el bot ya dijo que no hay asistente. En memoria,
   * para no volver a preguntarlo en cada intento; nunca en localStorage, que
   * lo dejaría dicho para siempre aunque se active mañana.
   */
  const [sinAsistente, setSinAsistente] = useState<string[]>([]);
  /** Los negocios en los que el bot dijo que el rol de esta persona no entra. */
  const [sinPermiso, setSinPermiso] = useState<string[]>([]);

  if (!session || !companyId) return null;

  const email = session.user.email ?? '';
  const proveedores = session.user.app_metadata?.providers;
  const conGoogle = Array.isArray(proveedores) && proveedores.includes('google');

  return (
    <main className="main main--asistente">
      <div className="wrap">
        <Topbar titulo="Asistente" sub="Pregúntale a Mia por tu negocio" />

        {!puedeUsarAsistente(rolDeNegocio(compania?.rol)) || sinPermiso.includes(companyId) ? (
          // El empleado que llega por la URL, o a quien el bot le acaba de decir que no. La entrada del menú ya no
          // la ve; esto es para que la página diga por qué en vez de un chat
          // que el bot le iba a rechazar.
          <section className="asis-tarjeta">
            <span className="asis-tarjeta__ico">
              <Lock size={22} />
            </span>
            <h2>El asistente es para el dueño y el administrador del negocio</h2>
            <p>Aquí Mia contesta con los números del negocio. Si necesitas un dato, pídeselo a quien lo administra.</p>
          </section>
        ) : bloqueado ? (
          <Bloqueo email={email} conGoogle={conGoogle} alDesbloquear={desbloquear} alSalir={() => void salir()} />
        ) : sinAsistente.includes(companyId) ? (
          <NoDisponible key={companyId} companyId={companyId} />
        ) : (
          <Conversacion
            key={companyId}
            companyId={companyId}
            modo={compania?.business_mode}
            esDueno={esDueno}
            conVoz={conVoz}
            alCambiarVoz={setConVoz}
            alNoDisponible={() => setSinAsistente((l) => (l.includes(companyId) ? l : [...l, companyId]))}
            alSinPermiso={() => setSinPermiso((l) => (l.includes(companyId) ? l : [...l, companyId]))}
            // El bot ya no reconoce a quien pregunta: como una sesión caducada.
            alSinSesion={() => void salir()}
          />
        )}
      </div>
    </main>
  );
}

/**
 * El bot contestó «El asistente no está activo para este negocio».
 *
 * El plan elige el texto: a quien no tiene Best Seller se le dice dónde viene
 * incluido; a quien sí lo tiene, que se lo estamos activando —decirle «súbete
 * de plan» a quien ya lo paga sería el peor mensaje posible—.
 */
function NoDisponible({ companyId }: { companyId: string }) {
  const { datos, cargando } = useCargar(async () => (await getCompania(companyId))?.plan ?? null, [companyId]);
  // Sin saber el plan todavía no se elige texto: enseñar uno y cambiarlo
  // medio segundo después por el contrario es peor que esperar.
  if (cargando) return null;

  const loTiene = datos === 'best_seller';
  return (
    <section className="asis-tarjeta">
      <span className="asis-tarjeta__ico">
        <Sparkles size={22} />
      </span>
      {loTiene ? (
        <>
          <h2>El asistente se está activando para tu negocio</h2>
          <p>Tu plan lo incluye. Si en un rato sigue sin responder, escríbenos y lo dejamos listo.</p>
          <a
            className="btn btn-primary asis-tarjeta__ancho"
            href={whatsappUrl('Hola 👋 Tengo el plan Best Seller y el asistente de Mia aún no está activo en mi panel.')}
            target="_blank"
            rel="noopener noreferrer"
          >
            Escribirnos por WhatsApp
          </a>
        </>
      ) : (
        <>
          <h2>Pregúntale a Mia lo que quieras de tu negocio: incluido en Best Seller</h2>
          <p>Cuánto entró hoy, quién te debe, qué se está agotando. Escribiendo o hablando, desde aquí.</p>
          <a className="btn btn-primary asis-tarjeta__ancho" href="/#pricing" target="_blank" rel="noopener noreferrer">
            Ver los planes
          </a>
        </>
      )}
    </section>
  );
}
