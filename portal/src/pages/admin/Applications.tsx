import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Plugs } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  Button,
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Field,
  Input,
  Modal,
  PageHeader,
  Panel,
  Select,
  SkeletonBlock,
  Textarea,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";

type Application = {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  description: string | null;
  organizations: number;
  api_keys: number;
  created_at: string | null;
};

const KIND_LABEL: Record<string, string> = {
  product: "Producto",
  internal: "Interno",
  partner: "Socio",
};

export default function Applications() {
  const { session } = usePlatformAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    kind: "product",
    description: "",
  });

  const load = useCallback(async () => {
    if (!session) return;
    const data = await platformApi<{ applications: Application[] }>(
      "/api/v1/platform/applications",
      { token: session.token },
    );
    setApplications(data.applications ?? []);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    load()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar las aplicaciones."),
      )
      .finally(() => setLoading(false));
  }, [session, load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return applications;
    return applications.filter((app) =>
      `${app.name} ${app.code} ${app.kind}`.toLowerCase().includes(needle),
    );
  }, [applications, query]);

  async function create() {
    if (!session) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformApi("/api/v1/platform/applications", {
        method: "POST",
        token: session.token,
        body: JSON.stringify({
          code: form.code.trim().toLowerCase(),
          name: form.name.trim(),
          kind: form.kind,
          description: form.description.trim() || null,
        }),
      });
      setCreating(false);
      setForm({ code: "", name: "", kind: "product", description: "" });
      await load();
      setNotice("Aplicación creada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la aplicación.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(app: Application) {
    if (!session) return;
    setError("");
    setNotice("");
    try {
      await platformApi(`/api/v1/platform/applications/${app.id}`, {
        method: "PATCH",
        token: session.token,
        body: JSON.stringify({
          status: app.status === "active" ? "suspended" : "active",
        }),
      });
      await load();
      setNotice(
        app.status === "active"
          ? `Aplicación ${app.name} suspendida.`
          : `Aplicación ${app.name} activada.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  }

  const columns: Column<Application>[] = [
    {
      key: "name",
      header: "Aplicación",
      render: (app) => (
        <div className="min-w-0">
          <span className="font-medium text-text">{app.name}</span>
          {app.description && (
            <span className="mt-0.5 block truncate text-xs text-muted">
              {app.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "code",
      header: "Código",
      render: (app) => <span className="mono text-xs text-muted">{app.code}</span>,
    },
    {
      key: "kind",
      header: "Tipo",
      render: (app) => KIND_LABEL[app.kind] ?? app.kind,
    },
    {
      key: "status",
      header: "Estado",
      render: (app) => (
        <Badge tone={app.status === "active" ? "ok" : "neutral"}>
          {app.status === "active" ? "Activa" : "Suspendida"}
        </Badge>
      ),
    },
    {
      key: "orgs",
      header: "Organizaciones",
      align: "right",
      render: (app) => app.organizations,
    },
    { key: "keys", header: "Claves", align: "right", render: (app) => app.api_keys },
    {
      key: "created",
      header: "Alta",
      align: "right",
      render: (app) => <span className="text-xs text-muted">{fmtDate(app.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aplicaciones"
        subtitle="Productos o canales que consumen Zent en nombre de una organización. El acceso directo no pasa por acá."
        actions={
          <Button leadingIcon={Plus} onClick={() => setCreating(true)}>
            Nueva aplicación
          </Button>
        }
      />

      {error && <ErrorInline message={error} />}
      {notice && (
        <p className="text-xs text-ok" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, código o tipo"
          aria-label="Buscar aplicación"
          className="h-9 w-[300px]"
        />
        <span className="text-xs text-faint">
          {rows.length} de {applications.length}
        </span>
      </div>

      <Panel>
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(app) => app.id}
            caption="Aplicaciones de la plataforma"
            rowActions={(app) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void toggleStatus(app)}
              >
                {app.status === "active" ? "Suspender" : "Activar"}
              </Button>
            )}
            empty={
              <EmptyState
                icon={Plugs}
                title={
                  applications.length === 0 ? "Sin aplicaciones" : "Sin coincidencias"
                }
                body={
                  applications.length === 0
                    ? "Crea la primera aplicación para poder atribuir el consumo de una organización a su producto."
                    : "Ajustá la búsqueda."
                }
              />
            }
          />
        )}
      </Panel>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Nueva aplicación"
        description="El código es estable y lo usa el producto para identificarse. No se puede repetir."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void create()}
              disabled={busy || !form.code.trim() || !form.name.trim()}
            >
              {busy ? "Creando…" : "Crear aplicación"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código" hint="minúsculas, números, guion o guion bajo">
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder="mentora"
            />
          </Field>
          <Field label="Nombre">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Mentora"
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              <option value="product">Producto</option>
              <option value="internal">Interno</option>
              <option value="partner">Socio</option>
            </Select>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
