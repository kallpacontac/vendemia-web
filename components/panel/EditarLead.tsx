'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EDITAR LOS DATOS DE UN CLIENTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Va por `actualizar_lead`, como toda escritura del panel: el bot es el único
 * que escribe en `leads`, y el cambio vuelve por el espejo.
 *
 * Qué se puede tocar y qué no, a propósito:
 *
 *   ✓ nombre, correo y dirección — lo que el cliente dijo mal o no dijo.
 *   ✓ los datos que recogió Mia (`custom_data`) — solo los VALORES. Las claves
 *     las define quien configura las preguntas obligatorias; inventar una aquí
 *     crearía un dato que ninguna pregunta pide.
 *   ✓ notas del negocio (`notas_salon`) — la voz del negocio, aparte de la de
 *     Mia (`customer_notes`), que sigue siendo de solo lectura.
 *   ✗ el teléfono — es la identidad en WhatsApp. Cambiarlo no «corrige» nada:
 *     el siguiente mensaje de ese cliente crearía un lead nuevo.
 *   ✗ el estado del embudo — lo reescribe el bot en cada turno; editarlo aquí
 *     duraría hasta el siguiente mensaje.
 *
 * Solo viaja lo que cambió. Si el bot todavía no sabe guardar un campo (hoy
 * `actualizar_lead` solo acepta `notas_salon`), lo dice el `result` y se avisa
 * en vez de dar por guardado algo que no se guardó. Ver
 * docs/prompt-bot-editar-lead.md.
 */
import { useState } from 'react';
import { UserPen } from 'lucide-react';
import { useAvisar, useComando } from './Avisos';
import type { Lead } from '@/lib/supabase/queries';

interface Resultado {
  lead_id: string;
  /** Los campos que el bot guardó. Si no viene, es un bot que solo guarda notas_salon. */
  actualizados?: string[];
}

const ETIQUETA: Record<string, string> = {
  name: 'nombre',
  customer_email: 'correo',
  customer_address: 'dirección',
  custom_data: 'datos recogidos',
  notas_salon: 'notas',
};

export function EditarLead({
  lead,
  alGuardar,
  alCerrar,
}: {
  lead: Lead;
  alGuardar: () => void;
  alCerrar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const [nombre, setNombre] = useState(lead.name ?? '');
  const [correo, setCorreo] = useState(lead.customer_email ?? '');
  const [direccion, setDireccion] = useState(lead.customer_address ?? '');
  const [datos, setDatos] = useState<Record<string, string>>({ ...lead.datos });
  const [notas, setNotas] = useState(lead.notas_salon ?? '');
  const [guardando, setGuardando] = useState(false);

  const cambios: Record<string, unknown> = {};
  if (nombre.trim() !== (lead.name ?? '')) cambios.name = nombre.trim();
  if (correo.trim() !== (lead.customer_email ?? '')) cambios.customer_email = correo.trim();
  if (direccion.trim() !== (lead.customer_address ?? '')) cambios.customer_address = direccion.trim();
  if (Object.keys(datos).some((k) => datos[k] !== lead.datos[k])) cambios.custom_data = datos;
  if (notas !== (lead.notas_salon ?? '')) cambios.notas_salon = notas;
  const hayCambios = Object.keys(cambios).length > 0;
  const correoMal = !!correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  async function guardar() {
    if (!hayCambios || guardando || correoMal) return;
    setGuardando(true);
    const r = await comando<Resultado>('actualizar_lead', { lead_id: lead.id, ...cambios });
    setGuardando(false);
    if (!r) return; // el error, o el «se está aplicando», ya lo avisó useComando

    // Un bot que solo sabe de notas_salon devuelve { lead_id, notas_salon } y
    // descarta el resto en silencio. Se dice lo que NO se guardó.
    const guardados = r.actualizados ?? (('notas_salon' in cambios) ? ['notas_salon'] : []);
    const perdidos = Object.keys(cambios).filter((k) => !guardados.includes(k));
    if (perdidos.length) {
      avisar(
        `No se guardó: ${perdidos.map((k) => ETIQUETA[k] ?? k).join(', ')}. El bot todavía no admite editar esos datos.`,
        'error',
      );
    } else {
      avisar('Datos del cliente guardados', 'ok');
    }
    alGuardar();
  }

  const claves = Object.keys(datos).sort();

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <div
        className="modal"
        style={{ width: 'min(480px, 100%)', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal__cab">
          <UserPen size={18} />
          <b>Datos del cliente</b>
        </div>
        <div className="modal__cuerpo" style={{ overflowY: 'auto' }}>
          <Campo etiqueta="Nombre" valor={nombre} alCambiar={setNombre} />
          <Campo
            etiqueta="Correo"
            valor={correo}
            alCambiar={setCorreo}
            tipo="email"
            error={correoMal ? 'Ese correo no tiene buena pinta.' : undefined}
          />
          <Campo etiqueta="Dirección" valor={direccion} alCambiar={setDireccion} />

          {claves.length > 0 && (
            <>
              <p className="field-label" style={{ marginTop: 14 }}>
                Lo que recogió Mia
              </p>
              {claves.map((k) => (
                <Campo
                  key={k}
                  etiqueta={k}
                  valor={datos[k] ?? ''}
                  alCambiar={(v) => setDatos((d) => ({ ...d, [k]: v }))}
                />
              ))}
            </>
          )}

          <label className="field-label" htmlFor="el-notas" style={{ marginTop: 14 }}>
            Notas del negocio
          </label>
          <textarea
            id="el-notas"
            className="textarea"
            rows={4}
            placeholder="Alergias, preferencias, lo que conviene recordar de este cliente…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
          <p className="muted" style={{ marginTop: 6 }}>
            El teléfono no se edita: es su identidad en WhatsApp. Si cambió de número, escribirá desde el
            nuevo y será otra conversación.
          </p>
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost btn-sm" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!hayCambios || guardando || correoMal}
            onClick={() => void guardar()}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  tipo = 'text',
  error,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  tipo?: string;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label className="field-label">
        {etiqueta}
        <input
          className="input"
          type={tipo}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          style={{ marginTop: 6, fontWeight: 500 }}
        />
      </label>
      {error && (
        <p style={{ color: 'var(--hot)', fontSize: 12, marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}
