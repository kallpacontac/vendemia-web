-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA AVISOS · 0002 · Los avisos al celular, solo al dueño y al administrador
--
-- Es la parte del CORTE DE ROLES (21-oct-2026) que no está en el bot: la
-- `0044_roles_corte.sql` del bot cierra las tablas, pero esta cola es nuestra.
--
-- El hueco: `panel_push_srv_pendientes` (0001) manda cada aviso a TODAS las
-- suscripciones del negocio. Hasta el corte cualquiera pudo activar los avisos
-- en Ajustes, así que un empleado suscrito seguiría recibiendo en el celular
-- «Pago recibido · S/ 80 · Mia verificó el comprobante de 987 654 321»: el
-- dinero y el teléfono del cliente que el corte le esconde en el panel.
--
-- Qué hace:
--   1. `avisos_recibe(usuario, negocio)`: true si es el dueño o el administrador.
--      Toda la decisión vive aquí: deshacer es devolver true.
--   2. El despachador solo manda (y solo resume) a quien `avisos_recibe`. Las
--      suscripciones del empleado NO se borran: si mañana pasa a administrador,
--      le vuelven a llegar sin tocar nada.
--   3. La política: un empleado ya no puede suscribirse (Ajustes tampoco se lo
--      enseña desde el corte, pero la API sí lo aceptaría).
--
-- APLICAR el día del corte, DESPUÉS de la 0044 del bot. Se niega a entrar antes
-- del 21 de octubre, como la 0044. Deshacer: 0002_avisos_por_rol_deshacer.sql.
--
-- ⚠️ El rol se mira en `memberships.role` y la tabla owner/admin/resto vive en
-- tres sitios (ver lib/panel/roles.ts). Aquí solo hace falta saber quién NO es
-- empleado: 'owner' y 'admin'.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
begin
    if (now() at time zone 'America/Lima')::date < date '2026-10-21' then
        raise exception 'Esto es del corte de roles: no se aplica antes del 21 de octubre de 2026.';
    end if;
end $$;

-- 1 · Quién recibe avisos
-- `memberships.auth_user_id` es TEXTO (0001 del bot) y las suscripciones guardan un uuid:
-- sin el ::text, Postgres no crea la función («operator does not exist: text = uuid»).
create or replace function public.avisos_recibe(p_user uuid, p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.memberships m
         where m.auth_user_id = p_user::text and m.company_id = p_company
           and m.role in ('owner', 'admin')
    );
$$;
revoke execute on function public.avisos_recibe(uuid, text) from public, anon;
grant execute on function public.avisos_recibe(uuid, text) to authenticated;

-- 2 · El despachador: igual que en la 0001, con `avisos_recibe` en los dos sitios.
create or replace function public.panel_push_srv_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_eventos jsonb;
    v_resumenes jsonb;
begin
    perform public.loyalty_srv_check();

    with vencidos as (
        update public.panel_push_events e set estado = 'enviado', enviado_at = now()
         where e.id in (select id from public.panel_push_events
                         where estado = 'pendiente' and not_before <= now()
                         order by id limit 300 for update skip locked)
        returning e.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'company_id', v.company_id, 'tipo', v.tipo, 'datos', v.datos, 'creado', v.creado,
        'negocio', c.name, 'modo', c.business_mode,
        'cliente', coalesce(nullif(l.name, ''), l.phone),
        'destinos', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.panel_push_subscriptions s
             where s.company_id = v.company_id and s.revoked_at is null
               and public.avisos_recibe(s.auth_user_id, s.company_id)
               and coalesce((s.prefs ->> v.tipo)::boolean, v.tipo <> 'persona')
               and not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta)
        ), '[]'::jsonb)
    ) order by v.id), '[]'::jsonb)
      into v_eventos
      from vencidos v
      join public.companies c on c.id = v.company_id
      left join public.leads l on l.id = v.datos ->> 'lead_id';

    -- Resúmenes: suscripciones cuyo silencio terminó hace menos de 15 min y que
    -- hoy aún no lo recibieron. Cuenta lo que pasó durante su silencio.
    with listas as (
        -- fin = hoy a la hora en que termina su silencio, en hora de Lima.
        select s.*,
               ((now() at time zone 'America/Lima')::date + s.silencio_hasta) at time zone 'America/Lima' as fin
          from public.panel_push_subscriptions s
         where s.revoked_at is null and s.silencio_desde is not null and s.silencio_hasta is not null
           and s.silencio_desde <> s.silencio_hasta
           and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
           and public.avisos_recibe(s.auth_user_id, s.company_id)
    ), tocan as (
        select l.*,
               -- inicio del silencio que acaba de terminar
               (case when l.silencio_desde > l.silencio_hasta
                     then ((now() at time zone 'America/Lima')::date - 1 + l.silencio_desde)
                     else ((now() at time zone 'America/Lima')::date + l.silencio_desde) end) at time zone 'America/Lima' as inicio
          from listas l
         where now() >= l.fin and now() < l.fin + interval '15 minutes'
    ), marcadas as (
        update public.panel_push_subscriptions s set ultimo_resumen = (now() at time zone 'America/Lima')::date
          from tocan t where s.id = t.id
        returning s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
        'negocio', c.name, 'modo', c.business_mode,
        'conteos', (select coalesce(jsonb_object_agg(x.tipo, x.n), '{}'::jsonb) from (
            select e.tipo, count(*) as n from public.panel_push_events e
             where e.company_id = t.company_id and e.estado in ('enviado', 'pendiente')
               and e.creado >= t.inicio and e.creado < t.fin
               and coalesce((t.prefs ->> e.tipo)::boolean, e.tipo <> 'persona')
             group by e.tipo) x)
    )), '[]'::jsonb)
      into v_resumenes
      from tocan t join public.companies c on c.id = t.company_id
     where t.id in (select id from marcadas);

    return jsonb_build_object('eventos', v_eventos, 'resumenes', v_resumenes);
end $$;
revoke execute on function public.panel_push_srv_pendientes() from public, anon, authenticated;
grant execute on function public.panel_push_srv_pendientes() to anon;

-- 3 · Suscribirse: cada uno las suyas, y solo si recibe avisos. Leer y borrar
-- las propias sigue abierto a cualquier miembro, para que pueda apagarlas.
drop policy if exists p_panel_push_subs_own on public.panel_push_subscriptions;
create policy p_panel_push_subs_own on public.panel_push_subscriptions
    for all to authenticated
    using (auth_user_id = auth.uid() and public.is_member(company_id))
    with check (auth_user_id = auth.uid() and public.avisos_recibe(auth.uid(), company_id));
