'use client';

/**
 * Mi página → Agregar funciones → «Tarjeta de puntos».
 *
 * Lee el club de Fideliza del negocio (con la sesión del dueño, por RLS) y deja
 * enseñarlo en la página con una casilla. Sin club, lleva a crearlo en una
 * pantalla. Lo que se guarda es solo { activo, slug } en secciones.fideliza: el
 * slug sale de Fideliza, nunca se teclea.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { urlUnirse } from '@/modules/fideliza/dominio/config';
import type { ConfigTarjeta } from '@/modules/tu-pagina/dominio/tarjeta';

interface Club {
  slug: string;
  nombre: string;
  estado: 'active' | 'paused';
  meta: number | null;
  premio: string;
}

type Estado = { cargando: true } | { cargando: false; club: Club | null; error: boolean };

export default function TarjetaEnPagina({ companyId, valor, alCambiar }: {
  companyId: string;
  valor: ConfigTarjeta;
  alCambiar: (v: ConfigTarjeta) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ cargando: true });

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const sb = supabase();
        const [ajustes, programas] = await Promise.all([
          sb.from('loyalty_settings').select('slug').eq('company_id', companyId).maybeSingle(),
          sb.from('loyalty_programs').select('name, status, current_version_id').eq('company_id', companyId).in('status', ['active', 'paused']).limit(1),
        ]);
        if (ajustes.error || programas.error) throw ajustes.error ?? programas.error;
        const p = programas.data?.[0] as { name: string; status: 'active' | 'paused'; current_version_id: string | null } | undefined;
        const slug = (ajustes.data as { slug?: string } | null)?.slug;
        let club: Club | null = null;
        if (p && slug) {
          const v = p.current_version_id
            ? await sb.from('loyalty_program_versions').select('reward_threshold, reward_description').eq('id', p.current_version_id).maybeSingle()
            : null;
          const ver = (v?.data ?? null) as { reward_threshold: number | null; reward_description: string | null } | null;
          club = { slug, nombre: p.name, estado: p.status, meta: ver?.reward_threshold ?? null, premio: ver?.reward_description ?? '' };
        }
        if (vigente) setEstado({ cargando: false, club, error: false });
      } catch {
        if (vigente) setEstado({ cargando: false, club: null, error: true });
      }
    })();
    return () => { vigente = false; };
  }, [companyId]);

  // Si el negocio cambió su dirección en Fideliza, la página apunta a la nueva al guardar.
  const club = estado.cargando ? null : estado.club;
  useEffect(() => {
    if (club && valor.activo && valor.slug !== club.slug) alCambiar({ ...valor, slug: club.slug });
  }, [club, valor, alCambiar]);

  if (estado.cargando) return <div className="tp-panel-apartado"><small className="muted">Buscando tu tarjeta de puntos…</small></div>;

  if (!club) {
    return (
      <div className="tp-panel-apartado">
        <label className="tp-panel-check">
          <input type="checkbox" checked={false} disabled />
          <span><b>Tarjeta de puntos</b><small className="muted">
            {estado.error ? 'No se pudo comprobar tu tarjeta de Fideliza. Recarga la página para intentarlo de nuevo.'
              : 'Tus clientes juntan sellos en cada visita y ganan un premio. Primero crea tu tarjeta: es una sola pantalla.'}
          </small></span>
        </label>
        {!estado.error && <Link className="btn btn-sm btn-primary" href="/panel/fideliza/club"><Gift size={14} /> Crear mi tarjeta de puntos</Link>}
      </div>
    );
  }

  const activo = Boolean(valor.activo);
  const regla = club.meta ? `Con ${club.meta} sellos: ${club.premio || 'su premio'}.` : club.premio;
  return (
    <div className={`tp-panel-apartado${activo ? ' activo' : ''}`}>
      <label className="tp-panel-check">
        <input type="checkbox" checked={activo} onChange={(e) => alCambiar({ activo: e.target.checked, slug: club.slug })} />
        <span><b>Mostrar mi tarjeta de puntos · {club.nombre}</b><small className="muted">{regla} Sale como una sección de tu página con el botón «Crear mi tarjeta gratis».</small></span>
      </label>
      {activo && (
        <div className="tp-panel-apartado__campos">
          {club.estado === 'paused' && <small className="tp-panel-mal">Tu tarjeta está en pausa en Fideliza: no saldrá en la página hasta que la reactives.</small>}
          <small className="muted">Tus clientes la crean sin app ni contraseña, la instalan en su celular o la guardan en Google Wallet. Tú les pones los sellos desde la Caja de Fideliza.</small>
          <div className="tp-panel-imagen-acciones">
            <a className="btn btn-sm btn-ghost" href={urlUnirse(club.slug)} target="_blank" rel="noopener"><ExternalLink size={14} /> Verla como tu cliente</a>
            <Link className="btn btn-sm btn-ghost" href="/panel/fideliza/club">Cambiar premio o diseño</Link>
            <Link className="btn btn-sm btn-ghost" href="/panel/fideliza/caja">Dar sellos</Link>
          </div>
        </div>
      )}
    </div>
  );
}
