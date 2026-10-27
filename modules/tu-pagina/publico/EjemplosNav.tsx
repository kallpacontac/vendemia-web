/** Enlaces visibles entre las demos completas, también en móvil. */
export default function EjemplosNav({ actual }: { actual: 'restaurante' | 'barberia' }) {
  return <nav className="tp-ejemplos-nav" aria-label="Ejemplos de negocios">
    <span>Explorar ejemplos</span>
    <a href="/ejemplos/pizzeria" aria-current={actual === 'restaurante' ? 'page' : undefined}>Forno Norte · restaurante</a>
    <a href="/ejemplos/cafeteria">Grano de Barrio · cafetería</a>
    <a href="/ejemplos/barberia" aria-current={actual === 'barberia' ? 'page' : undefined}>Atelier Norte · barbería</a>
    <a href="/ejemplos/clinica-dental?diseno=clara">Sonrisa Norte · clínica</a>
  </nav>;
}
