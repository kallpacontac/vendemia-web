-- «Mi página» vive en tienda.vendemias.com y Fideliza en fideliza.vendemias.com.
-- Sus direcciones pertenecen a espacios distintos, por lo que una empresa puede
-- usar el mismo slug en ambos productos. `vendemia` tampoco es una ruta interna
-- de la tienda y no debe aparecer como ocupada solo por ser el nombre de marca.
--
-- La unicidad de public.tu_pagina.slug continúa impidiendo que dos empresas
-- diferentes usen la misma dirección dentro de tienda.vendemias.com. La RPC
-- tu_pagina_slug_libre ya excluye de esa comprobación a la propia empresa.

create or replace function public.tu_pagina_slug_reservado(p text)
returns boolean language sql immutable as $$
    select p = any(array['panel', 'api', 'admin', 'login', 'acceso', 'ayuda', 'soporte', 'pide', 'tienda', 'agenda', 'tu-pagina',
                         'vendemias', 'mia', 'fideliza', 'www', 'app', 'static', 'assets', 'cuenta', 'precios',
                         'legal', 'privacidad', 'terminos', 'blog', 'guias', 'nuevo', 'demo', 'test']);
$$;
