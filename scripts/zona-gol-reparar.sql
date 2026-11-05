-- ═══════════════════════════════════════════════════════════════════════════════
-- REPARAR · página de Zona Gol en 404 y «Avísame» con función duplicada (5-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Se corre entero en el editor SQL. No borra datos de nadie. Al final sale UNA fila:
--   negocio = 1, pagina = 1, publicada = true, versiones_ocupada = 1  → todo bien.
--   negocio = 0  → Zona Gol se borró (se corrió zona-gol-demo-deshacer.sql): corre otra
--                  vez scripts/zona-gol-demo.sql con el celular y el titular rellenados.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- 1 · La v2_cancha_ocupada de 4 argumentos (fuera del repo) que rompe «Avísame».
--     La buena, de 5 con el último opcional, se queda.
do $$
begin
    if to_regprocedure('public.v2_cancha_ocupada(text, text, text, text, text)') is not null then
        drop function if exists public.v2_cancha_ocupada(text, text, text, text);
    end if;
end $$;

-- 2 · Si la página existe pero quedó sin publicar, se publica.
update public.tu_pagina set publicada = true where slug = 'zona-gol' and not publicada;

commit;

notify pgrst, 'reload schema';

-- 3 · Qué hay ahora.
select (select count(*) from public.companies where id = 'zona-gol')               as negocio,
       (select count(*) from public.tu_pagina where slug = 'zona-gol')             as pagina,
       (select publicada from public.tu_pagina where slug = 'zona-gol')            as publicada,
       (select count(*) from public.appointments where company_id = 'zona-gol')    as reservas,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'v2_cancha_ocupada')           as versiones_ocupada;
