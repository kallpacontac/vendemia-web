-- Deshace 0002_avisos_por_rol.sql en un paso: los avisos vuelven a salir para
-- todas las suscripciones del negocio, como con la 0001. Va con el deshacer de
-- la 0044 del bot, si el corte se echa atrás.
--
-- El despachador puede seguir llamando a `avisos_recibe`: con esto dice que sí
-- a cualquiera.

create or replace function public.avisos_recibe(p_user uuid, p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select true;
$$;

drop policy if exists p_panel_push_subs_own on public.panel_push_subscriptions;
create policy p_panel_push_subs_own on public.panel_push_subscriptions
    for all to authenticated
    using (auth_user_id = auth.uid() and public.is_member(company_id))
    with check (auth_user_id = auth.uid() and public.is_member(company_id));
