'use client';

import { Image as ImageIcon, Video, Sparkles, Box, Shapes, Hexagon } from 'lucide-react';
import { ASSETS, type AssetId, type AssetKind } from '@/lib/assets';

/**
 * BLOQUE B · <AssetSlot />
 *
 * Ocupa el lugar de cada asset y deja clarísimo qué hay que reemplazar.
 * Regla de oro: el placeholder tiene que verse BIEN, no roto — la maqueta
 * se presenta a cliente con los slots vacíos y no debe dar vergüenza.
 *
 * Si ASSETS[id].url existe, renderiza el asset real y se olvida del placeholder.
 */

type Props = {
  id: AssetId;
  kind?: AssetKind;
  ratio?: string;           // '4/5' · '16/9' · '1/1' · '3/1' · '16/6'
  label: string;            // qué debe ir aquí, en lenguaje humano
  tone?: 'dark' | 'light';  // adapta el placeholder al fondo de su sección
  radius?: 'icon' | 'btn' | 'input' | 'card' | 'hero' | 'none';
  className?: string;
  /** Oculta los metadatos (id/spec) en slots muy pequeños tipo logo o icon */
  compact?: boolean;
  priority?: boolean;
};

const KIND_ICON: Record<AssetKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  lottie: Sparkles,
  '3d': Box,
  icon: Shapes,
  logo: Hexagon,
};

const RADIUS_CLASS = {
  icon: 'rounded-icon',
  btn: 'rounded-btn',
  input: 'rounded-input',
  card: 'rounded-card',
  hero: 'rounded-hero',
  none: '',
} as const;

export default function AssetSlot({
  id,
  kind,
  ratio,
  label,
  tone = 'dark',
  radius = 'card',
  className = '',
  compact = false,
  priority = false,
}: Props) {
  const entry = ASSETS[id];
  const resolvedKind = kind ?? entry.kind;
  const hasUrl = Boolean(entry.url);
  const Icon = KIND_ICON[resolvedKind];

  const rootProps = {
    'data-asset-slot': id,
    'data-asset-kind': resolvedKind,
    'data-asset-ready': hasUrl,
  };

  const style: React.CSSProperties = ratio ? { aspectRatio: ratio.replace('/', ' / ') } : {};

  // ── 1. Asset real ────────────────────────────────────────
  if (hasUrl) {
    if (resolvedKind === 'video') {
      return (
        <video
          {...rootProps}
          src={entry.url!}
          className={`${RADIUS_CLASS[radius]} h-full w-full object-cover ${className}`}
          style={style}
          autoPlay
          muted
          loop
          playsInline
          preload={priority ? 'auto' : 'none'}
          aria-label={label}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rootProps}
        src={entry.url!}
        alt={label}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`${RADIUS_CLASS[radius]} h-full w-full object-cover ${className}`}
        style={style}
      />
    );
  }

  // ── 2. Placeholder ───────────────────────────────────────
  const dark = tone === 'dark';

  const bg = dark
    ? 'radial-gradient(circle at 30% 20%, rgba(255,73,0,.18), transparent 60%), #0A0A0A'
    : 'radial-gradient(circle at 30% 20%, rgba(255,73,0,.10), transparent 60%), #F1F1EE';

  const border = dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)';
  const textColor = dark ? 'var(--text-mid)' : 'var(--text-muted)';

  return (
    <div
      {...rootProps}
      role="img"
      aria-label={`Asset pendiente: ${label}`}
      className={`relative flex flex-col items-center justify-center overflow-hidden text-center ${RADIUS_CLASS[radius]} ${className}`}
      style={{ ...style, background: bg, border: `1px dashed ${border}` }}
    >
      <span
        className="absolute right-3 top-3 rounded-full px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.14em]"
        style={{ background: 'rgba(255,73,0,.15)', color: 'var(--orange-500)' }}
      >
        Asset
      </span>

      <Icon size={24} className="opacity-50" style={{ color: textColor }} aria-hidden />

      {!compact && (
        <>
          <span className="mt-3 max-w-[80%] text-[13px] font-medium" style={{ color: textColor }}>
            {label}
          </span>
          <span className="mt-1 font-mono text-[11px] opacity-45" style={{ color: textColor }}>
            {id}
          </span>
          <span className="mt-[2px] text-[11px] opacity-35" style={{ color: textColor }}>
            {entry.spec}
          </span>
        </>
      )}
    </div>
  );
}
