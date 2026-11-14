-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · dirección corta: agenda.vendemias.com/the247barbershop → agenda.vendemias.com/the247
-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido por Alvaro el 14-nov-2026 («es demasiado larga»). Sin redirección: el enlace viejo deja
-- de abrir (decisión de Alvaro: todavía no se había compartido).
--
-- Solo cambia la dirección de la PÁGINA (tu_pagina.slug). No cambian:
--   · el negocio (companies.id sigue siendo the247barbershop), sus citas, pagos y clientes;
--   · la tarjeta de puntos: fideliza.vendemias.com/n/the247barbershop (es otro slug, el de Fideliza).
-- Se puede correr más de una vez. Para volver atrás: cambia 'the247' por 'the247barbershop' abajo.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_nuevo constant text := 'the247';
    v_viejo constant text := 'the247barbershop';
begin
    if exists (select 1 from public.tu_pagina where slug = v_nuevo and company_id <> 'the247barbershop') then
        raise exception 'La dirección % ya la usa otro negocio. No se toca nada.', v_nuevo;
    end if;
    if public.tu_pagina_slug_reservado(v_nuevo) then
        raise exception 'La dirección % está reservada.', v_nuevo;
    end if;

    update public.tu_pagina set slug = v_nuevo where company_id = 'the247barbershop';

    -- El texto que leerá Mia cuando se encienda el bot.
    update public.companies
       set custom_rules = replace(custom_rules, 'agenda.vendemias.com/' || v_viejo, 'agenda.vendemias.com/' || v_nuevo)
     where id = 'the247barbershop';

    -- Botones de «Mis enlaces» (Fideliza) que llevaran a la agenda, si el dueño puso alguno.
    update public.loyalty_links
       set url = replace(url, 'agenda.vendemias.com/' || v_viejo, 'agenda.vendemias.com/' || v_nuevo), updated_at = now()
     where company_id = 'the247barbershop' and url like '%agenda.vendemias.com/' || v_viejo || '%';
end $$;

commit;

-- Comprobación: la página en «the247», las reglas con la dirección nueva y 0 botones con la vieja.
-- Si «publicados_con_la_vieja» > 0: en el panel, Fideliza → Enlaces y QR → Publicar otra vez.
select p.slug,
       'https://agenda.vendemias.com/' || p.slug as enlace,
       (select custom_rules not like '%agenda.vendemias.com/the247barbershop%'
          from public.companies where id = 'the247barbershop') as reglas_al_dia,
       (select count(*) from public.loyalty_links l where l.company_id = 'the247barbershop'
           and l.url like '%agenda.vendemias.com/the247barbershop%') as botones_con_la_vieja,
       (select count(*) from public.loyalty_published_link_versions v where v.company_id = 'the247barbershop'
           and v.links::text like '%agenda.vendemias.com/the247barbershop%') as publicados_con_la_vieja
  from public.tu_pagina p
 where p.company_id = 'the247barbershop';
