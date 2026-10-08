'use client';

/**
 * La invitación a activar los avisos, en el Dashboard. UNA vez y descartable.
 *
 * No pide el permiso del navegador: lleva a Ajustes, donde se explica qué se
 * va a avisar y se pide tras pulsar. Un «¿Permitir notificaciones?» en frío se
 * rechaza, y rechazado ya no se puede volver a preguntar.
 *
 * No sale si el navegador no admite avisos y no es un iPhone (en iPhone en
 * Safari sí sale: allí lo primero es instalar), ni si ya están activados en
 * este celular, ni si se cerró.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { plataforma } from './Instalable';

const CLAVE = 'vm-invitacion-avisos';

export default function InvitacionAvisos() {
  const [ver, setVer] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE)) return;
    } catch {
      return;
    }
    const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!soporta && plataforma() !== 'ios') return;
    if (soporta && Notification.permission !== 'default') return; // ya decidió
    void (async () => {
      const reg = await navigator.serviceWorker?.getRegistration('/panel');
      const sub = await reg?.pushManager?.getSubscription();
      if (!sub) setVer(true);
    })().catch(() => {});
  }, []);

  if (!ver) return null;
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE, '1');
    } catch {
      /* ventana privada: se cierra solo esta vez */
    }
    setVer(false);
  };

  return (
    <div className="card invitacion-avisos">
      <Bell size={18} />
      <div>
        <b>Recibe tus pagos y reservas en el celular</b>
        <small className="muted">Solo lo que pide que hagas algo. De noche, un resumen por la mañana.</small>
      </div>
      <Link href="/panel/configuracion#avisos" className="btn btn-primary btn-sm" onClick={cerrar}>
        Activar
      </Link>
      <button type="button" className="invitacion-avisos__cerrar" onClick={cerrar} aria-label="No, gracias">
        <X size={16} />
      </button>
    </div>
  );
}
