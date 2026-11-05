import type { Metadata } from 'next';
import Marco from '@/modules/tu-pagina/publico/Marco';
import CanchasPortada from '@/modules/tu-pagina/publico/CanchasPortada';
import EjemplosNav from '@/modules/tu-pagina/publico/EjemplosNav';
import { CANCHAS_EJEMPLO, CONFIG_EJEMPLO, HORARIO_EJEMPLO, PASO_EJEMPLO, reservasEjemplo } from '@/modules/tu-pagina/dominio/canchas-ejemplo';
import type { Escaparate, Item } from '@/modules/tu-pagina/dominio/tienda';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Zona Gol · Fútbol / canchas | Vendemia',
  description: 'Ejemplo interactivo de una página de reservas de canchas de fútbol.',
  robots: { index: false, follow: false },
};

const canchas: Item[] = CANCHAS_EJEMPLO.map((c) => ({
  ...c, descripcion: '', fotos: [], tipo: 'cita', duracion: PASO_EJEMPLO,
  quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
}));

export default function CanchasEjemplo() {
  // La hora de verdad: con una fija, por la tarde se ofrecían horas que ya pasaron.
  const ahora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Lima', hour12: false }).slice(0, 16);
  const hoy = ahora.slice(0, 10);
  const pagina: PaginaPublica = {
    slug: 'zona-gol-ejemplo', version: 1, titulo: 'Zona Gol',
    frase: 'Tu partido empieza aquí. Canchas listas para jugar con tu equipo.',
    whatsapp: '', color: '#183D2B', plantilla: 'canchas', logo_url: null, portada_url: null, distritos: [],
    secciones: {
      reservar: true, catalogo: false,
      apariencia: { plantillaActiva: true, fotoPlantilla: 'canchas', mostrarWhatsapp: false },
      canchas: CONFIG_EJEMPLO,
    },
  };
  const esc: Escaparate = {
    modo: null, items: canchas, familias: canchas.map((c) => c.familia),
    agenda: {
      horario: HORARIO_EJEMPLO, paso: PASO_EJEMPLO, equipo: [], bloqueos: [],
      ocupados: reservasEjemplo(hoy, ahora).map((r) => ({ item: r.cancha, inicio: r.inicio, fin: r.fin, empleado: '' })),
    },
    pideProfesional: false, entrega: 'pickup', direccion: 'Miraflores, Lima', hoy, ahora,
  };
  return <Marco pagina={pagina} portada>
    <CanchasPortada pagina={pagina} esc={esc} ejemplo />
    <EjemplosNav actual="canchas" />
  </Marco>;
}
