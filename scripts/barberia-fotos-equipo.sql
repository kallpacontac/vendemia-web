-- ═══════════════════════════════════════════════════════════════════════════
-- FOTOS DE EJEMPLO · el equipo de barberia-01
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fotografías reales de Pexels, solo para visualizar la selección en el negocio
-- de prueba. No corresponden a sus empleados. Fuentes y autores en
-- docs/fuentes-fotos-barberia.md. Viven en public/assets/equipo-barberia/,
-- así que hay que subir la web antes.
--
-- Requiere modules/tu-pagina/sql/0012_foto_del_equipo.sql. Se reparten por orden
-- de nombre y solo a quien no tiene foto: no pisa ninguna subida desde el panel.
-- Si hay más de seis barberos, el resto sigue con su inicial.
--
-- Deshacer (quita estas, no las subidas):
--   update public.employees set foto_url = null
--    where company_id = 'barberia-01' and foto_url like 'https://vendemias.com/assets/equipo-barberia/%';
-- ═══════════════════════════════════════════════════════════════════════════

with sin_foto as (
    select id, row_number() over (order by name) as n
      from public.employees
     where company_id = 'barberia-01' and coalesce(is_active, 1) = 1 and coalesce(foto_url, '') = ''
)
update public.employees e
   set foto_url = 'https://vendemias.com/assets/equipo-barberia/barbero-' || s.n || '.jpg'
  from sin_foto s
 where e.id = s.id and s.n <= 6;

select name, foto_url from public.employees where company_id = 'barberia-01' order by name;
