#!/usr/bin/env node
/**
 * Publica en un Android conectado por USB una notificación con la forma de un aviso de Yape, para
 * probar el lector (docs/verificar-pagos-yape.md) sin que nadie tenga que yapear.
 *
 *   npm run yape-prueba -- <monto> [nombre] [--codigo 123] [--texto "…"] [--titulo "…"]
 *   npm run yape-prueba -- --escenario      → la batería de casos de abajo, uno cada 4 s
 *   npm run yape-prueba -- --leer           → imprime los avisos REALES de Yape que hay en el celular
 *   npm run yape-prueba -- --permitir <paquete/.Servicio>  → da acceso a notificaciones sin ir a Ajustes
 *
 *   --serie <id>  elige el celular si hay más de uno (`adb devices`)
 *
 * ⚠️ La notificación la publica `com.android.shell`, NO Yape. Es lo que tiene que pasar: el lector
 * de verdad filtra por paquete y firma, y DEBE ignorarla (es exactamente un «Yape falso»). Para
 * probar el resto del camino, solo la versión de pruebas del lector acepta `com.android.shell`.
 * En MacroDroid: disparador «Notificación recibida» → cualquier app → el texto contiene
 * «te envió un pago».
 *
 * ⚠️ El texto sale de los repos de 2024-2025. El vigente se mira con `--leer` en el celular del
 * negocio tras un yapeo real, y se pasa con --texto/--titulo. Lo mismo el código de 3 dígitos:
 * su formato aquí es una suposición.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const bandera = (b) => args.includes(b);
const valor = (b) => {
  const i = args.indexOf(b);
  return i >= 0 ? args[i + 1] : undefined;
};
const CON_VALOR = ['--codigo', '--texto', '--titulo', '--serie', '--permitir'];
const sueltos = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.includes(args[i - 1]));

const YAPE = 'com.bcp.innovacxion.yapeapp';
const TITULO = 'Confirmación de Pago';
const serie = valor('--serie');

function adb(...comando) {
  const r = spawnSync('adb', [...(serie ? ['-s', serie] : []), ...comando], { encoding: 'utf8' });
  if (r.error) {
    console.error('No encuentro adb. Instala platform-tools o scrcpy y vuelve a probar.');
    process.exit(1);
  }
  return { ok: r.status === 0, salida: `${r.stdout}${r.stderr}`.trim() };
}

/** `adb shell` junta los argumentos en una línea para el sh del celular: hay que entrecomillar. */
const comillas = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function comprobarCelular() {
  const sdk = Number(adb('shell', 'getprop', 'ro.build.version.sdk').salida);
  if (!sdk) {
    console.error('No hay ningún celular conectado (o no autorizó la depuración USB). Mira `adb devices`.');
    process.exit(1);
  }
  if (sdk < 29) {
    console.error(`Este celular es Android SDK ${sdk}: \`cmd notification post\` necesita Android 10 o más.`);
    process.exit(1);
  }
}

function textoDe(monto, nombre, codigo) {
  const base = `Yape! ${nombre} te envió un pago por S/ ${monto}`;
  return codigo ? `${base}. El cód. de seguridad es: ${codigo}` : base;
}

/** La misma etiqueta vuelve a publicar ENCIMA de la anterior: así se simula un aviso repetido. */
function publicar({ monto, nombre = 'JUAN PEREZ', codigo, texto, titulo = TITULO, etiqueta }) {
  const cuerpo = texto ?? textoDe(monto, nombre, codigo);
  const tag = etiqueta ?? `yape-prueba-${Date.now()}`;
  const r = adb(
    'shell',
    ['cmd', 'notification', 'post', '-S', 'bigtext', '-t', comillas(titulo), tag, comillas(cuerpo)].join(' '),
  );
  if (!r.ok) {
    console.error(`Falló: ${r.salida}`);
    process.exit(1);
  }
  console.log(`📲 ${titulo} · ${cuerpo}   (etiqueta ${tag})`);
}

const ESCENARIO = [
  { nota: 'Monto único: casa con un solo pedido', monto: '24.93', nombre: 'JUAN PEREZ' },
  { nota: 'El cliente redondeó: queda «por asignar»', monto: '25.00', nombre: 'ROSA QUISPE' },
  { nota: 'Nombre recortado a 3 letras (dic-2025)', monto: '18.47', nombre: 'MAR' },
  { nota: 'Con código de seguridad (formato supuesto)', monto: '12.96', nombre: 'LUIS TORRES', codigo: '482' },
  { nota: 'Mismo aviso dos veces: se cuenta UNA', monto: '30.00', nombre: 'ANA DIAZ', etiqueta: 'yape-prueba-repetido' },
  { nota: '…', monto: '30.00', nombre: 'ANA DIAZ', etiqueta: 'yape-prueba-repetido' },
  { nota: 'Dos clientes, mismo monto, mismo minuto', monto: '15.00', nombre: 'PEDRO RAMOS' },
  { nota: '…', monto: '15.00', nombre: 'CARLA VEGA' },
  { nota: 'Monto con miles', monto: '1,250.00', nombre: 'EMPRESA SAC' },
  { nota: 'Texto que no es un pago: el lector lo descarta', texto: 'Yape! Tienes una promoción esperándote' },
];

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

if (bandera('--leer')) {
  comprobarCelular();
  const { salida } = adb('shell', 'dumpsys', 'notification', '--noredact');
  const bloques = salida.split(/\n(?=\s*NotificationRecord\()/).filter((b) => b.includes(YAPE));
  if (!bloques.length) {
    console.log(`No hay avisos de ${YAPE} en el celular. Pide un yapeo real y vuelve a correrlo sin borrarlo.`);
  }
  for (const b of bloques) {
    const campo = (c) => b.match(new RegExp(`${c}=String \\((.*)\\)`))?.[1] ?? '—';
    console.log(`\ntítulo: ${campo('android.title')}\ntexto:  ${campo('android.text')}\nlargo:  ${campo('android.bigText')}`);
  }
} else if (bandera('--permitir')) {
  const componente = valor('--permitir');
  if (!componente?.includes('/')) {
    console.error('Uso: --permitir <paquete>/<.Servicio>, p. ej. pe.vendemia.caja/.LectorYape');
    process.exit(1);
  }
  comprobarCelular();
  const r = adb('shell', 'cmd', 'notification', 'allow_listener', componente);
  console.log(r.ok ? `✅ ${componente} ya puede leer notificaciones.` : `Falló: ${r.salida}`);
} else if (bandera('--escenario')) {
  comprobarCelular();
  for (const caso of ESCENARIO) {
    if (caso.nota !== '…') console.log(`\n— ${caso.nota}`);
    publicar(caso);
    await espera(4000);
  }
} else {
  const [monto, nombre] = sueltos;
  if (!monto && !valor('--texto')) {
    console.error('Uso: npm run yape-prueba -- <monto> [nombre] [--codigo 123] [--texto "…"] [--titulo "…"]');
    console.error('     npm run yape-prueba -- --escenario | --leer | --permitir <paquete/.Servicio>');
    process.exit(1);
  }
  comprobarCelular();
  publicar({
    // «24,93» es coma decimal; «1,250.00», separador de miles.
    monto: monto && Number(/^\d+,\d{1,2}$/.test(monto) ? monto.replace(',', '.') : monto.replace(/,/g, '')).toFixed(2),
    nombre,
    codigo: valor('--codigo'),
    texto: valor('--texto'),
    titulo: valor('--titulo'),
  });
}
