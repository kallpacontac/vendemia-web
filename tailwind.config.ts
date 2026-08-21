import type { Config } from 'tailwindcss';

/**
 * BLOQUE A · TOKENS
 * Los colores viven como CSS vars en globals.css y se exponen aquí.
 * La escala de radios es CERRADA: full · 8 · 12 · 16 · 24 · 28 · 32.
 * Nada intermedio. Si dudas entre 18 y 20, es 24.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          500: 'var(--orange-500)',
          400: 'var(--orange-400)',
          glow: 'var(--orange-glow)',
        },
        amber: { 300: 'var(--amber-300)' },
        bg: {
          900: 'var(--bg-900)',
          850: 'var(--bg-850)',
          intro: 'var(--bg-intro)',
          cream: 'var(--bg-cream)',
        },
        surface: {
          800: 'var(--surface-800)',
          700: 'var(--surface-700)',
        },
        line: {
          dark: 'var(--border-dark)',
          darker: 'var(--border-darker)',
          light: 'var(--border-light)',
        },
        text: {
          hi: 'var(--text-hi)',
          mid: 'var(--text-mid)',
          low: 'var(--text-low)',
          dark: 'var(--text-dark)',
          muted: 'var(--text-muted)',
        },
        pastel: {
          green: '#DCF0DC',
          amber: '#F8EDD4',
          blue: '#D9E6F7',
          pink: '#F5DCEC',
          sky: '#DCE9F5',
        },
      },
      borderRadius: {
        // Escala cerrada — no añadas valores intermedios.
        icon: '8px',
        btn: '12px',
        input: '16px',
        card: '24px',
        hero: '28px',
        stack: '32px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Escala tipográfica verificada sobre un diseño de 1440px
        micro: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        badge: ['12px', { lineHeight: '1', fontWeight: '500' }],
        body: ['15px', { lineHeight: '1.55' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h2: ['52px', { lineHeight: '1.08', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['64px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
      maxWidth: {
        container: '1280px',
        hero: '720px',
        prose: '560px',
        faq: '900px',
      },
      transitionTimingFunction: {
        directional: 'cubic-bezier(.16,1,.3,1)',
      },
      keyframes: {
        'marquee-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-right': {
          from: { transform: 'translateX(-50%)' },
          to: { transform: 'translateX(0)' },
        },
        breathe: {
          '0%,100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.06)' },
        },
        'ray-pulse': {
          '0%,100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        // Los tres puntos del "escribiendo…" de la demo conversacional.
        // Suben y se aclaran a la vez; el desfase entre puntos lo pone el
        // componente con animationDelay, no una animación por punto.
        'typing-dot': {
          '0%,60%,100%': { transform: 'translateY(0)', opacity: '0.35' },
          '30%': { transform: 'translateY(-5px)', opacity: '1' },
        },
      },
      animation: {
        'marquee-left': 'marquee-left 30s linear infinite',
        'marquee-right': 'marquee-right 30s linear infinite',
        breathe: 'breathe 8s ease-in-out infinite',
        'ray-pulse': 'ray-pulse 4s ease-in-out infinite',
        'spin-slow': 'spin-slow 40s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
