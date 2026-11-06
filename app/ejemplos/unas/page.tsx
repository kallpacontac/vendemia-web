import type { Metadata } from 'next';
import Marco from '@/modules/tu-pagina/publico/Marco';
import UnasPortada from '@/modules/tu-pagina/publico/UnasPortada';
import EjemplosNav from '@/modules/tu-pagina/publico/EjemplosNav';
import type { Escaparate, Item } from '@/modules/tu-pagina/dominio/tienda';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import type { TarjetaPublica } from '@/modules/tu-pagina/dominio/tarjeta';
import { trazoSello } from '@/modules/fideliza/dominio/sellos';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Luna Uñas · Ejemplo de estudio de uñas | Vendemia',
  description: 'Conoce la plantilla de estudio de uñas y prueba cómo se vería una reserva.',
  robots: { index: false, follow: false },
};

const servicios: Item[] = [
  ['manicure', 'Manicure clásico', 'Cuidado completo y acabado natural para tus manos.', 45, 45],
  ['semi', 'Esmaltado semipermanente', 'Color duradero con brillo impecable.', 65, 60],
  ['diseno', 'Diseño de uñas', 'Detalles personalizados para expresar tu estilo.', 85, 75],
  ['pedicure', 'Pedicure spa', 'Un momento de descanso y cuidado para tus pies.', 75, 60],
].map(([id, nombre, descripcion, precio, duracion]) => ({
  id: String(id), nombre: String(nombre), descripcion: String(descripcion), precio: Number(precio),
  duracion: Number(duracion), familia: 'Estudio de uñas', fotos: [], tipo: 'cita',
  quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
}));

// Cómo se ve la tarjeta de puntos de Fideliza cuando el dueño la enseña en su página.
const tarjeta: TarjetaPublica = {
  nombre: 'Club Luna', regla: 'Cada visita suma 1 sello. Con 6: un esmaltado en gel gratis.',
  premio: 'un esmaltado en gel gratis', meta: 6, trazo: trazoSello('gema'), url: '#tarjeta',
};

export default function PaginaUnasEjemplo() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const pagina: PaginaPublica = {
    slug: 'luna-unas-ejemplo', version: 1, titulo: 'Luna Uñas', frase: 'Manicure, diseño y cuidado para que cada detalle hable de ti.',
    whatsapp: '', color: '#A57970', plantilla: 'unas', logo_url: null, portada_url: null, distritos: [],
    secciones: { reservar: true, catalogo: false, apariencia: { plantillaActiva: true, fotoPlantilla: 'unas', tituloBanner: 'Uñas que hablan de ti.', promocionTexto: '20% de descuento en tu primer manicure', mostrarWhatsapp: true } },
  };
  const esc: Escaparate = {
    modo: 'appointment', entrega: 'pickup', direccion: 'Miraflores, Lima', hoy, ahora: `${hoy} 09:00`, pideProfesional: false,
    familias: ['Estudio de uñas'], items: servicios,
    agenda: { horario: {}, paso: 30, equipo: [], bloqueos: [], ocupados: [] },
  };
  return <Marco pagina={pagina} portada><UnasPortada pagina={pagina} esc={esc} tarjeta={tarjeta} reservarHref="#reserva" demo /><EjemplosNav actual="unas" /></Marco>;
}
