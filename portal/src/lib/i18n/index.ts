/**
 * Traducción de mensajes de interfaz.
 *
 * Sin dependencias externas: el catálogo es un objeto tipado y `t()` devuelve
 * una clave existente o falla en compilación. Interpolación simple con `{name}`.
 * El locale, la zona horaria y la moneda siguen viviendo en `lib/locale.tsx`.
 */
import { es, type MessageKey } from "./es";

export type { MessageKey };
export { es };

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const message: string = es[key];
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
