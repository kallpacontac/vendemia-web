# Prompt para la sesión del bot: un audio de 6 s rechazado por «muy largo» en Mia Gerente

Pégalo tal cual en la sesión del bot (`vendemia`).

## Lo que pasó (27-oct-2026, Barber Shop, Android, Chrome, panel instalado)

Alvaro grabó una pregunta de **6 segundos** en Mia Gerente y la respuesta fue:

> El audio es muy largo. Mándame la pregunta en menos de un minuto.

Ese texto sale de `transcribirDeLaWeb` (`src/services/owner/index.ts`) por **dos** motivos distintos:
el archivo pasa de `MAX_AUDIO_BYTES` (1 MB) o `aNotaDeVoz` mide más de `MAX_AUDIO_SEGUNDOS` (90 s).
Por el tamaño no puede ser: el panel graba a 32 kbps y 6 s son unos 25 KB. Así que casi seguro es la
**duración medida**, que salió por encima de 90.

Lo que ya se descartó: un WebM cuyas marcas de tiempo empiezan en el segundo 200 (lo típico de Chrome
en Android) **no** lo provoca; con el mismo `ffmpeg` y `ffprobe` de `aNotaDeVoz`, el Ogg de salida
mide 6,0 s. Queda algo más raro del archivo de Android (saltos en las marcas de tiempo a mitad de la
grabación, por ejemplo), y no se puede ver porque el audio se borra y el rechazo no deja rastro.

## Qué hacer

1. **Que el rechazo deje rastro.** En los dos `return` de «muy largo», un `console.warn` con: bytes,
   `mime`, segundos medidos por ffprobe y `audio.segundos` (lo que midió el navegador al grabar; el
   panel lo manda desde hoy, opcional, ver abajo). Sin el contenido del audio.
2. **Dos mensajes distintos**, para saber cuál saltó:
   - por tamaño: «Ese audio pesa demasiado. ¿Me lo repites más corto o me lo escribes?»;
   - por duración: el de ahora.
3. **Medir la duración por las muestras, no por las marcas de tiempo.** En `aNotaDeVoz`, añadir al
   `ffmpeg` el filtro `-af asetpts=N/SR/TB`: rehace las marcas de tiempo a partir del número de
   muestras, así que la duración del Ogg es la del audio de verdad aunque el WebM venga con saltos.
   Sirve también para las notas de voz de WhatsApp, que pasan por la misma función.
4. **El tamaño acota la duración.** Si ffprobe dice más de 90 s pero el archivo pesa menos de
   300 KB (a 32 kbps son unos 75 s como mucho), es un error de medida: se registra (punto 1) y se
   sigue con la transcripción. El tope de 1 MB sigue protegiendo el coste.

## El campo nuevo del panel

```ts
{ audio: { base64, mime, segundos?: number }, con_voz?: boolean }   // segundos con un decimal
```

Solo para el registro y para comparar: **no** sirve para dejar pasar un audio (lo manda el navegador
y se puede falsear). Si no viene, todo funciona como antes.

## Cómo saber que quedó bien

- [ ] Un audio de 6 s desde un Android (Chrome, panel instalado) → se transcribe y se responde.
- [ ] Un audio de verdad de más de 90 s → el mensaje de duración.
- [ ] Si vuelve a saltar, el registro dice bytes, mime, segundos de ffprobe y del navegador.
