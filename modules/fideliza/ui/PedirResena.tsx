'use client';

/**
 * «Pedir reseña en Google», en Avisos (sql/0026). Pedido de Alvaro el 24-nov-2026: «por correo y
 * por notificación si tiene la tarjeta, un aviso configurable y con un link para dejar reseña en
 * Google directo»; y «en la tarjeta que sea personalizable: si lo quiere agregar, que lo agregue».
 *
 *   · Interruptor del aviso: al día siguiente de su 1.ª (o 2.ª) visita, a las 9:00, una sola vez.
 *   · Interruptor aparte: el botón «Dejar mi reseña» en la tarjeta del cliente.
 *   · El enlace sale solo si el dueño eligió su negocio en Google (page_style.place_id); si no, lo
 *     pega una vez. Solo enlaces de Google (lo valida la base).
 * Sin la 0026 no se enseña: no hay nada que prender.
 */
import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { urlResenas } from '@/modules/fideliza/dominio/botones';

interface Config {
  activo: boolean;
  visita: 1 | 2;
  titulo: string;
  texto: string;
  url: string;
  en_tarjeta: boolean;
}

export default function PedirResena({ companyId, editable, negocio, placeId }: { companyId: string; editable: boolean; negocio: string; placeId: string | null }) {
  const avisar = useAvisar();
  const { datos, releer } = useCargar(async () => {
    try {
      return await accion<{ config: Partial<Config> | null; enviados_30: number; enviados: number }>('resena.leer', { companyId });
    } catch {
      return null; // sin la 0026
    }
  }, [companyId]);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<Config | null>(null);

  if (!datos) return null;
  const guardada = datos.config ?? {};
  const urlSola = placeId ? urlResenas(placeId) : '';
  const c: Config = {
    activo: Boolean(guardada.activo),
    visita: guardada.visita === 2 ? 2 : 1,
    titulo: guardada.titulo || `¿Qué tal te fue en ${negocio || 'nuestro local'}?`.slice(0, 60),
    texto: guardada.texto || 'Déjanos tu reseña en Google: nos ayuda mucho y toma un minuto.',
    url: guardada.url || urlSola,
    en_tarjeta: Boolean(guardada.en_tarjeta),
  };

  async function guardar(nuevo: Config, ok: string) {
    if ((nuevo.activo || nuevo.en_tarjeta) && !nuevo.url.trim()) {
      setEditando(nuevo);
      return;
    }
    setOcupado(true);
    try {
      await accion('resena.guardar', { companyId, datos: { ...nuevo, url: nuevo.url.trim() } });
      avisar(ok, 'ok');
      setEditando(null);
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <li className={`fz-avisos__fila${c.activo ? '' : ' fz-avisos__fila--off'}`}>
        <div className="fz-avisos__cab">
          <div>
            <b>Pedir reseña en Google</b>
            <small>Al día siguiente de su {c.visita === 1 ? '1.ª' : '2.ª'} visita, a las 9:00. Por aviso al celular y por correo, si lo dejó. Una sola vez por cliente.</small>
          </div>
          <button type="button" className={`toggle${c.activo ? ' on' : ''}`} role="switch" aria-checked={c.activo} aria-label="Pedir reseña en Google"
            disabled={!editable || ocupado} onClick={() => void guardar({ ...c, activo: !c.activo }, c.activo ? 'Apagado: Pedir reseña.' : 'Prendido: Pedir reseña. Sale sola.')} />
        </div>
        <div className="fz-avisos__msg">
          <b>{c.titulo}</b>
          <span>{c.texto}</span>
        </div>
        <div className="fz-avisos__pie">
          <div className="chip-tabs fz-avisos__dias" role="group" aria-label="Después de qué visita">
            {([1, 2] as const).map((n) => (
              <button key={n} type="button" className={c.visita === n ? 'active' : ''} aria-pressed={c.visita === n} disabled={!editable || ocupado}
                onClick={() => void guardar({ ...c, visita: n }, `Listo: tras la ${n === 1 ? '1.ª' : '2.ª'} visita.`)}>
                Tras la {n === 1 ? '1.ª' : '2.ª'} visita
              </button>
            ))}
          </div>
          <small>{datos.enviados_30 ? `Últimos 30 días: pedida a ${datos.enviados_30}` : 'Todavía no se ha pedido a nadie.'}</small>
          {editable && (
            <button type="button" className="nc-link fz-avisos__editar" onClick={() => setEditando({ ...c })}>
              <Pencil size={13} /> Cambiar mensaje o enlace
            </button>
          )}
        </div>
        <div className="fz-resena__tarjeta">
          <div>
            <b>Botón en la tarjeta del cliente</b>
            <small>«Dejar mi reseña en Google», a la vista cada vez que abre su tarjeta.</small>
          </div>
          <button type="button" className={`toggle${c.en_tarjeta ? ' on' : ''}`} role="switch" aria-checked={c.en_tarjeta} aria-label="Botón de reseña en la tarjeta"
            disabled={!editable || ocupado} onClick={() => void guardar({ ...c, en_tarjeta: !c.en_tarjeta }, c.en_tarjeta ? 'Quitado de la tarjeta.' : 'Listo: el botón ya sale en la tarjeta.')} />
        </div>
      </li>

      {editando && (
        <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) setEditando(null); }}>
          <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="fz-resena-titulo">
            <div className="fz-modal__cab">
              <h3 id="fz-resena-titulo">Pedir reseña en Google</h3>
              <button type="button" className="q-icon" aria-label="Cerrar" onClick={() => setEditando(null)} disabled={ocupado}>
                <X size={18} />
              </button>
            </div>
            <div className="fz-modal__cuerpo">
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-resena-t">Título</label>
                <input id="fz-resena-t" className="input" maxLength={60} value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-resena-x">Mensaje</label>
                <textarea id="fz-resena-x" className="textarea" maxLength={160} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-resena-u">Enlace para dejar la reseña</label>
                <input id="fz-resena-u" className="input" inputMode="url" placeholder="https://g.page/r/…/review" value={editando.url} onChange={(e) => setEditando({ ...editando, url: e.target.value })} />
                <small className="fz-def">
                  {urlSola && editando.url === urlSola
                    ? 'Sale de tu negocio elegido en Google: no tienes que tocar nada.'
                    : 'En Google: tu Perfil de Empresa → «Pedir reseñas» → copiar enlace. O elige tu negocio en Google en «Mis enlaces» y sale solo.'}
                </small>
              </div>
              <label className="field-label">Así le llega al cliente</label>
              <div className="fz-modal__vista">
                <b>{editando.titulo || 'Título'}</b>
                <span>{editando.texto || 'Mensaje'}</span>
              </div>
              <p className="fz-def">Al tocarlo se abre directo la ventana para escribir la reseña. Sin premio por reseñar: Google no lo permite.</p>
            </div>
            <div className="fz-modal__pie">
              <button className="btn btn-primary" disabled={ocupado || !editando.titulo.trim() || !editando.texto.trim() || !editando.url.trim()}
                onClick={() => void guardar(editando, editando.activo && !c.activo ? 'Guardado y prendido: Pedir reseña.' : 'Guardado.')}>
                <Check size={17} /> {ocupado ? 'Guardando…' : editando.activo && !c.activo ? 'Guardar y prender' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
