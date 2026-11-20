-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0027: el descanso del día en el horario (el almuerzo de 1:00 a 2:30 pm)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (The 24/7): «en los horarios no hay para poner hora de almuerzo 1 a 2:30 pm».
--
--   · Cada día del horario (del negocio o de un barbero) puede llevar `break_start` y `break_end`
--     (HH:MM). En ese rato no hay turno: ni la página, ni el panel, ni la reserva ofrecen ni aceptan
--     esa hora, igual que fuera del horario.
--   · Va en v2_dia_que_cubre (tu-pagina 0011), que es por donde pasan v2_en_turno_el, v2_aforo y
--     v2_hueco. Su copia en TypeScript es diaQueCubre (lib/panel/medianoche.ts): las dos dicen lo mismo.
--   · Un descanso a medias o mal escrito (sin fin, fin antes que inicio) se ignora: mejor ofrecer una
--     hora de más que cerrar el día entero por un error de tecleo. La pantalla no deja guardarlo así.
--   · Lo de antes no cambia: un día sin descanso se comporta exactamente igual.
--   · Mia por WhatsApp (el bot) calcula sus horas aparte: en un negocio con el bot, el descanso
--     todavía no lo ve.
--
-- Necesita la 0011 de tu-pagina. Idempotente. Deshacer: volver a correr la 0011 de tu-pagina
-- (deja v2_dia_que_cubre sin descanso) y `drop function public.v2_en_descanso(jsonb, integer)`.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ¿El minuto p_min (desde la medianoche de ese día) cae en el descanso del día p_d?
create or replace function public.v2_en_descanso(p_d jsonb, p_min integer)
returns boolean language plpgsql immutable as $$
declare
    v_ini integer;
    v_fin integer;
begin
    if p_d is null or jsonb_typeof(p_d) <> 'object' then return false; end if;
    if coalesce(p_d->>'break_start', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
       or coalesce(p_d->>'break_end', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
        return false;
    end if;
    v_ini := public.v2_min(p_d->>'break_start');
    v_fin := public.v2_min(p_d->>'break_end');
    if v_fin <= v_ini then return false; end if;
    return p_min >= v_ini and p_min < v_fin;
end $$;

-- La de la 0011, con el descanso: en él, el día no cubre ese minuto.
create or replace function public.v2_dia_que_cubre(p_h jsonb, p_fecha text, p_min integer)
returns jsonb language plpgsql immutable as $$
declare
    v_hoy  text := public.v2_clave_dia(p_fecha);
    v_ayer text := public.v2_clave_dia(to_char(p_fecha::date - 1, 'YYYY-MM-DD'));
    t      record;
begin
    select * into t from public.v2_tramo(p_h -> v_hoy);
    if t.abre is not null and p_min >= t.abre and p_min < t.cierra then
        if public.v2_en_descanso(p_h -> v_hoy, p_min) then return null; end if;
        return p_h -> v_hoy;
    end if;
    select * into t from public.v2_tramo(p_h -> v_ayer);
    if t.abre is not null and t.cierra > 1440 and p_min + 1440 < t.cierra then return p_h -> v_ayer; end if;
    return null;
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.v2_en_descanso(jsonb, integer)') is not null as descanso;
