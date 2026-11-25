-- Deshace 0027: loyalty_role vuelve a la de 0002 (todo lo que no es dueño entra como cajero).
create or replace function public.loyalty_role(p_company text)
returns text
language sql stable security definer
set search_path = public
as $$
    select case
        when p_company is null then null
        when (select auth.uid()) is null then null
        else coalesce(
            (select case when m.role = 'owner' then 'owner' else coalesce(s.role, 'cashier') end
               from public.memberships m
               left join public.loyalty_staff s
                      on s.company_id = m.company_id and s.auth_user_id = m.auth_user_id
              where m.company_id = p_company
                and m.auth_user_id = (select auth.uid())::text
              limit 1),
            case when public.loyalty_es_admin() then 'platform_admin' end)
    end;
$$;

notify pgrst, 'reload schema';
