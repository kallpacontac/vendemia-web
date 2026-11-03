'use client';

/**
 * El ejemplo de «Atención en mesa» (/ejemplos/mesa). Es la pantalla real con un servidor
 * simulado en memoria, junto a lo que ve el mozo. No avisa a nadie ni guarda nada.
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import AtencionEnMesa, { type ApiMesa, type CarritoMesa, type DatosLlamado, type LineaMesa } from '@/modules/tu-pagina/publico/AtencionEnMesa';
import { soles, type Item } from '@/modules/tu-pagina/dominio/tienda';
import type { AjustesCarta } from '@/modules/tu-pagina/dominio/mesa';

interface LlamadoDemo { id: number; titulo: string; detalle: string; creado: number; veces: number; tipo: string }

const plato = (id: string, nombre: string, familia: string, precio: number, descripcion: string, foto = '', opciones: string[] = []): Item => ({
  id, nombre, familia, precio, descripcion, fotos: foto ? [foto] : [], tipo: 'producto', duracion: 0, quedan: null,
  opciones: opciones.map((etiqueta, i) => ({ id: `${id}-${i}`, etiqueta, quedan: null })), grupos: [], vigenciaMeses: 0,
});

const R = '/assets/restaurante-ejemplo';
const N = '/assets/negocios-ejemplo';
const ITEMS: Item[] = [
  plato('p1', 'Pizza margarita', 'Para compartir', 42, 'Salsa de tomate, mozzarella y albahaca fresca.', `${R}/margarita.webp`, ['Mediana', 'Familiar']),
  plato('p2', 'Pizza pepperoni', 'Para compartir', 46, 'Pepperoni, mozzarella y orégano.', `${R}/pepperoni.webp`, ['Mediana', 'Familiar']),
  plato('p3', 'Fettuccine a la huancaína', 'Fondos', 38, 'Salsa de ají amarillo y queso fresco, con lomo saltado.', `${R}/fettuccine.webp`),
  plato('p4', 'Pasta al horno', 'Fondos', 36, 'Gratinada con queso y salsa de la casa.', `${R}/pasta-horno.webp`),
  plato('p5', 'Tarta vasca', 'Postres', 18, 'Exterior caramelizado y centro cremoso.', `${N}/cafe-4.webp`),
  plato('p6', 'Espresso doble', 'Bebidas', 9, 'Café peruano de temporada.', `${N}/cafe-0.webp`),
  plato('p7', 'Limonada de hierbabuena', 'Bebidas', 12, 'Recién exprimida.'),
  plato('p8', 'Pisco sour', 'Bebidas', 26, 'Pisco quebranta, limón y clara batida.'),
];
const AJUSTES: AjustesCarta = {
  p1: { destacado: true, en: 'Margherita pizza' },
  p2: { en: 'Pepperoni pizza' },
  p3: { destacado: true, antes: 45, en: 'Huancaína fettuccine with stir-fried beef' },
  p4: { en: 'Baked pasta' },
  p5: { en: 'Basque cheesecake' },
  p6: { en: 'Double espresso' },
  p7: { en: 'Mint lemonade' },
  p8: { desde: '17:00', hasta: '02:00', en: 'Pisco sour' },
};
const EQUIPO = [{ id: 'e1', nombre: 'Rosa Quispe' }, { id: 'e2', nombre: 'Marco Salas' }];
const MESA = { salon: 'Terraza', numero: '12' };

const resumen = (lineas: LineaMesa[]): CarritoMesa => ({
  lineas,
  unidades: lineas.reduce((t, l) => t + l.cantidad, 0),
  total: lineas.reduce((t, l) => t + l.precio * l.cantidad, 0),
  personas: new Set(lineas.map((l) => l.mia)).size,
});

const espera = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
};

export default function MesaEjemplo() {
  const [llamados, setLlamados] = useState<LlamadoDemo[]>([]);
  const [atendidos, setAtendidos] = useState<number[]>([]);
  const [ahora, setAhora] = useState(0);
  const lineas = useRef<LineaMesa[]>([]);
  const siguiente = useRef(1);

  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);

  const registrar = (tipo: string, titulo: string, detalle: string) => {
    setLlamados((actual) => {
      const previo = tipo === 'pedido' ? null : actual.find((l) => l.tipo === tipo);
      if (!previo) return [...actual, { id: siguiente.current++, tipo, titulo, detalle, creado: Date.now(), veces: 1 }];
      return actual.map((l) => (l === previo ? { ...l, veces: l.veces + 1, detalle: detalle || l.detalle } : l));
    });
  };

  const api = useRef<ApiMesa>({
    async llamar(d: DatosLlamado) {
      if (d.tipo === 'mozo') registrar('mozo', 'Llama al mozo', '');
      if (d.tipo === 'cuenta') registrar('cuenta', 'Pide la cuenta', d.dividir ? 'Quieren dividir la cuenta.' : d.comprobante === 'factura' ? `Factura · RUC ${d.documento}` : `Boleta${d.documento ? ` · DNI ${d.documento}` : ''}`);
      if (d.tipo === 'requerimiento') registrar('requerimiento', 'Otro pedido', d.detalle ?? '');
      if (d.tipo === 'sugerencia') registrar('sugerencia', 'Sugerencia (solo gerencia)', d.detalle ?? '');
      if (d.tipo === 'felicitacion') {
        const para = EQUIPO.find((e) => e.id === d.employeeId)?.nombre;
        registrar('felicitacion', `Felicitación${para ? ` para ${para}` : ''}`, d.detalle ?? '');
      }
      return { status: 'ok', repetida: false };
    },
    async leer() { return resumen(lineas.current); },
    async agregar(itemId, opcion) {
      const item = ITEMS.find((i) => i.id === itemId);
      if (!item) return null;
      const etiqueta = item.opciones.find((o) => o.id === opcion)?.etiqueta ?? '';
      const igual = lineas.current.find((l) => l.mia && l.catalog_id === itemId && l.opcion === etiqueta);
      if (igual) igual.cantidad += 1;
      else lineas.current = [...lineas.current, { id: `${itemId}-${etiqueta}`, catalog_id: itemId, nombre: item.nombre, opcion: etiqueta, precio: item.precio ?? 0, cantidad: 1, mia: true }];
      // Así se ve otra persona de la mesa agregando desde su celular.
      if (!lineas.current.some((l) => !l.mia)) {
        const otro = ITEMS[6];
        lineas.current = [...lineas.current, { id: 'de-otro', catalog_id: otro.id, nombre: otro.nombre, opcion: '', precio: otro.precio ?? 0, cantidad: 2, mia: false }];
      }
      return resumen(lineas.current);
    },
    async cantidad(id, cantidad) {
      lineas.current = lineas.current.map((l) => (l.id === id ? { ...l, cantidad } : l)).filter((l) => l.cantidad > 0);
      return resumen(lineas.current);
    },
    async pedir(nota) {
      if (!lineas.current.length) return { status: 'vacio' };
      const lista = lineas.current.map((l) => `${l.cantidad}× ${l.nombre}${l.opcion ? ` · ${l.opcion}` : ''}`).join('\n');
      registrar('pedido', 'Quiere pedir', `${lista}${nota ? `\n“${nota}”` : ''}\nAproximado: ${soles(resumen(lineas.current).total)}`);
      lineas.current = [];
      return { status: 'ok' };
    },
  });

  const pendientes = llamados.filter((l) => !atendidos.includes(l.id));

  return (
    <div className="tm-ejemplo">
      <div className="tm-ejemplo__mesa">
        <AtencionEnMesa
          negocio="Casa Brasa"
          logo={null}
          whatsapp=""
          token="ejemplo-de-mesa"
          mesa={MESA}
          equipo={EQUIPO}
          items={ITEMS}
          ajustes={AJUSTES}
          api={api.current}
          avisoDemo="Ejemplo: no se avisa a nadie. Prueba los botones y mira lo que le llega al mozo."
        />
      </div>
      <aside className="tm-ejemplo__mozo" aria-label="Lo que ve el mozo">
        <h2>Lo que ve el mozo</h2>
        <p>En su celular y en el panel. Él sigue comandando en el sistema que el restaurante ya usa.</p>
        {pendientes.length === 0 && <p className="tm-ejemplo__vacio">Ninguna mesa está esperando.</p>}
        {pendientes.map((l) => (
          <article key={l.id}>
            <header><b>Terraza · Mesa 12</b><time>{espera(ahora - l.creado)}</time></header>
            <strong>{l.titulo}{l.veces > 1 ? ` · insistió ${l.veces} veces` : ''}</strong>
            {l.detalle && <p>{l.detalle}</p>}
            <button type="button" onClick={() => setAtendidos((a) => [...a, l.id])}><CheckCheck size={16} aria-hidden="true" /> Llegué a la mesa</button>
          </article>
        ))}
      </aside>
    </div>
  );
}
