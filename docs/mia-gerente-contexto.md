# Mia Gerente · contexto para retomar (30-oct-2026)

Para abrir una sesión nueva y seguir sin releer todo. El diseño completo está en
`mia-gerente-consolidado.md`; las pruebas, en `pruebas-mia-gerente.md`.

## Reglas que no cambian

- El modelo **no calcula ni estima nada**: toda cifra sale de una función.
- Todo lo que va a un cliente pasa por la tarjeta **Aprobar y enviar · Corregir · ✕**. Aprueban el
  dueño o el administrador; el administrador también ofertas con descuento, sin ver costo ni margen.
- La tarjeta sale **dentro del chat de Mia Gerente** (decisión del 24-oct). En Mensajes queda para los
  que Mia proponga sola.
- Los mensajes suenan a persona y siguen el tono de Ajustes (`bot_tone`).
- Avisos de stock: solo si se piden, push de la PWA, solo a quien los pidió.
- Desde esta sesión **no se toca el repo del bot** (`vendemia`): se le pasan encargos en `docs/prompt-bot-*.md`.

## Hecho en la web (todo en main)

| Qué | Dónde |
|---|---|
| Borradores, aprobación en el servidor, firma, mínimo del precio, salida a las 9:00 de noche | `modules/datos/sql/0008_mia_gerente.sql` (aplicada) |
| Avisos de stock y «por aprobar» | `modules/avisos/sql/0003_stock_y_por_aprobar.sql` (aplicada) |
| Datos de compra y costo (solo dueño) | `modules/datos/sql/0009_datos_de_compra.sql` (aplicada) |
| Tarjeta | `components/panel/TarjetaBorrador.tsx`, `asistente/BorradorEnChat.tsx`, `lib/panel/borradores.ts` |
| Mensajes: filtro y etiqueta «Por aprobar», `oferta_por_confirmar` | `app/(panel)/panel/mensajes/page.tsx` |
| Ficha del producto: aviso de stock y datos de compra | `AvisoStock.tsx`, `DatosDeCompra.tsx` |
| Celular: audio con `segundos`, botones de WhatsApp dentro de la burbuja | `asistente/Conversacion.tsx`, `asistente.css` |

## Encargos al bot

| Encargo | Estado |
|---|---|
| `prompt-bot-mia-gerente-fase1.md` + `-tono.md` | hechos por la sesión del bot (27-oct, sin commitear en su repo) |
| `prompt-bot-mia-gerente-compras.md` (`que_comprar`) | en curso en la sesión del bot |
| `prompt-bot-audio-asistente.md` (audio de 6 s rechazado por «muy largo») | sin pasar |
| Que Mia diga «es cliente desde hoy, aún no ha escrito» en vez de «no existe» | idea, sin escribir |

## Para probar: Diego Ramos en Barber Shop

- El número del dueño (termina en 4701) es dueño/admin en todos los negocios: sus chats con el bot son
  del dueño (`owner_messages`), **nunca** de cliente. No sirve para probar a un cliente.
- Cliente de prueba: **Diego Ramos**, `barberia-01`, número que termina en **8007**, creado el 27-oct
  en el SQLite del bot (id `demo-8339cbfa-…`, `source = 'demo'`, 13 mensajes, sin citas). Ya está en
  el panel. Lo borra `npm run demo -- borrar barberia-01`.
- **Antes de probar:** añadir su número a `ALLOWED_NUMBERS` del `.env` del bot y reiniciar. Sin eso
  le llegan los mensajes de Mia, pero lo que él conteste se ignora.
- Pasos: sección 7 de `pruebas-mia-gerente.md`.
- El push «Mensajes por aprobar» solo salta con borradores que Mia crea sola (`creado_por` nulo);
  pedirle uno a Mia no lo dispara.

## Lo que falta (fase 2)

1. Precio pactado al cobrar servicios y planes, y negociar por escalones (hoy se deriva al dueño con
   `oferta_por_confirmar`).
2. Coordinar entregas: qué pedidos tienen datos por completar, completarlos, ubicación por WhatsApp.
3. Mia propone mensajes sola cada mañana (eso enciende el push «por aprobar»).
4. Medir resultados: cuántos mensajes aprobados terminaron en venta o visita.
5. Más consejos: plata parada, horas vacías, faltas, comprados juntos, «qué hago hoy».
6. Audio en el mensaje al cliente.
