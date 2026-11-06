-- ═══════════════════════════════════════════════════════════════════════════
-- FOTOS DE EJEMPLO · el equipo de Mara Beauty Studio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fotografías reales de Pexels (licencia libre, sin atribución obligatoria), solo para
-- que se vean caras al elegir profesional en la demo. NO son Fiorella, Kiara, Lucero ni
-- Joel: cuando Mara mande las fotos de su equipo se suben en Panel → Equipo y estas se van.
-- Fuentes en docs/fuentes-fotos-mara.md. Viven en public/assets/equipo-mara/, así que
-- la web tiene que estar subida antes (lo está desde el commit que trae este fichero).
--
-- Solo pone foto a quien no tiene: no pisa ninguna subida desde el panel.
--
-- Deshacer (quita estas, no las subidas):
--   update public.employees set foto_url = null
--    where company_id = 'mara-beauty-studio' and foto_url like 'https://vendemias.com/assets/equipo-mara/%';
-- ═══════════════════════════════════════════════════════════════════════════

update public.employees e
   set foto_url = 'https://vendemias.com/assets/equipo-mara/' || f.archivo
  from (values ('mb-e-fiorella', 'estilista-1.jpg'),
               ('mb-e-kiara',    'estilista-2.jpg'),
               ('mb-e-lucero',   'estilista-3.jpg'),
               ('mb-e-joel',     'estilista-4.jpg')) as f(id, archivo)
 where e.company_id = 'mara-beauty-studio' and e.id = f.id and coalesce(e.foto_url, '') = '';

select name, foto_url from public.employees where company_id = 'mara-beauty-studio' order by name;
