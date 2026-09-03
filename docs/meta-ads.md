# Poner tráfico de Meta en Vendemia

Todo lo que sigue supone que la landing ya está desplegada en `vendemias.com`.

---

## 1 · Antes del primer sol de presupuesto

| Qué | Dónde | Estado |
|---|---|---|
| `NEXT_PUBLIC_META_PIXEL_ID` | variables de entorno de producción | **falta** |
| `NEXT_PUBLIC_SITE_URL=https://vendemias.com` | variables de entorno de producción | comprobar |
| Datos de empresa en `EMPRESA` (`lib/legal.ts`) | razón social, RUC, domicilio, correo | **falta** |
| `/privacidad` accesible | ya enlazada en el pie | listo |

Meta revisa la política de privacidad de los dominios que anuncian. La página
existe y **ya declara el píxel**; si añades otra herramienta de medición —Google
Ads, TikTok, un mapa de calor— hay que actualizar ese apartado *antes* de
desplegarla, no después.

---

## 2 · Qué mide la web hoy

Dos eventos, y con estos dos basta para que Meta optimice:

- **`PageView`** — al cargar la landing. Solo la landing: el panel y el login no
  llevan píxel, a propósito.
- **`Contact`** — cada clic en un botón de WhatsApp, con `content_name` (la
  etiqueta del botón, que dice de qué sección salió: hero, precios, cierre o
  pie). Ésta es tu conversión.

En el Administrador de eventos, `Contact` tiene que aparecer como evento
recibido antes de que crees la campaña. Si no aparece, la campaña no puede
optimizar por él.

**Comprobación en 2 minutos:** instala la extensión *Meta Pixel Helper* en
Chrome, abre `vendemias.com`, y pulsa "Probar Mia por WhatsApp". Debes ver
`PageView` al cargar y `Contact` al pulsar.

---

## 3 · Configuración de la campaña

**Objetivo:** Ventas (o Clientes potenciales) → optimizar por **`Contact`**.
No uses "Tráfico": trae la visita más barata, que es la que menos compra.

**Presupuesto y aprendizaje.** Meta necesita del orden de 50 conversiones
semanales por conjunto de anuncios para salir de la fase de aprendizaje. Si tu
presupuesto no da para eso, es mejor **un solo conjunto de anuncios** con
varias creatividades que cinco conjuntos repartiéndose las conversiones y
ninguno aprendiendo.

**Plantilla de URL.** En *Parámetros de URL* del anuncio, pega esto tal cual —
las llaves las rellena Meta sola:

```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Eso hace dos cosas en la web, las dos automáticas:

1. **Se salta la intro de marca.** 3,4 segundos de animación delante de alguien
   que llega con un coste por clic detrás es la ventana entera en la que decide
   si se queda. Cualquier `utm_` o `fbclid` la desactiva.
2. **Marca el mensaje de WhatsApp.** Al final del mensaje aparece
   `— ref: meta · <campaña> · <anuncio>`. Cuando te escriban vas a saber de qué
   anuncio vienen sin preguntar, y podrás cortar los que no cierran.

**Segmentación para empezar** (según los rubros ya definidos): Lima por
distritos y luego Arequipa, Trujillo, Chiclayo, Piura, Cusco. Intereses de
propietarios de pequeños negocios, peluquerías, clínicas dentales, gimnasios,
e-commerce. Empieza amplio: con presupuesto pequeño, segmentar mucho es
quedarse sin conversiones para aprender.

---

## 4 · El otro formato: Click-to-WhatsApp

No lleva código. En Meta: objetivo **Ventas** o **Interacción** → destino
**WhatsApp**.

- **A favor:** el prospecto salta directo a la conversación, sin landing de por
  medio. Suele dar más conversaciones y más baratas.
- **En contra:** conversaciones más frías —no ha leído precios ni garantía— y
  **no puedes ponerle UTMs**, así que la atribución se pierde. Distingue el
  origen poniendo un mensaje de apertura distinto en cada anuncio.

**Cómo repartirlo:** landing para tráfico frío, que es donde el precio, la
garantía y la demo hacen su trabajo; Click-to-WhatsApp para retargeting de
quien ya visitó la web y no escribió. Ese público lo construyes con el píxel:
*visitó la web* menos *disparó `Contact`*.

---

## 5 · Qué mirar la primera semana

- **Coste por `Contact`.** Es tu número. Compáralo con lo que te deja un cliente:
  a S/89 al mes, un cliente que dura seis meses son S/534.
- **De cada 10 que escriben, cuántos pagan.** Esto no lo mide Meta y es lo que
  de verdad decide si la campaña es rentable. Anótalo a mano desde el primer día.
- **Qué anuncio trae los que cierran**, no los que más escriben. Para eso está
  el `— ref:` del mensaje.

No toques la campaña los primeros 3 o 4 días aunque vaya mal: cada edición
reinicia la fase de aprendizaje.

---

## 6 · Lo que falta y sube el techo

- **Conversions API.** Envío servidor a servidor, para recuperar entre un 10 y
  un 30 % de conversiones que el navegador pierde por iOS y bloqueadores.
  Necesita un token de acceso de Meta y una ruta en Next.
- **Un evento intermedio** (`ViewContent` al llegar a precios, o al mover la
  calculadora). Más señales = la campaña aprende antes. Se hace con
  `evento('ViewContent', …)` de `lib/medicion.ts`.
- **Un testimonio con cifra** en el hero. Sigue siendo lo que más subiría la
  conversión de la página, y por tanto lo que más baja el coste por `Contact`.
