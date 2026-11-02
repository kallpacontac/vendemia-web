import type { Metadata } from 'next';
import Marco from '@/modules/tu-pagina/publico/Marco';
import CanchasPortada from '@/modules/tu-pagina/publico/CanchasPortada';
import EjemplosNav from '@/modules/tu-pagina/publico/EjemplosNav';
import { sumarDias } from '@/modules/tu-pagina/dominio/agenda';
import type { Escaparate, Item } from '@/modules/tu-pagina/dominio/tienda';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Zona Gol · Fútbol / canchas | Vendemia',
  description: 'Ejemplo interactivo de una página de reservas de canchas de fútbol.',
  robots: { index: false, follow: false },
};

const canchas: Item[] = ([
  ['c5', 'Cancha Norte', '5 vs 5', 110],
  ['c6', 'Cancha Central', '6 vs 6', 135],
  ['c7', 'Cancha Principal', '7 vs 7', 160],
  ['c9', 'Cancha Grande', '9 vs 9', 220],
] as const).map(([id, nombre, familia, precio]) => ({
  id, nombre, familia, precio, descripcion: '', fotos: [], tipo: 'cita', duracion: 60,
  quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
}));

export default function CanchasEjemplo() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const manana = sumarDias(hoy, 1);
  const pagina: PaginaPublica = {
    slug: 'zona-gol-ejemplo', version: 1, titulo: 'Zona Gol',
    frase: 'Tu partido empieza aquí. Canchas listas para jugar con tu equipo.',
    whatsapp: '', color: '#183D2B', plantilla: 'canchas', logo_url: null, portada_url: null, distritos: [],
    secciones: {
      reservar: true, catalogo: false,
      apariencia: { plantillaActiva: true, fotoPlantilla: 'canchas', mostrarWhatsapp: false },
      canchas: { activo: true, desde: '18:00', noche: { c5: 140, c6: 170, c7: 190, c9: 260 } },
    },
  };
  const horario = { open: '08:00', close: '23:00', closed: false };
  const esc: Escaparate = {
    modo: null, items: canchas, familias: canchas.map((c) => c.familia),
    agenda: {
      horario: { monday: horario, tuesday: horario, wednesday: horario, thursday: horario, friday: horario, saturday: horario, sunday: horario },
      paso: 60, equipo: [], bloqueos: [],
      ocupados: [
        { item: 'c5', inicio: `${hoy} 19:00`, fin: `${hoy} 20:00`, empleado: '' },
        { item: 'c7', inicio: `${manana} 18:00`, fin: `${manana} 19:00`, empleado: '' },
      ],
    },
    pideProfesional: false, entrega: 'pickup', direccion: 'Miraflores, Lima', hoy, ahora: `${hoy} 08:00`,
  };
  return <Marco pagina={pagina} portada>
    <CanchasPortada pagina={pagina} esc={esc} ejemplo />
    <EjemplosNav actual="canchas" />
  </Marco>;
}
