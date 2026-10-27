import type { Metadata } from 'next';
import Marco, { Cabecera } from '@/modules/tu-pagina/publico/Marco';
import Escaparate from '@/modules/tu-pagina/publico/Escaparate';
import type { PaginaPublica } from '@/modules/tu-pagina/servidor/pagina';
import type { Escaparate as Datos, Item } from '@/modules/tu-pagina/dominio/tienda';

export const metadata: Metadata = { title: 'Forno Norte · Ejemplo de Carta visual', robots: { index: false, follow: false } };

const foto = (nombre: 'margarita' | 'pepperoni' | 'fettuccine' | 'duo' | 'pasta-horno') => `/assets/restaurante-ejemplo/${nombre}.webp`;
const producto = (id: string, nombre: string, descripcion: string, precio: number, familia: string, imagen: ReturnType<typeof foto>): Item => ({
  id, nombre, descripcion, precio, familia, fotos: [imagen], tipo: 'producto', duracion: 0, quedan: null, opciones: [], grupos: [], vigenciaMeses: 0,
});

const pagina: PaginaPublica = {
  slug: 'forno-norte', version: 1, titulo: 'Forno Norte', frase: 'Pizzas de masa lenta y pastas hechas en casa.', whatsapp: '', plantilla: 'restaurante', color: '#EF3C24', logo_url: null, portada_url: null, distritos: [],
  secciones: { catalogo: true, reservar: false, apariencia: { plantillaActiva: true, fotoPlantilla: 'pizzeria', tituloBanner: 'La pizza que reúne a todos', mostrarWhatsapp: false, pedirMetodoPago: true, pedirNotaPedido: true, pedirUbicacion: true } },
};

const esc: Datos = {
  modo: 'ecommerce', entrega: 'both', direccion: 'Av. La Paz 123, Miraflores, Lima', hoy: '2026-10-26', ahora: '2026-10-26 12:00', pideProfesional: false,
  agenda: { horario: {}, paso: 30, equipo: [], bloqueos: [], ocupados: [] },
  familias: ['Promociones', 'Pizzas', 'Pastas'],
  items: [
    producto('promo-uno', 'Dúo del horno', 'Pizza margarita y pizza pepperoni para compartir.', 54, 'Promociones', foto('duo')),
    producto('promo-dos', 'Cena para dos', 'Pizza pepperoni y fettuccine de la casa.', 68, 'Promociones', foto('pepperoni')),
    producto('margarita', 'Margarita clásica', 'Salsa de tomate, mozzarella fresca y albahaca.', 29, 'Pizzas', foto('margarita')),
    producto('pepperoni', 'Pepperoni de la casa', 'Mozzarella, pepperoni dorado y masa fermentada.', 34, 'Pizzas', foto('pepperoni')),
    producto('pasta', 'Fettuccine Alfredo', 'Salsa cremosa, parmesano y perejil fresco.', 32, 'Pastas', foto('fettuccine')),
    producto('pasta-horno', 'Pasta al horno', 'Pasta gratinada con queso y salsa de tomate.', 35, 'Pastas', foto('pasta-horno')),
  ],
};

export default function EjemploPizzeria() {
  return <Marco pagina={pagina} portada>
    <div className="tp-ejemplo-restaurante"><span>Forno Norte es un negocio de ejemplo. Los pedidos son una simulación.</span><a href="/panel/tu-pagina">Crear mi página →</a></div>
    <Cabecera pagina={pagina} catalogoDisponible fotoDestacada="/assets/restaurante-ejemplo/portada.webp" />
    <main className="tp-hoja">
      <Escaparate esc={esc} slug={pagina.slug} whatsapp="" puedePedir puedeReservar={false} disposicion="cuadricula" plantillaRestaurante nombreNegocio={pagina.titulo} apariencia={pagina.secciones.apariencia} demoPedido />
    </main>
  </Marco>;
}
