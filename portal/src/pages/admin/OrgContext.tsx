import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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

/** Capacidades de IA que pertenecen al contexto de la organización. */
const AI_LINKS = [
  { to: "/control-center/model-gateway", label: "Gateway de modelos" },
  { to: "/control-center/decision-engine", label: "Motor de decisión" },
  { to: "/control-center/ai-runtime", label: "Runtime de IA" },
  { to: "/control-center/inference-proxy", label: "Inferencia" },
  { to: "/control-center/evals", label: "Evaluaciones" },
  { to: "/control-center/traces", label: "Trazas" },
  { to: "/control-center/model-health", label: "Salud de modelos" },
  { to: "/control-center/metering", label: "Medición" },
  { to: "/control-center/cost-governance", label: "Gobierno de costos" },
  { to: "/control-center/optimizer", label: "Optimizador" },
];

export default function OrgContext() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = usePlatformAuth();
  const section = parseOrgSection(searchParams.get("seccion"));

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

      {!loading && section === "consumo" && (
        <div className="space-y-6">
          <OrgBudget orgId={orgId} />
          <OrgConsumption orgId={orgId} />
        </div>
      )}

      {!loading && section === "ia" && (
        <Panel>
          <PanelHeader
            title="Configuración de IA de la organización"
            description="Estas capacidades se configuran por organización. Por ahora abren la vista global de plataforma, hasta que tengan alcance propio por organización."
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AI_LINKS.map((link) => (
              <ButtonLink
                key={link.to}
                to={link.to}
                variant="secondary"
                size="sm"
              >
                {link.label}
              </ButtonLink>
            ))}
          </div>
        </Panel>
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
          hint="Mientras tanto, la ficha completa de la organización muestra el detalle disponible hoy."
          action={
            <ButtonLink
              to={`/control-center/tenants/${orgId}`}
              variant="secondary"
              size="sm"
            >
              Ver ficha completa
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
