-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · sus 28 productos (bebidas y de barbería), con precio y costo (18-nov-2026).
-- Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   La lista es la de su sistema anterior. Quedan en el Catálogo como PRODUCTO (no se agendan:
--   se venden en «Cobrar ticket» o con «+ Agregar» en «Listos para cobrar»), agrupados por
--   familia («Bebidas», «Productos de barbería»).
--   · El costo va a catalogo_costos: así Reportes calcula lo que se gana por unidad.
--   · Sin control de stock (stock = null): ponlo en el Catálogo si quieren contarlo.
--   · Si ya existe (mismo id), se actualizan precio, costo y familia.
--   · Corregido al copiar: «Sa Luis sin gas» → «San Luis sin gas».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create temp table t247_prod (id text, nombre text, familia text, precio numeric, costo numeric, orden int) on commit drop;
insert into t247_prod values
    ('t247-p-agua-sol',         'Agua Sol',               'Bebidas',  1.00,  0.70, 101),
    ('t247-p-pilsen',           'Cerveza Pilsen',         'Bebidas',  5.00,  4.20, 102),
    ('t247-p-cristal',          'Cerveza Cristal',        'Bebidas',  5.00,  4.20, 103),
    ('t247-p-negra-malta',      'Cerveza negra malta',    'Bebidas',  5.50,  5.00, 104),
    ('t247-p-trigo',            'Cerveza de trigo',       'Bebidas',  5.50,  5.00, 105),
    ('t247-p-cielo-con-gas',    'Cielo con gas',          'Bebidas',  1.50,  1.00, 106),
    ('t247-p-cielo-sin-gas',    'Cielo sin gas',          'Bebidas',  1.50,  0.90, 107),
    ('t247-p-coca-cola',        'Coca Cola',              'Bebidas',  3.00,  2.20, 108),
    ('t247-p-corona',           'Corona',                 'Bebidas',  6.00,  5.20, 109),
    ('t247-p-electrolight',     'Electrolay',             'Bebidas',  2.00,  1.50, 110),
    ('t247-p-fanta',            'Fanta',                  'Bebidas',  2.00,  1.60, 111),
    ('t247-p-frugos',           'Frugos Valle',           'Bebidas',  2.00,  1.60, 112),
    ('t247-p-guaranita',        'Guaranita 300 ml',       'Bebidas',  1.50,  0.90, 113),
    ('t247-p-inca-kola',        'Inca Kola',              'Bebidas',  3.00,  2.20, 114),
    ('t247-p-power',            'Power azul/rojo 500 ml', 'Bebidas',  3.00,  2.20, 115),
    ('t247-p-pulp-250',         'Pulp 250 ml',            'Bebidas',  2.00,  1.20, 116),
    ('t247-p-pulpin-150',       'Pulpín 150 ml',          'Bebidas',  1.00,  0.70, 117),
    ('t247-p-san-luis-sin-gas', 'San Luis sin gas',       'Bebidas',  2.00,  1.50, 118),
    ('t247-p-san-luis-con-gas', 'San Luis con gas',       'Bebidas',  2.00,  1.50, 119),
    ('t247-p-sporade',          'Sporade 500 ml',         'Bebidas',  3.00,  2.20, 120),
    ('t247-p-spray',            'Spray',                  'Bebidas',  2.00,  1.50, 121),
    ('t247-p-volt',             'Volt',                   'Bebidas',  3.00,  2.20, 122),
    ('t247-p-cera-amarilla',    'Cera amarilla',          'Productos de barbería', 25.00, 21.00, 201),
    ('t247-p-cera-dorada',      'Cera dorada',            'Productos de barbería', 25.00, 20.00, 202),
    ('t247-p-cera-spider',      'Cera Spider',            'Productos de barbería', 25.00, 20.00, 203),
    ('t247-p-gel-150',          'Gel Rolda 150 ml',       'Productos de barbería', 10.00,  7.00, 204),
    ('t247-p-gel-250',          'Gel Rolda 250 ml',       'Productos de barbería', 15.00, 12.00, 205),
    ('t247-p-gel-500',          'Gel Rolda 500 ml',       'Productos de barbería', 25.00, 20.00, 206);

update public.catalog k
   set name = t.nombre, price = t.precio, familia = t.familia, tipo = 'producto', is_active = 1, sort_order = t.orden,
       updated_at = extract(epoch from now())::bigint
  from t247_prod t
 where k.company_id = 'the247barbershop' and k.id = t.id;

insert into public.catalog (id, company_id, name, description, price, duration_minutes, is_active, sort_order, familia, tipo, stock)
select t.id, 'the247barbershop', t.nombre, '', t.precio, 0, 1, t.orden, t.familia, 'producto', null
  from t247_prod t
 where not exists (select 1 from public.catalog k where k.company_id = 'the247barbershop' and k.id = t.id);

insert into public.catalogo_costos (catalog_id, company_id, costo)
select t.id, 'the247barbershop', t.costo from t247_prod t
on conflict (catalog_id) do update set costo = excluded.costo, cambiada_at = now();

commit;

-- Comprobación: 22 bebidas y 6 de barbería, con su costo.
select k.familia, count(*) as productos, count(c.costo) as con_costo
  from public.catalog k left join public.catalogo_costos c on c.catalog_id = k.id
 where k.company_id = 'the247barbershop' and k.tipo = 'producto' and k.id like 't247-p-%'
 group by k.familia order by k.familia;
