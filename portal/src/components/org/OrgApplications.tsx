import { useCallback, useEffect, useMemo, useState } from "react";
import { Key, Plugs } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Metric,
  MetricGrid,
  Panel,
  PanelHeader,
  Select,
  SkeletonBlock,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

type OrgApplication = {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  api_keys: number;
  last_used_at: string | null;
};

type OrgApplicationsResponse = {
  applications: OrgApplication[];
  direct_access_keys: number;
};

/**
 * Nivel 2 — Aplicaciones e integraciones.
 *
 * Muestra por qué aplicaciones consume Zent esta organización y si además usa
 * el acceso directo (claves sin aplicación = contrato de agente directo).
 */
export function OrgApplications({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [data, setData] = useState<OrgApplicationsResponse>({
    applications: [],
    direct_access_keys: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  const token = session?.token ?? "";

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    platformApi<OrgApplicationsResponse>(
      `/api/v1/platform/organizations/${orgId}/applications`,
      { token },
    )
      .then((response) => {
        if (!cancelled) {
          setData({
            applications: response.applications ?? [],
            direct_access_keys: response.direct_access_keys ?? 0,
          });
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "No se pudieron cargar las aplicaciones.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId, refresh]);

  const totalKeys = useMemo(
    () => data.applications.reduce((sum, app) => sum + app.api_keys, 0),
    [data.applications],
  );

  const lastUsed = useMemo(() => {
    const dates = data.applications
      .map((app) => app.last_used_at)
      .filter((value): value is string => Boolean(value))
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [data.applications]);

  const columns: Column<OrgApplication>[] = [
    {
      key: "name",
      header: "Aplicación",
      render: (app) => <span className="font-medium text-text">{app.name}</span>,
    },
    {
      key: "code",
      header: "Código",
      render: (app) => <span className="mono text-xs text-muted">{app.code}</span>,
    },
    {
      key: "kind",
      header: "Tipo",
      render: (app) => <span className="text-xs text-muted">{app.kind}</span>,
    },
    {
      key: "status",
      header: "Estado",
      render: (app) => (
        <Badge tone={app.status === "active" ? "ok" : "neutral"}>
          {app.status === "active" ? "Activa" : app.status}
        </Badge>
      ),
    },
    {
      key: "keys",
      header: "Claves",
      align: "right",
      render: (app) => app.api_keys,
    },
    {
      key: "last",
      header: "Último uso",
      align: "right",
      render: (app) => (
        <span className="text-xs text-muted">
          {app.last_used_at ? fmtDateTime(app.last_used_at) : "sin uso"}
        </span>
      ),
    },
  ];

  const hasDirect = data.direct_access_keys > 0;

  return (
    <div className="space-y-4">
      <MetricGrid>
        <Metric label="Aplicaciones" value={data.applications.length} />
        <Metric label="Claves por aplicación" value={totalKeys} />
        <Metric label="Acceso directo" value={data.direct_access_keys} />
        <Metric label="Último uso" value={lastUsed ? fmtDateTime(lastUsed) : "—"} />
      </MetricGrid>

      <Panel>
        <PanelHeader
          title="Aplicaciones e integraciones"
          description="Productos o canales que consumen Zent en nombre de esta organización. El acceso directo son claves sin aplicación (contrato de agente directo)."
        />

        {error && <ErrorInline message={error} />}
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            bare
            columns={columns}
            rows={data.applications}
            rowKey={(app) => app.id}
            caption="Aplicaciones de la organización"
            empty={
              <EmptyState
                icon={Plugs}
                title={
                  hasDirect
                    ? "Acceso directo, sin aplicaciones"
                    : "Sin aplicaciones ni acceso directo"
                }
                body={
                  hasDirect
                    ? "Esta organización consume Zent con sus propias claves: no pasa por una aplicación."
                    : "Todavía no hay claves de API emitidas para esta organización."
                }
                hint="Las aplicaciones se dan de alta en la configuración general de Zent."
              />
            }
          />
        )}
      </Panel>


      <KeysPanel
        orgId={orgId}
        token={session?.token ?? ""}
        onChanged={() => setRefresh((value) => value + 1)}
      />
    </div>
  );
}

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  is_active: boolean;
  application_id: string | null;
  last_used_at: string | null;
};

type AppOption = { id: string; name: string; code: string };

/** Claves de API de la organización, con su aplicación de origen. */
function KeysPanel({
  orgId,
  token,
  onChanged,
}: {
  orgId: string;
  token: string;
  onChanged: () => void;
}) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [keysRes, appsRes] = await Promise.all([
      platformApi<{ api_keys: ApiKey[] }>(
        `/api/v1/platform/organizations/${orgId}/security`,
        { token },
      ),
      platformApi<{ applications: AppOption[] }>("/api/v1/platform/applications", {
        token,
      }),
    ]);
    setKeys(keysRes.api_keys ?? []);
    setApps(appsRes.applications ?? []);
  }, [orgId, token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar las claves."),
      )
      .finally(() => setLoading(false));
  }, [token, load]);

  async function assign(key: ApiKey, applicationId: string) {
    if (!token) return;
    setBusy(key.id);
    setError("");
    try {
      await platformApi(`/api/v1/platform/api-keys/${key.id}/application`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ application_id: applicationId || null }),
      });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la aplicación.");
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<ApiKey>[] = [
    {
      key: "name",
      header: "Clave",
      render: (key) => (
        <div className="min-w-0">
          <span className="font-medium text-text">{key.name}</span>
          <span className="mono mt-0.5 block text-[10px] text-faint">
            {key.prefix}••••
          </span>
        </div>
      ),
    },
    {
      key: "scopes",
      header: "Permisos",
      render: (key) => (
        <span className="text-xs text-muted">
          {key.scopes.length > 0 ? key.scopes.join(", ") : "sin permisos"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (key) => (
        <Badge tone={key.is_active ? "ok" : "neutral"}>
          {key.is_active ? "Activa" : "Inactiva"}
        </Badge>
      ),
    },
    {
      key: "application",
      header: "Aplicación",
      render: (key) => (
        <Select
          aria-label={`Aplicación de la clave ${key.name}`}
          className="h-8 w-[190px] text-xs"
          value={key.application_id ?? ""}
          disabled={busy === key.id || apps.length === 0}
          onChange={(event) => void assign(key, event.target.value)}
          placeholder="Acceso directo"
        >
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "last",
      header: "Último uso",
      align: "right",
      render: (key) => (
        <span className="text-xs text-muted">
          {key.last_used_at ? fmtDateTime(key.last_used_at) : "sin uso"}
        </span>
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Claves de API y su aplicación"
        description="Asignar la aplicación a una clave atribuye su consumo. Sin aplicación, la clave es acceso directo."
      />
      {error && <ErrorInline message={error} />}
      {loading ? (
        <SkeletonBlock rows={3} />
      ) : (
        <DataTable
          bare
          columns={columns}
          rows={keys}
          rowKey={(key) => key.id}
          caption="Claves de API de la organización"
          empty={
            <EmptyState
              icon={Key}
              compact
              title="Sin claves de API"
              body="Esta organización todavía no emitió claves."
            />
          }
        />
      )}
    </Panel>
  );
}
