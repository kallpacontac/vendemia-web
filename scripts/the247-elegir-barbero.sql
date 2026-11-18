-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · que el cliente ELIJA SU BARBERO al reservar en la página (18-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Enciende «Preguntar por el profesional» (companies.ask_employee), lo mismo que el interruptor
--   de Ajustes. Con eso, la página de reservas muestra el paso «2 · BARBERO Y DÍA» con la foto y
--   el nombre de cada barbero activo, y solo ofrece las horas libres de ese barbero. Mia, cuando
--   se prenda, también preguntará «¿con quién?».
--
--   Los barberos salen de Panel › Equipo (los 8, activos). Uno inactivo no se ofrece.
--   Apagar: update public.companies set ask_employee = 0 where id = 'the247barbershop';
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

update public.companies set ask_employee = 1 where id = 'the247barbershop';

commit;

-- Comprobación: pide_barbero = 1 y los barberos que saldrán en la página.
select c.ask_employee as pide_barbero,
       (select string_agg(e.name, ', ' order by e.name) from public.employees e
         where e.company_id = c.id and coalesce(e.is_active, 1) = 1) as barberos_en_la_pagina
  from public.companies c where c.id = 'the247barbershop';
