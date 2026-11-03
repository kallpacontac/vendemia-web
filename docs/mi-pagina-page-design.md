# Mi página: lectura de la referencia y adaptación

Referencia visual consultada: https://qcarta.com/ (2 de noviembre de 2026).

## Patrón de página identificado

1. Barra superior clara y fija, con navegación por secciones y una acción principal.
2. Portada en dos columnas: promesa breve a la izquierda y una demostración móvil interactiva a la derecha.
3. Prueba del producto antes de la explicación extensa: el visitante puede tocar categorías y agregar un producto.
4. Bloques escaneables: soluciones, tres pasos, capacidades, galería de ejemplos, preguntas y cierre.
5. Ejemplos presentados en marcos de celular, cada uno con acceso directo a su página completa.
6. Tipografía negra grande, superficies claras, acentos de color, tarjetas redondeadas y mucho espacio entre secciones.

## Adaptación a Vendemia

- La ruta `/mi-pagina` usa esta secuencia con la identidad verde de Mi página y navegación propia.
- La demo de portada es ilustrativa y local: no envía pedidos ni guarda información.
- La galería muestra únicamente ejemplos del proyecto: La Baguette, Grano de Barrio, Atelier Norte, Zona Gol y Sonrisa Norte.
- Los CTA llevan al panel de Mi página. La landing principal enlaza la nueva página y muestra dos ejemplos propios.
- Las afirmaciones se limitan a capacidades presentes en el producto; no se copiaron precios, testimonios ni datos comerciales de la referencia.

Los archivos principales son `app/mi-pagina/MiPaginaLanding.tsx`, `app/mi-pagina/mi-pagina.css` y `components/landing/MiPaginaTeaser.tsx`.
