/**
 * Los errores de las funciones de Postgres llegan como `loyalty:<código>`.
 * Aquí se traducen a algo que se pueda enseñar en la caja o en el panel. Un
 * código que no esté en la lista sale como «No se pudo completar»: nunca el
 * texto crudo de Postgres, que habla del esquema.
 */
export const MENSAJES: Record<string, string> = {
  forbidden: 'Tu usuario no tiene permiso para esto.',
  forbidden_location: 'Tu usuario no puede operar en esa sucursal.',
  forbidden_demo_class: 'Solo el equipo de Vendemia puede usar la tarjeta de demostración.',
  server_key: 'El servidor de Fideliza no está configurado (falta la clave del servidor).',
  not_found: 'No existe o ya no está disponible.',
  invalid_phone: 'Ese teléfono no parece válido.',
  invalid_email: 'Ese correo no parece válido.',
  invalid_url: 'El enlace tiene que empezar por https:// y no puede apuntar a otra placa.',
  invalid_settings: 'Revisa los datos del negocio: alguno no es válido.',
  slug_taken: 'Esa dirección ya la usa otro negocio. Prueba con otra.',
  settings_missing: 'Primero completa los datos del negocio (paso 1).',
  invalid_location: 'Esa sucursal no existe o está desactivada.',
  location_name_taken: 'Ya hay una sucursal con ese nombre.',
  not_a_member: 'Esa persona no pertenece a este negocio (o es propietaria).',
  invalid_program: 'Revisa el nombre y la descripción del programa.',
  invalid_rule: 'La regla no está completa o tiene un valor fuera de rango.',
  rule_type_locked:
    'No se puede cambiar el tipo de regla de un programa publicado: los saldos dejarían de significar lo mismo. Crea un programa nuevo.',
  another_program_live: 'Ya hay otro programa activo o pausado en este negocio.',
  program_not_published: 'Ese programa todavía no se ha publicado.',
  program_not_active: 'El programa no está activo: no se pueden registrar operaciones.',
  program_expired: 'La regla del programa venció. Publica una nueva para seguir acumulando.',
  member_not_found: 'No encontramos esa tarjeta en este negocio.',
  member_inactive: 'Esa tarjeta está suspendida o dada de baja.',
  member_create_replayed: 'Esa tarjeta ya se creó.',
  join_replayed: 'Tu tarjeta ya se creó.',
  code_generation_failed: 'No se pudo generar el código. Inténtalo otra vez.',
  invalid_kind: 'Tipo de operación no válido.',
  kind_mismatch: 'Este programa no acumula con ese tipo de operación.',
  invalid_amount: 'El importe no es válido.',
  amount_required: 'Este programa da puntos por gasto: indica el importe.',
  external_ref_required: 'Este negocio exige el número de comprobante.',
  duplicate_reference: 'Ese comprobante ya se registró. No se sumó otra vez.',
  idempotency_conflict: 'Esa operación ya se envió con otros datos. Vuelve a empezar.',
  location_not_participating: 'Esa sucursal no participa en el programa.',
  no_reward_available: 'No hay premio disponible para canjear.',
  reward_expired: 'Ese premio venció.',
  already_refunded: 'Esa operación ya se devolvió entera.',
  partial_refund_not_supported: 'La devolución parcial solo existe en programas de puntos por gasto.',
  reason_required: 'Escribe el motivo (mínimo 3 letras).',
  invalid_units: 'Cantidad no válida.',
  insufficient_balance: 'El saldo quedaría en negativo.',
  contact_missing: 'Ese cliente no tiene ese dato.',
  invalid_status: 'Estado no válido.',
  invalid_source: 'Origen no válido.',
  invalid_links: 'Revisa los enlaces: alguno no es válido.',
  empty_profile_in_use:
    'Hay placas activas usando este perfil y se quedarían sin destino. Añade un enlace o confirma que quieres dejarlas sin destino.',
  invalid_device: 'Revisa la sucursal y el perfil de la placa.',
  invalid_activation_code: 'Ese código de activación no es válido o ya se usó.',
  device_no_destination: 'La placa necesita un perfil con al menos un enlace publicado.',
  device_retired: 'Esa placa está retirada.',
  invalid_count: 'Cantidad no válida (1 a 500).',
  invalid_campaign: 'Revisa el título y el texto del mensaje.',
  invalid_campaign_config: 'Revisa los días y el tope de mensajes.',
  invalid_range: 'Rango de fechas no válido.',
  consent_required: 'Primero hay que aceptar recibir avisos.',
  invalid_channel: 'Canal no válido.',
  invalid_action: 'Acción no válida.',
  wallet_class_missing: 'El programa todavía no tiene tarjeta de Google Wallet. Publícalo primero.',
  wallet_not_configured: 'Google Wallet no está configurado en este servidor.',
  rate_limited: 'Demasiados intentos seguidos. Espera un momento.',
  invalid_input: 'Faltan datos o alguno no es válido.',
  unauthenticated: 'Tu sesión caducó. Vuelve a entrar.',
};

export function codigoDe(mensaje: string | undefined | null): string | null {
  const m = /loyalty:([a-z_]+)/.exec(mensaje ?? '');
  return m ? m[1] : null;
}

export function mensajeDe(codigo: string | null | undefined): string {
  return (codigo && MENSAJES[codigo]) || 'No se pudo completar. Inténtalo otra vez.';
}
