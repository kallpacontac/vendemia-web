'use client';

/**
 * La foto del DNI y el CV del empleado (18-nov-2026, The 24/7). Datos 0019.
 *
 * Van a un cubo PRIVADO de Supabase Storage («empleados-docs»): no tienen enlace público. Para
 * verlos se pide un enlace firmado que caduca en 5 minutos. Solo el dueño y el administrador
 * (lo impone Postgres en storage.objects). En la tablet, «Subir» deja tomar la foto con la cámara.
 */
import { useRef, useState } from 'react';
import { Eye, FileText, IdCard, Trash2, Upload } from 'lucide-react';
import { useAvisar } from './Avisos';
import { supabase } from '@/lib/supabase/client';

const CUBO = 'empleados-docs';
const MAX = 10 * 1024 * 1024;
type Tipo = 'dni' | 'cv';
const NOMBRE: Record<Tipo, string> = { dni: 'DNI', cv: 'CV' };

export default function DocumentosEmpleado({
  companyId,
  employeeId,
  dniFoto,
  cv,
  alCambiar,
}: {
  companyId: string;
  employeeId: string;
  dniFoto: string;
  cv: string;
  alCambiar: () => void;
}) {
  const avisar = useAvisar();
  const [enVuelo, setEnVuelo] = useState<Tipo | null>(null);
  const entradas = { dni: useRef<HTMLInputElement>(null), cv: useRef<HTMLInputElement>(null) };

  async function subir(tipo: Tipo, file: File | undefined) {
    if (!file) return;
    if (file.size > MAX) return avisar(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB: como máximo 10 MB.`, 'error');
    if (!/^image\//.test(file.type) && file.type !== 'application/pdf') return avisar('Sube una foto o un PDF.', 'error');
    setEnVuelo(tipo);
    const ext = (file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const ruta = `${companyId}/${employeeId}/${tipo}-${Date.now()}.${ext}`;
    const anterior = tipo === 'dni' ? dniFoto : cv;
    try {
      const up = await supabase().storage.from(CUBO).upload(ruta, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw new Error(/bucket|not found/i.test(up.error.message) ? 'Falta instalar los documentos (datos 0019).' : up.error.message);
      const r = await supabase().rpc('empleado_doc_guardar', { p_company: companyId, p_employee: employeeId, p_tipo: tipo, p_ruta: ruta });
      if (r.error) throw new Error(r.error.message);
      if (anterior) void supabase().storage.from(CUBO).remove([anterior]);
      avisar(`✓ ${NOMBRE[tipo]} guardado.`, 'ok');
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setEnVuelo(null);
      const input = entradas[tipo].current;
      if (input) input.value = '';
    }
  }

  async function ver(ruta: string) {
    // La ventana se abre YA (dentro del toque) y luego se le pone el enlace firmado.
    const w = window.open('', '_blank');
    const { data, error } = await supabase().storage.from(CUBO).createSignedUrl(ruta, 300);
    if (error || !data?.signedUrl) {
      w?.close();
      return avisar(error?.message ?? 'No se pudo abrir el documento.', 'error');
    }
    if (w) w.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  async function quitar(tipo: Tipo, ruta: string) {
    if (!window.confirm(`¿Quitar el ${NOMBRE[tipo]} de la ficha?`)) return;
    setEnVuelo(tipo);
    const r = await supabase().rpc('empleado_doc_guardar', { p_company: companyId, p_employee: employeeId, p_tipo: tipo, p_ruta: '' });
    if (r.error) avisar(r.error.message, 'error');
    else {
      void supabase().storage.from(CUBO).remove([ruta]);
      avisar(`${NOMBRE[tipo]} quitado.`, 'ok');
      alCambiar();
    }
    setEnVuelo(null);
  }

  const fila = (tipo: Tipo, ruta: string) => (
    <div className="emp-doc" key={tipo}>
      <span className="emp-doc__que">
        {tipo === 'dni' ? <IdCard size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
        <b>{tipo === 'dni' ? 'Foto del DNI' : 'CV'}</b>
        <small className={ruta ? 'emp-doc__ok' : 'muted'}>{ruta ? 'Guardado' : 'Sin subir'}</small>
      </span>
      <span className="emp-doc__acciones">
        {ruta && (
          <button type="button" className="btn btn-ghost" onClick={() => void ver(ruta)} disabled={enVuelo === tipo}>
            <Eye size={16} /> Ver
          </button>
        )}
        <button type="button" className={`btn ${ruta ? 'btn-ghost' : 'btn-primary'}`} disabled={enVuelo === tipo}
          onClick={() => entradas[tipo].current?.click()}>
          <Upload size={16} /> {enVuelo === tipo ? 'Subiendo…' : ruta ? 'Cambiar' : 'Subir'}
        </button>
        {ruta && (
          <button type="button" className="q-icon" aria-label={`Quitar ${NOMBRE[tipo]}`} disabled={enVuelo === tipo} onClick={() => void quitar(tipo, ruta)}>
            <Trash2 size={16} />
          </button>
        )}
      </span>
      <input ref={entradas[tipo]} type="file" hidden accept={tipo === 'dni' ? 'image/*' : 'image/*,application/pdf'}
        onChange={(e) => void subir(tipo, e.target.files?.[0])} />
    </div>
  );

  return (
    <div className="emp-docs">
      <span className="field-label">Documentos</span>
      {fila('dni', dniFoto)}
      {fila('cv', cv)}
      <small className="muted" style={{ fontSize: 11.5 }}>Privados: no tienen enlace público. Solo los ven el dueño y el administrador.</small>
    </div>
  );
}
