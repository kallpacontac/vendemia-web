'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CRM · los contactos por etapa, en columnas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Módulo aparte de Clientes a propósito (Alvaro, 25-nov-2026): Clientes es el
 * registro; esto es el embudo de trabajo. Qué columna toca a cada contacto lo
 * decide lib/panel/prospectos.ts, con hechos de las tablas.
 */
import Topbar from '@/components/panel/Topbar';
import TableroClientes from '@/components/panel/TableroClientes';
import { useSesion } from '@/components/panel/Sesion';

export default function Crm() {
  const { companyId } = useSesion();
  return (
    <main className="main main--crm">
      <div className="wrap">
        <Topbar titulo="CRM" sub="Tus contactos por etapa: quién espera respuesta, quién está interesado y quién ya agendó" />
        {companyId ? <TableroClientes companyId={companyId} /> : <div className="vacio">Elige un negocio para ver su CRM.</div>}
      </div>
    </main>
  );
}
