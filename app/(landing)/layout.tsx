import '../globals.css';
import BrandIntro from '@/components/BrandIntro';
import SmoothScroll from '@/components/SmoothScroll';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LO QUE ES SOLO DE LA LANDING VIVE AQUÍ, NO EN app/layout.tsx
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La intro de marca, el scroll suave de Lenis y el telón (`page-curtain`)
 * estaban en el layout raíz cuando este proyecto era una sola página. Con el
 * panel dentro, ahí hacían daño: el panel arrancaría con la cortina
 * desplazada 100vh, con Lenis secuestrando la rueda del ratón en una tabla y
 * con la intro comercial delante del login.
 *
 * Un grupo de rutas —el paréntesis en el nombre de la carpeta— no cambia la
 * URL: la landing sigue siendo "/". Solo separa qué layout envuelve a qué.
 *
 * globals.css también se importa AQUÍ y no en la raíz. Next carga el CSS por
 * segmento, así que los tokens y resets de la landing no llegan al panel, que
 * tiene los suyos en (panel)/panel.css. Los dos definen --brand con valores
 * distintos: juntos, uno de los dos saldría con el color del otro.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <BrandIntro />

      {/*
        M3 · El contenido SIEMPRE se renderiza, desde el primer paint. Nunca
        lo montes al terminar la intro: eso mediría 3 segundos de LCP.
        Solo está transformado hacia abajo mientras la intro corre.
      */}
      <div className="page-curtain">{children}</div>
    </>
  );
}
