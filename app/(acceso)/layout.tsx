import '../panel.css';

/**
 * La pantalla de acceso usa el sistema de diseño del panel, pero NO su layout:
 * ni barra lateral, ni guardia de sesión —sería una guardia que se protege de
 * sí misma— ni proveedores. Por eso vive en su propio grupo de rutas.
 */
export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
