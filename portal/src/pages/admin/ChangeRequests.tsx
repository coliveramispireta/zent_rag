import { useCallback, useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
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
import { fmtDateTime } from "../../lib/format";
import { saveGrant } from "../../lib/changeGrant";

type RequestRow = {
  id: string;
  organization_id: string;
  organization_name: string | null;
  kind: string;
  title: string;
  description: string;
  status: string;
  opened_by: string | null;
  taken_by: string | null;
  grant_expires_at: string | null;
  resolution_note: string | null;
  created_at: string | null;
};

type Org = { id: string; name: string; company_name: string | null };

const KIND_LABEL: Record<string, string> = {
  agent_create: "Alta de agente",
  agent_config: "Configuración de agente",
  integration: "Integración",
  parameters: "Parámetros",
  other: "Otro",
};

const STATUS_TONE: Record<string, "ok" | "warn" | "neutral" | "info"> = {
  open: "info",
  taken: "warn",
  resolved: "ok",
  cancelled: "neutral",
  expired: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Abierto",
  taken: "Tomado",
  resolved: "Resuelto",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export default function ChangeRequests() {
  const { session } = usePlatformAuth();
  const token = session?.token ?? "";
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [granted, setGranted] = useState<{ title: string; token: string; expiresAt: string } | null>(null);
  const [form, setForm] = useState({
    organization_id: "",
    kind: "agent_config",
    title: "",
    description: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    const [list, orgList] = await Promise.all([
      platformApi<{ requests: RequestRow[] }>("/api/v1/platform/change-requests", { token }),
      platformApi<{ organizations: Org[] }>("/api/v1/platform/organizations", { token }),
    ]);
    setRows(list.requests ?? []);
    setOrgs(orgList.organizations ?? []);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los requerimientos."))
      .finally(() => setLoading(false));
  }, [token, load]);

  async function create() {
    setBusy("create");
    setError("");
    try {
      await platformApi("/api/v1/platform/change-requests", {
        method: "POST",
        token,
        body: JSON.stringify({
          organization_id: form.organization_id,
          kind: form.kind,
          title: form.title.trim(),
          description: form.description.trim(),
        }),
      });
      setCreating(false);
      setForm({ organization_id: "", kind: "agent_config", title: "", description: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el requerimiento.");
    } finally {
      setBusy(null);
    }
  }

  async function take(row: RequestRow) {
    setBusy(row.id);
    setError("");
    try {
      const out = await platformApi<{
        request_id: string;
        token: string;
        expires_at: string;
      }>(`/api/v1/platform/change-requests/${row.id}/take`, {
        method: "POST",
        token,
        body: "{}",
      });
      saveGrant({
        requestId: out.request_id,
        token: out.token,
        orgId: row.organization_id,
        expiresAt: out.expires_at,
        title: row.title,
      });
      setGranted({ title: row.title, token: out.token, expiresAt: out.expires_at });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo tomar el requerimiento.");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(row: RequestRow) {
    setBusy(row.id);
    setError("");
    try {
      await platformApi(`/api/v1/platform/change-requests/${row.id}/resolve`, {
        method: "POST",
        token,
        body: JSON.stringify({ note: "Configuración actualizada y verificada." }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver el requerimiento.");
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<RequestRow>[] = [
    {
      key: "title",
      header: "Requerimiento",
      render: (row) => (
        <div className="min-w-0">
          <span className="font-medium text-text">{row.title}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{row.description}</span>
        </div>
      ),
    },
    {
      key: "org",
      header: "Organización",
      render: (row) => row.organization_name ?? "—",
    },
    { key: "kind", header: "Tipo", render: (row) => KIND_LABEL[row.kind] ?? row.kind },
    {
      key: "status",
      header: "Estado",
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "Creado",
      align: "right",
      render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Requerimientos"
        subtitle="Sustento auditable de los cambios de configuración. Sin un requerimiento tomado, el Nivel 2 es solo lectura."
        actions={
          <Button leadingIcon={Plus} onClick={() => setCreating(true)}>
            Nuevo requerimiento
          </Button>
        }
      />

      {error && <ErrorInline message={error} />}

      <Panel>
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            caption="Requerimientos de cambio"
            rowActions={(row) => (
              <div className="flex items-center gap-1">
                {row.status === "open" && (
                  <Button variant="ghost" size="sm" disabled={busy === row.id} onClick={() => void take(row)}>
                    Tomar
                  </Button>
                )}
                {row.status === "taken" && (
                  <Button variant="ghost" size="sm" disabled={busy === row.id} onClick={() => void resolve(row)}>
                    Resolver
                  </Button>
                )}
              </div>
            )}
            empty={
              <EmptyState
                title="Sin requerimientos"
                body="Abrí uno para habilitar cambios de configuración en una organización."
              />
            }
          />
        )}
      </Panel>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Nuevo requerimiento"
        description="El sustento es obligatorio: qué se cambia y por qué."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy === "create" ||
                !form.organization_id ||
                form.title.trim().length < 3 ||
                form.description.trim().length < 10
              }
              onClick={() => void create()}
            >
              Abrir requerimiento
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organización">
            <Select
              value={form.organization_id}
              onChange={(event) => setForm({ ...form, organization_id: event.target.value })}
              placeholder="Elegir organización…"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.company_name || org.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              <option value="agent_config">Configuración de agente</option>
              <option value="agent_create">Alta de agente</option>
              <option value="integration">Integración</option>
              <option value="parameters">Parámetros</option>
              <option value="other">Otro</option>
            </Select>
          </Field>
          <Field label="Título" className="sm:col-span-2">
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ej. Ajustar límite de solicitudes"
            />
          </Field>
          <Field
            label="Sustento"
            hint="Mínimo 10 caracteres. Queda en la auditoría."
            className="sm:col-span-2"
          >
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(granted)}
        onOpenChange={() => setGranted(null)}
        title="Token temporal"
        description="Se muestra una sola vez. Se pierde al resolver el requerimiento o al vencer."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setGranted(null)}>Entendido</Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm">
          <p className="text-muted">{granted?.title}</p>
          <code className="mono block break-all rounded-sm border border-border bg-soft px-3 py-2 text-xs">
            {granted?.token}
          </code>
          <p className="text-xs text-muted">
            Vence: {granted ? fmtDateTime(granted.expiresAt) : "—"}
          </p>
        </div>
      </Modal>
    </div>
  );
}
