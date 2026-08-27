/**
 * Constantes e utilitários de URL para a API do Witiquetas
 */
export function build_api_url(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
}
