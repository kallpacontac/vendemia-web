/**
 * «SON CIENTO DIECIOCHO CON 00/100 SOLES»: la leyenda 1000 que SUNAT espera en
 * boletas y facturas. Hasta 999 999 999,99, que sobra para un local.
 */
const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
  'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hasta999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let txt = CENTENAS[c];
  if (resto) {
    let r: string;
    if (resto < 10) r = UNIDADES[resto];
    else if (resto < 30) r = DIEZ_A_VEINTINUEVE[resto - 10];
    else r = DECENAS[Math.floor(resto / 10)] + (resto % 10 ? ` Y ${UNIDADES[resto % 10]}` : '');
    txt = txt ? `${txt} ${r}` : r;
  }
  return txt;
}

/** «UNO» delante de MIL o MILLONES se apocopa: «VEINTIUN MIL», «TREINTA Y UN MILLONES». */
const apocope = (t: string) => t.replace(/UNO$/, 'UN');

export function enteroEnLetras(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'UN MILLON' : `${apocope(hasta999(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocope(hasta999(miles))} MIL`);
  if (resto) partes.push(hasta999(resto));
  return partes.join(' ');
}

export function montoEnLetras(soles: number): string {
  const centimos = Math.round(soles * 100);
  const entero = Math.floor(centimos / 100);
  const cent = String(centimos % 100).padStart(2, '0');
  return `SON ${enteroEnLetras(entero)} CON ${cent}/100 SOLES`;
}
