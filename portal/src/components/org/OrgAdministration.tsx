import { useEffect, useState } from "react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Panel,
  PanelHeader,
  SkeletonBlock,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../ui";
import { fmtCurrencyCents, fmtDateTime } from "../../lib/format";

type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  tone?: string;
};

type Billing = {
  subscription: {
    id: string;
    plan: string;
    status: string;
    interval: string;
    period_start: string | null;
    period_end: string | null;
    auto_renew: boolean;
  } | null;
  invoices: {
    id: string;
    status: string;
    total_cents: number;
    paid_at: string | null;
    created_at: string | null;
  }[];
};

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

type AuditEntry = {
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string | null;
  metadata: Record<string, unknown>;
};

const TABS = [
  { id: "actividad", label: "Actividad" },
  { id: "facturacion", label: "Facturación" },
  { id: "seguridad", label: "Seguridad" },
  { id: "auditoria", label: "Auditoría" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EMPTY_TEXT = "—";

/**
 * Administración de la organización dentro del contexto (Nivel 2).
 *
 * Solo lo que no tiene sección propia: actividad, facturación, seguridad y
 * auditoría. Agentes, ingesta, consumo y parámetros viven en sus secciones.
 */
export function OrgAdministration({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const token = session?.token ?? "";
  const [tab, setTab] = useState<TabId>("actividad");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      if (tab === "actividad") {
        const out = await platformApi<{ items: TimelineItem[] }>(
          `/api/v1/platform/organizations/${orgId}/timeline`,
          { token }
        );
        if (!cancelled) setTimeline(out.items ?? []);
      } else if (tab === "facturacion") {
        const out = await platformApi<Billing>(
          `/api/v1/platform/organizations/${orgId}/billing`,
          { token }
        );
        if (!cancelled) setBilling(out);
      } else if (tab === "seguridad") {
        const out = await platformApi<{ api_keys: ApiKey[] }>(
          `/api/v1/platform/organizations/${orgId}/security`,
          { token }
        );
        if (!cancelled) setKeys(out.api_keys ?? []);
      } else {
        const out = await platformApi<{ entries: AuditEntry[] }>(
          `/api/v1/platform/organizations/${orgId}/audit`,
          { token }
        );
        if (!cancelled) setAudit(out.entries ?? []);
      }
    })()
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No se pudo cargar la sección.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId, tab]);

  const invoiceColumns: Column<Billing["invoices"][number]>[] = [
    { key: "id", header: "Factura", render: (row) => <span className="mono text-xs">{row.id.slice(0, 8)}</span> },
    { key: "status", header: "Estado", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => <span className="mono text-xs">{fmtCurrencyCents(row.total_cents, 2)}</span>,
    },
    {
      key: "paid",
      header: "Pagada",
      align: "right",
      render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.paid_at)}</span>,
    },
  ];

  const keyColumns: Column<ApiKey>[] = [
    { key: "name", header: "Nombre", render: (row) => row.name },
    { key: "prefix", header: "Prefijo", render: (row) => <span className="mono text-xs">{row.prefix}…</span> },
    {
      key: "scopes",
      header: "Scopes",
      render: (row) => <span className="text-xs text-muted">{row.scopes.length}</span>,
    },
    {
      key: "active",
      header: "Estado",
      render: (row) => <StatusBadge status={row.is_active ? "active" : "disabled"} />,
    },
    {
      key: "last_used",
      header: "Último uso",
      align: "right",
      render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.last_used_at)}</span>,
    },
  ];

  const auditColumns: Column<AuditEntry>[] = [
    { key: "action", header: "Acción", render: (row) => <span className="mono text-xs">{row.action}</span> },
    { key: "resource", header: "Recurso", render: (row) => row.resource_type },
    {
      key: "actor",
      header: "Actor",
      render: (row) => (
        <span className="mono text-xs text-muted">
          {row.actor_user_id ? row.actor_user_id.slice(0, 8) : EMPTY_TEXT}
        </span>
      ),
    },
    {
      key: "at",
      header: "Fecha",
      align: "right",
      render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {error && <ErrorInline message={error} className="mt-3" />}

        <TabsContent value="actividad" className="mt-3">
          <Panel>
            <PanelHeader
              title="Actividad de la organización"
              description="Eventos de la organización en orden cronológico inverso."
            />
            {loading ? (
              <div className="p-4">
                <SkeletonBlock rows={4} />
              </div>
            ) : timeline.length === 0 ? (
              <EmptyState title="Sin actividad" body="No hay eventos registrados para esta organización." />
            ) : (
              <ul className="divide-y divide-border">
                {timeline.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2.5">
                    <span className="text-xs text-faint">{fmtDateTime(item.at)}</span>
                    <span className="text-sm text-text">{item.title}</span>
                    {item.detail && <span className="text-xs text-muted">{item.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="facturacion" className="mt-3">
          <Panel>
            <PanelHeader
              title="Suscripción"
              description="Plan y período de facturación de la organización."
            />
            {loading ? (
              <div className="p-4">
                <SkeletonBlock rows={2} />
              </div>
            ) : !billing?.subscription ? (
              <EmptyState title="Sin suscripción" body="La organización no tiene una suscripción activa." />
            ) : (
              <dl className="grid gap-3 p-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Plan</dt>
                  <dd className="text-text">{billing.subscription.plan}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Estado</dt>
                  <dd>
                    <StatusBadge status={billing.subscription.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Período</dt>
                  <dd className="text-text">
                    {fmtDateTime(billing.subscription.period_start)} —{" "}
                    {fmtDateTime(billing.subscription.period_end)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Renovación automática</dt>
                  <dd className="text-text">{billing.subscription.auto_renew ? "Sí" : "No"}</dd>
                </div>
              </dl>
            )}
          </Panel>

          <div className="mt-4">
            <Panel>
              <PanelHeader title="Facturas" />
              <DataTable
                columns={invoiceColumns}
                rows={billing?.invoices ?? []}
                rowKey={(row) => row.id}
                caption="Facturas de la organización"
                empty={<EmptyState title="Sin facturas" body="Todavía no se emitió ninguna factura." />}
              />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="seguridad" className="mt-3">
          <Panel>
            <PanelHeader
              title="Claves de API"
              description="Accesos técnicos de la organización. Se administran en Aplicaciones e integraciones."
            />
            {loading ? (
              <div className="p-4">
                <SkeletonBlock rows={4} />
              </div>
            ) : (
              <DataTable
                columns={keyColumns}
                rows={keys}
                rowKey={(row) => row.id}
                caption="Claves de API de la organización"
                empty={<EmptyState title="Sin claves" body="La organización no tiene claves de API." />}
              />
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="auditoria" className="mt-3">
          <Panel>
            <PanelHeader
              title="Auditoría"
              description="Acciones registradas sobre esta organización."
            />
            {loading ? (
              <div className="p-4">
                <SkeletonBlock rows={5} />
              </div>
            ) : (
              <DataTable
                columns={auditColumns}
                rows={audit}
                rowKey={(row) =>
                  `${row.action}-${row.created_at}-${row.resource_id ?? ""}`
                }
                caption="Auditoría de la organización"
                empty={<EmptyState title="Sin registros" body="No hay acciones auditadas." />}
              />
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
