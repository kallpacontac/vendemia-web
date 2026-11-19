'use client';

/**
 * «Acceso al panel» del empleado (19-nov-2026, The 24/7: «que el admin o el dueño le mande y
 * gestione sus usuarios y su contraseña en el panel»). Datos 0021.
 *
 *   · Sin acceso: su celular y «Dar acceso» → se crea su usuario (el celular) y una contraseña.
 *   · Con acceso: «Nueva contraseña» (la olvidó) y «Quitar acceso» (ya no trabaja aquí).
 * La contraseña sale UNA vez, en grande, con «Copiar» y «Enviar por WhatsApp» a su celular.
 * Solo el dueño y el administrador (lo impone Postgres).
 */
import { useState } from 'react';
import { Check, Copy, KeyRound, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import { useAvisar } from './Avisos';
import { supabase } from '@/lib/supabase/client';

export default function AccesoEmpleado({
  companyId,
  employeeId,
  nombre,
  usuario,
  telefono,
  alCambiar,
}: {
  companyId: string;
  employeeId: string;
  nombre: string;
  /** Su usuario si ya entra al panel (el celular); null si no tiene acceso. */
  usuario: string | null;
  /** El de su ficha, para no escribirlo dos veces. */
  telefono: string;
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const [cel, setCel] = useState(telefono);
  const [enVuelo, setEnVuelo] = useState(false);
  /** Lo que hay que pasarle: se ve una sola vez (al cerrar la ficha, se va). */
  const [credencial, setCredencial] = useState<{ usuario: string; clave: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    setEnVuelo(true);
    const { data, error } = await supabase().rpc(fn, args);
    setEnVuelo(false);
    if (error) {
      avisar(/function|find/i.test(error.message) && new RegExp(fn).test(error.message)
        ? 'Falta instalar el acceso del equipo (modules/datos/sql/0021_acceso_del_equipo.sql).'
        : error.message, 'error');
      return null;
    }
    return data as T;
  }

  async function dar() {
    const d = cel.replace(/\D/g, '').slice(-9);
    if (!/^9\d{8}$/.test(d)) return avisar('El celular tiene 9 dígitos y empieza en 9.', 'error');
    const r = await rpc<{ usuario: string; clave: string | null }>('equipo_acceso_dar', { p_company: companyId, p_employee: employeeId, p_celular: d });
    if (!r) return;
    setCredencial(r);
    avisar(r.clave ? `✓ ${nombre} ya puede entrar. Pásale su usuario y contraseña.` : `✓ ${nombre} ya puede entrar con la contraseña que usa siempre.`, 'ok');
    alCambiar();
  }

  async function nueva() {
    if (!window.confirm(`¿Darle una contraseña nueva a ${nombre}? La de antes deja de servir.`)) return;
    const r = await rpc<{ usuario: string; clave: string }>('equipo_acceso_clave', { p_company: companyId, p_employee: employeeId });
    if (!r) return;
    setCredencial(r);
    avisar('✓ Contraseña nueva lista. Pásasela.', 'ok');
  }

  async function quitar() {
    if (!window.confirm(`¿Quitarle el acceso a ${nombre}? Ya no podrá entrar al panel de este negocio. Su ficha y sus citas se quedan.`)) return;
    const r = await rpc<number>('equipo_acceso_quitar', { p_company: companyId, p_employee: employeeId });
    if (r === null) return;
    setCredencial(null);
    avisar(`Acceso de ${nombre} quitado.`, 'ok');
    alCambiar();
  }

  const texto = credencial
    ? `Hola ${nombre.split(' ')[0]}, este es tu acceso al panel:\nEntra en https://vendemias.com/login\nUsuario: ${credencial.usuario}${credencial.clave ? `\nContraseña: ${credencial.clave}` : '\nContraseña: la que ya usas'}\nPuedes cambiarla en tu menú › Cambiar contraseña.`
    : '';
  const celWa = (credencial?.usuario ?? '').replace(/\D/g, '');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      avisar('No se pudo copiar: anótalo a mano.', 'error');
    }
  }

  return (
    <div className="emp-acceso">
      <span className="field-label"><KeyRound size={15} style={{ verticalAlign: -2 }} /> Acceso al panel</span>

      {credencial ? (
        <div className="emp-acceso__credencial" role="status">
          <small>Pásale esto (se ve una sola vez)</small>
          <div><span>Usuario</span><b>{credencial.usuario}</b></div>
          <div><span>Contraseña</span><b>{credencial.clave ?? 'la que ya usa'}</b></div>
          <div className="emp-acceso__acciones">
            <button type="button" className="btn btn-ghost" onClick={() => void copiar()}>
              {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
            {/^\d{9}$/.test(celWa) && (
              <a className="btn btn-primary" href={`https://wa.me/51${celWa}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> Enviar por WhatsApp
              </a>
            )}
          </div>
          <button type="button" className="nc-link" onClick={() => setCredencial(null)}>Listo, ya se lo pasé</button>
        </div>
      ) : usuario ? (
        <div className="emp-acceso__fila">
          <span>Entra con el usuario <b>{usuario}</b></span>
          <div className="emp-acceso__acciones">
            <button type="button" className="btn btn-primary" disabled={enVuelo} onClick={() => void nueva()}>
              <KeyRound size={16} /> Nueva contraseña
            </button>
            <button type="button" className="btn btn-ghost" disabled={enVuelo} onClick={() => void quitar()}>
              <UserMinus size={16} /> Quitar acceso
            </button>
          </div>
        </div>
      ) : (
        <div className="emp-acceso__fila">
          <span className="muted">Todavía no entra al panel. Su usuario será su celular.</span>
          <div className="emp-acceso__dar">
            <input className="input" inputMode="tel" placeholder="Celular · 987654321" value={cel} onChange={(e) => setCel(e.target.value)} aria-label="Celular del empleado" />
            <button type="button" className="btn btn-primary" disabled={enVuelo} onClick={() => void dar()}>
              <UserPlus size={16} /> {enVuelo ? 'Creando…' : 'Dar acceso'}
            </button>
          </div>
        </div>
      )}
      <small className="muted" style={{ fontSize: 11.5 }}>Entra a «Mi agenda» y «Mi comisión». No ve la caja ni los números del negocio.</small>
    </div>
  );
}
