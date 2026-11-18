-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · sus 8 barberos, con 50 % de comisión (18-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   La lista es la de su sistema anterior. Quedan en Equipo, activos, con su 50 %: desde ya
--   «Cobrar ticket» los muestra para elegir quién atendió y Comisiones los cuenta.
--   · Si alguno ya existe con ese nombre (sin importar mayúsculas), no se duplica: solo se le
--     pone el 50 % y se reactiva.
--   · No crea sus cuentas para entrar al panel: eso es Ajustes › Acceso del equipo, con el
--     correo de cada uno, y enlazar su ficha.
--   · Sin sede: el aforo sigue siendo por sillas de cada sede.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create temp table t247_barberos (id text, nombre text) on commit drop;
insert into t247_barberos values
    ('t247-e-alexander', 'Alexander'),
    ('t247-e-brandy',    'Brandy'),
    ('t247-e-chino',     'Chino'),
    ('t247-e-elvis',     'Elvis'),
    ('t247-e-nicolas',   'Nicolás'),
    ('t247-e-paul',      'Paul'),
    ('t247-e-rayan',     'Rayan'),
    ('t247-e-victor',    'Víctor');

-- Los que ya estaban (mismo nombre, con o sin tilde ni mayúsculas): 50 % y activos.
update public.employees e
   set comision_pct = 50, is_active = 1
  from t247_barberos b
 where e.company_id = 'the247barbershop'
   and translate(lower(btrim(e.name)), 'áéíóú', 'aeiou') = translate(lower(b.nombre), 'áéíóú', 'aeiou');

insert into public.employees (id, company_id, name, is_active, comision_pct)
select b.id, 'the247barbershop', b.nombre, 1, 50
  from t247_barberos b
 where not exists (
        select 1 from public.employees e
         where e.company_id = 'the247barbershop'
           and (e.id = b.id or translate(lower(btrim(e.name)), 'áéíóú', 'aeiou') = translate(lower(b.nombre), 'áéíóú', 'aeiou')));

commit;

-- Comprobación: los 8, activos, con 50 %.
select name, is_active, comision_pct from public.employees where company_id = 'the247barbershop' order by name;
