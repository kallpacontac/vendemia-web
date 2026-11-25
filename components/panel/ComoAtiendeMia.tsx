'use client';

/**
 * «Cómo atiende Mia» · Ajustes → Asistente → Cómo responde.
 *
 * Controlada: el valor vive en el formulario de Configuración y viaja en el
 * mismo `update_company` que el resto (`modo_atencion`, `servicio_cierre`,
 * `canal_cierre`), con el mismo botón de guardar. Las reglas y los textos, en
 * lib/panel/modoAtencion.ts.
 */
import { Headphones } from 'lucide-react';
import type { BusinessMode } from '@/lib/supabase/types';
import {
  MODOS_ATENCION,
  MOTIVO_SIN_HIBRIDO,
  TEXTO_MODO_ATENCION,
  admiteHibrido,
  hibridoRoto,
  type CanalCierre,
  type ModoAtencion,
} from '@/lib/panel/modoAtencion';
import './como-atiende.css';

export interface ValorAtencion {
  modo_atencion: ModoAtencion;
  servicio_cierre: string;
  canal_cierre: CanalCierre;
}

export default function ComoAtiendeMia({
  valor,
  alCambiar,
  businessMode,
  servicios,
  asistente,
  puede,
}: {
  valor: ValorAtencion;
  alCambiar: (cambio: Partial<ValorAtencion>) => void;
  businessMode: BusinessMode;
  /** Los servicios activos del catálogo (serviciosDeCierre). */
  servicios: { id: string; name: string; duration_minutes?: number | null }[];
  asistente: string;
  /** Dueño o administrador. El resto lo ve sin poder cambiarlo. */
  puede: boolean;
}) {
  const conAgenda = admiteHibrido(businessMode);
  const roto = hibridoRoto(valor.modo_atencion, businessMode, valor.servicio_cierre, servicios);

  return (
    <div className="sec">
      <h4>
        <Headphones /> Cómo atiende {asistente}
      </h4>
      <p className="cfg-guide">Quién cierra la venta: {asistente} sola, tú en una llamada que ella te deja agendada, o tú desde el principio.</p>
      {!puede && (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
          Solo lo cambian el dueño y el administrador.
        </p>
      )}

      <div className="opciones opciones--3" role="radiogroup" aria-label={`Cómo atiende ${asistente}`}>
        {MODOS_ATENCION.map((m) => {
          // Un híbrido que ya estaba puesto se deja elegido aunque el negocio ya no sea de citas:
          // esconderlo sería decir que está en «Cierra la venta» sin haberlo guardado nadie.
          const bloqueado = m === 'hibrido' && !conAgenda;
          return (
            <button
              key={m}
              type="button"
              className={`opcion ${valor.modo_atencion === m ? 'on' : ''} ${bloqueado ? 'opcion--off' : ''}`}
              onClick={() => alCambiar({ modo_atencion: m })}
              role="radio"
              aria-checked={valor.modo_atencion === m}
              disabled={!puede || bloqueado}
            >
              <b>{TEXTO_MODO_ATENCION[m].titulo}</b>
              <small>{bloqueado ? MOTIVO_SIN_HIBRIDO : TEXTO_MODO_ATENCION[m].detalle(asistente)}</small>
              {m === 'cierra' && <span className="opcion__def">por defecto</span>}
            </button>
          );
        })}
      </div>

      {valor.modo_atencion === 'hibrido' && conAgenda && (
        <div className="grid-form atiende-cierre">
          <div>
            <label className="field-label" htmlFor="servicio-cierre">
              ¿Qué se agenda?
            </label>
            <select
              id="servicio-cierre"
              className="select"
              value={servicios.some((s) => s.id === valor.servicio_cierre) ? valor.servicio_cierre : ''}
              disabled={!puede}
              onChange={(e) => alCambiar({ servicio_cierre: e.target.value })}
            >
              <option value="" disabled>
                {servicios.length ? 'Elige un servicio' : 'No tienes servicios activos'}
              </option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.duration_minutes ? ` · ${s.duration_minutes} min` : ''}
                </option>
              ))}
            </select>
            <small className="muted" style={{ fontSize: 11.5 }}>
              Es una cita normal de ese servicio: sale en tu agenda como las demás.
            </small>
          </div>
          <div>
            <label className="field-label" htmlFor="canal-cierre">
              ¿Por dónde?
            </label>
            <select
              id="canal-cierre"
              className="select"
              value={valor.canal_cierre}
              disabled={!puede}
              onChange={(e) => alCambiar({ canal_cierre: e.target.value === 'meet' ? 'meet' : 'llamada' })}
            >
              <option value="llamada">Llamada</option>
              <option value="meet">Google Meet</option>
            </select>
            <small className="muted" style={{ fontSize: 11.5 }}>
              {valor.canal_cierre === 'meet'
                ? `El enlace del Meet lo mandas tú: ${asistente} le dice al cliente que le llegará antes de la hora.`
                : `${asistente} le dice al cliente que le llamarán a su mismo número.`}
            </small>
          </div>
        </div>
      )}

      {roto && (
        <div className="desfase atiende-aviso" role="status">
          {roto} Mientras tanto, {asistente} atiende como «Cierra la venta».
        </div>
      )}
    </div>
  );
}
