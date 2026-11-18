-- Boletas y facturas · 0002: en la Amazonía, un local que vende servicios Y productos.
--
-- Un salón de Iquitos corta el pelo (servicio: leyenda 2002) y vende ceras (bien: 2001).
-- Con la 0001 el local elegía una sola leyenda para siempre. Ahora puede elegir «ambas»
-- en Ajustes, y entonces cada comprobante lleva la de lo que se vendió en él: la manda
-- el panel en p_doc.leyendas (['2001'], ['2002'] o las dos) y aquí se comprueba.
--
-- Requiere la 0001. Se puede correr dos veces. Deshacer: scripts/facturacion-0002-deshacer.sql.

begin;

alter table public.factura_ajustes drop constraint if exists factura_ajustes_leyenda_amazonia_check;
alter table public.factura_ajustes add constraint factura_ajustes_leyenda_amazonia_check
    check (leyenda_amazonia in ('2001', '2002', 'ambas'));

-- Las leyendas del catálogo 52 que lleva el comprobante. Solo con exonerado (Amazonía).
-- Con «ambas» decide lo que pide el panel; si no pide ninguna válida, se para (antes de dar número).
create or replace function public.factura_leyendas(p_tipo text, p_ley text, p_pedidas jsonb)
returns jsonb language plpgsql immutable as $$
declare
    v jsonb;
begin
    if p_tipo is distinct from 'exonerado' or p_ley is null then
        return '[]'::jsonb;
    end if;
    if p_ley in ('2001', '2002') then
        return jsonb_build_array(p_ley);
    end if;
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) into v
      from (select distinct e as x
              from jsonb_array_elements_text(
                       case when jsonb_typeof(p_pedidas) = 'array' then p_pedidas else '[]'::jsonb end) e
             where e in ('2001', '2002')) s;
    if v = '[]'::jsonb then
        raise exception 'Di si vendiste servicios, productos o los dos (va como leyenda en el comprobante).'
            using errcode = '22023';
    end if;
    return v;
end $$;

-- La misma de la 0001; cambia solo de dónde salen las leyendas (v_leyendas).
create or replace function public.factura_reservar(p_company text, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.factura_rol(p_company);
    a public.factura_ajustes;
    v_tipo text := p_doc->>'tipo';
    v_serie text;
    v_numero integer;
    v_ya public.comprobantes_electronicos;
    v_id uuid;
    v_ahora timestamp := now() at time zone 'America/Lima';
    v_tasa numeric;
    v_leyendas jsonb;
begin
    select * into a from public.factura_ajustes where company_id = p_company;
    if a.company_id is null or not a.activo then
        raise exception 'Las boletas y facturas no están activas. Actívalas en Ajustes.' using errcode = '55000';
    end if;
    if v_tipo not in ('boleta', 'factura') then
        raise exception 'Tipo de comprobante no válido.' using errcode = '22023';
    end if;

    -- El mismo formulario enviado dos veces: devolver el que ya existe.
    select * into v_ya from public.comprobantes_electronicos
     where company_id = p_company and clave = p_doc->>'clave';
    if v_ya.id is not null then
        return jsonb_build_object('id', v_ya.id, 'serie', v_ya.serie, 'numero', v_ya.numero, 'repetido', true);
    end if;

    -- Los montos se calcularon con una tasa; tiene que ser la que toca HOY. Si no (cambió el año
    -- con la pantalla abierta, o alguien tocó los Ajustes a la vez), se para antes de gastar número.
    v_tasa := public.factura_tasa(a.igv_tipo, a.igv_porcentaje, v_ahora::date);
    if (p_doc->>'igv_porcentaje') is null or (p_doc->>'igv_porcentaje')::numeric <> v_tasa then
        raise exception 'La tasa del IGV cambió (ahora es % %%). Recarga la página y vuelve a emitir.',
            replace(trim_scale(v_tasa)::text, '.', ',') using errcode = '22023';
    end if;
    v_leyendas := public.factura_leyendas(a.igv_tipo, a.leyenda_amazonia, p_doc->'leyendas');

    v_serie := case v_tipo when 'boleta' then a.serie_boleta else a.serie_factura end;
    insert into public.factura_series as s (company_id, serie, ultimo) values (p_company, v_serie, 1)
    on conflict (company_id, serie) do update set ultimo = s.ultimo + 1
    returning ultimo into v_numero;

    insert into public.comprobantes_electronicos (
        company_id, clave, tipo, serie, numero, fecha, hora, cliente, lineas, op_gravadas, op_exoneradas,
        igv, total, igv_tipo, igv_porcentaje, leyenda_amazonia, leyendas, emisor, proveedor, ambiente,
        ref_tipo, ref_id, emitido_por)
    values (
        p_company, p_doc->>'clave', v_tipo, v_serie, v_numero, v_ahora::date, to_char(v_ahora, 'HH24:MI:SS'),
        p_doc->'cliente', p_doc->'lineas',
        coalesce((p_doc->>'op_gravadas')::numeric, 0), coalesce((p_doc->>'op_exoneradas')::numeric, 0),
        coalesce((p_doc->>'igv')::numeric, 0), (p_doc->>'total')::numeric,
        -- En el comprobante «mype» es gravado: lo que cuenta es la tasa con la que salió.
        case when a.igv_tipo = 'exonerado' then 'exonerado' else 'gravado' end, v_tasa, a.leyenda_amazonia,
        v_leyendas,
        jsonb_build_object('ruc', a.ruc, 'razon_social', a.razon_social, 'nombre_comercial', a.nombre_comercial,
            'direccion', a.direccion, 'ubigeo', a.ubigeo, 'departamento', a.departamento,
            'provincia', a.provincia, 'distrito', a.distrito),
        a.proveedor, a.ambiente,
        left(coalesce(p_doc->>'ref_tipo', ''), 20), left(coalesce(p_doc->>'ref_id', ''), 80), auth.uid())
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'serie', v_serie, 'numero', v_numero, 'repetido', false);
end $$;

revoke execute on function public.factura_leyendas(text, text, jsonb) from public, anon;
revoke execute on function public.factura_reservar(text, jsonb) from public, anon;
grant execute on function public.factura_reservar(text, jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';
