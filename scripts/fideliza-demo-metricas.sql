-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · MÉTRICAS DE DEMO para `vendemia` (club de hamburguesas) y `mara-beauty-studio`
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 8-nov-2026 para la demo de un restaurante: que la pestaña
-- Fideliza → Números se vea viva (leads, quién viene, quién dejó de venir, ticket, premios).
-- Se corre entero en el editor SQL de Supabase. No hay nada que rellenar.
--
-- Deja, en cada negocio, unos seis meses de historia INVENTADA:
--   · Clientes de todos los grupos: fieles, regulares, atrasados, dormidos, «no regresaron»,
--     recuperados (volvieron tras más de 60 días), nuevos y leads (crearon su tarjeta y aún no compran).
--   · Compras con importe (el ticket del que vuelve sale algo mayor que el de la primera vez),
--     sellos, premios ganados y canjeados en la visita siguiente, y algunos por canjear.
--   · Aperturas de la página «Únete» (QR y placa) para el embudo de leads.
--   · Restaurante: más movimiento viernes y sábado por la noche y algo al mediodía.
--     Salón: de 10 a 19 h, con los sábados más llenos.
--
-- VENDEMIA: si no tiene club, crea «Club Burger» (8 sellos = una hamburguesa clásica gratis,
-- icono de hamburguesa, diseño Vibrante). Si ya tiene uno, lo usa tal cual y no le cambia nada.
-- MARA: usa el «Club Mara» que ya existe (6 sellos) y le suma clientas. Las 10 de antes se quedan.
--
-- Todo lo sembrado lleva la marca `seed-fzm-` (tarjetas, operaciones, canjes) o
-- detail.seed = 'fzm' (aperturas). Las tarjetas van sin teléfono ni correo: nadie recibe nada.
-- Se niega a correr si ya hay una siembra en alguno de los dos negocios.
-- Deshacer: scripts/fideliza-demo-metricas-deshacer.sql (quita solo lo sembrado).
--
-- ⚠️ Para poner las fechas en el pasado, el libro de puntos (loyalty_ledger, que no se edita)
-- se abre solo dentro de esta transacción y SOLO para las filas sembradas, igual que
-- hace mara-beauty-demo-deshacer.sql. Si algo falla, no queda nada escrito.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── La siembra de un negocio ─────────────────────────────────────────────────────
create or replace function pg_temp.fzm_sembrar(p_company text, p_rubro text, p_nombres text[], p_plan jsonb)
returns integer language plpgsql as $$
declare
    v_hoy      date := (now() at time zone 'America/Lima')::date;
    v_seg      text;
    v_cant     integer;
    v_i        integer := 0;
    v_n        integer;     -- visitas de esta persona
    v_ritmo    integer;     -- días entre visitas
    v_ultima   integer;     -- hace cuántos días vino por última vez
    v_dias     integer[];
    v_ts       timestamptz[];
    v_monto    bigint;
    v_alta     timestamptz;
    v_r        jsonb;
    v_m        uuid;
    v_tx       uuid;
    v_d        integer;
    v_dow      integer;
    v_hora     integer;
    v_t        timestamptz;
    v_k        integer;
    v_premio   record;
    v_sig      timestamptz;
    v_abren    integer;
    v_nombre   text;
    rest       constant boolean := p_rubro = 'restaurante';
begin
    for v_seg, v_cant in select key, value::integer from jsonb_each_text(p_plan) loop
        for c in 1 .. v_cant loop
            v_i := v_i + 1;
            v_nombre := p_nombres[1 + (v_i - 1) % array_length(p_nombres, 1)];

            -- 1 · Cuántas veces vino y cada cuánto, según su grupo.
            v_ritmo := case when rest then 7 else 18 end;
            case v_seg
                when 'fieles' then
                    v_ritmo := case when rest then 5 + floor(random() * 5) else 14 + floor(random() * 8) end;
                    v_n := case when rest then 6 + floor(random() * 7) else 5 + floor(random() * 4) end;
                    v_ultima := floor(random() * v_ritmo);
                when 'regulares' then
                    v_ritmo := case when rest then 10 + floor(random() * 11) else 20 + floor(random() * 16) end;
                    v_n := 2 + floor(random() * 3);
                    v_ultima := floor(random() * v_ritmo);
                when 'atrasados' then
                    v_ritmo := case when rest then 7 + floor(random() * 4) else 14 + floor(random() * 7) end;
                    v_n := 3 + floor(random() * 3);
                    v_ultima := greatest(16, ceil(v_ritmo * 1.6)::integer) + floor(random() * greatest(1, v_ritmo));
                    v_ultima := least(v_ultima, v_ritmo * 3 - 1, 85);
                when 'dormidos' then
                    v_ritmo := 10 + floor(random() * 11);
                    v_n := 2 + floor(random() * 3);
                    v_ultima := 95 + floor(random() * 50);
                when 'no_regresaron' then
                    -- Casi todos de hace 1 a 3 meses: es lo que baja «Regresan» a una cifra creíble.
                    v_n := 1;
                    v_ultima := 31 + floor(random() * case when random() < 0.8 then 60 else 120 end);
                when 'recuperados' then
                    -- Venían, dejaron de venir más de dos meses y volvieron hace poco (abajo).
                    v_ritmo := 8 + floor(random() * 7);
                    v_n := 3;
                    v_ultima := 80 + floor(random() * 30);
                when 'nuevos' then
                    v_n := 1;
                    v_ultima := floor(random() * 28);
                else -- leads: crearon su tarjeta y aún no compran
                    v_n := 0;
                    v_ultima := floor(random() * 45);
            end case;

            -- 2 · Los días (de la más antigua a la última) y la hora de cada visita.
            v_dias := '{}';
            for k in reverse v_n - 1 .. 0 loop
                v_d := v_ultima + k * v_ritmo + case when k > 0 then floor(random() * 3)::integer - 1 else 0 end;
                -- En un restaurante, casi la mitad de las salidas caen en viernes o sábado.
                v_dow := extract(isodow from v_hoy - v_d)::integer;  -- 1 = lunes … 7 = domingo
                if rest and random() < 0.45 and v_dow not in (5, 6) then
                    v_d := v_d + ((v_dow - 6 + 7) % 7);           -- al sábado anterior
                end if;
                if not rest and random() < 0.30 and v_dow <> 6 then
                    v_d := v_d + ((v_dow - 6 + 7) % 7);
                end if;
                v_dias := v_dias || v_d;
            end loop;
            if v_seg = 'recuperados' then v_dias := v_dias || (2 + floor(random() * 20))::integer; end if;
            v_ts := '{}';
            foreach v_d in array v_dias loop
                v_dow := extract(isodow from v_hoy - v_d)::integer;
                if rest then
                    v_hora := case when v_dow in (5, 6) and random() < 0.8 then 19 + floor(random() * 4)
                                   when random() < 0.5 then 12 + floor(random() * 3)
                                   else 19 + floor(random() * 3) end;
                else
                    v_hora := case when v_dow = 6 then 10 + floor(random() * 8) else 11 + floor(random() * 8) end;
                end if;
                v_t := ((v_hoy - v_d)::timestamp + make_interval(hours => v_hora, mins => floor(random() * 60)::integer))
                       at time zone 'America/Lima';
                if v_t > now() then v_t := now() - make_interval(mins => 15 + floor(random() * 90)::integer); end if;
                if array_length(v_ts, 1) is not null and v_t <= v_ts[array_length(v_ts, 1)] then
                    v_t := v_ts[array_length(v_ts, 1)] + interval '1 day';
                    if v_t > now() then v_t := now() - interval '5 minutes'; end if;
                end if;
                v_ts := v_ts || v_t;
            end loop;

            -- Se une al llegar por primera vez (unos minutos antes de pagar), o sin comprar.
            v_alta := case when v_n > 0 then v_ts[1] - make_interval(mins => 3 + floor(random() * 15)::integer)
                           else ((v_hoy - v_ultima)::timestamp + make_interval(hours => 12 + floor(random() * 9)::integer))
                                at time zone 'America/Lima' end;
            if v_alta > now() then v_alta := now() - interval '30 minutes'; end if;

            -- 3 · La tarjeta y sus compras, con las mismas funciones que la Caja.
            v_r := public.loyalty_member_create(p_company, v_nombre, null, null, false,
                                                'seed-fzm-' || p_company || '-' || v_i, 'panel');
            v_m := (v_r ->> 'member_id')::uuid;
            v_k := 0;
            foreach v_t in array v_ts loop
                v_k := v_k + 1;
                v_monto := case
                    when rest and v_k = 1 then (18 + floor(random() * 21)) * 100 + case when random() < 0.5 then 50 else 0 end
                    when rest then (24 + floor(random() * 32)) * 100 + case when random() < 0.5 then 50 else 0 end
                    when v_k = 1 then (7 + floor(random() * 10)) * 500
                    else (9 + floor(random() * 16)) * 500 end;
                v_r := public.loyalty_record(p_company, v_m, 'purchase', v_monto, null, null,
                                             'seed-fzm-' || p_company || '-' || v_i || '-' || v_k, 'caja');
                v_tx := (v_r ->> 'transaction_id')::uuid;
                update public.loyalty_transactions set created_at = v_t where id = v_tx;
                update public.loyalty_ledger set created_at = v_t where transaction_id = v_tx;
                update public.loyalty_rewards set issued_at = v_t where source_transaction_id = v_tx;
            end loop;

            -- 4 · El premio se canjea en la visita siguiente; el último ganado puede quedar por canjear.
            for v_premio in select r.id, r.issued_at from public.loyalty_rewards r
                             where r.member_id = v_m and r.status = 'available' order by r.issued_at loop
                select min(t) into v_sig from unnest(v_ts) t where t > v_premio.issued_at;
                continue when v_sig is null;
                perform public.loyalty_redeem(p_company, v_m, v_premio.id, null, 'seed-fzm-r-' || v_premio.id);
                update public.loyalty_rewards set redeemed_at = v_sig + interval '2 minutes' where id = v_premio.id;
                update public.loyalty_redemptions set created_at = v_sig + interval '2 minutes' where reward_id = v_premio.id;
            end loop;

            -- 5 · Fechas de la tarjeta: alta y primera/última compra en el pasado. Se unió desde el QR.
            update public.loyalty_members
               set created_at = v_alta, joined_via = 'public',
                   first_op_at = (select min(t.created_at) from public.loyalty_transactions t where t.member_id = v_m),
                   last_op_at = (select max(t.created_at) from public.loyalty_transactions t where t.member_id = v_m),
                   updated_at = greatest(v_alta, coalesce((select max(t.created_at) from public.loyalty_transactions t where t.member_id = v_m), v_alta))
             where id = v_m;

            -- 6 · Lo que vio antes de unirse: abrió la placa o el QR y la página «Únete».
            insert into public.loyalty_public_events (company_id, member_id, kind, source, detail, created_at)
            values (p_company, null, 'device_open', case when random() < 0.6 then 'qr' else 'nfc' end, '{"seed":"fzm"}', v_alta - interval '2 minutes'),
                   (p_company, null, 'join_view', null, '{"seed":"fzm"}', v_alta - interval '1 minute'),
                   (p_company, v_m, 'join', null, '{"seed":"fzm"}', v_alta);
        end loop;
    end loop;

    -- Quien abrió «Únete» y no se registró: un 60 % más de aperturas, repartidas en 6 meses.
    v_abren := ceil(v_i * 0.6);
    for k in 1 .. v_abren loop
        v_t := now() - make_interval(days => floor(random() * 180)::integer, hours => floor(random() * 10)::integer);
        insert into public.loyalty_public_events (company_id, kind, source, detail, created_at)
        values (p_company, 'device_open', case when random() < 0.6 then 'qr' else 'nfc' end, '{"seed":"fzm"}', v_t - interval '1 minute'),
               (p_company, 'join_view', null, '{"seed":"fzm"}', v_t);
    end loop;
    return v_i;
end $$;

-- ── Los dos negocios ─────────────────────────────────────────────────────────────
do $$
declare
    v_email   constant text := 'subovideodetodo@gmail.com';   -- dueña de `vendemia` y de `mara-beauty-studio`
    v_user    uuid;
    v_prog    uuid;
    v_slug    text;
    v_n       integer;
begin
    perform setseed(0.811);   -- mismos datos cada vez que se corre desde cero
    select id into v_user from auth.users where lower(email) = lower(v_email);
    if v_user is null then raise exception 'No existe la cuenta %.', v_email; end if;
    if not exists (select 1 from public.companies where id = 'vendemia') then raise exception 'No existe el negocio vendemia.'; end if;
    if not exists (select 1 from public.companies where id = 'mara-beauty-studio') then
        raise exception 'No existe mara-beauty-studio: corre antes scripts/mara-beauty-demo.sql.';
    end if;
    if exists (select 1 from public.loyalty_members where creation_key like 'seed-fzm-%') then
        raise exception 'Ya hay una siembra (seed-fzm-). Para empezar de cero, corre antes scripts/fideliza-demo-metricas-deshacer.sql.';
    end if;

    -- Actuar como la dueña: las funciones del panel comprueban sus permisos.
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

    alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;

    -- ── VENDEMIA · club de hamburguesas, si aún no tiene ───────────────────────────
    if public.loyalty_live_program('vendemia') is null or (public.loyalty_live_program('vendemia')).id is null then
        if not exists (select 1 from public.loyalty_settings where company_id = 'vendemia') then
            v_slug := 'vendemia';
            if exists (select 1 from public.loyalty_settings where slug = v_slug) then v_slug := 'club-vendemia'; end if;
            perform public.loyalty_settings_save('vendemia', jsonb_build_object(
                'slug', v_slug, 'display_name', 'Vendemia Burger', 'tagline', 'Junta sellos y la próxima va por la casa', 'bg_color', '#E4572E'));
        end if;
        -- Solo el sello y el diseño de la tarjeta; lo demás de su página, como estaba.
        perform public.loyalty_page_style_save('vendemia',
            coalesce((select s.page_style from public.loyalty_settings s where s.company_id = 'vendemia'), '{}'::jsonb)
            || jsonb_build_object('sello', 'hamburguesa', 'tarjeta', 'viva'));
        v_prog := public.loyalty_program_save('vendemia', null, 'Club Burger', 'Un sello por cada compra. Al octavo, invitamos nosotros.', 'repeat',
            jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 8,
                               'reward_description', 'una hamburguesa clásica gratis'));
        perform public.loyalty_program_publish('vendemia', v_prog);
        raise notice 'vendemia: creado «Club Burger» (8 sellos).';
    else
        raise notice 'vendemia: ya tenía club; se usa tal cual.';
    end if;

    v_n := pg_temp.fzm_sembrar('vendemia', 'restaurante', array[
        'Luis Ramírez', 'Carla Mendoza', 'Jorge Quispe', 'Ana Torres', 'Diego Flores', 'Sofía Vargas', 'Renato Chávez',
        'Valeria Rojas', 'Bruno Castillo', 'Lucía Huamán', 'Martín Salazar', 'Paola Gutiérrez', 'Kevin Paredes',
        'Daniela León', 'Óscar Delgado', 'Mariana Ríos', 'Sebastián Cruz', 'Fernanda Soto', 'Andrés Medina',
        'Camila Romero', 'Piero Espinoza', 'Gianella Ruiz', 'Rodrigo Vega', 'Alexandra Campos', 'Joaquín Herrera',
        'Natalia Silva', 'Franco Aguilar', 'Rosa Cárdenas', 'Mateo Navarro', 'Ximena Palacios', 'Gustavo Lozano',
        'Milagros Ortiz', 'César Ramos', 'Brenda Peña', 'Hugo Tapia', 'Andrea Molina', 'Iván Fuentes', 'Karen Vásquez',
        'Raúl Benites', 'Diana Arias', 'Marco Zevallos', 'Jimena Bustamante', 'Álvaro Córdova', 'Nicole Pinto',
        'Eduardo Rivas', 'Patricia Muñoz', 'Gabriel Salas', 'Melissa Cabrera', 'Javier Montes', 'Claudia Ibarra',
        'Fabio Coronado', 'Lorena Villanueva', 'Samuel Ponce', 'Tatiana Rosales', 'Enzo Becerra', 'Pamela Gallardo',
        'Ricardo Málaga', 'Estefany Luna', 'Walter Sánchez', 'Yesenia Quiroz', 'Adrián Neyra', 'Silvia Prado',
        'Cristian Alva', 'Mónica Ugarte', 'Tomás Rengifo', 'Elena Saavedra', 'Josué Mori', 'Kiara Albújar'],
        '{"fieles": 12, "regulares": 14, "atrasados": 9, "dormidos": 8, "no_regresaron": 22, "recuperados": 4, "nuevos": 9, "leads": 12}');
    raise notice 'vendemia: % tarjetas sembradas.', v_n;

    -- ── MARA · más clientas en el «Club Mara» que ya existe ────────────────────────
    if (public.loyalty_live_program('mara-beauty-studio')).id is null then
        raise exception 'mara-beauty-studio no tiene el club activo: corre antes scripts/mara-beauty-demo.sql.';
    end if;
    v_n := pg_temp.fzm_sembrar('mara-beauty-studio', 'salon', array[
        'Jimena Salazar', 'Patricia León', 'Nicole Gutiérrez', 'Mariela Torres', 'Ximena Delgado', 'Gabriela Ramos',
        'Alessandra Pinto', 'Fátima Cueva', 'Brenda Ochoa', 'Melany Rivera', 'Yuliana Ccori', 'Stephanie Lazo',
        'Katherine Ayala', 'Rocío Marín', 'Pierina Solís', 'Angie Cárdenas', 'Lizbeth Vílchez', 'Mayra Condori',
        'Leslie Miranda', 'Allison Valdivia', 'Carolina Tello', 'Yadira Poma', 'Diana Rojas', 'Evelyn Chumpitaz',
        'Liliana Ñique', 'Briggitte Campos', 'Susana Mamani', 'Mirella Choque', 'Thalía Beltrán', 'Vanessa Ugaz',
        'Cinthya Barrios', 'Pamela Inga', 'Romina Arce', 'Lady Cahuana', 'Erika Laura', 'Noelia Pacheco',
        'Sheyla Tupac', 'Kimberly Flores', 'Dayana Vera', 'Ruth Llanos', 'Zully Huerta', 'Antonella Pérez',
        'Karla Sifuentes', 'Wendy Salcedo', 'Abigail Cornejo', 'Mía Espinoza', 'Joel Medina', 'Fabiola Ríos'],
        '{"fieles": 8, "regulares": 11, "atrasados": 7, "dormidos": 6, "no_regresaron": 12, "recuperados": 3, "nuevos": 5, "leads": 7}');
    raise notice 'mara-beauty-studio: % tarjetas sembradas.', v_n;

    alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;

    -- La cuenta de cada tarjeta debe cuadrar con su libro (balance = suma del ledger).
    if exists (select 1 from public.loyalty_members m
                where m.creation_key like 'seed-fzm-%'
                  and m.balance <> coalesce((select sum(l.units) from public.loyalty_ledger l where l.member_id = m.id), 0)) then
        raise exception 'Una tarjeta sembrada no cuadra con su libro: no se guarda nada.';
    end if;
end $$;

commit;

-- Comprobación: una fila por negocio.
select c.id,
       (select p.name from public.loyalty_programs p where p.company_id = c.id and p.status = 'active' limit 1) as club,
       (select count(*) from public.loyalty_members m where m.company_id = c.id) as tarjetas,
       (select count(*) from public.loyalty_members m where m.company_id = c.id and m.creation_key like 'seed-fzm-%') as sembradas,
       (select count(*) from public.loyalty_members m where m.company_id = c.id and m.creation_key like 'seed-fzm-%' and m.ops_count = 0) as leads_sin_compra,
       (select count(*) from public.loyalty_transactions t where t.company_id = c.id and t.idempotency_key like 'seed-fzm-%') as compras,
       (select count(*) from public.loyalty_rewards r where r.company_id = c.id and r.status = 'redeemed') as premios_canjeados,
       (select count(*) from public.loyalty_rewards r where r.company_id = c.id and r.status = 'available') as premios_por_canjear,
       (select min(m.created_at)::date from public.loyalty_members m where m.company_id = c.id and m.creation_key like 'seed-fzm-%') as desde
  from public.companies c
 where c.id in ('vendemia', 'mara-beauty-studio');
