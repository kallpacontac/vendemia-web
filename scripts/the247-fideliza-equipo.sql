-- The 24/7 (20-nov-2026, Alvaro, urgente): «activa Fideliza para los empleados también».
-- Deshace lo que dejó la 0022 de datos (equipo_fideliza = false). Es lo mismo que el interruptor
-- de Ajustes › Orden del menú › «¿Tu equipo ve Fideliza?». En Fideliza el empleado es «cajero»:
-- registra clientes, suma sellos y canjea; no edita el club ni ve números ni campañas.

insert into public.menu_ajustes (company_id, equipo_fideliza)
values ('the247barbershop', true)
on conflict (company_id) do update set equipo_fideliza = true, updated_at = now();

-- Comprobación: true.
select company_id, equipo_fideliza from public.menu_ajustes where company_id = 'the247barbershop';
