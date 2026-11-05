/**
 * Achica una foto en el navegador antes de subirla: una foto de celular pasa de los 4,5 MB que
 * admite una función de Vercel, y una captura de Yape se lee igual de bien a 1600 px.
 * Si el navegador no puede (HEIC en algunos, por ejemplo), devuelve el archivo tal cual.
 */
export async function achicarImagen(archivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * escala);
    lienzo.height = Math.round(bmp.height * escala);
    lienzo.getContext('2d')?.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.88));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}
