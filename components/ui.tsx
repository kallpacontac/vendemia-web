import type { ReactNode } from 'react';

/**
 * Piezas pequeñas que se repiten. Están aquí para que ninguna sección
 * reinvente un badge con un radio distinto.
 */

/** Badge en píldora · alto 28px, texto 12px, padding-x 12px */
export function Badge({
  children,
  icon,
  tone = 'dark',
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'dark' | 'light';
}) {
  const dark = tone === 'dark';
  return (
    <span
      className="inline-flex h-[28px] items-center gap-[6px] rounded-full border px-3 text-badge"
      style={
        dark
          ? { borderColor: 'var(--border-dark)', background: 'var(--surface-800)', color: 'var(--text-mid)' }
          : { borderColor: 'transparent', background: 'var(--text-dark)', color: '#fff' }
      }
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Párrafo con términos clave en <strong> blanco sobre el resto en gris.
 * Ese contraste tipográfico DENTRO del párrafo se repite en cada tarjeta y es
 * uno de los detalles que más aporta a la sensación de acabado.
 */
export function RichParagraph({
  parts,
  className = '',
  strongColor = 'var(--text-hi)',
  baseColor = 'var(--text-mid)',
}: {
  parts: readonly { readonly text: string; readonly strong?: boolean }[];
  className?: string;
  strongColor?: string;
  baseColor?: string;
}) {
  return (
    <p className={`text-body ${className}`} style={{ color: baseColor }}>
      {parts.map((part, i) =>
        part.strong ? (
          <strong key={i} style={{ color: strongColor, fontWeight: 600 }}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  );
}

/** Tarjeta oscura estándar · radius 24, bg #0A0A0A, border 1px #1F1F1F, padding 28 */
export function DarkCard({
  children,
  className = '',
  glowCorner = 'top-left',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  glowCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';
  // TS solo permite atributos con guion sin declarar en elementos intrínsecos.
  // En un componente hay que abrir la puerta explícitamente, o `data-card` no
  // compila.
  [key: `data-${string}`]: unknown;
} & React.HTMLAttributes<HTMLDivElement>) {
  const corner = {
    'top-left': '20% 15%',
    'top-right': '80% 15%',
    'bottom-left': '20% 85%',
    'bottom-right': '80% 85%',
    none: '',
  }[glowCorner];

  return (
    <div
      className={`relative overflow-hidden rounded-card border p-7 ${className}`}
      style={{ background: 'var(--surface-800)', borderColor: 'var(--border-dark)' }}
      {...rest}
    >
      {glowCorner !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background: `radial-gradient(60% 60% at ${corner}, rgba(255,73,0,.06), transparent 70%)`,
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Campo de estrellas — puntos con opacidad animada desfasada */
export function Starfield({ count = 50, className = '' }: { count?: number; className?: string }) {
  // Determinista: mismo resultado en servidor y cliente, sin hydration mismatch.
  const stars = Array.from({ length: count }, (_, i) => {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 43758.5453;
    const c = Math.sin(i * 39.425) * 43758.5453;
    return {
      left: `${((a - Math.floor(a)) * 100).toFixed(2)}%`,
      top: `${((b - Math.floor(b)) * 100).toFixed(2)}%`,
      size: (c - Math.floor(c)) > 0.5 ? 2 : 1,
      delay: `${(((a - Math.floor(a)) * 4)).toFixed(2)}s`,
      duration: `${(2 + (b - Math.floor(b)) * 2).toFixed(2)}s`,
    };
  });

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  );
}
