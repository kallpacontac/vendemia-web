/**
 * Entrar con el CELULAR en vez del correo (18-nov-2026, The 24/7: «las cuentas de los barberos
 * con su número nomás»). Supabase entra por correo, así que cada cuenta de barbero tiene un
 * correo interno hecho con su celular: `987654321@equipo.vendemias.com`. Nunca recibe nada
 * (se crea ya confirmado, ver scripts/the247-cuentas-barberos.sql); solo es su usuario.
 *
 * Si lo escrito son solo números (con espacios, guiones o el +51 delante), es un celular: se
 * convierte en ese correo. Si lleva @, es un correo y se deja tal cual.
 */
export const DOMINIO_EQUIPO = 'equipo.vendemias.com';

export function usuarioACorreo(escrito: string): string {
  const t = escrito.trim();
  if (t.includes('@')) return t;
  const d = t.replace(/[\s()+-]/g, '');
  if (/^\d{9,12}$/.test(d)) return `${d.slice(-9)}@${DOMINIO_EQUIPO}`;
  return t;
}
