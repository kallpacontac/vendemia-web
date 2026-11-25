-- ══════════════════════════════════════════════════════════════════════════
-- FIDELIZA 0027 · El administrador del negocio entra en Fideliza como ENCARGADO
-- ══════════════════════════════════════════════════════════════════════════
--
-- 25-nov-2026, The 24/7: «Restar sello deberíamos tener para el cajero / dueño».
-- El cajero de The 24/7 (Jhony) es `admin` en el panel, pero Fideliza solo
-- distinguía al dueño: cualquier otro miembro sin rol propio entraba como
-- `cashier`, que no puede devolver ni corregir (ops.refund). Con esto:
--
--   · memberships.role = 'admin'  → 'manager' (encargado): resta sellos, deshace,
--     corrige saldos, y la regla «el equipo solo suma con el QR» no le aplica.
--   · el resto de miembros (barberos, `member`, `agent`) → 'cashier', como antes.
--   · un rol puesto a mano en Fideliza › Ajustes › Equipo (loyalty_staff) sigue
--     mandando sobre ambos: si al admin le pusieron «cajero», sigue cajero.
--
-- Solo cambia loyalty_role (0002). Idempotente. Deshacer: 0027_admin_es_encargado_deshacer.sql.

create or replace function public.loyalty_role(p_company text)
returns text
language sql stable security definer
set search_path = public
as $$
    select case
        when p_company is null then null
        when (select auth.uid()) is null then null
        else coalesce(
            (select case when m.role = 'owner' then 'owner'
                         else coalesce(s.role, case when m.role = 'admin' then 'manager' else 'cashier' end) end
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
