# Mi página: lectura de la referencia y adaptación

Referencia visual consultada: https://qcarta.com/ (3 de noviembre de 2026).

## Patrón de página identificado

1. Barra superior clara y fija, con navegación por secciones y una acción principal.
2. Portada en dos columnas: promesa breve a la izquierda y una demostración móvil interactiva a la derecha.
3. Prueba del producto antes de la explicación extensa: el visitante puede tocar categorías y agregar un producto.
4. Bloques escaneables: soluciones, tres pasos, capacidades, galería de ejemplos, preguntas y cierre.
5. Ejemplos presentados en marcos de celular, cada uno con acceso directo a su página completa.
6. Tipografía negra grande, superficies claras, acentos de color, tarjetas redondeadas y mucho espacio entre secciones.
7. Titulares Poppins ExtraBold con tracking cerrado. Las secciones entran con opacidad y desplazamiento vertical; el teléfono flota lentamente, las manchas y órbitas se mueven a otro ritmo, y los controles responden al toque.
8. El logotipo es una pieza compacta de alto contraste sobre una silueta oscura.

En una ventana CSS de 1530 px, la portada de referencia usa un contenedor de 1152 px con 24 px de espacio interior, dos columnas de unos 549 y 499 px separadas por 56 px, un título Poppins 800 de 68 px con interlineado de 69,36 px y un teléfono de 320 × 624 px. Las banderas son imágenes de 60 × 40 px en una fila que avanza horizontalmente, con 36 px entre ellas.

En `/planes`, la barra superior mide unos 68–69 px de alto. Sus enlaces usan Poppins de 14 px y peso 500, con 8 px de relleno vertical y 12 px horizontal; el acceso de cliente usa peso 600. El botón principal mide unos 41 px de alto. El menú «Soluciones» abre una tarjeta flotante de 360 px con iconos sobre cuadrados negros y descripciones breves. El encabezado conserva blanco al 85 % y desenfoque de fondo de 8 px aun al desplazarse. Vendemia mantiene esas proporciones y usa naranja en los acentos y el botón principal.

La sección de soluciones usa una tarjeta de unos 654 × 602 px y dos tarjetas de unos 430 × 293 px apiladas con 20 px de separación. La sección de tres pasos divide 1104 px en columnas de 440 y 616 px, con 48 px entre ellas; cada paso ocupa al menos 125 px.

## Adaptación a Vendemia

- La ruta `/mi-pagina` usa esta secuencia con la paleta de Vendemia: negro, crema y naranja. El texto de la portada usa Poppins. El wordmark dice «Vendemia» con lettering blanco, contorno negro grueso y extrusión negra que sigue cada letra; la «i» no tiene punto blanco y lleva un solo punto naranja. No lleva cápsula de fondo ni mascota.
- El titular reserva un espacio fijo para «local», «carta» y «sitio» y las escribe con un cursor naranja, sin desplazar «digital» a otra línea. El teléfono, los avisos flotantes y las capas usan movimientos de distintas velocidades; `prefers-reduced-motion` los desactiva.
- El teléfono de muestra mide 320 × 624 px en escritorio. La cabecera naranja llega hasta el marco superior y un surco negro queda centrado. La franja negra muestra los tipos de negocio; una sección blanca aparte presenta imágenes de 17 banderas en movimiento horizontal. Las imágenes se guardan localmente en `public/assets/mi-pagina/banderas/` para que no dependan de emoji ni de una conexión externa en producción.
- Los avisos flotantes incluyen un contador de promoción de muestra y la opción de entrega o recojo. El QR local lleva al ejemplo de cafetería y el resumen suma los precios al agregar productos. El verde se reserva para el control de WhatsApp; el marco del QR y los demás acentos siguen el naranja Vendemia.
- Las tres soluciones conservan los ejemplos propios de catálogo, agenda y canchas dentro de la composición asimétrica de la referencia. Los pasos se presentan como tres tarjetas numeradas con una línea de continuidad.
- La demo de portada es ilustrativa y local: no envía pedidos ni guarda información.
- La galería muestra únicamente ejemplos del proyecto: La Baguette, Grano de Barrio, Atelier Norte, Zona Gol y Sonrisa Norte.
- En la referencia, las vistas de cartas dentro de los celulares se desplazan verticalmente con una transición de 8 segundos al pasar el cursor. La galería de Vendemia usa capturas completas de sus cinco demos, con tres teléfonos visibles en escritorio, desplazamiento horizontal para ver los demás y acceso a cada demo. Los teléfonos flotan despacio y el marco se amplía e inclina ligeramente en hover.
- Las tarjetas de los tres pasos y las capacidades tienen una respuesta leve de escala e inclinación. Las capacidades se muestran como una cuadrícula de icono, título y texto, con entradas escalonadas al aparecer. El amarillo detrás del texto en la captura de referencia corresponde a la selección del navegador: en Vendemia solo aparece mientras el visitante selecciona texto mediante `::selection`, nunca como estado permanente.
- Los movimientos respetan `prefers-reduced-motion`; el recorrido automático dentro de cada teléfono se desactiva en ese modo.
- Los CTA llevan al panel de Mi página. La landing principal enlaza la nueva página y muestra dos ejemplos propios.
- Los planes Básico, Interactivo y Pro, con sus tarifas y listas de funciones, se incorporaron después por solicitud explícita del propietario tomando la referencia como base. Las demos y testimonios de Qcarta no se usan en Vendemia.
- Los botones y superficies destacadas de Qcarta funcionan por contraste entre un color de marca muy saturado y texto blanco. Vendemia mantiene la tarjeta principal en naranja profundo `#c63c00` con texto blanco; el naranja claro queda para detalles decorativos.
- Los planes viven ahora en `/mi-pagina/planes`, con miga de navegación, selector de periodo, tres tarjetas, comparación de funciones y preguntas. La landing enlaza esa subpágina. Como segunda variante de contraste, los CTA principales usan negro suave `#111` con texto naranja cálido `#ff9f50`; la tarjeta Interactivo conserva naranja profundo con texto blanco.

Los archivos principales son `app/mi-pagina/MiPaginaLanding.tsx`, `app/mi-pagina/mi-pagina.css` y `components/landing/MiPaginaTeaser.tsx`.
