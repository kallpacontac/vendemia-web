import type { Metadata } from 'next';
import ClinicaDentalEjemplo, { esDisenoClinica } from '@/modules/tu-pagina/publico/ClinicaDentalEjemplo';

export const metadata: Metadata = {
  title: 'Clínica Sonrisa Norte · Ejemplos de agenda | Vendemia',
  description: 'Dos plantillas de agenda y una vista de servicios para una clínica dental de ejemplo.',
};

export default function PaginaClinica({ searchParams }: { searchParams?: { diseno?: string } }) {
  const diseno = esDisenoClinica(searchParams?.diseno) ? searchParams.diseno : 'clara';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return <ClinicaDentalEjemplo diseno={diseno} hoy={hoy} />;
}
