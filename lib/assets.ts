/**
 * BLOQUE B · INVENTARIO DE ASSETS
 *
 * Un único punto de verdad. Mientras `url` sea null, <AssetSlot /> renderiza
 * un placeholder presentable. En cuanto le pongas una url, el placeholder
 * desaparece solo y no hay que tocar ningún componente.
 *
 * El checklist vivo está en /dev/assets.
 */

export type AssetKind = 'image' | 'video' | 'lottie' | '3d' | 'icon' | 'logo';

export type AssetEntry = {
  url: string | null;
  spec: string;
  kind: AssetKind;
  /** Dónde se usa — solo informativo, lo lee /dev/assets */
  section: string;
  /** Alta = bloquea el lanzamiento */
  priority: 'alta' | 'media' | 'baja';
};

/**
 * OJO con el tipado: si exportas el objeto literal directamente, TypeScript
 * infiere `url: null` (tipo literal) y luego `entry.url!` no compila. El paso
 * por `_assets` + el mapped type conserva las CLAVES para AssetId pero ensancha
 * los VALORES a AssetEntry, que es lo que queremos.
 */
const _assets = {
  // Los únicos con url: se generan con `npm run logo` desde el logo original.
  'brand.mark': {
    url: '/brand/mia.svg',
    spec: 'SVG · Mia sobre el avión · usar a partir de 48px',
    kind: 'logo',
    section: '0 · Intro / marca',
    priority: 'alta',
  },
  'brand.avatar': {
    url: '/brand/mia-avatar.svg',
    spec: 'SVG · cabeza + mano · legible desde 24px · es el favicon',
    kind: 'logo',
    section: '0 · Navbar / footer',
    priority: 'alta',
  },
  'brand.lockup': {
    url: '/brand/lockup.webp',
    spec: 'WebP alfa 1621x596 · logo + wordmark claro · variantes -claro y -azul',
    kind: 'logo',
    section: '0 · OG / prensa',
    priority: 'media',
  },
  'hero.lightRay': {
    url: null,
    spec: 'PNG alfa 1600x900, blend screen',
    kind: 'image',
    section: '1 · Hero',
    priority: 'alta',
  },
  'benefit.mediaCard': {
    url: '/ilustraciones/benefit-mediaCard.svg',
    spec: 'JPG/WebP 880x1100 (4:5)',
    kind: 'image',
    section: '2 · Beneficio',
    priority: 'media',
  },
  'benefit.chipLogos': {
    url: null,
    spec: '8 SVG a color 20px',
    kind: 'logo',
    section: '2 · Beneficio',
    priority: 'media',
  },
  'bentoA.globe': {
    url: '/ilustraciones/bentoA-globe.svg',
    spec: 'WebM alfa loop 8s, 800x800',
    kind: 'image',
    section: '3 · Bento A',
    priority: 'alta',
  },
  'bentoA.endpoint': {
    url: '/ilustraciones/bentoA-endpoint.svg',
    spec: 'SVG diagrama de nodos',
    kind: 'image',
    section: '3 · Bento A',
    priority: 'media',
  },
  'bentoB.privacy': {
    url: '/ilustraciones/bentoB-privacy.svg',
    spec: 'SVG/WebM 600x400',
    kind: 'image',
    section: '4 · Bento B',
    priority: 'media',
  },
  'bentoB.storage': {
    url: '/ilustraciones/bentoB-storage.svg',
    spec: 'SVG grid de bloques 600x400',
    kind: 'image',
    section: '4 · Bento B',
    priority: 'media',
  },
  'bentoB.models': {
    url: '/ilustraciones/bentoB-models.svg',
    spec: 'SVG diagrama de nodos 600x400',
    kind: 'image',
    section: '4 · Bento B',
    priority: 'media',
  },
  'bentoB.autoscale': {
    url: '/ilustraciones/bentoB-autoscale.svg',
    spec: 'SVG circuito ancho 900x300',
    kind: 'image',
    section: '4 · Bento B',
    priority: 'media',
  },
  'bentoB.gpu': {
    url: '/ilustraciones/bentoB-gpu.svg',
    spec: 'SVG logo + snippet de código',
    kind: 'image',
    section: '4 · Bento B',
    priority: 'media',
  },
  'global.globe': {
    url: '/ilustraciones/global-globe.svg',
    spec: 'WebM alfa loop 12s, 1200x1200',
    kind: 'image',
    section: '5 · Red global',
    priority: 'alta',
  },
  'useCases.it': {
    url: '/ilustraciones/useCases-it.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'useCases.retail': {
    url: '/ilustraciones/useCases-retail.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'useCases.auto': {
    url: '/ilustraciones/useCases-auto.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'useCases.gaming': {
    url: '/ilustraciones/useCases-gaming.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'useCases.hospitality': {
    url: '/ilustraciones/useCases-hospitality.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'useCases.manufacturing': {
    url: '/ilustraciones/useCases-manufacturing.svg',
    spec: 'PNG/WebP 600x400',
    kind: 'image',
    section: '7 · Casos de uso',
    priority: 'media',
  },
  'footer.nebula': {
    url: null,
    spec: 'PNG alfa 900x600',
    kind: 'image',
    section: '12 · Footer',
    priority: 'baja',
  },
  'footer.badges': {
    url: null,
    spec: '3 SVG de certificación',
    kind: 'logo',
    section: '12 · Footer',
    priority: 'baja',
  },
  'footer.payments': {
    url: null,
    spec: '4 SVG de métodos de pago',
    kind: 'logo',
    section: '12 · Footer',
    priority: 'baja',
  },
} satisfies Record<string, AssetEntry>;

export const ASSETS: { [K in keyof typeof _assets]: AssetEntry } = _assets;

export type AssetId = keyof typeof _assets;

export const ASSET_IDS = Object.keys(ASSETS) as AssetId[];

export function getAsset(id: AssetId): AssetEntry {
  return ASSETS[id];
}

export function isAssetReady(id: AssetId): boolean {
  return Boolean(ASSETS[id].url);
}
