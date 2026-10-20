# Referencia de Dizi para «Mi página»

Revisión del 20 de octubre de 2026. Fuentes: [portada de Dizi](https://www.dizicatalogo.com/), [registro](https://www.dizicatalogo.com/register), [catálogo Kallpa](https://www.dizicatalogo.com/t/kallpa) y las nueve capturas aportadas por el usuario. Es una referencia de experiencia, no una especificación de su implementación interna.

## Lo que hace fácil empezar

1. **Promesa concreta antes del formulario.** La portada explica el resultado: un enlace para mostrar productos y recibir pedidos por WhatsApp. Sus tres pasos públicos son subir productos, compartir el enlace y recibir pedidos.
2. **Registro guiado:** negocio → diseño → cuenta. El primer paso pide solo nombre y WhatsApp de ventas. El segundo muestra modelos visuales, un grupo de sugeridos y un color opcional. El tercero pide enlace, correo y contraseña; la cuenta se crea al final. Los campos no compiten entre sí en una sola pantalla móvil.
3. **Elección visual, no técnica.** Cada modelo tiene miniatura, nombre y descripción corta del efecto visible. El primero aparece preseleccionado, por lo que elegir otro diseño no es obligatorio.
4. **Personalización diferida.** Tras crear el catálogo, Dizi propone logo y portada, permite importar algunos datos de Facebook y ofrece saltar la configuración inicial. Así, las imágenes no impiden publicar.
5. **Resultado compartible enseguida.** El panel reúne URL pública, copia, apertura, PDF y QR. En el catálogo Kallpa, el cliente ve búsqueda, categorías, una ficha con precio y botones de consultar/agregar al carrito. En móvil, las acciones de la ficha quedan al alcance del pulgar.

La portada anuncia **15 diseños**, pero el selector del registro mostraba **16 nombres** en la revisión. Conviene tomar la diversidad de estructuras como referencia y evitar prometer una cifra que no coincida con el selector real.

## Familias visuales observadas

| Familia | Ejemplos visibles en Dizi | Decisión visual útil para Vendemia |
|---|---|---|
| Cuadrícula limpia | Minimalista, Portada con Banner | Dos columnas móviles, fotografías uniformes, lectura rápida. |
| Cálida o editorial | Clásico Cálido, Arch Studio, Estilo Editorial en portada | Tipografía y ritmo adecuados para artesanía, belleza o servicios. |
| Fotografía protagonista | Vibrante, Boutique, Dark Fashion, Elite | Portada o producto destacado con texto breve y contraste fuerte. |
| Naturaleza | Nature Mint, Eco Hero, Forest Deep | Paletas suaves u oscuras y tratamiento más orgánico de las fotos. |
| Lista funcional | Corporativo Azul | Comparación rápida de muchos servicios o productos. |

Otros nombres visibles en el registro: Nocturno, Aurora Glass, Slash Diagonal y Sunset Glow. No todos justifican una estructura distinta: varios son combinaciones de color, forma de tarjeta y portada. Para Vendemia es mejor empezar con pocos modelos que se distingan de verdad, y dejar que el color de marca se aplique a cualquiera.

## Brecha detectada antes de la implementación

- La cuenta se crea en `/login`; después `AltaNegocio` pide el nombre, y la publicación se configura en `/panel/tu-pagina`. Para quien solo quiere un catálogo, el recorrido se percibe como varias tareas separadas.
- `PanelTuPagina` permite escoger **Agenda, Tienda o ambas**, pero esa elección define la función de la página, no una plantilla visual. El editor expone identidad, enlace, función, color y opciones en una sola vista. El plan existente ya propone tres pasos en [PLAN-TU-PAGINA.md](PLAN-TU-PAGINA.md).
- La columna `tu_pagina.plantilla` admite seis valores y `publica.css` contiene estilos para ellos, pero el panel guarda la plantilla a partir del tipo de página. `Marco` no emite `data-plantilla`; por eso esos estilos no se aplican y el usuario no puede elegirlos. La vista previa actual depende de que la página ya esté publicada.
- Dizi deja claro qué hacer después de crear el catálogo. Vendemia ya ofrece URL, QR y PDF cuando la página está publicada; vale la pena convertirlos en la pantalla de llegada tras publicar.

## Dirección propuesta

**Flujo inicial de «Mi página» en tres pasos, sobre la arquitectura actual:**

1. **Tu negocio.** Nombre precargado desde la compañía; elegir si el cliente compra, reserva o hace ambas cosas. La opción recomendada se selecciona automáticamente.
2. **Tu diseño.** Mostrar 3–4 miniaturas grandes y legibles: Vitrina, Lista, Carta y una variante para agenda. Sugerir según el rubro y el tipo de página. Color de marca opcional. La miniatura y la vista previa deben usar el mismo componente de la página pública. Logo y portada quedan opcionales.
3. **Publica.** WhatsApp y enlace, con validación clara; botón único «Publicar mi página». Después, mostrar enlace, copiar, QR y «Añadir mi primer producto» o «Configurar reservas» según corresponda.

Para acercarse al orden de Dizi en el registro general, se podría recoger nombre/WhatsApp/diseño antes de pedir cuenta y conservarlos hasta completar Google o correo. Es un cambio mayor del flujo de autenticación; conviene abordarlo después de simplificar «Mi página» para usuarios que ya tienen cuenta.

**Criterios de implementación:** mantener la elección funcional separada de la visual; conservar las páginas ya publicadas y su plantilla guardada; dar un valor por defecto sensato; hacer que vista previa y página pública coincidan; no convertir logo, portada, colores avanzados ni secciones adicionales en requisitos para publicar. La interfaz y los textos deben ser propios de Vendemia.

## Aplicado en el módulo

- La primera publicación de «Mi página» presenta tres pasos: negocio, diseño y publicación. Las páginas ya publicadas mantienen el editor completo.
- El panel ofrece Vitrina, Lista, Carta cálida y Agenda como diseños visuales independientes de la función de la página. El color y el logo son opcionales.
- La página pública usa la plantilla guardada para decidir disposición y estilo. Las páginas antiguas conservan su apariencia hasta que el dueño seleccione explícitamente un diseño. La vista previa de páginas publicadas usa la misma ruta pública con los cambios de diseño sin guardar.
- Antes de publicar, una vista visual reutiliza la cabecera y los estilos públicos con artículos de muestra. El enlace, el QR y el PDF existentes siguen disponibles después. Queda como mejora posterior cargar productos reales en esa primera vista previa.
- El orden de creación de cuenta en `/login` no cambió; simplificarlo requiere un trabajo separado en autenticación.
