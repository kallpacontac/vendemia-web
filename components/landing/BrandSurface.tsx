import type { ReactNode } from 'react';

export default function BrandSurface({ children }: { children: ReactNode }) {
  return (
    <div className="vendemia-landing-page">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&display=swap" />
      {children}
    </div>
  );
}
