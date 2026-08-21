/* GENERADO POR scripts/logo.mjs · no editar a mano · npm run logo */

export type BrandAsset = { src: string; w: number; h: number };

export const BRAND_ASSETS = {
  "mark": {
    "src": "/brand/mia.svg",
    "w": 523,
    "h": 620
  },
  "avatar": {
    "src": "/brand/mia-avatar.svg",
    "w": 296,
    "h": 221
  },
  "lockup": {
    "src": "/brand/lockup.webp",
    "w": 1621,
    "h": 596
  },
  "lockupLight": {
    "src": "/brand/lockup-claro.webp",
    "w": 1621,
    "h": 596
  }
} satisfies Record<string, BrandAsset>;

export type BrandAssetId = keyof typeof BRAND_ASSETS;
