-- ═══════════════════════════════════════════════════════════════════════════════
-- ZONA GOL · volver a poner su página en agenda.vendemias.com/zona-gol (5-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
-- El negocio y sus reservas siguen; faltaba la fila de tu_pagina con slug zona-gol.
--   · Si Zona Gol tiene página con OTRA dirección: se le devuelve «zona-gol» y se publica.
--   · Si no tiene ninguna: se crea igual que en scripts/zona-gol-demo.sql.
-- No toca reservas, clientes ni pagos. Al final sale una fila: slug = zona-gol, publicada = true.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_wsp text;
begin
    if not exists (select 1 from public.companies where id = 'zona-gol') then
        raise exception 'No existe el negocio zona-gol: corre scripts/zona-gol-demo.sql.';
    end if;
    if exists (select 1 from public.tu_pagina where slug = 'zona-gol' and company_id <> 'zona-gol') then
        raise exception 'La dirección zona-gol la usa otro negocio. No se toca nada.';
    end if;

    if exists (select 1 from public.tu_pagina where company_id = 'zona-gol') then
        update public.tu_pagina set slug = 'zona-gol', publicada = true where company_id = 'zona-gol';
    else
        select coalesce(nullif(whatsapp_phone, ''), owner_phone, '') into v_wsp from public.companies where id = 'zona-gol';
        insert into public.tu_pagina (company_id, slug, titulo, frase, whatsapp, plantilla, color, publicada, secciones)
        values ('zona-gol', 'zona-gol', 'Zona Gol', 'Tu partido empieza aquí. Canchas listas para jugar con tu equipo.', v_wsp, 'canchas', '#183D2B', true,
                jsonb_build_object('reservar', true, 'catalogo', false, 'envios', false,
                    'apariencia', jsonb_build_object('plantillaActiva', true, 'fotoPlantilla', 'canchas', 'mostrarWhatsapp', false),
                    'canchas', jsonb_build_object('activo', true, 'desde', '18:00', 'finde', false, 'noche', '{}'::jsonb, 'plazo', 30, 'adelanto', 40, 'comprobante', 'pagina', 'validacion', 'automatica')));
    end if;
end $$;

commit;

select company_id, slug, publicada, plantilla, secciones -> 'canchas' as canchas
  from public.tu_pagina where company_id = 'zona-gol';
