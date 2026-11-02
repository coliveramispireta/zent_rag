import { Buildings, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { platformApi } from "../../api";
import {
  Badge,
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  EmptyState,
  ErrorInline,
  Field,
  Input,
  Metric,
  MetricGrid,
  Modal,
  PageHeader,
  Pagination,
  ResultCount,
  Select,
  Skeleton,
  StatusBadge,
  cn,
  type Column,
  type SortState,
} from "../../components/ui";
import { usePlatformAuth } from "../../platformAuth";
import { readGrant } from "../../lib/changeGrant";

type Org = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  status: string;
  subscription_status: string | null;
  plan: string | null;
  is_trial: boolean;
  payment_provider: string | null;
  amount_due_cents: number;
  next_renewal_at: string | null;
};

const FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "trialing", label: "Trial" },
  { id: "active", label: "Active" },
  { id: "past_due", label: "Past due" },
  { id: "paused", label: "Paused/canceled" },
];

const PAGE_SIZE = 25;

type OrgDetail = {
  id: string;
  plan: string | null;
  subscription_status: string | null;
  status: string;
  users: number;
  agents: number;
  requests_30d: number;
  mrr_cents: number;
  amount_due_cents: number;
  next_renewal_at: string | null;
};

function usdCents(cents: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function matchesFilter(org: Org, filter: string) {
  const status = org.subscription_status || "";
  if (filter === "all") return true;
  if (filter === "trialing") return status === "trialing" || org.is_trial;
  if (filter === "active") return status === "active";
  if (filter === "past_due") return status === "past_due";
  if (filter === "paused") {
    return status === "paused" || status === "canceled" || status === "suspended" || status === "expired";
  }
  return true;
}

function sortValue(org: Org, key: string): string | number {
  switch (key) {
    case "name":
      return (org.company_name || org.name).toLowerCase();
    case "email":
      return (org.email || "").toLowerCase();
    case "plan":
      return (org.plan || "").toLowerCase();
    case "status":
      return (org.subscription_status || org.status || "").toLowerCase();
    case "provider":
      return (org.payment_provider || "").toLowerCase();
    case "due":
      return org.amount_due_cents || 0;
    case "renewal":
      return org.next_renewal_at ? new Date(org.next_renewal_at).getTime() : Number.POSITIVE_INFINITY;
    default:
      return "";
  }
}

export default function AdminCustomersPage() {
  const { session } = usePlatformAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [peek, setPeek] = useState<Org | null>(null);
  const [peekData, setPeekData] = useState<OrgDetail | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);
  const [peekError, setPeekError] = useState("");

  const navigate = useNavigate();
  const token = session?.token ?? "";

  const loadOrgs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await platformApi<{ organizations: Org[] }>(
        "/api/v1/platform/organizations",
        { token }
      );
      setOrgs(data.organizations || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando clientes");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const [creating, setCreating] = useState(false);
  const [plans, setPlans] = useState<{ name: string; display_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [created, setCreated] = useState<{ organization_id?: string } | null>(null);
  const [form, setForm] = useState({
    company_name: "",
    email: "",
    plan_name: "trial",
    with_demo: true,
  });

  async function openCreate() {
    setCreating(true);
    setCreateError("");
    setCreated(null);
    if (plans.length === 0 && token) {
      try {
        const data = await platformApi<{ plans: { name: string; display_name: string }[] }>(
          "/api/v1/platform/plans",
          { token }
        );
        setPlans(data.plans ?? []);
      } catch {
        setPlans([]);
      }
    }
  }

  async function createOrg() {
    if (!token) return;
    setSaving(true);
    setCreateError("");
    try {
      const out = await platformApi<{ organization_id?: string }>(
        "/api/v1/platform/onboarding/provision",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            company_name: form.company_name.trim(),
            email: form.email.trim(),
            plan_name: form.plan_name,
            with_demo: form.with_demo,
          }),
        }
      );
      setCreated(out);
      setCreating(false);
      setForm({ company_name: "", email: "", plan_name: "trial", with_demo: true });
      await loadOrgs();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "No se pudo crear la organización."
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  async function openPeek(org: Org) {
    if (!session) return;
    setPeek(org);
    setPeekData(null);
    setPeekError("");
    setPeekLoading(true);
    try {
      setPeekData(
        await platformApi<OrgDetail>(`/api/v1/platform/organizations/${org.id}`, {
          token: session.token,
        })
      );
    } catch (err) {
      setPeekError(err instanceof Error ? err.message : "Error cargando el resumen");
    } finally {
      setPeekLoading(false);
    }
  }

  type OrgAction = "edit" | "suspend" | "activate" | "delete";

  const [action, setAction] = useState<OrgAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [preview, setPreview] = useState<{
    organization?: { protected?: boolean; protected_reason?: string };
  } | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    company_name: "",
    email: "",
    ruc: "",
    phone: "",
    country: "",
  });

  function openAction(kind: OrgAction) {
    if (!peek) return;
    setAction(kind);
    setActionError("");
    setActionNotice("");
    setConfirmText("");
    if (kind === "edit") {
      setEditForm({
        name: peek.name ?? "",
        company_name: peek.company_name ?? "",
        email: peek.email ?? "",
        ruc: "",
        phone: "",
        country: "",
      });
    }
    if (kind === "delete") {
      setPreview(null);
      void (async () => {
        try {
          setPreview(
            await platformApi<{
              organization?: { protected?: boolean; protected_reason?: string };
            }>(`/api/v1/platform/organizations/${peek.id}/deletion-preview`, { token })
          );
        } catch {
          setPreview({});
        }
      })();
    }
  }

  async function runAction() {
    if (!peek || !action) return;
    setActionBusy(true);
    setActionError("");
    try {
      if (action === "edit") {
        const grant = readGrant(peek.id);
        await platformApi(`/api/v1/platform/organizations/${peek.id}`, {
          method: "PATCH",
          token,
          headers: grant ? { "X-Change-Token": grant.token } : undefined,
          body: JSON.stringify(editForm),
        });
        setActionNotice("Datos de la organización actualizados.");
      } else if (action === "delete") {
        await platformApi(`/api/v1/platform/organizations/${peek.id}`, {
          method: "DELETE",
          token,
          body: JSON.stringify({ confirmation: confirmText }),
        });
        setActionNotice(`Organización eliminada: ${peek.company_name || peek.name}.`);
        setPeek(null);
        setPeekData(null);
      } else {
        await platformApi(
          `/api/v1/platform/organizations/${peek.id}/${action}`,
          { method: "POST", token, body: "{}" }
        );
        setActionNotice(
          action === "suspend"
            ? "Organización suspendida."
            : "Organización reactivada."
        );
      }
      setAction(null);
      await loadOrgs();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo completar la acción.";
      setActionError(
        message.includes("change_grant_required")
          ? "Tomá un requerimiento abierto para esta organización antes de editarla."
          : message
      );
    } finally {
      setActionBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = orgs.filter((o) => {
      if (!matchesFilter(o, filter)) return false;
      if (!q) return true;
      const hay = `${o.company_name || ""} ${o.name} ${o.email || ""}`.toLowerCase();
      return hay.includes(q);
    });
    if (!sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [orgs, query, filter, sort]);

  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<Org>[] = [
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            void openPeek(o);
          }}
        >
          Acciones
        </Button>
      ),
    },
    {
      key: "name",
      header: "Empresa",
      sortable: true,
      render: (o) => (
        <Link
          className="font-medium text-accent hover:underline"
          to={`/control-center/org/${o.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {o.company_name || o.name}
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      sortable: true,
      hideBelow: "lg",
      render: (o) => <span className="text-muted">{o.email || "—"}</span>,
    },
    { key: "plan", header: "Plan", sortable: true, render: (o) => o.plan || "—" },
    {
      key: "status",
      header: "Suscripción",
      sortable: true,
      render: (o) => <StatusBadge status={o.subscription_status || o.status} />,
    },
    {
      key: "provider",
      header: "Provider",
      sortable: true,
      hideBelow: "lg",
      render: (o) => <span className="text-muted">{o.payment_provider || "manual"}</span>,
    },
    {
      key: "due",
      header: "Por pagar",
      align: "right",
      sortable: true,
      render: (o) => <span className="mono">{usdCents(o.amount_due_cents || 0)}</span>,
    },
    {
      key: "renewal",
      header: "Próxima renovación",
      sortable: true,
      hideBelow: "md",
      render: (o) => (
        <span className="text-muted">
          {o.next_renewal_at ? new Date(o.next_renewal_at).toLocaleDateString("es-CL") : "—"}
        </span>
      ),
    },
  ];

  const filtered = query.trim() !== "" || filter !== "all";

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Organizaciones de la plataforma."
        actions={
          <Button leadingIcon={Plus} onClick={() => void openCreate()}>
            Nueva organización
          </Button>
        }
      />

      {actionNotice && <p className="mb-3 text-xs text-ok">{actionNotice}</p>}

      {created?.organization_id && (
        <p className="mb-3 text-xs text-ok">
          Organización creada.{" "}
          <Link
            className="text-accent hover:underline"
            to={`/control-center/org/${created.organization_id}`}
          >
            Abrir contexto de la organización
          </Link>
        </p>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title="Nueva organización"
        description="Crea la organización, su usuario owner, la suscripción y una clave de API."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                saving || form.company_name.trim().length < 2 || !form.email.includes("@")
              }
              onClick={() => void createOrg()}
            >
              {saving ? "Creando…" : "Crear organización"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empresa" className="sm:col-span-2">
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="Ej. Acme"
            />
          </Field>
          <Field label="Email del owner" className="sm:col-span-2">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="owner@empresa.com"
            />
          </Field>
          <Field label="Plan">
            <Select
              value={form.plan_name}
              onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
            >
              {plans.length === 0 ? (
                <option value="trial">trial</option>
              ) : (
                plans.map((plan) => (
                  <option key={plan.name} value={plan.name}>
                    {plan.display_name || plan.name}
                  </option>
                ))
              )}
            </Select>
          </Field>
          <Field label="Datos de ejemplo">
            <label className="flex h-9 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.with_demo}
                onChange={(e) => setForm({ ...form, with_demo: e.target.checked })}
              />
              Crear agente y datos de demo
            </label>
          </Field>
        </div>
        {createError && <ErrorInline message={createError} className="mt-3" />}
      </Modal>
      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(o) => o.id}
        caption="Organizaciones de la plataforma"
        loading={loading}
        error={error || null}
        empty={
          filtered ? (
            <EmptyState
              icon={MagnifyingGlass}
              title="Sin resultados"
              body="Ninguna organización coincide con la búsqueda o el filtro activo."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Buildings}
              title="Sin organizaciones"
              body="Todavía ninguna organización se registró en la plataforma."
            />
          )
        }
        sort={sort}
        onSortChange={setSort}
        stickyHeader
        onRowClick={(o) => navigate(`/control-center/org/${o.id}`)}
        toolbar={
          <>
            <Input
              type="search"
              icon={MagnifyingGlass}
              aria-label="Buscar empresa o email"
              placeholder="Buscar empresa o email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-sm"
            />
            <div
              role="group"
              aria-label="Filtrar por suscripción"
              className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-soft p-0.5"
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "min-h-8 cursor-pointer rounded-sm px-3 text-[13px] font-medium transition-colors duration-150",
                      active ? "bg-surface text-text shadow-panel" : "text-muted hover:text-text"
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </>
        }
        footer={
          visible.length > 0 ? (
            <>
              <ResultCount shown={paged.length} total={visible.length} noun="organizaciones" />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={visible.length}
                onPageChange={setPage}
              />
            </>
          ) : null
        }
      />

      <Drawer
        open={!!peek}
        onOpenChange={(open) => {
          if (!open) setPeek(null);
        }}
        title={peek ? peek.company_name || peek.name : "Organización"}
        description={peek?.email || undefined}
        width={420}
        footer={
          peek && (
            <div className="flex w-full flex-col gap-2">
              <ButtonLink
                variant="primary"
                size="sm"
                to={`/control-center/org/${peek.id}`}
              >
                Abrir contexto de la organización
              </ButtonLink>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openAction("edit")}
                >
                  Editar datos
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openAction("delete")}
                >
                  Eliminar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="col-span-2"
                  onClick={() =>
                    openAction(
                      (peekData?.subscription_status || peekData?.status) === "suspended"
                        ? "activate"
                        : "suspend"
                    )
                  }
                >
                  {(peekData?.subscription_status || peekData?.status) === "suspended"
                    ? "Reactivar organización"
                    : "Suspender organización"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {peekLoading ? (
          <Skeleton className="h-[180px] rounded-lg" />
        ) : (
          <>
            <ErrorInline message={peekError} />
            {peekData && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">Plan: {peekData.plan || "—"}</Badge>
                  <StatusBadge status={peekData.subscription_status || peekData.status} />
                </div>
                <MetricGrid cols={2}>
                  <Metric size="md" label="MRR" value={usdCents(peekData.mrr_cents)} />
                  <Metric size="md" label="Por pagar" value={usdCents(peekData.amount_due_cents)} />
                  <Metric size="md" label="Usuarios" value={peekData.users} />
                  <Metric size="md" label="Agentes" value={peekData.agents} />
                  <Metric size="md" label="Requests 30d" value={peekData.requests_30d} />
                  <Metric
                    size="md"
                    label="Próxima renovación"
                    value={
                      peekData.next_renewal_at
                        ? new Date(peekData.next_renewal_at).toLocaleDateString("es-CL")
                        : "—"
                    }
                  />
                </MetricGrid>
              </div>
            )}
          </>
        )}
      </Drawer>

      <Modal
        open={action === "edit"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Editar organización"
        description="Los cambios quedan auditados. Si sos operador, necesitás un requerimiento tomado."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button
              disabled={actionBusy || editForm.name.trim().length < 2}
              onClick={() => void runAction()}
            >
              {actionBusy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre interno" className="sm:col-span-2">
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </Field>
          <Field label="Empresa" className="sm:col-span-2">
            <Input
              value={editForm.company_name}
              onChange={(e) =>
                setEditForm({ ...editForm, company_name: e.target.value })
              }
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </Field>
          <Field label="RUC">
            <Input
              value={editForm.ruc}
              onChange={(e) => setEditForm({ ...editForm, ruc: e.target.value })}
            />
          </Field>
          <Field label="Teléfono">
            <Input
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            />
          </Field>
          <Field label="País">
            <Input
              value={editForm.country}
              onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
            />
          </Field>
        </div>
        {actionError && <ErrorInline message={actionError} className="mt-3" />}
      </Modal>

      <Modal
        open={action === "suspend" || action === "activate"}
        onOpenChange={(open) => !open && setAction(null)}
        title={action === "suspend" ? "Suspender organización" : "Reactivar organización"}
        description={peek ? peek.company_name || peek.name : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button disabled={actionBusy} onClick={() => void runAction()}>
              {actionBusy
                ? "Procesando…"
                : action === "suspend"
                  ? "Suspender"
                  : "Reactivar"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">
          {action === "suspend"
            ? "La organización deja de operar: su suscripción pasa a suspendida y las claves de API quedan bloqueadas."
            : "La organización vuelve a operar y su suscripción pasa a activa."}
        </p>
        {actionError && <ErrorInline message={actionError} className="mt-3" />}
      </Modal>

      <Modal
        open={action === "delete"}
        onOpenChange={(open) => !open && setAction(null)}
        title="Eliminar organización"
        description="Borrado definitivo: no se puede deshacer."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={
                actionBusy ||
                confirmText.trim().length === 0 ||
                preview?.organization?.protected === true
              }
              onClick={() => void runAction()}
            >
              {actionBusy ? "Eliminando…" : "Eliminar definitivamente"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Se eliminan permanentemente los agentes, el conocimiento, las claves,
            el consumo y la auditoría de{" "}
            <strong className="text-text">
              {peek ? peek.company_name || peek.name : ""}
            </strong>
            . Antes conviene descargar un respaldo.
          </p>
          {preview?.organization?.protected && (
            <ErrorInline
              message={
                preview.organization.protected_reason ||
                "La organización tiene un platform admin como miembro: reasignalo antes de eliminarla."
              }
            />
          )}
          <Field
            label={`Escribí «${peek ? peek.company_name || peek.name : ""}» para confirmar`}
          >
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Nombre exacto"
            />
          </Field>
          <p className="text-xs text-danger">
            Debe estar sin requerimientos abiertos y no puede ser tu propia organización.
          </p>
        </div>
        {actionError && <ErrorInline message={actionError} className="mt-3" />}
      </Modal>
    </div>
  );
}
