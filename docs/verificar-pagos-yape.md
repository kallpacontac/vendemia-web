# Verificar pagos de Yape sin confiar en capturas

Investigación, septiembre 2026. No hay nada implementado todavía: esto es el mapa
del terreno y el diseño que se desprende de él.

El problema de fondo: hoy un pago se confirma porque el cliente manda una captura
y alguien la mira. Existen apps y webs que fabrican pantallas idénticas a las de
Yape —el precio subió de S/ 10-20 a unos S/ 200 por lo demandadas que están—, así
que la captura no prueba nada. **Quien controla el canal de prueba es el atacante.**

---

## 1 · Las tres rutas, y qué prueba cada una

| Ruta | Qué prueba de verdad | Costo / fricción |
|---|---|---|
| Pasarela con Yape como método (Culqi, Mercado Pago, Izipay, ProntoPaga) | Webhook firmado desde el emisor. Confianza criptográfica | comisión ~3-4% + RUC |
| Yape Negocios / QR dinámico con API propia | Lo mismo, directo con BCP | RUC + cuenta BCP, 3-10 días hábiles de afiliación |
| **Leer las notificaciones del celular del vendedor** | Que *ese* celular recibió un aviso del app oficial de Yape | gratis, solo Android, frágil |

La tercera es la que interesa a corto plazo. Su valor no es ser infalsificable en
abstracto: es que **el cliente deja de controlar el canal**. La captura la fabrica
él; la notificación la genera el sistema operativo del vendedor.

---

## 2 · El formato real de la notificación

Confirmado en dos implementaciones abiertas ([Jozelom/yape-listener](https://github.com/Jozelom/yape-listener),
[BrunoPM2001/yapeListener](https://github.com/BrunoPM2001/yapeListener)):

```
packageName  : "com.bcp.innovacxion.yapeapp"
android.title: "Confirmación de Pago"
android.text : "Yape! JUAN PEREZ te envió un pago por S/ 25.00"
```

El regex que ambos usan:

```kotlin
Regex("""Yape!\s(.+?)\ste envió un pago por S/\s([\d.]+)""")
```

Los repos son de 2024-2025 y el texto pudo cambiar. **Comprobar el texto vigente
antes de escribir una línea de código**, con el celular conectado por USB:

```bash
adb shell dumpsys notification --noredact | grep -A5 yapeapp
```

---

## 3 · Arquitectura del lector

1. `NotificationListenerService` con `BIND_NOTIFICATION_LISTENER_SERVICE`. El
   permiso se concede en Ajustes → Acceso a notificaciones; no es un permiso
   runtime normal.
2. Filtrar por `sbn.packageName`. **Esto es lo que sostiene todo el esquema**: el
   `packageName` lo pone el sistema a partir del UID del proceso que publica, no
   lo puede falsificar otra app. Un "Yape falso" instalado aparece con su propio
   package. Reforzar verificando la firma del APK con
   `PackageManager.GET_SIGNING_CERTIFICATES`, que cubre el caso raro de un
   sideload usando el mismo package cuando el Yape real no está instalado.
3. Foreground service + exclusión de optimización de batería. Sin esto Android
   mata el listener y se pierden pagos **en silencio**, que es el peor modo de
   fallo posible.
4. Cola local (Room) y POST firmado con HMAC al backend, con reintentos. Nunca
   disparar la llamada de red directamente dentro de `onNotificationPosted`.
5. Heartbeat cada N minutos. Si el celular deja de reportar, el backend tiene que
   *saberlo* y dejar de prometer confirmación automática.

**Prototipo sin escribir la app:** MacroDroid o Tasker → trigger "Notificación
recibida" filtrada por Yape → acción HTTP POST. Sirve para validar el flujo
completo antes de invertir en un APK.

---

## 4 · El problema difícil: casar notificación ↔ pedido

Aquí falla casi todo el mundo. La notificación **no trae número de operación**, y
hay dos complicaciones:

- **Diciembre 2025:** Yape pasó a mostrar solo las tres primeras letras del
  nombre. Hubo tantas quejas que lo reajustaron, pero el estado final no está
  claro. **No diseñar el matching asumiendo nombre completo.**
- Dos clientes pagando S/ 25.00 con un minuto de diferencia son indistinguibles.

Dos técnicas que sí lo resuelven:

**Céntimos únicos.** Al generar el pedido se reserva un monto con céntimos
irrepetibles dentro de una ventana de tiempo: S/ 25.**07**. La notificación de
S/ 25.07 casa con un único pedido, sin ambigüedad. Es la técnica estándar en
cripto y acá funciona igual.

**El código de seguridad de 3 dígitos.** Desde abril 2025 cada yapeo genera tres
dígitos que ve el emisor en su pantalla de confirmación **y** el receptor en su
notificación. Pidiéndolo en el checkout y comparándolo contra el de la
notificación se prueba que el pago que el cliente dice haber hecho es el que
llegó. Verificar con `dumpsys` si el código viene en el texto de la notificación
o solo en el detalle del movimiento.

Combinando ambas, el matching queda prácticamente exacto.

---

## 5 · Lo que esta ruta NO da

- **Solo Android.** iOS no permite leer notificaciones ajenas. Si el dueño usa
  iPhone, la alternativa es parsear por IMAP el correo de aviso de Yape, pero
  solo se dispara desde umbrales configurables (S/ 10, 50, 100, 500) y con más
  latencia.
- **Falsos negativos silenciosos:** celular apagado, sin datos, No Molestar,
  notificaciones agrupadas, el sistema matando el servicio. Hace falta un camino
  manual de reconciliación, sí o sí.
- **Google Play no aprueba el APK fácilmente.** El acceso a notificaciones es
  política restringida: exige ser funcionalidad central, declarada y revisada.
  Plan realista: distribución interna/sideload, o apoyarse en un servicio ya
  existente — [BiPe Alerta](https://www.bipealerta.com/Documentacion.html) tiene
  webhook documentado (`Monto`, `NombreCliente`, `FechaHora`, auth por Bearer o
  `X-API-Key`); también Yapay, Tingu Alerta, Morado Pago.
- **Datos personales de terceros.** Se capturan nombres de pagadores en el
  backend: eso cae bajo la Ley 29733. Guardar el mínimo y definir retención.

---

## 6 · Plan por fases

No es una disyuntiva entre rutas, es un orden:

1. **Ahora:** lector + céntimos únicos + código de 3 dígitos. El estado
   `pago_verificado_por_notificacion` tiene que ser **distinto** de
   `pago_confirmado_por_pasarela` en el modelo de datos desde el día uno, no un
   refactor futuro.
2. **Siempre:** el botón manual de "marcar como pagado" sigue existiendo como
   fallback.
3. **Cuando el volumen lo justifique:** pasarela con webhook firmado, y el lector
   queda como red de seguridad para quienes yapean directo al número.

---

## Fuentes

- [Jozelom/yape-listener](https://github.com/Jozelom/yape-listener) · [BrunoPM2001/yapeListener](https://github.com/BrunoPM2001/yapeListener) — formato de la notificación
- [Código de seguridad de 3 dígitos (Infobae, abr-2025)](https://www.infobae.com/peru/2025/04/01/yape-implementa-codigo-de-seguridad-que-combate-yapeos-falsos-en-nueva-actualizacion/)
- [Recorte de nombres (La República, dic-2025)](https://larepublica.pe/economia/2025/12/19/yape-actualiza-su-app-ahora-solo-veras-las-tres-primeras-letras-del-nombre-al-hacer-un-yapeo-atmp-1381262)
- [BiPe Alerta · documentación de webhooks](https://www.bipealerta.com/Documentacion.html)
- [Mercado Pago · Yape](https://www.mercadopago.com.pe/developers/es/docs/checkout-api-payments/integration-configuration/yape) · [Culqi · tokens Yape](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens-yape)
- [Google Play · permisos y APIs sensibles](https://support.google.com/googleplay/android-developer/answer/16558241)
- [Yape falso, cómo opera (El Comercio)](https://elcomercio.pe/lima/yape-falso-como-reconocer-esta-modalidad-de-estafa-nueva-modalidad-falso-yape-raqueteo-estafa-con-yape-robo-de-celulares-noticia/)
