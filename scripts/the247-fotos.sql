-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · fotos de los servicios reencuadradas en las caras (14-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Para el negocio ya creado con la primera versión de scripts/the247-alta.sql. Cada servicio
-- pasa a su propia foto (public/assets/the247/). Solo cambia la URL; no toca las fotos que el
-- dueño haya subido después desde el panel (solo las t247-m-*). Se puede correr más de una vez.
-- Necesita las fotos desplegadas en vendemias.com/assets/the247/.

update public.catalog_media m
   set url = 'https://vendemias.com/assets/the247/' || f.archivo
  from (values ('t247-corte', 'corte.webp'), ('t247-corte-barba', 'corte-barba.webp'), ('t247-corte-cejas', 'corte-cejas.webp'),
               ('t247-corte-raya', 'corte-raya.webp'), ('t247-corte-diseno', 'corte-diseno.webp'), ('t247-corte-nino', 'corte-nino.webp'),
               ('t247-perfilado', 'perfilado.webp'), ('t247-barba', 'arreglo-barba.webp')) as f(id, archivo)
 where m.company_id = 'the247barbershop' and m.id = 't247-m-' || f.id;

-- Comprobación: 8 filas, cada servicio con su archivo.
select catalog_id, url from public.catalog_media where company_id = 'the247barbershop' order by catalog_id;
