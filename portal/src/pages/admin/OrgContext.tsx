import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { useParams, useSearchParams } from "react-router-dom";
import CustomerDetail from "./CustomerDetail";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  ButtonLink,
  EmptyState,
  ErrorInline,
  Metric,
  MetricGrid,
  PageHeader,
  Panel,
  PanelHeader,
  SkeletonBlock,
} from "../../components/ui";
import { OrgAgents } from "../../components/org/OrgAgents";
import ErrorBoundary from "../../components/ErrorBoundary";
import { ChangeGrantBar } from "../../components/org/ChangeGrantBar";
import { OrgApplications } from "../../components/org/OrgApplications";
import { OrgIngestion } from "../../components/org/OrgIngestion";
import { OrgConsumption } from "../../components/org/OrgConsumption";
import { OrgBudget } from "../../components/org/OrgBudget";
import { OrgParameters } from "../../components/org/OrgParameters";
import {
  ORG_SECTIONS,
  parseOrgSection,
  type OrgSectionId,
} from "../../lib/orgSections";

type OrgDetail = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  plan: string | null;
  status: string | null;
};

type Health = { score: number; label: string };

type Counts = { users: number; agents: number; sources: number };

const EMPTY_COUNTS: Counts = { users: 0, agents: 0, sources: 0 };

/**
 * Capacidades de IA del contexto. Se abren dentro del propio contexto
 * (`?seccion=ia&vista=<slug>`) para no perder el segundo sidebar.
 */
const AI_VIEWS: Record<
  string,
  { label: string; Page: LazyExoticComponent<ComponentType> }
> = {
  "model-gateway": {
    label: "Gateway de modelos",
    Page: lazy(() => import("./ModelGateway")),
  },
  "decision-engine": {
    label: "Motor de decisión",
    Page: lazy(() => import("./DecisionEngine")),
  },
  "ai-runtime": { label: "Runtime de IA", Page: lazy(() => import("./Runtime")) },
  "inference-proxy": {
    label: "Inferencia",
    Page: lazy(() => import("./InferenceProxy")),
  },
  evals: { label: "Evaluaciones", Page: lazy(() => import("./EvalsLab")) },
  traces: { label: "Trazas", Page: lazy(() => import("./Traces")) },
  "model-health": {
    label: "Salud de modelos",
    Page: lazy(() => import("./ModelHealth")),
  },
  metering: { label: "Medición", Page: lazy(() => import("./Metering")) },
  "cost-governance": {
    label: "Gobierno de costos",
    Page: lazy(() => import("./CostGovernance")),
  },
  optimizer: { label: "Optimizador", Page: lazy(() => import("./Optimizer")) },
  workflows: { label: "Flujos de trabajo", Page: lazy(() => import("./Workflows")) },
  copilot: { label: "Copiloto", Page: lazy(() => import("./Copilot")) },
  feedback: { label: "Retroalimentación", Page: lazy(() => import("./Feedback")) },
  "chat-insights": {
    label: "Insights de chat",
    Page: lazy(() => import("./ChatInsights")),
  },
};

const AI_LINKS = Object.entries(AI_VIEWS).map(([slug, item]) => ({
  slug,
  label: item.label,
}));

export default function OrgContext() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = usePlatformAuth();
  const section = parseOrgSection(searchParams.get("seccion"));
  const aiVista = searchParams.get("vista");
  const aiView = aiVista ? AI_VIEWS[aiVista] : undefined;

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessOrigin, setAccessOrigin] = useState("Acceso directo");

  const token = session?.token ?? "";

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    async function load() {
      const [detail, healthRes, users, agents, sources] = await Promise.allSettled([
        platformApi<OrgDetail>(`/api/v1/platform/organizations/${orgId}`, { token }),
        platformApi<Health>(`/api/v1/platform/tenants/${orgId}/health`, { token }),
        platformApi<{ users: unknown[] }>(
          `/api/v1/platform/organizations/${orgId}/users`,
          { token },
        ),
        platformApi<{ agents: unknown[] }>(
          `/api/v1/platform/organizations/${orgId}/agents`,
          { token },
        ),
        platformApi<{ sources: unknown[] }>(
          `/api/v1/platform/organizations/${orgId}/sources`,
          { token },
        ),
      ]);
      if (cancelled) return;
      if (detail.status === "fulfilled") setOrg(detail.value);
      else setError("No se pudo cargar la organización.");
      if (healthRes.status === "fulfilled") setHealth(healthRes.value);
      setCounts({
        users: users.status === "fulfilled" ? (users.value.users?.length ?? 0) : 0,
        agents: agents.status === "fulfilled" ? (agents.value.agents?.length ?? 0) : 0,
        sources: sources.status === "fulfilled" ? (sources.value.sources?.length ?? 0) : 0,
      });
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, orgId]);

  // Origen del acceso: aplicaciones por las que consume + acceso directo.
  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    platformApi<{
      applications: { name: string }[];
      direct_access_keys: number;
    }>(`/api/v1/platform/organizations/${orgId}/applications`, {
      token,
    })
      .then((data) => {
        if (cancelled) return;
        const names = (data.applications ?? []).map((app) => app.name);
        const direct = data.direct_access_keys > 0;
        if (names.length === 0) setAccessOrigin("Acceso directo");
        else if (direct) setAccessOrigin(`${names.join(", ")} + acceso directo`);
        else setAccessOrigin(names.join(", "));
      })
      .catch(() => {
        if (!cancelled) setAccessOrigin("—");
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId]);

  const title = useMemo(
    () => org?.company_name || org?.name || "Organización",
    [org],
  );

  function goTo(next: OrgSectionId) {
    const params = new URLSearchParams(searchParams);
    if (next === "resumen") params.delete("seccion");
    else params.set("seccion", next);
    setSearchParams(params, { replace: true });
  }

  const current = ORG_SECTIONS.find((item) => item.id === section);

  return (
    <div className="space-y-6">
      <ChangeGrantBar orgId={orgId} />

      <PageHeader
        title={title}
        subtitle={org?.email ?? undefined}
        actions={
          <ButtonLink
            to={`/control-center/tenants/${orgId}`}
            variant="secondary"
            size="sm"
          >
            Ver ficha completa
          </ButtonLink>
        }
      />

      <nav
        aria-label="Secciones de la organización"
        className="flex flex-wrap gap-1.5 lg:hidden"
      >
        {ORG_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goTo(item.id)}
            aria-current={item.id === section ? "page" : undefined}
            className={
              item.id === section
                ? "rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-text"
                : "rounded-sm border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-soft/60 hover:text-text"
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <ErrorInline message={error} />}
      {loading ? <SkeletonBlock rows={4} /> : null}

      <ErrorBoundary>
      {!loading && section === "resumen" && (
        <>
          <MetricGrid>
            <Metric
              label="Salud"
              value={health ? `${health.score}/100` : "—"}
              hint={health?.label}
            />
            <Metric label="Usuarios" value={counts.users} />
            <Metric label="Agentes" value={counts.agents} />
            <Metric label="Fuentes" value={counts.sources} />
          </MetricGrid>

          <Panel>
            <PanelHeader
              title="Contexto de la organización"
              description="Nivel 2 del menú: aquí se administra esta organización sin cambiar de sesión."
            />
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Plan</dt>
                <dd className="text-text">{org?.plan ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Estado</dt>
                <dd className="text-text">{org?.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Origen del acceso</dt>
                <dd className="text-text">{accessOrigin}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Usuario de la aplicación</dt>
                <dd className="text-text">{org?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Organización</dt>
                <dd className="mono text-xs text-muted">{orgId}</dd>
              </div>
            </dl>
          </Panel>
        </>
      )}

      {!loading && section === "agentes" && <OrgAgents orgId={orgId} />}

      {!loading && section === "ingesta" && <OrgIngestion orgId={orgId} />}

      {!loading && section === "aplicaciones" && <OrgApplications orgId={orgId} />}

      {!loading && section === "parametros" && <OrgParameters orgId={orgId} />}

      {!loading && section === "administracion" && <CustomerDetail embedded />}

      {!loading && section === "consumo" && (
        <div className="space-y-6">
          <OrgBudget orgId={orgId} />
          <OrgConsumption orgId={orgId} />
        </div>
      )}

      {!loading && section === "ia" && !aiView && (
        <Panel>
          <PanelHeader
            title="Configuración de IA de la organización"
            description="Estas capacidades se configuran por organización. Se abren aquí mismo, sin salir del contexto."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AI_LINKS.map((link) => (
              <ButtonLink
                key={link.slug}
                to={`/control-center/org/${orgId}?seccion=ia&vista=${link.slug}`}
                variant="secondary"
                size="sm"
              >
                {link.label}
              </ButtonLink>
            ))}
          </div>
        </Panel>
      )}

      {!loading && section === "ia" && aiView && aiVista && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-soft px-3 py-2">
            <span className="text-xs text-muted">
              {aiView.label} · vista global de plataforma. El alcance por
              organización llega en la próxima etapa.
            </span>
            <ButtonLink
              to={`/control-center/org/${orgId}?seccion=ia`}
              variant="ghost"
              size="sm"
            >
              ‹ Todas las capacidades
            </ButtonLink>
          </div>
          <Suspense fallback={<SkeletonBlock rows={4} />}>
            <aiView.Page />
          </Suspense>
        </div>
      )}

      {!loading &&
        section !== "resumen" &&
        section !== "ia" &&
        section !== "agentes" &&
        section !== "ingesta" &&
        section !== "aplicaciones" &&
        section !== "parametros" &&
        section !== "consumo" && (
        <EmptyState
          title={`${current?.label ?? "Sección"} — en preparación`}
          body="Esta sección del Nivel 2 se construye en la siguiente etapa de la reorganización."
          hint="Mientras tanto, todo lo disponible de la organización está en las demás secciones de este menú."
        />
      )}
      </ErrorBoundary>
    </div>
  );
}
