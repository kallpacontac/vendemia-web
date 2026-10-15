'use client';
// Pide en el panel: modules/pide/ui. Aquí solo la ruta.
import { Suspense } from 'react';
import PanelPide from '@/modules/pide/ui/PanelPide';

// useSearchParams (el QR de la etiqueta trae ?envio=) exige un Suspense alrededor.
export default function Page() {
  return (
    <Suspense>
      <PanelPide />
    </Suspense>
  );
}
