import type { Metadata } from 'next';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import EjemplosNav from '@/modules/tu-pagina/publico/EjemplosNav';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import type { Escaparate as Datos, Item } from '@/modules/tu-pagina/dominio/tienda';

export const metadata: Metadata = { title: 'La Baguette · Ejemplo de Carta visual', robots: { index: false, follow: false } };

const foto = (indice: number) => `/assets/negocios-ejemplo/cafe-${indice}.webp`;
const producto = (id: string, nombre: string, descripcion: string, precio: number, familia: string, imagen: ReturnType<typeof foto>): Item => ({
  id, nombre, descripcion, precio, familia, fotos: [imagen], tipo: 'producto', duracion: 0, quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
});

const pagina: PaginaPublica = {
  slug: 'la-baguette', version: 1, titulo: 'La Baguette', frase: 'Pan recién horneado, café y algo rico para cada pausa.', whatsapp: '', plantilla: 'restaurante', color: '#B9662F', logo_url: '/assets/restaurante-ejemplo/la-baguette-logo.svg', portada_url: null, distritos: [],
  secciones: { catalogo: true, reservar: false, apariencia: { plantillaActiva: true, fotoPlantilla: 'cafeteria', tituloBanner: 'El sabor de lo recién hecho', mostrarWhatsapp: false, pedirMetodoPago: true, pedirNotaPedido: true, pedirUbicacion: true } },
};

const esc: Datos = {
  modo: 'ecommerce', entrega: 'both', direccion: 'Av. La Paz 123, Miraflores, Lima', hoy: '2026-10-26', ahora: '2026-10-26 12:00', pideProfesional: false,
  agenda: { horario: {}, paso: 30, equipo: [], bloqueos: [], ocupados: [] },
  familias: ['Favoritos', 'Panadería', 'Bebidas'],
  items: [
    producto('pan-masa-madre', 'Pan de masa madre', 'Horneado cada mañana, de corteza crujiente y miga suave.', 20, 'Favoritos', foto(3)),
    producto('croissant-pistacho', 'Croissant de pistacho', 'Hojaldre de mantequilla con crema de pistacho.', 18, 'Favoritos', foto(2)),
    producto('latte', 'Latte de la casa', 'Doble espresso, leche vaporizada y arte latte.', 14, 'Bebidas', foto(0)),
    producto('cold-brew', 'Cold brew de naranja', 'Extracción en frío, hielo y naranja fresca.', 16, 'Bebidas', foto(1)),
    producto('tarta-queso', 'Tarta de queso', 'Porción cremosa con cubierta caramelizada.', 19, 'Panadería', foto(4)),
    producto('espresso', 'Espresso con galleta', 'Café de origen acompañado de una galleta de mantequilla.', 10, 'Bebidas', foto(5)),
  ],
};

export default function EjemploLaBaguette() {
  return <Marco pagina={pagina} portada>
    <div className="tp-ejemplo-restaurante"><span>La Baguette es un negocio de ejemplo. Los pedidos son una simulación.</span><a href="/panel/tu-pagina">Crear mi página →</a></div>
    <EjemplosNav actual="restaurante" />
    <Cabecera pagina={pagina} catalogoDisponible fotoDestacada="/assets/negocios-ejemplo/cafeteria-hero.webp" />
    <main className="tp-hoja">
      <Escaparate esc={esc} slug={pagina.slug} whatsapp="" puedePedir puedeReservar={false} disposicion="cuadricula" plantillaRestaurante pedidoGastronomico nombreNegocio={pagina.titulo} apariencia={pagina.secciones.apariencia} demoPedido />
    </main>
  </Marco>;
}
