type Props = {
  nombre: string;
  slug: 'mancha' | 'brew-bliss' | 'kallpa';
  hashInicial?: string;
};

/** El sitio original se sirve desde public, en el mismo dominio que Vendemia. */
export default function PaginaPersonalizada({ nombre, slug, hashInicial = '' }: Props) {
  return (
    <main style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', overflow: 'hidden' }}>
      <iframe
        title={nombre}
        src={`/paginas-personalizadas/${slug}/index.html${hashInicial}`}
        style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
      />
    </main>
  );
}
