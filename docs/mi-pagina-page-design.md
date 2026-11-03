# Mi página: lectura de la referencia y adaptación

Referencia visual consultada: https://qcarta.com/ (2 de noviembre de 2026).

## Patrón de página identificado

1. Barra superior clara y fija, con navegación por secciones y una acción principal.
2. Portada en dos columnas: promesa breve a la izquierda y una demostración móvil interactiva a la derecha.
3. Prueba del producto antes de la explicación extensa: el visitante puede tocar categorías y agregar un producto.
4. Bloques escaneables: soluciones, tres pasos, capacidades, galería de ejemplos, preguntas y cierre.
5. Ejemplos presentados en marcos de celular, cada uno con acceso directo a su página completa.
6. Tipografía negra grande, superficies claras, acentos de color, tarjetas redondeadas y mucho espacio entre secciones.
7. Titulares Poppins ExtraBold con tracking cerrado. Las secciones entran con opacidad y desplazamiento vertical; el teléfono flota lentamente, las manchas y órbitas se mueven a otro ritmo, y los controles responden al toque.
8. El logotipo es una pieza compacta de alto contraste sobre una silueta oscura.

## Adaptación a Vendemia

- La ruta `/mi-pagina` usa esta secuencia con la paleta de Vendemia: negro, crema y naranja. El texto usa Plus Jakarta Sans. El wordmark dice «Vendemia» con lettering blanco, contorno negro grueso y extrusión negra que sigue cada letra; el punto de la «i» es naranja. No lleva cápsula de fondo ni mascota.
- El titular reserva un espacio fijo para «página», «tienda» y «agenda» y las escribe con un cursor naranja, sin desplazar el resto de la frase. El teléfono, los avisos flotantes y las capas usan movimientos de distintas velocidades; `prefers-reduced-motion` los desactiva.
- La maqueta del teléfono crece en la portada, muestra una cabecera naranja, categorías, tres productos y un resumen de pedido. La franja negra incluye una lista de banderas latinoamericanas como detalle visual.
- La demo de portada es ilustrativa y local: no envía pedidos ni guarda información.
- La galería muestra únicamente ejemplos del proyecto: La Baguette, Grano de Barrio, Atelier Norte, Zona Gol y Sonrisa Norte.
- Los CTA llevan al panel de Mi página. La landing principal enlaza la nueva página y muestra dos ejemplos propios.
- Las afirmaciones se limitan a capacidades presentes en el producto; no se copiaron precios, testimonios ni datos comerciales de la referencia.

Los archivos principales son `app/mi-pagina/MiPaginaLanding.tsx`, `app/mi-pagina/mi-pagina.css` y `components/landing/MiPaginaTeaser.tsx`.
