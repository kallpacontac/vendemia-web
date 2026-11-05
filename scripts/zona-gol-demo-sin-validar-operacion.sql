-- ═══════════════════════════════════════════════════════════════════════════════
-- DEMO · Zona Gol acepta un n.º de operación repetido (solo lo lee, guarda y muestra)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido por Alvaro el 5-nov-2026 para la demo. Necesita la 0018. Solo afecta a zona-gol.
-- Lo demás se sigue validando: monto, número de Yape/Plin, antigüedad y la misma captura.
-- REVERTIR después de la demo: scripts/zona-gol-validar-operacion.sql
update public.tu_pagina
   set secciones = jsonb_set(secciones, '{canchas,validarOperacion}', 'false'::jsonb, true)
 where slug = 'zona-gol';

-- Comprobación: debe salir false.
select slug, secciones #> '{canchas,validarOperacion}' as valida_operacion from public.tu_pagina where slug = 'zona-gol';
