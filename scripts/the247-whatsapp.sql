-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · el WhatsApp de la empresa es +51 914 440 960 (17-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   En el alta se puso 914 440 860 (el de su post de «Reservas»). Alvaro confirmó el 960.
--   Cambia: el botón de WhatsApp de la página (tu_pagina.whatsapp) y el WhatsApp del negocio
--   (companies.whatsapp_phone, y owner_phone si era ese mismo número). El Yape (902 318 120) no se toca.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

update public.companies
   set whatsapp_phone = '51914440960',
       owner_phone    = case when owner_phone in ('51914440860', '914440860', '') or owner_phone is null then '51914440960' else owner_phone end
 where id = 'the247barbershop';

update public.tu_pagina set whatsapp = '51914440960' where company_id = 'the247barbershop';

commit;

-- Comprobación: todo con 960.
select c.whatsapp_phone, c.owner_phone, p.whatsapp as pagina
  from public.companies c join public.tu_pagina p on p.company_id = c.id
 where c.id = 'the247barbershop';
