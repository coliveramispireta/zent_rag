import { useEffect, useMemo, useState } from "react";
import { Robot } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Input,
  Metric,
  MetricGrid,
  Panel,
  PanelHeader,
  Select,
  SkeletonBlock,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";

type OrgAgent = {
  id: string;
  name: string;
  model: string | null;
  is_active: boolean;
  created_at: string | null;
  deployments: number;
};

type StatusFilter = "all" | "active" | "inactive";

/**
 * Nivel 2 — Agentes de la organización.
 *
 * Hoy el API de plataforma expone solo lectura (`GET .../agents`); las acciones
 * de edición y pausa se habilitan cuando exista el endpoint de administración
 * por organización.
 */
export function OrgAgents({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [agents, setAgents] = useState<OrgAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const token = session?.token ?? "";

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    platformApi<{ agents: OrgAgent[] }>(
      `/api/v1/platform/organizations/${orgId}/agents`,
      { token },
    )
      .then((data) => {
        if (!cancelled) setAgents(data.agents ?? []);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No se pudieron cargar los agentes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (status === "active" && !agent.is_active) return false;
      if (status === "inactive" && agent.is_active) return false;
      if (needle && !agent.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [agents, query, status]);

  const active = agents.filter((agent) => agent.is_active).length;

  const columns: Column<OrgAgent>[] = [
    {
      key: "name",
      header: "Agente",
      render: (agent) => (
        <span className="font-medium text-text">{agent.name}</span>
      ),
    },
    {
      key: "model",
      header: "Modelo",
      render: (agent) => (
        <span className="mono text-xs text-muted">{agent.model || "automático"}</span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (agent) => (
        <Badge tone={agent.is_active ? "ok" : "neutral"}>
          {agent.is_active ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      key: "deployments",
      header: "Despliegues",
      align: "right",
      render: (agent) => agent.deployments,
    },
    {
      key: "created",
      header: "Creado",
      align: "right",
      render: (agent) => (
        <span className="text-xs text-muted">{fmtDate(agent.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <MetricGrid>
        <Metric label="Agentes" value={agents.length} />
        <Metric label="Activos" value={active} />
        <Metric label="Inactivos" value={agents.length - active} />
        <Metric
          label="Con despliegue"
          value={agents.filter((agent) => agent.deployments > 0).length}
        />
      </MetricGrid>

      <Panel>
        <PanelHeader
          title="Agentes de la organización"
          description="Alta, configuración y pausa de agentes. Hoy la vista es de solo lectura: la administración se habilita cuando exista el endpoint por organización."
        />

        <div className="flex flex-wrap items-end gap-2 px-4 pb-3 pt-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre"
            aria-label="Buscar agente"
            className="h-9 w-[240px]"
          />
          <Select
            aria-label="Filtrar por estado"
            className="h-9 w-[170px]"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">Todos los estados</option>
            <option value="active">Solo activos</option>
            <option value="inactive">Solo inactivos</option>
          </Select>
          <span className="text-xs text-faint">{rows.length} de {agents.length}</span>
        </div>

        {error && <ErrorInline message={error} />}
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(agent) => agent.id}
            caption="Agentes de la organización"
            empty={
              <EmptyState
                icon={Robot}
                title={agents.length === 0 ? "Sin agentes" : "Sin coincidencias"}
                body={
                  agents.length === 0
                    ? "Esta organización todavía no creó agentes."
                    : "Ajustá la búsqueda o el filtro de estado."
                }
              />
            }
          />
        )}
      </Panel>
    </div>
  );
}
