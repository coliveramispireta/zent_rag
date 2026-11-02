/**
 * Sesión de trabajo de configuración: token del requerimiento tomado.
 *
 * Vive en `sessionStorage` (nunca en localStorage): se pierde al cerrar la
 * pestaña y no se comparte entre pestañas.
 */
const KEY = "zent_change_grant";

export type ChangeGrant = {
  requestId: string;
  token: string;
  orgId: string;
  expiresAt: string;
  title: string;
};

export function readGrant(orgId?: string): ChangeGrant | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const grant = JSON.parse(raw) as ChangeGrant;
    if (orgId && grant.orgId !== orgId) return null;
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return grant;
  } catch {
    return null;
  }
}

export function saveGrant(grant: ChangeGrant): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(grant));
  } catch {
    // sin persistencia
  }
}

export function clearGrant(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin persistencia
  }
}
