-- Deshace modules/tu-pagina/sql/0017_pago_de_cancha.sql. Los pagos ya registrados se quedan en
-- pending_payments; solo se pierde la lista de comprobantes por revisar.
begin;
drop function if exists public.cancha_validar_pago(text, text, numeric, text);
drop function if exists public.comprobante_revisar(text, uuid, text, numeric, text);
drop function if exists public.comprobantes_panel(text);
drop function if exists public.comprobante_srv_registrar(text, text, text, jsonb);
drop function if exists public.comprobante_srv_repetido(text, text, text, text);
drop function if exists public.comprobante_srv_buscar(text, text, text);
drop function if exists public.v2_comprobante_aplicar(public.appointments, numeric, text, text, text, text, text);
drop function if exists public.v2_comprobante_cita(text, text, text);
drop table if exists public.comprobantes_web;
drop function if exists public.tu_pagina_srv_pago(text);
commit;
