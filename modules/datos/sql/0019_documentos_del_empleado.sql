-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0019: la foto del DNI y el CV del empleado, en PRIVADO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «imágenes del DNI y la imagen del CV en la ficha del empleado».
--
-- Son documentos de identidad: NO van a Cloudinary (las fotos del equipo son públicas, con
-- enlace). Van a un cubo PRIVADO de Supabase Storage, «empleados-docs», en la carpeta del
-- negocio (<company_id>/<employee_id>/…). Solo el dueño y el administrador de ESE negocio
-- suben, ven (con un enlace firmado que caduca) y borran. Nadie más, ni con el enlace.
--
--   · empleado_fichas.dni_foto / cv: la ruta del archivo en el cubo ('' = sin documento).
--   · empleado_doc_guardar(company, employee, 'dni' | 'cv', ruta): apunta (o quita, con '').
--   · empleado_fichas_leer: ahora también devuelve dni_foto y cv.
--
-- Necesita la 0018. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- 1 · El cubo privado: fotos y PDF, hasta 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('empleados-docs', 'empleados-docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2 · Quién: el dueño o el administrador del negocio de la carpeta.
drop policy if exists empleados_docs_ver on storage.objects;
drop policy if exists empleados_docs_subir on storage.objects;
drop policy if exists empleados_docs_borrar on storage.objects;
create policy empleados_docs_ver on storage.objects for select to authenticated
    using (bucket_id = 'empleados-docs' and coalesce(public.rol_en((storage.foldername(name))[1]), '') in ('dueno', 'admin'));
create policy empleados_docs_subir on storage.objects for insert to authenticated
    with check (bucket_id = 'empleados-docs' and coalesce(public.rol_en((storage.foldername(name))[1]), '') in ('dueno', 'admin'));
create policy empleados_docs_borrar on storage.objects for delete to authenticated
    using (bucket_id = 'empleados-docs' and coalesce(public.rol_en((storage.foldername(name))[1]), '') in ('dueno', 'admin'));

-- 3 · Dónde quedó cada documento.
alter table public.empleado_fichas add column if not exists dni_foto text not null default '';
alter table public.empleado_fichas add column if not exists cv text not null default '';

create or replace function public.empleado_doc_guardar(p_company text, p_employee text, p_tipo text, p_ruta text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ruta text := btrim(coalesce(p_ruta, ''));
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'Los documentos del empleado los ve y cambia el dueño o el administrador.' using errcode = '42501';
    end if;
    if p_tipo not in ('dni', 'cv') then
        raise exception 'Documento no válido.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.employees where id = p_employee and company_id = p_company) then
        raise exception 'Ese empleado no es de este negocio.' using errcode = '22023';
    end if;
    -- Solo rutas de SU carpeta: <company>/<employee>/…
    if v_ruta <> '' and v_ruta not like p_company || '/' || p_employee || '/%' then
        raise exception 'Ese archivo no es de este empleado.' using errcode = '22023';
    end if;
    insert into public.empleado_fichas (company_id, employee_id, actualizado_por)
    values (p_company, p_employee, auth.uid())
    on conflict (company_id, employee_id) do nothing;
    if p_tipo = 'dni' then
        update public.empleado_fichas set dni_foto = v_ruta, actualizado_por = auth.uid(), actualizado_at = now()
         where company_id = p_company and employee_id = p_employee;
    else
        update public.empleado_fichas set cv = v_ruta, actualizado_por = auth.uid(), actualizado_at = now()
         where company_id = p_company and employee_id = p_employee;
    end if;
    return jsonb_build_object('tipo', p_tipo, 'ruta', v_ruta);
end $$;

create or replace function public.empleado_fichas_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        return '{}'::jsonb;
    end if;
    return coalesce((select jsonb_object_agg(employee_id, jsonb_build_object(
                         'telefono', telefono, 'dni', dni, 'sedes', to_jsonb(sedes), 'dni_foto', dni_foto, 'cv', cv))
                       from public.empleado_fichas where company_id = p_company), '{}'::jsonb);
end $$;

revoke execute on function public.empleado_doc_guardar(text, text, text, text) from public, anon;
grant execute on function public.empleado_doc_guardar(text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: el cubo privado y la función.
select (select public from storage.buckets where id = 'empleados-docs') as cubo_publico_debe_ser_false,
       to_regprocedure('public.empleado_doc_guardar(text,text,text,text)') is not null as guardar;
