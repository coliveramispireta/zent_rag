/**
 * Adaptador de API para el editor de flujos.
 *
 * El studio y sus paneles llaman a `api(...)` con la sesión del tenant. Cuando
 * el Control Center monta el editor dentro del contexto de una organización,
 * `setStudioTarget` apunta esas llamadas al API de plataforma, que resuelve la
 * organización por parámetro. Sin target, todo sigue igual que antes.
 */
import { api, platformApi } from "../api";

type ApiOptions = RequestInit & {
  token?: string;
  organizationId?: string;
  workspaceId?: string;
};

type StudioTarget = { orgId: string; token: string };

let target: StudioTarget | null = null;

export function setStudioTarget(next: StudioTarget | null): void {
  target = next;
}

export function studioTarget(): StudioTarget | null {
  return target;
}

function rewrite(path: string, orgId: string): string {
  const base = `/api/v1/platform/organizations/${orgId}`;

  if (path === "/api/v1/knowledge-bases") return `${base}/knowledge-bases`;
  if (path === "/api/v1/agents") return `${base}/agents`;
  if (path.startsWith("/api/v1/workflows/runs/")) {
    return path.replace(
      "/api/v1/workflows/runs/",
      `${base}/workflows/runs/`,
    );
  }
  if (path === "/api/v1/workflows/triggers") return `${base}/workflow-triggers`;
  if (path === "/api/v1/workflows") return `${base}/workflows`;
  if (path.startsWith("/api/v1/workflows/")) {
    return path.replace("/api/v1/workflows/", `${base}/workflows/`);
  }
  return path;
}

export function studioApi<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  if (!target) return api<T>(path, options);
  const { token: _ignored, organizationId: _org, ...rest } = options;
  return platformApi<T>(rewrite(path, target.orgId), {
    ...rest,
    token: target.token,
  });
}
