-- ═══════════════════════════════════════════════════════════════════════════════
-- ARREGLO · «function public.v2_cancha_ocupada(text, text, text, text) is not unique»
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 5-nov-2026. En la base hay DOS v2_cancha_ocupada: la buena de la 0011, con 5 argumentos (el
-- quinto, p_excepto, opcional), y otra de 4 que no está en ninguna migración del repo. Con las
-- dos, una llamada con 4 argumentos (la de «Avísame si se libera») no sabe cuál usar y falla.
--
-- Quita SOLO la de 4. Las llamadas con 4 argumentos pasan a la de 5 con p_excepto = '', que es
-- lo mismo. Se corre entero en el editor SQL. Al final sale una tabla: debe quedar 1 versión.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    -- Solo si la buena está: sin ella no se quita nada.
    if to_regprocedure('public.v2_cancha_ocupada(text, text, text, text, text)') is null then
        raise exception 'No está la v2_cancha_ocupada de 5 argumentos (0011). No se toca nada.';
    end if;
end $$;

drop function if exists public.v2_cancha_ocupada(text, text, text, text);

commit;

notify pgrst, 'reload schema';

-- Comprobación: cada función de canchas debe salir con versiones = 1.
select p.proname as funcion, count(*) as versiones,
       string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname like 'v2_cancha%' or p.proname like 'cancha_%' or p.proname like 'comprobante%' or p.proname like 'avisame%')
 group by p.proname
 order by versiones desc, p.proname;
