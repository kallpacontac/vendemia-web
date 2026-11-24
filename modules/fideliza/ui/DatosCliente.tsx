'use client';

/**
 * «Datos del cliente» en su ficha de Clientes. Pedido de Alvaro el 24-nov-2026: «en el módulo de
 * cliente, editar la info y agregar lo clave como fecha de nacimiento, correo y otros datos como
 * opcionales; revisa el responsive y que no sea saturado ni maree a mis clientes».
 *
 * Antes eran tres piezas sueltas (datos con edición en línea, verificación por contacto y el
 * cumpleaños en otro bloque). Ahora: una lista corta para leer y UNA ventana para editarlo todo.
 *   · Nombre y celular, como siempre. Correo, cumpleaños (día y mes, sin año) y nota: opcionales.
 *   · La nota («degradado bajo, con barba») va en sql/0026; sin ella, no se enseña.
 *   · Verificar el celular en persona sigue existiendo, dentro de la ventana.
 * La Caja no cambia: allí sigue CumpleCliente.
 */
import { useEffect, useState } from 'react';
import { Check, MessageCircle, Pencil, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { accion, mensaje } from '@/modules/fideliza/cliente/api';
import { codigoDe, mensajeDe } from '@/modules/fideliza/dominio/errores';
import { fechaCumple } from '@/modules/fideliza/ui/CumpleCliente';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface Contacto { kind: 'phone' | 'email'; value?: string; verified_at: string | null; verified_method?: string }

interface Props {
  companyId: string;
  memberId: string;
  alias: string | null;
  contactos: Contacto[] | null;
  verContactos: boolean;
  /** members.manage: el dueño y el gerente. */
  editable: boolean;
  /** members.create: verificar en persona. */
  puedeVerificar: boolean;
  activa: boolean;
  alGuardar: () => void;
}

interface Borrador { alias: string; phone: string; email: string; dia: string; mes: string; nota: string }

export default function DatosCliente(p: Props) {
  const avisar = useAvisar();
  const [cumple, setCumple] = useState<string | null | undefined>(undefined);
  const [nota, setNota] = useState<string | null | undefined>(undefined); // undefined = sin la 0026
  const [ronda, setRonda] = useState(0);
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let vivo = true;
    const sb = supabase();
    void sb.rpc('loyalty_birthday_get', { p_company: p.companyId, p_member: p.memberId }).then(({ data, error }) => {
      if (vivo) setCumple(error ? undefined : ((data as { mes_dia: string | null } | null)?.mes_dia ?? null));
    });
    void sb.rpc('loyalty_member_nota_get', { p_company: p.companyId, p_member: p.memberId }).then(({ data, error }) => {
      if (vivo) setNota(error ? undefined : ((data as string | null) ?? null));
    });
    return () => { vivo = false; };
  }, [p.companyId, p.memberId, ronda]);

  const tel = p.contactos?.find((c) => c.kind === 'phone');
  const correo = p.contactos?.find((c) => c.kind === 'email');
  const wa = tel?.value ? tel.value.replace(/\D/g, '') : '';

  function abrir() {
    const [m, d] = (cumple ?? '').split('-');
    setFallo('');
    setB({
      alias: p.alias ?? '',
      phone: tel?.value ?? '',
      email: correo?.value ?? '',
      dia: d ? String(Number(d)) : '',
      mes: m ? String(Number(m)) : '',
      nota: nota ?? '',
    });
  }

  async function guardar() {
    if (!b) return;
    setFallo('');
    if (b.alias.trim().length < 2) return setFallo('Escribe su nombre.');
    if (Boolean(b.dia) !== Boolean(b.mes)) return setFallo('Para el cumpleaños, elige el día y el mes (o deja los dos vacíos).');
    if (b.dia && Number(b.dia) > DIAS_MES[Number(b.mes) - 1]) return setFallo(`${MESES[Number(b.mes) - 1]} no tiene ${b.dia} días.`);
    setGuardando(true);
    try {
      const sb = supabase();
      if (b.alias.trim() !== (p.alias ?? '') || b.phone.trim() !== (tel?.value ?? '') || b.email.trim() !== (correo?.value ?? '')) {
        await accion('miembro.editar', { companyId: p.companyId, memberId: p.memberId, alias: b.alias.trim(), phone: b.phone.trim(), email: b.email.trim() });
      }
      const mesDia = b.dia && b.mes ? `${b.mes.padStart(2, '0')}-${b.dia.padStart(2, '0')}` : '';
      if (cumple !== undefined && mesDia !== (cumple ?? '')) {
        const { error } = await sb.rpc('loyalty_birthday_set', { p_company: p.companyId, p_member: p.memberId, p_mes_dia: mesDia });
        if (error) throw new Error(mensajeDe(codigoDe(error.message)));
      }
      if (nota !== undefined && b.nota.trim() !== (nota ?? '')) {
        const { error } = await sb.rpc('loyalty_member_nota_set', { p_company: p.companyId, p_member: p.memberId, p_nota: b.nota.trim() });
        if (error) throw new Error(mensajeDe(codigoDe(error.message)));
      }
      avisar('Datos guardados', 'ok');
      setB(null);
      setRonda((r) => r + 1);
      p.alGuardar();
    } catch (e) {
      setFallo(mensaje(e));
    } finally {
      setGuardando(false);
    }
  }

  async function verificar() {
    try {
      await accion('miembro.verificar', { companyId: p.companyId, memberId: p.memberId, kind: 'phone' });
      avisar('Celular verificado en persona', 'ok');
      p.alGuardar();
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  const vacio = <span className="fz-datos__vacio">—</span>;
  const oculto = (v?: string) => (p.verContactos ? v : '•••');

  return (
    <section className="fz-datos" aria-label="Datos del cliente">
      <div className="fz-datos__cab">
        <h3>Datos del cliente</h3>
        {p.editable && p.activa && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={abrir}>
            <Pencil size={14} /> Editar
          </button>
        )}
      </div>
      <dl className="fz-datos__lista">
        <div><dt>Nombre</dt><dd>{p.alias?.trim() || vacio}</dd></div>
        <div>
          <dt>Celular</dt>
          <dd>
            {tel?.value ? oculto(tel.value) : vacio}
            {tel?.verified_at && <span className="fz-datos__ok"><Check size={13} /> verificado</span>}
            {p.verContactos && wa.length >= 9 && (
              <a className="fz-datos__wa" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label="Escribirle por WhatsApp">
                <MessageCircle size={15} /> WhatsApp
              </a>
            )}
          </dd>
        </div>
        <div><dt>Correo</dt><dd>{correo?.value ? oculto(correo.value) : vacio}</dd></div>
        {cumple !== undefined && <div><dt>Cumpleaños</dt><dd>{cumple ? fechaCumple(cumple) : vacio}</dd></div>}
        {nota !== undefined && <div className="fz-datos__nota"><dt>Nota</dt><dd>{nota || vacio}</dd></div>}
      </dl>

      {b && (
        <div className="modal-fondo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) setB(null); }}>
          <div className="modal fz-modal" role="dialog" aria-modal="true" aria-labelledby="fz-datos-titulo">
            <div className="fz-modal__cab">
              <h3 id="fz-datos-titulo">Datos del cliente</h3>
              <button type="button" className="q-icon" aria-label="Cerrar" onClick={() => setB(null)} disabled={guardando}>
                <X size={18} />
              </button>
            </div>
            <div className="fz-modal__cuerpo">
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-d-nombre">Nombre</label>
                <input id="fz-d-nombre" className="input" maxLength={40} autoComplete="off" value={b.alias} onChange={(e) => setB({ ...b, alias: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-d-tel">Celular</label>
                <input id="fz-d-tel" className="input" inputMode="tel" maxLength={20} placeholder="987 654 321" value={b.phone} onChange={(e) => setB({ ...b, phone: e.target.value })} />
                {tel && !tel.verified_at && p.puedeVerificar && b.phone.trim() === (tel.value ?? '') && (
                  <button type="button" className="nc-link fz-datos__verificar" onClick={() => void verificar()}>Lo tengo delante: marcar como verificado</button>
                )}
              </div>
              <div className="fz-campo">
                <label className="field-label" htmlFor="fz-d-correo">Correo <span className="fz-datos__opc">(opcional)</span></label>
                <input id="fz-d-correo" className="input" type="email" inputMode="email" maxLength={120} placeholder="para avisarle de sus premios" value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} />
              </div>
              {cumple !== undefined && (
                <div className="fz-campo">
                  <span className="field-label">Cumpleaños <span className="fz-datos__opc">(opcional)</span></span>
                  <div className="fz-datos__cumple">
                    <select className="input" aria-label="Día" value={b.dia} onChange={(e) => setB({ ...b, dia: e.target.value })}>
                      <option value="">Día</option>
                      {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                    </select>
                    <select className="input" aria-label="Mes" value={b.mes} onChange={(e) => setB({ ...b, mes: e.target.value })}>
                      <option value="">Mes</option>
                      {MESES.map((x, i) => <option key={x} value={String(i + 1)}>{x}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {nota !== undefined && (
                <div className="fz-campo">
                  <label className="field-label" htmlFor="fz-d-nota">Nota <span className="fz-datos__opc">(opcional)</span></label>
                  <textarea id="fz-d-nota" className="textarea" rows={2} maxLength={280} placeholder="Ej.: degradado bajo, con barba" value={b.nota} onChange={(e) => setB({ ...b, nota: e.target.value })} />
                </div>
              )}
              <small className="fz-def">Cambiar el celular o el correo le quita la verificación.</small>
              {fallo && <p className="fz-datos__fallo" role="alert">{fallo}</p>}
            </div>
            <div className="fz-modal__pie">
              <button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>
                <Check size={17} /> {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
