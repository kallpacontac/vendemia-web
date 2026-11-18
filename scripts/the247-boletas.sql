-- ═══════════════════════════════════════════════════════════════════════════════
-- THE 24/7 · Activar boletas e impresión EN PRUEBA (18-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Deja las boletas encendidas con el proveedor «Prueba local»: NO envía nada a SUNAT. Sirve
-- para ver el flujo completo en la tablet: cobrar → «Emitir boleta» → Imprimir / WhatsApp.
-- El ticket impreso dice «DOCUMENTO DE PRUEBA · SIN VALOR TRIBUTARIO».
--
-- ANTES, en este orden (se pueden correr dos veces sin problema):
--   1 · modules/facturacion/sql/0002_servicios_y_productos.sql   (Iquitos: servicios Y productos)
--   2 · modules/facturacion/sql/0003_boleta_al_cobrar.sql        (la boleta al cobrar en Caja)
--
-- RUC, razón social y dirección: si los dejas vacíos abajo, se toman de Mi página › Libro de
-- Reclamaciones. Si tampoco están ahí, el script se para y te lo dice.
--
-- Qué deja puesto (todo se cambia luego en Ajustes › Boletas y facturas):
--   · IGV: exonerado, Amazonía, «ambas» leyendas: cada boleta lleva la de lo vendido
--     (2002 servicios: el corte; 2001 bienes: la cera o la bebida).
--   · Al cobrar: «preguntar» → tras cobrar sale el botón «Emitir boleta», ya con el detalle.
--   · Ticketera de 80 mm (si su impresora es la pequeña portátil, cámbialo a 58 en Ajustes).
--   · Series B001 y F001.
--
-- PARA QUE VALGAN ANTE SUNAT (después de probar): Ajustes › Boletas y facturas › proveedor
-- «Lucode» (el dueño lo autoriza una vez en su Clave SOL), pegar el token, ambiente
-- «Producción», Guardar. Lo emitido en prueba no se cruza con lo real.
--
-- Deshacer (apagarlas): update public.factura_ajustes set activo = false where company_id = 'the247barbershop';
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    -- ▼▼▼ Vacíos = los de Mi página › Libro de Reclamaciones ▼▼▼
    v_ruc          text := '';   -- 11 dígitos, empieza en 10 o 20. Ej.: '20612345678'
    v_razon_social text := '';   -- como figura en SUNAT. Ej.: 'INVERSIONES 24/7 E.I.R.L.'
    v_direccion    text := '';   -- dirección fiscal. Ej.: 'Jr. Huallaga 625, Iquitos'
    -- ▲▲▲
begin
    -- Vacíos: se toman de Mi página › Libro de Reclamaciones (lo que ya se llenó en la ficha).
    select coalesce(nullif(v_ruc, ''), regexp_replace(coalesce(secciones #>> '{proveedor,ruc}', ''), '\D', '', 'g')),
           coalesce(nullif(btrim(v_razon_social), ''), btrim(coalesce(secciones #>> '{proveedor,razon_social}', ''))),
           coalesce(nullif(btrim(v_direccion), ''), btrim(coalesce(secciones #>> '{proveedor,direccion}', '')))
      into v_ruc, v_razon_social, v_direccion
      from public.tu_pagina where company_id = 'the247barbershop';
    v_ruc := coalesce(v_ruc, ''); v_razon_social := coalesce(v_razon_social, ''); v_direccion := coalesce(v_direccion, '');
    if to_regprocedure('public.factura_leyendas(text,text,jsonb)') is null then
        raise exception 'Falta correr antes modules/facturacion/sql/0002_servicios_y_productos.sql';
    end if;
    if to_regprocedure('public.factura_al_cobrar_guardar(text,text)') is null then
        raise exception 'Falta correr antes modules/facturacion/sql/0003_boleta_al_cobrar.sql';
    end if;
    if v_ruc !~ '^(10|15|16|17|20)\d{9}$' then
        raise exception 'Falta el RUC: ponlo arriba en v_ruc o en Mi página › Libro de Reclamaciones (11 dígitos, empieza en 10 o 20).';
    end if;
    -- El dígito verificador, como lo comprueba el panel (modules/facturacion/dominio/validar.ts).
    if (11 - ((5*substr(v_ruc,1,1)::int + 4*substr(v_ruc,2,1)::int + 3*substr(v_ruc,3,1)::int + 2*substr(v_ruc,4,1)::int
             + 7*substr(v_ruc,5,1)::int + 6*substr(v_ruc,6,1)::int + 5*substr(v_ruc,7,1)::int + 4*substr(v_ruc,8,1)::int
             + 3*substr(v_ruc,9,1)::int + 2*substr(v_ruc,10,1)::int) % 11)) % 10 <> substr(v_ruc,11,1)::int then
        raise exception 'El RUC % no es válido (el último dígito no cuadra): revísalo.', v_ruc;
    end if;
    if btrim(v_razon_social) = '' or btrim(v_direccion) = '' then
        raise exception 'Faltan la razón social o la dirección fiscal: ponlas arriba o en Mi página › Libro de Reclamaciones.';
    end if;

    insert into public.factura_ajustes as a (
        company_id, activo, proveedor, ambiente, ruc, razon_social, nombre_comercial, direccion,
        igv_tipo, leyenda_amazonia, ticket_ancho, al_cobrar, actualizado_at)
    values (
        'the247barbershop', true, 'simulado', 'pruebas', v_ruc, btrim(v_razon_social), 'The 24/7 Barber Shop', btrim(v_direccion),
        'exonerado', 'ambas', 80, 'preguntar', now())
    on conflict (company_id) do update set
        activo = true, proveedor = 'simulado', ambiente = 'pruebas',
        ruc = excluded.ruc, razon_social = excluded.razon_social,
        nombre_comercial = coalesce(nullif(a.nombre_comercial, ''), excluded.nombre_comercial),
        direccion = excluded.direccion, igv_tipo = 'exonerado', leyenda_amazonia = 'ambas',
        al_cobrar = case when a.al_cobrar = 'no' then 'preguntar' else a.al_cobrar end,
        actualizado_at = now();
end $$;

commit;

-- Comprobación: una fila con activo = true y proveedor = simulado.
select company_id, activo, proveedor, ambiente, ruc, razon_social, igv_tipo, leyenda_amazonia, ticket_ancho, al_cobrar
  from public.factura_ajustes where company_id = 'the247barbershop';
