-- ═══════════════════════════════════════════════════════════════════════════════
-- ¿POR QUÉ EL PANEL SIGUE DICIENDO «TU CUENTA NO TIENE UN NEGOCIO ASIGNADO»?
--
-- Pégalo entero en el SQL Editor de Supabase. Son cuatro comprobaciones y cada
-- una descarta una causa distinta. La que falle señala el arreglo.
--
-- ⚠️ Aquí `auth.uid()` es NULL: el SQL Editor no corre como tu usuario del panel,
-- corre como postgres. Por eso no se puede llamar a es_admin_plataforma() y ya
-- está — hay que comparar las tablas a mano, que es lo que hace el paso 3.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · ¿Qué cuentas existen, y cuál es su UID? ───────────────────────────────
-- El UID que va en platform_admins es el de la columna `id`. NO el email.
select id as uid, email, last_sign_in_at
from auth.users
order by last_sign_in_at desc nulls last;


-- ── 2 · ¿Qué hay realmente en platform_admins? ────────────────────────────────
select auth_user_id, nota, created_at from public.platform_admins;


-- ── 3 · LA COMPROBACIÓN QUE IMPORTA: ¿casan? ──────────────────────────────────
-- `casa = true` en la fila de tu cuenta es lo único que hace que el panel te deje
-- entrar. Si sale la fila con casa = false, o no sale ninguna, el UID insertado no
-- es el de esa cuenta — el error más común es pegar el email, o el UID del dueño
-- de un negocio en vez del tuyo.
select
    u.email,
    u.id                        as uid_real,
    a.auth_user_id              as uid_insertado,
    (a.auth_user_id is not null) as casa
from auth.users u
left join public.platform_admins a on a.auth_user_id = u.id::text
order by casa desc, u.email;


-- ── 4 · ¿Existe la función y puede llamarla el panel? ─────────────────────────
-- `puede_ejecutar` en false = falta el grant de la 0020.
-- Si esta consulta no devuelve NINGUNA fila, la 0020 no llegó a aplicarse entera.
select
    p.proname                                                as funcion,
    p.prosecdef                                              as security_definer,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as puede_ejecutar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('es_admin_plataforma', 'is_member');


-- ── 5 · Y las políticas de retargeting y commands ─────────────────────────────
-- Tienen que salir p_retargeting_read, p_commands_read y p_commands_insert.
-- Si a las de commands les falta `es_admin_plataforma`, la 0022 no está aplicada.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('retargeting', 'commands')
order by tablename, policyname;


-- ═══════════════════════════════════════════════════════════════════════════════
-- ARREGLOS SEGÚN LO QUE HAYA FALLADO
--
-- · Paso 3 sin fila con casa = true → el UID está mal. Bórralo y mete el bueno:
--
--     delete from public.platform_admins;
--     insert into public.platform_admins (auth_user_id, nota)
--     select id::text, 'Alvaro — admin de la plataforma'
--       from auth.users where email = 'PON-AQUI-TU-EMAIL';
--
--   (Así se copia el UID solo y no hay forma de equivocarse al pegarlo.)
--
-- · Paso 4 sin filas, o la función existe pero el panel recibe un PGRST202
--   «Could not find the function … in the schema cache» → PostgREST no la ha
--   visto todavía. Se le dice que recargue:
--
--     notify pgrst, 'reload schema';
--
-- · Paso 4 con puede_ejecutar = false:
--
--     grant execute on function public.es_admin_plataforma() to authenticated;
--
-- Y si los cinco pasos salen bien, el problema NO está en la base: está en que el
-- navegador sigue sirviendo el build viejo. Mira la consola del navegador — si el
-- código nuevo corre y algo falla, deja escrito «[sesion] es_admin_plataforma()
-- falló:» con el motivo.
-- ═══════════════════════════════════════════════════════════════════════════════
