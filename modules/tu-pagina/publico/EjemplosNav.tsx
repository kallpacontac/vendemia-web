/** Enlaces visibles entre las demos completas, también en móvil. */
export default function EjemplosNav({ actual }: { actual: 'restaurante' | 'barberia' | 'canchas' | 'mesa' }) {
  return <nav className="tp-ejemplos-nav" aria-label="Ejemplos de negocios">
    <span>Explorar ejemplos</span>
    <a href="/ejemplos/la-baguette" aria-current={actual === 'restaurante' ? 'page' : undefined}>La Baguette · panadería</a>
    <a href="/ejemplos/mesa" aria-current={actual === 'mesa' ? 'page' : undefined}>Casa Brasa · atención en mesa</a>
    <a href="/ejemplos/cafeteria">Grano de Barrio · cafetería</a>
    <a href="/ejemplos/barberia" aria-current={actual === 'barberia' ? 'page' : undefined}>Atelier Norte · barbería</a>
    <a href="/ejemplos/canchas" aria-current={actual === 'canchas' ? 'page' : undefined}>Zona Gol · fútbol</a>
    <a href="/ejemplos/clinica-dental?diseno=clara">Sonrisa Norte · clínica</a>
  </nav>;
}
