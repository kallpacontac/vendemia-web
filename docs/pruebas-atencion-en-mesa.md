# Checklist de pruebas · Atención en mesa (QR, llamados, pedido compartido, /panel/mesas)

Para marcar a mano. Cada prueba dice qué hacer y qué tiene que pasar. Si algo no pasa, anota el
número y qué viste (mejor con captura).

Lo ya probado con base simulada no se repite aquí. Esto es lo que solo se ve de verdad: la base real,
un QR impreso, celulares reales y avisos que suenan.

**Lo imprescindible, si hay poco tiempo:** 1.1 a 1.5, 2.1 a 2.4, 3.1 a 3.4, 3.9, 7.1 a 7.3, 8.1 y 8.2.

---

## 0 · Antes de empezar

- [ ] Correr `modules/tu-pagina/sql/0015_atencion_en_mesa.sql` en el editor SQL de Supabase. Sale sin
      error. Si algo se rompe después, se deshace con `scripts/atencion-mesa-0015-deshacer.sql`.
- [ ] Vercel desplegó `45c1825` o posterior.
- [ ] Un **negocio de prueba que venda productos**, con varios platos en el catálogo: alguno con
      variantes, alguno con foto y alguno con stock 0. **No uses uno con clientes reales:** cambiarle
      la plantilla cambia su página pública.
- [ ] Una cuenta de **dueño** y una de **empleado** en ese negocio (Ajustes → Acceso del equipo), con
      el empleado ya vinculado a su ficha del equipo.
- [ ] El panel instalado y abierto desde el icono en **dos celulares**: dueño y empleado. Avisos
      activados en los dos, en **Mesas**, y **Probar** hace sonar el aviso de prueba.
- [ ] Dos celulares más para hacer de clientes, **sin** sesión en el panel. Mejor si uno es Android y
      el otro iPhone. Solo con datos móviles, como un cliente de verdad.
- [ ] Ten en cuenta el límite: **40 llamados por hora en cada mesa**. Si tras muchas pruebas sale «No
      pudimos enviar el aviso», cambia de mesa antes de anotarlo como fallo.

---

## 1 · Publicar la plantilla y crear las mesas (dueño)

- [ ] **1.1** En **Mi página** elige **Atención en mesa** y publica.
      → Antes de publicar, debajo del selector se lee «Tras publicar, crea tus mesas e imprime sus QR
      en Mesas».
- [ ] **1.2** Recarga el panel. → **Mesas** aparece en el menú, en computadora y en celular.
- [ ] **1.3** **Mesas → Mesas y QR**: crea un salón «Terraza» con varias mesas y otras sin salón.
      → Salen en la lista como «Activa».
- [ ] **1.4** **Imprimir todos** y **saca la hoja en papel**.
      → A4 con 6 QR por hoja. Cada uno dice su mesa y su salón, y no sale cortado.
- [ ] **1.5** Escanea un QR **del papel** con la cámara normal del celular, sin app.
      → Abre `<negocio>/mesa/<código>` y arriba dice la mesa correcta.
- [ ] **1.6** Prueba el botón **Descargar QR** de una mesa. → Baja una imagen que también se escanea.
- [ ] **1.7** Abre la página normal del negocio, `/<negocio>`, sin QR.
      → Se ve la carta para mirar. **No** deja pedir ni llamar al mozo.

---

## 2 · Llamar y pedir la cuenta (cliente + mozo)

Ten a la vista el celular del cliente y el del mozo, este con **Mesas → En vivo** abierto. Mira cuánto
tarda el aviso en sonar: es el dato que más importa.

- [ ] **2.1** Cliente: **Llamar al mozo**.
      → El cliente ve «Aviso enviado» y «Alguien de nuestro equipo va en camino».
      → Le **suena al dueño y al empleado**: título con negocio y mesa, texto «Llama al mozo».
      → Aparece en En vivo en unos 10 segundos, sin recargar.
- [ ] **2.2** Toca el aviso con el panel cerrado. → Abre **/panel/mesas**, no la pantalla de inicio.
- [ ] **2.3** Mozo: **Llegué a la mesa**.
      → El llamado sale de la lista y suben «atendidos hoy» y «tiempo promedio».
- [ ] **2.4** Cliente: **Pedir la cuenta → Boleta**, con DNI vacío.
      → Se envía. El mozo ve Boleta. El aviso dice «Pide la cuenta».
- [ ] **2.5** Pide **Boleta** con un DNI de 5 dígitos. → No deja: «El DNI debe tener 8 dígitos».
- [ ] **2.6** Pide **Factura** sin RUC o con RUC corto. → No deja: «El RUC debe tener 11 dígitos». Con
      11 dígitos, el mozo lo ve.
- [ ] **2.7** Pide la cuenta marcando **Dividir la cuenta**. → El mozo lee «Quieren dividir la cuenta».
- [ ] **2.8** **Otro pedido** con «Más servilletas». → El aviso dice «Más servilletas».
- [ ] **2.9** **Otro pedido** en blanco. → Se envía y el aviso dice «Necesita algo».

### Insistir

- [ ] **2.10** Toca **Llamar al mozo** tres veces seguidas.
      → El cliente ve «Aviso enviado otra vez». En En vivo hay **un solo** llamado, con «insistió 3
      veces». No llegan tres avisos.
- [ ] **2.11** Espera más de un minuto y vuelve a tocar. → Llega otro aviso, con «(insiste)».
- [ ] **2.12** Con un llamado abierto, pide también la cuenta. → Son **dos** llamados separados.

### Dos mozos

- [ ] **2.13** Con el dueño y el empleado en En vivo, los dos tocan **Llegué a la mesa** casi a la vez.
      → No da error. En Historial queda **uno** solo como quien llegó.

---

## 3 · Pedido compartido (dos celulares en la misma mesa)

- [ ] **3.1** Cliente A: **Ver la carta**, agrega dos platos. Cliente B escanea el **mismo QR**.
      → En unos 12 segundos B ve los platos de A, marcados «De otro celular».
- [ ] **3.2** B agrega lo suyo. → A lo ve, y los dos leen «2 celulares están armando este pedido».
- [ ] **3.3** B intenta cambiar o quitar una línea de A. → No puede: solo cambia las suyas.
- [ ] **3.4** A escribe una nota («sin ají») y toca **Avisar al mozo**.
      → A lee «Tu mozo ya sabe lo que quieren». El mozo recibe el aviso «Quiere pedir: ya eligieron» y
      ve en En vivo las líneas, la nota y el total.
- [ ] **3.5** Después de eso, el carrito queda vacío **en los dos** celulares.
- [ ] **3.6** A y B agregan el **mismo plato** y envían. → El mozo ve una línea con la cantidad sumada.
- [ ] **3.7** A y B tocan **Avisar al mozo** a la vez. → Llega **un** solo pedido.
- [ ] **3.8** Agrega un plato con variantes sin elegir. → Pide «Elige una opción».

### Lo importante: no toca nada del negocio

- [ ] **3.9** Tras el pedido de 3.4, revisa el panel.
      → **No** aparece nada nuevo en **Pedidos** ni en **Caja**, y el **stock** de esos platos no bajó.

---

## 4 · La carta

En **Mesas → Carta** (dueño), guarda los ajustes y míralos en el celular del cliente.

- [ ] **4.1** Marca un plato como **Favorito**. → Sale en «Favoritos de la casa».
- [ ] **4.2** Ponle **Precio de antes**. → Sale tachado junto al precio actual.
- [ ] **4.3** Ponle un horario que **no** incluya la hora actual. → No se puede agregar y dice «Se sirve
      de … a …».
- [ ] **4.4** Un horario que cruce la medianoche (20:00 a 02:00) a una hora dentro de esa franja.
      → Sí se puede agregar.
- [ ] **4.5** El plato con stock 0. → Dice «Agotado» y no se puede agregar.
- [ ] **4.6** El **buscador** encuentra un plato, y escribiendo algo que no existe dice «No encontramos
      ese plato».
- [ ] **4.7** Un plato sin precio. → Dice «A consultar», no «S/ 0».

### Idiomas

- [ ] **4.8** Abre el QR en un celular **en inglés**. → Abre en inglés sin tocar nada.
- [ ] **4.9** Pon un **Nombre en inglés** a un plato. → Sale traducido. Los que no lo tienen salen en
      español, con la nota de que algunos llevan su nombre en español.
- [ ] **4.10** Cambia a **portugués** con el selector.
      → La pantalla cambia, los platos siguen en español, y al recargar recuerda el idioma.
- [ ] **4.11** Desde un celular en inglés, toca **Llamar al mozo**. → Al mozo le llega **en español**.

---

## 5 · Sugerencias y felicitaciones

- [ ] **5.1** Cliente: **Sugerencias**, marcando «Quiero que me respondan» con nombre y teléfono.
      → Le **suena al dueño** y **no** al empleado. Sale en **Mesas → Comentarios**, y **no** en En vivo.
- [ ] **5.2** **Felicitaciones**, con un comentario y eligiendo un mozo de la lista.
      → **No suena en ningún celular**. Sale en Comentarios y suma en el conteo de ese mozo.
- [ ] **5.3** En la lista de mozos solo salen los del equipo activos.

---

## 6 · Permisos y mesas apagadas

- [ ] **6.1** Con el **empleado**: en Mesas solo ve **En vivo**. No están Mesas y QR, Carta, Comentarios
      ni Historial.
- [ ] **6.2** Con el **empleado**: entra al panel y mira dónde cae.
      → Limitación conocida: en una tienda o restaurante cae en Fideliza y llega a Mesas por el menú.
      Dime si para el mozo esto es un problema.
- [ ] **6.3** **Apagar** una mesa y escanear su QR. → «No reconocemos este QR». **Activar** y vuelve a
      funcionar, con el mismo papel.
- [ ] **6.4** **Nuevo QR** en una mesa. → El papel viejo deja de abrir y el nuevo abre esa mesa.
- [ ] **6.5** **Quitar** una mesa con llamados atendidos. → Sale de la lista y su historial se conserva.
- [ ] **6.6** En Mi página cambia a **Carta visual** (la de La Baguette) y publica.
      → **Mesas** sigue en el menú, aunque dentro de «Más» en el celular y de «…» en la computadora. Los
      QR abren y avisan igual. Caja no pierde su sitio en la barra del celular.
- [ ] **6.7** Mismo negocio, con el **empleado**: también ve **Mesas** y le llegan los llamados.
- [ ] **6.8** Cambia a **otra plantilla** (Minimalista, por ejemplo) y publica. → **Mesas** ya no aparece
      en el menú. Los QR impresos siguen avisando: si ya no se usan, apaga las mesas antes de cambiar.
- [ ] **6.9** Vuelve a **Atención en mesa**. → **Mesas** vuelve a la vista, con las mesas y sus QR intactos.

---

## 7 · Avisos: lo que cambió la migración

La 0015 toca el despachador de avisos de **todos** los negocios, así que esta sección también comprueba
que no se rompió nada de lo que ya había.

- [ ] **7.1** **Después de las 22:00** (o poniendo en Ajustes → Avisos en este celular un silencio que cubra la hora
      actual),
      llama al mozo. → **El aviso suena igual.** Es la razón del cambio: las cenas caen dentro del
      silencio.
- [ ] **7.2** A esa misma hora, provoca un aviso normal (una cita o un pedido). → **No suena**: el
      silencio sigue valiendo para todo lo demás.
- [ ] **7.3** En otro negocio, de día: una cita o un pedido nuevo. → El aviso llega como siempre.
- [ ] **7.4** A la mañana siguiente, si hubo llamados de noche: el **resumen de la mañana** no los
      incluye, y sí incluye lo demás que quedó callado.
- [ ] **7.5** Tres mesas distintas llaman casi a la vez. → Un aviso agrupado «3 llamados de mesas», o
      uno por mesa. No se mezcla con avisos de citas o pedidos.

### iPhone

- [ ] **7.6** El aviso suena en iPhone con el panel instalado en pantalla de inicio y la app cerrada.
- [ ] **7.7** **Llegué: escanear mesa** en Android con Chrome. → Abre la cámara, lee el QR y cierra
      **todo** lo que esa mesa esperaba. En Historial, esa llegada sale con «(QR)».
- [ ] **7.8** En iPhone ese botón **no aparece**, porque depende de la cámara de Chrome. Se usa **Llegué
      a la mesa**, y debe bastar.

---

## 8 · En un salón de verdad

- [ ] **8.1** **Sin conexión**: modo avión en el cliente y toca **Llamar al mozo**.
      → «Sin conexión», con **Reintentar** y **Avisar por WhatsApp**. El WhatsApp abre al número del
      negocio con la mesa ya escrita.
- [ ] **8.2** QR impreso en la mesa, **con la luz de un salón de noche** y desde la distancia de quien
      está sentado. → Lo lee a la primera.
- [ ] **8.3** Un celular barato con datos malos. → La carta abre sin esperar demasiado, con fotos.
- [ ] **8.4** Pantalla del cliente en iPhone y en un Android pequeño. → Nada se corta ni se sale de la
      pantalla, y el teclado no tapa el botón de enviar.
- [ ] **8.5** Pregúntale a un mozo real, sin explicarle antes: ¿entiende el aviso sin abrirlo? ¿Encuentra
      el botón **Llegué a la mesa**?
- [ ] **8.6** Deja un carrito a medias en una mesa y vuelve **más de 3 horas después**. → Ya no aparece:
      el siguiente cliente de esa mesa no hereda el pedido.
- [ ] **8.7** En **Historial**, una cuenta atendida con DNI o RUC **no** muestra el documento.

---

## Qué no probar (no está en esta versión)

- Que el pedido entre al POS o a la comandera: el pedido es un aviso al mozo, a propósito.
- Comprobantes: la plantilla solo le pasa al mozo el DNI o RUC; no los emite.
- Calificar lo consumido, premios por visita, karaoke, y comprobar por GPS que el cliente está en el local.
- Nombres de platos en portugués.
