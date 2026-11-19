-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0021: el dueño o el administrador dan y gestionan el ACCESO de su equipo
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 19-nov-2026 (The 24/7): «que el admin o el dueño le mande y gestione sus usuarios y su
-- contraseña, en el panel». Hasta hoy las cuentas de los barberos se creaban con un script.
--
-- Usuario = su celular (por dentro, 9XXXXXXXX@equipo.vendemias.com, ya confirmado: el login
-- convierte el celular en ese correo, lib/panel/cuentaCelular.ts). Acceso de EMPLEADO
-- (memberships.role = 'member') enlazado a su ficha: entra a Mi agenda y Mi comisión.
--
--   · equipo_accesos_leer(company)                 { employee_id: { usuario } }
--   · equipo_acceso_dar(company, employee, celular) crea la cuenta (o reusa la de ese celular) y
--                                                   devuelve { usuario, clave } para pasársela.
--   · equipo_acceso_clave(company, employee)       una contraseña nueva: { usuario, clave }.
--   · equipo_acceso_quitar(company, employee)      deja de entrar a ESTE negocio (la cuenta queda).
--
-- Solo el dueño o el administrador. La contraseña nueva se genera aquí (nombre + 4 cifras) y se
-- devuelve UNA vez; en la base solo queda cifrada (bcrypt), como cualquier contraseña.
--
-- ⚠️ Una cuenta que también es de OTRO negocio, o que es dueño o administrador en alguno, NO se
-- toca la contraseña desde aquí: si no, el dueño de un negocio podría entrar a la cuenta que esa
-- persona usa en otro. En ese caso se le da acceso y la contraseña la cambia él en su menú.
--
-- Necesita v2_autorizar_agenda y rol_en; usa empleado_fichas (0018) si está. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Quién puede: el dueño o el administrador de ese negocio. Solo para las funciones de abajo.
create or replace function public.equipo_acceso_autorizar(p_company text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'El acceso del equipo lo gestiona el dueño o el administrador.' using errcode = '42501';
    end if;
end $$;

-- Una contraseña fácil de dictar: su nombre (sin tildes) + 4 cifras al azar. Mínimo 6.
create or replace function public.equipo_clave_nueva(p_nombre text)
returns text language sql volatile set search_path = public as $$
    select left(coalesce(nullif(regexp_replace(translate(lower(split_part(btrim(coalesce(p_nombre, '')), ' ', 1)),
                                                       'áéíóúüñ', 'aeiouun'), '[^a-z]', '', 'g'), ''), 'barbero'), 12)
           || lpad((floor(random() * 10000))::int::text, 4, '0');
$$;

-- ¿Se le puede cambiar la contraseña a esta cuenta desde este negocio? Solo si no es de otro
-- negocio y no es dueño ni administrador en ninguno.
create or replace function public.equipo_cuenta_es_solo_de(p_user uuid, p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select not exists (select 1 from public.memberships m
                        where m.auth_user_id = p_user::text
                          and (m.company_id <> p_company or m.role in ('owner', 'admin')));
$$;

create or replace function public.equipo_accesos_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.equipo_acceso_autorizar(p_company);
    return coalesce((
        select jsonb_object_agg(m.employee_id, jsonb_build_object(
                   'usuario', case when u.email like '%@equipo.vendemias.com' then split_part(u.email, '@', 1) else u.email end))
          from public.memberships m
          join auth.users u on u.id::text = m.auth_user_id
         where m.company_id = p_company and coalesce(m.employee_id, '') <> '' and m.role in ('member', 'agent')), '{}'::jsonb);
end $$;

create or replace function public.equipo_acceso_dar(p_company text, p_employee text, p_celular text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cel    text := right(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), 9);
    v_email  text;
    v_nombre text;
    v_user   uuid;
    v_clave  text;
    v_nueva  boolean := false;
begin
    perform public.equipo_acceso_autorizar(p_company);
    select name into v_nombre from public.employees where id = p_employee and company_id = p_company;
    if not found then raise exception 'Ese empleado no es de este negocio.' using errcode = '22023'; end if;
    if v_cel !~ '^9\d{8}$' then
        raise exception 'El celular tiene 9 dígitos y empieza en 9.' using errcode = '22023';
    end if;
    if exists (select 1 from public.memberships where company_id = p_company and employee_id = p_employee and role in ('member', 'agent')) then
        raise exception '% ya tiene acceso: usa «Nueva contraseña».', v_nombre using errcode = '22023';
    end if;
    v_email := v_cel || '@equipo.vendemias.com';
    v_clave := public.equipo_clave_nueva(v_nombre);

    select id into v_user from auth.users where lower(email) = v_email;
    if v_user is null then
        v_user := gen_random_uuid();
        v_nueva := true;
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', v_nombre), now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
                'email', now(), now(), now());
    elsif public.equipo_cuenta_es_solo_de(v_user, p_company) then
        update auth.users set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf')), updated_at = now()
         where id = v_user;
    else
        v_clave := null;   -- cuenta de otro negocio: su contraseña no se toca
    end if;

    if exists (select 1 from public.memberships where auth_user_id = v_user::text and company_id = p_company) then
        update public.memberships set employee_id = p_employee
         where auth_user_id = v_user::text and company_id = p_company and role in ('member', 'agent');
    else
        insert into public.memberships (id, auth_user_id, company_id, role, employee_id)
        values ('m-' || gen_random_uuid(), v_user::text, p_company, 'member', p_employee);
    end if;

    -- Su celular, también en la ficha (0018), si está.
    if to_regclass('public.empleado_fichas') is not null then
        execute 'insert into public.empleado_fichas (company_id, employee_id, telefono) values ($1, $2, $3)
                 on conflict (company_id, employee_id) do update set telefono = excluded.telefono, actualizado_at = now()'
          using p_company, p_employee, v_cel;
    end if;
    return jsonb_build_object('usuario', v_cel, 'clave', v_clave, 'nueva', v_nueva);
end $$;

create or replace function public.equipo_acceso_clave(p_company text, p_employee text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_user   uuid;
    v_email  text;
    v_nombre text;
    v_clave  text;
begin
    perform public.equipo_acceso_autorizar(p_company);
    select m.auth_user_id::uuid, u.email, e.name into v_user, v_email, v_nombre
      from public.memberships m
      join auth.users u on u.id::text = m.auth_user_id
      join public.employees e on e.id = m.employee_id and e.company_id = p_company
     where m.company_id = p_company and m.employee_id = p_employee and m.role in ('member', 'agent')
     limit 1;
    if v_user is null then
        raise exception 'Este empleado no tiene acceso: usa «Dar acceso».' using errcode = '22023';
    end if;
    if not public.equipo_cuenta_es_solo_de(v_user, p_company) then
        raise exception 'Esta cuenta también se usa en otro negocio: la contraseña la cambia la persona en su menú › Cambiar contraseña.' using errcode = '42501';
    end if;
    v_clave := public.equipo_clave_nueva(v_nombre);
    update auth.users set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf')), updated_at = now()
     where id = v_user;
    return jsonb_build_object('usuario', case when v_email like '%@equipo.vendemias.com' then split_part(v_email, '@', 1) else v_email end,
                              'clave', v_clave);
end $$;

create or replace function public.equipo_acceso_quitar(p_company text, p_employee text)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    perform public.equipo_acceso_autorizar(p_company);
    delete from public.memberships
     where company_id = p_company and employee_id = p_employee and role in ('member', 'agent');
    get diagnostics n = row_count;
    return n;
end $$;

revoke execute on function public.equipo_acceso_autorizar(text) from public, anon, authenticated;
revoke execute on function public.equipo_clave_nueva(text) from public, anon, authenticated;
revoke execute on function public.equipo_cuenta_es_solo_de(uuid, text) from public, anon, authenticated;
revoke execute on function
    public.equipo_accesos_leer(text),
    public.equipo_acceso_dar(text, text, text),
    public.equipo_acceso_clave(text, text),
    public.equipo_acceso_quitar(text, text)
from public, anon;
grant execute on function
    public.equipo_accesos_leer(text),
    public.equipo_acceso_dar(text, text, text),
    public.equipo_acceso_clave(text, text),
    public.equipo_acceso_quitar(text, text)
to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y quién tiene acceso hoy en The 24/7.
select to_regprocedure('public.equipo_acceso_dar(text,text,text)') is not null as acceso_del_equipo;
select e.name as empleado, split_part(u.email, '@', 1) as usuario
  from public.memberships m
  join auth.users u on u.id::text = m.auth_user_id
  join public.employees e on e.id = m.employee_id
 where m.company_id = 'the247barbershop' and m.role in ('member', 'agent')
 order by e.name;
