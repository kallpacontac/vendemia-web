#!/usr/bin/env node
/**
 * Dispara el aviso «Instala tu tarjeta» de Fideliza (modules/fideliza/publico/AvisoInstalar.tsx).
 *
 *   npm run aviso-instalar -- <token|enlace> [variante] [--local] [--no-abrir]
 *
 *   variante  1 (por defecto) → olvida «Ahora no» y lo evalúa como en el celular
 *             ios              → «Compartir → Añadir a pantalla de inicio»
 *             android          → instalar a mano desde el menú ⋮ de Chrome
 *             instalar         → el botón «Instalar» (solo instala de verdad si Chrome lo ofreció)
 *   --local   abre http://localhost:3000 en vez de producción
 *   --no-abrir  solo imprime el enlace
 *
 * Las variantes forzadas salen en cualquier equipo, también en la computadora:
 * sirven para ver el diseño. Para la instalación real, usa «1» en el celular.
 * Además imprime una línea para pegar en la consola de una tarjeta ya abierta.
 */
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const bandera = (b) => args.includes(b);
const [entrada, variante = '1'] = args.filter((a) => !a.startsWith('--'));
const VARIANTES = ['1', 'ios', 'android', 'instalar'];

if (!entrada || !VARIANTES.includes(variante)) {
  console.error('Uso: npm run aviso-instalar -- <token|enlace de la tarjeta> [1|ios|android|instalar] [--local] [--no-abrir]');
  process.exit(1);
}

// Acepta el token suelto o el enlace completo de la tarjeta (/m/<token>).
const token = entrada.match(/\/m\/([A-Za-z0-9_-]{30,64})/)?.[1] ?? entrada;
if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) {
  console.error('No reconozco el token. Pega el enlace de la tarjeta (…/m/<token>) o solo el token.');
  process.exit(1);
}

const base = bandera('--local')
  ? 'http://localhost:3000'
  : process.env.NEXT_PUBLIC_FIDELIZA_URL || 'https://fideliza.vendemias.com';
const url = `${base.replace(/\/$/, '')}/m/${token}?app=${variante}`;

console.log(`\nEnlace:\n  ${url}\n`);
console.log('En una tarjeta ya abierta, pega en la consola (F12):');
console.log(`  dispatchEvent(new CustomEvent('fz:aviso-instalar', { detail: '${variante}' }))\n`);

if (!bandera('--no-abrir')) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
}
