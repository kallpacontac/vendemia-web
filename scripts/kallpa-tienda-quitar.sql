-- ═══════════════════════════════════════════════════════════════════════════════
-- KALLPA · Quitar el negocio suelto «kallpa-tienda» · 13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- La PRIMERA versión de scripts/kallpa-clubes-alta.sql creó la cafetería como un
-- negocio aparte (`kallpa-tienda`, página fideliza.vendemias.com/n/kallpa-tienda,
-- club de 12 sellos). Después se decidió UNA tarjeta: la cafetería es la línea
-- «Compra» del club de `kallpa` (la página /n/kallpa-triatlon). Esto borra el
-- negocio suelto y todo lo suyo. A `kallpa` no lo toca.
--
-- Se NIEGA si alguien ya creó tarjeta en kallpa-tienda: esa gente tendría sellos
-- ahí y se perderían. Si pasa, avísame y lo resolvemos (pasarles los sellos a su
-- línea «Compra» en kallpa).
--
-- Orden recomendado: 0017 → scripts/kallpa-clubes-alta.sql (añade «Compra» a kallpa)
-- → este script → scripts/kallpa-botones.sql.
-- Todo en una transacción: si algo falla, no se borra nada.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_tienda constant text := 'kallpa-tienda';
    v_n integer;
begin
    if not exists (select 1 from public.companies where id = v_tienda) then
        raise notice 'No existe «kallpa-tienda»: no hay nada que quitar.';
        return;
    end if;
    select count(*) into v_n from public.loyalty_members where company_id = v_tienda;
    if v_n > 0 then
        raise exception '«kallpa-tienda» ya tiene % tarjeta(s) de clientes. No se borra: avisa para pasar sus sellos a la línea «Compra» de kallpa.', v_n;
    end if;
    -- Que kallpa ya tenga su línea «Compra»: si no, la cafetería se quedaría sin club.
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_programs' and column_name = 'parent_program_id')
       or not exists (select 1 from public.loyalty_programs
                       where company_id = 'kallpa' and parent_program_id is not null and status in ('active', 'paused')) then
        raise exception 'kallpa aún no tiene la línea «Compra». Corre antes la 0017 y scripts/kallpa-clubes-alta.sql.';
    end if;

    -- Lo de MiaTap sin borrado en cascada desde el negocio.
    delete from public.loyalty_wallet_classes where company_id = v_tienda;
    delete from public.loyalty_outbox where company_id = v_tienda;
    delete from public.loyalty_public_events where company_id = v_tienda;
    update public.loyalty_settings set default_profile_id = null where company_id = v_tienda;
    update public.loyalty_programs set current_version_id = null where company_id = v_tienda;
    -- Accesos y el negocio (lo demás de MiaTap cae en cascada: ajustes, club, página, equipo).
    delete from public.memberships where company_id = v_tienda;
    delete from public.companies where id = v_tienda;
    raise notice 'Quitado «kallpa-tienda». La cafetería sigue como la línea «Compra» de kallpa.';
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: debe salir solo kallpa, con Asistencia y Compra.
select c.id as negocio, s.slug, coalesce(p.line_label, p.name) as linea, p.status
  from public.companies c
  join public.loyalty_settings s on s.company_id = c.id
  join public.loyalty_programs p on p.company_id = c.id and p.status in ('active', 'paused')
 where c.id in ('kallpa', 'kallpa-tienda')
 order by c.id, p.parent_program_id nulls first;
