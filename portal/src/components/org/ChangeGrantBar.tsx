import { useCallback, useEffect, useState } from "react";
import { ClipboardText, Key } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import { Badge, Button, CopyButton, ErrorInline, Select } from "../ui";
import { clearGrant, readGrant, saveGrant, type ChangeGrant } from "../../lib/changeGrant";

type RequestRow = {
  id: string;
  organization_id: string;
  kind: string;
  title: string;
  status: string;
  taken_by: string | null;
  grant_expires_at: string | null;
};

function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "vencido";
  const minutes = Math.floor(ms / 60000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

/**
 * Barra de sesión de trabajo del Nivel 2: sin requerimiento tomado, la
 * configuración es solo lectura.
 */
export function ChangeGrantBar({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [grant, setGrant] = useState<ChangeGrant | null>(() => readGrant(orgId));
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const token = session?.token ?? "";

  const load = useCallback(async () => {
    if (!token) return;
    const data = await platformApi<{ requests: RequestRow[] }>(
      `/api/v1/platform/change-requests?organization_id=${orgId}`,
      { token },
    );
    setRequests(data.requests ?? []);
  }, [token, orgId]);

  useEffect(() => {
    if (!token) return;
    void load().catch(() => setRequests([]));
  }, [token, load]);

  const open = requests.filter((item) => item.status === "open");

  async function take(id: string) {
    setBusy(true);
    setError("");
    try {
      const out = await platformApi<{
        request_id: string;
        token: string;
        expires_at: string;
      }>(`/api/v1/platform/change-requests/${id}/take`, {
        method: "POST",
        token,
        body: "{}",
      });
      const next: ChangeGrant = {
        requestId: out.request_id,
        token: out.token,
        orgId,
        expiresAt: out.expires_at,
        title: requests.find((item) => item.id === id)?.title ?? "Requerimiento",
      };
      saveGrant(next);
      setGrant(next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo tomar el requerimiento.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!grant) return;
    setBusy(true);
    setError("");
    try {
      await platformApi(`/api/v1/platform/change-requests/${grant.requestId}/resolve`, {
        method: "POST",
        token,
        body: JSON.stringify({ note: "Configuración actualizada y verificada." }),
      });
      clearGrant();
      setGrant(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver el requerimiento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5">
      {grant ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="ok">Sesión de trabajo</Badge>
          <span className="min-w-0 flex-1 text-xs text-text">
            {grant.title} · vence en {remaining(grant.expiresAt)}
          </span>
          <CopyButton value={grant.token} label="Copiar token" />
          <Button variant="secondary" size="sm" onClick={() => void resolve()} disabled={busy}>
            {busy ? "Resolviendo…" : "Resolver requerimiento"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">Solo lectura</Badge>
          <span className="min-w-0 flex-1 text-xs text-muted">
            Tomá un requerimiento abierto para modificar la configuración de esta organización.
          </span>
          {open.length > 0 ? (
            <>
              <Select
                aria-label="Requerimiento a tomar"
                className="h-8 w-[260px] text-xs"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                placeholder="Elegir requerimiento…"
              >
                {open.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                leadingIcon={Key}
                disabled={!selected || busy}
                onClick={() => void take(selected)}
              >
                {busy ? "Tomando…" : "Tomar"}
              </Button>
            </>
          ) : (
            <a
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              href="/control-center/change-requests"
            >
              <ClipboardText size={14} aria-hidden /> Abrir un requerimiento
            </a>
          )}
        </div>
      )}
      {error && <ErrorInline message={error} className="mt-2" />}
    </div>
  );
}
