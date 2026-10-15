import 'server-only';
/**
 * Tu página usa la misma fontanería de servidor que Fideliza: la clave anon + la
 * cabecera x-fideliza-key, que solo abre las funciones *_srv_* (Postgres la
 * comprueba con loyalty_srv_check), y el límite por cubo (loyalty_srv_rate_hit).
 * Es infraestructura común, no funcionalidad de Fideliza: Tu página no lee ni
 * escribe nada suyo.
 */
export { servidor, rpc, ErrorRpc } from '@/modules/fideliza/servidor/supabase';
export { limitar, huellaIp, log } from '@/modules/fideliza/servidor/http';
