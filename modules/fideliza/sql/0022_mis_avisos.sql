-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0022: «Mis avisos» · avisos propios guardados, con su regla, para enviarlos cuando se quiera
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 19-nov-2026 (The 24/7): «no sé si se guardó; primero ver los predefinidos; si quiero uno en
-- específico, que lo configure y establezca las reglas; si lo quiere enviar ahora, que lo mande;
-- e indicar los límites, para que el cliente no se sature y desinstale».
--
-- Un aviso guardado es: nombre, a quién (la regla: todos / hace N días que no vienen / les faltan
-- N o menos) y el título y el texto. Se envía con la misma función de siempre
-- (loyalty_aviso_enviar, 0014), con sus mismos topes: solo a quien aceptó los avisos, de 09:00 a
-- 20:00 y como máximo 4 por persona cada 30 días. Aquí se guarda además cuándo se envió por
-- última vez y a cuántos, para avisar antes de repetirlo demasiado pronto.
--
--   · loyalty_avisos_guardados_leer(company)
--   · loyalty_aviso_guardado_guardar(company, datos)   (con id = editar; sin id = nuevo; hasta 20)
--   · loyalty_aviso_guardado_borrar(company, id)
--   · loyalty_aviso_guardado_enviado(company, id, alcance)
-- Permiso: campaigns.manage (el mismo que enviar). Necesita la 0014. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.loyalty_avisos_guardados (
    id              uuid primary key default gen_random_uuid(),
    company_id      text not null,
    nombre          text not null check (char_length(nombre) between 1 and 60),
    audiencia       text not null check (audiencia in ('todos', 'inactivos', 'cerca')),
    valor           integer not null default 1,
    titulo          text not null check (char_length(titulo) between 1 and 60),
    texto           text not null check (char_length(texto) between 1 and 160),
    creado_por      uuid,
    creado_at       timestamptz not null default now(),
    actualizado_at  timestamptz not null default now(),
    ultimo_envio    timestamptz,
    ultimo_alcance  integer not null default 0,
    envios          integer not null default 0
);
create index if not exists loyalty_avisos_guardados_negocio on public.loyalty_avisos_guardados (company_id, actualizado_at desc);
alter table public.loyalty_avisos_guardados enable row level security;
revoke all on public.loyalty_avisos_guardados from anon, authenticated;

create or replace function public.loyalty_avisos_guardados_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    return coalesce((select jsonb_agg(to_jsonb(a) - 'company_id' - 'creado_por' order by a.actualizado_at desc)
                       from public.loyalty_avisos_guardados a where a.company_id = p_company), '[]'::jsonb);
end $$;

create or replace function public.loyalty_aviso_guardado_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d        jsonb := coalesce(p_datos, '{}'::jsonb);
    v_id     uuid := nullif(d->>'id', '')::uuid;
    v_aud    text := coalesce(d->>'audiencia', 'todos');
    v_valor  integer := coalesce(nullif(d->>'valor', '')::integer, 1);
    v_titulo text := btrim(coalesce(d->>'titulo', ''));
    v_texto  text := btrim(coalesce(d->>'texto', ''));
    v_nombre text := left(coalesce(nullif(btrim(d->>'nombre'), ''), btrim(coalesce(d->>'titulo', ''))), 60);
    v_fila   public.loyalty_avisos_guardados;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    -- Las mismas reglas que al enviar (0014): días 7–365, faltan ≥ 1.
    perform public.loyalty_aviso_validar(v_aud, v_valor);
    if v_titulo = '' or v_texto = '' then
        raise exception 'Escribe el título y el texto del aviso.' using errcode = '22023';
    end if;
    if char_length(v_titulo) > 60 or char_length(v_texto) > 160 then
        raise exception 'El título va hasta 60 letras y el texto hasta 160.' using errcode = '22023';
    end if;
    if v_aud <> 'cerca' and position('{faltan}' in v_titulo || v_texto) > 0 then
        raise exception '{faltan} solo sirve en «Les falta poco».' using errcode = '22023';
    end if;
    if v_id is null then
        if (select count(*) from public.loyalty_avisos_guardados where company_id = p_company) >= 20 then
            raise exception 'Ya tienes 20 avisos guardados: borra alguno para crear otro.' using errcode = '22023';
        end if;
        insert into public.loyalty_avisos_guardados (company_id, nombre, audiencia, valor, titulo, texto, creado_por)
        values (p_company, v_nombre, v_aud, v_valor, v_titulo, v_texto, auth.uid())
        returning * into v_fila;
    else
        update public.loyalty_avisos_guardados
           set nombre = v_nombre, audiencia = v_aud, valor = v_valor, titulo = v_titulo, texto = v_texto, actualizado_at = now()
         where id = v_id and company_id = p_company
        returning * into v_fila;
        if not found then raise exception 'Ese aviso ya no existe.' using errcode = '22023'; end if;
    end if;
    return to_jsonb(v_fila) - 'company_id' - 'creado_por';
end $$;

create or replace function public.loyalty_aviso_guardado_borrar(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    delete from public.loyalty_avisos_guardados where id = p_id and company_id = p_company;
end $$;

create or replace function public.loyalty_aviso_guardado_enviado(p_company text, p_id uuid, p_alcance integer)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    update public.loyalty_avisos_guardados
       set ultimo_envio = now(), ultimo_alcance = greatest(coalesce(p_alcance, 0), 0), envios = envios + 1
     where id = p_id and company_id = p_company;
end $$;

revoke execute on function
    public.loyalty_avisos_guardados_leer(text),
    public.loyalty_aviso_guardado_guardar(text, jsonb),
    public.loyalty_aviso_guardado_borrar(text, uuid),
    public.loyalty_aviso_guardado_enviado(text, uuid, integer)
from public, anon;
grant execute on function
    public.loyalty_avisos_guardados_leer(text),
    public.loyalty_aviso_guardado_guardar(text, jsonb),
    public.loyalty_aviso_guardado_borrar(text, uuid),
    public.loyalty_aviso_guardado_enviado(text, uuid, integer)
to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.loyalty_aviso_guardado_guardar(text,jsonb)') is not null as mis_avisos;
