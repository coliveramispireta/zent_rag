import { useCallback, useEffect, useMemo, useState } from "react";
import { Robot } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  Button,
  ButtonLink,
  type Column,
  DataTable,
  Drawer,
  EmptyState,
  ErrorInline,
  Field,
  Input,
  Metric,
  MetricGrid,
  Modal,
  Panel,
  PanelHeader,
  Select,
  SkeletonBlock,
  Textarea,
} from "../../components/ui";
import { fmtDate, fmtDateTime } from "../../lib/format";
import { readGrant } from "../../lib/changeGrant";

type OrgAgent = {
  id: string;
  name: string;
  model: string | null;
  is_active: boolean;
  created_at: string | null;
  deployments: number;
};

type StatusFilter = "all" | "active" | "inactive";

type Automation = {
  workflow_id: string;
  name: string;
  status: string;
  when: string;
  runs_7d: number;
  failed_runs: number;
  success_rate: number | string | null;
  last_activity?: string | null;
};

const AUTOMATION_LABEL: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  draft: "Borrador",
  error: "Con errores",
  needs_attention: "Requiere atención",
};

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
  const [selected, setSelected] = useState<OrgAgent | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [busyFlow, setBusyFlow] = useState("");
  const [agentModal, setAgentModal] = useState<"new" | "edit" | null>(null);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [kbs, setKbs] = useState<{ id: string; name: string }[]>([]);
  const [agentForm, setAgentForm] = useState({
    name: "",
    description: "",
    system_prompt: "",
    model: "",
    is_active: true,
    knowledge_base_ids: [] as string[],
  });

  const token = session?.token ?? "";

  async function loadKbs() {
    try {
      const data = await platformApi<{ knowledge_bases: { id: string; name: string }[] }>(
        `/api/v1/platform/organizations/${orgId}/knowledge-bases`,
        { token }
      );
      setKbs(data.knowledge_bases ?? []);
    } catch {
      setKbs([]);
    }
  }

  function openNewAgent() {
    setAgentError("");
    setAgentForm({
      name: "",
      description: "",
      system_prompt: "",
      model: "",
      is_active: true,
      knowledge_base_ids: [],
    });
    setAgentModal("new");
    void loadKbs();
  }

  async function openEditAgent() {
    if (!selected) return;
    setAgentError("");
    try {
      const detail = await platformApi<{
        name: string;
        description: string | null;
        system_prompt: string | null;
        model: string | null;
        is_active: boolean;
        knowledge_base_ids: string[];
      }>(`/api/v1/platform/organizations/${orgId}/agents/${selected.id}`, { token });
      setAgentForm({
        name: detail.name,
        description: detail.description ?? "",
        system_prompt: detail.system_prompt ?? "",
        model: detail.model ?? "",
        is_active: detail.is_active,
        knowledge_base_ids: detail.knowledge_base_ids ?? [],
      });
      setAgentModal("edit");
      await loadKbs();
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : "No se pudo cargar el agente.");
    }
  }

  async function saveAgent() {
    setAgentSaving(true);
    setAgentError("");
    try {
      const grant = readGrant(orgId);
      const payload = {
        name: agentForm.name.trim(),
        description: agentForm.description.trim() || null,
        system_prompt: agentForm.system_prompt.trim() || null,
        model: agentForm.model.trim() || null,
        is_active: agentForm.is_active,
        knowledge_base_ids: agentForm.knowledge_base_ids,
      };
      if (agentModal === "edit" && selected) {
        await platformApi(`/api/v1/platform/organizations/${orgId}/agents/${selected.id}`, {
          method: "PATCH",
          token,
          headers: grant ? { "X-Change-Token": grant.token } : undefined,
          body: JSON.stringify(payload),
        });
      } else {
        await platformApi(`/api/v1/platform/organizations/${orgId}/agents`, {
          method: "POST",
          token,
          headers: grant ? { "X-Change-Token": grant.token } : undefined,
          body: JSON.stringify({ ...payload, tools: [] }),
        });
      }
      setAgentModal(null);
      await reloadAgents();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setAgentError(
        message.includes("change_grant_required")
          ? "Tomá un requerimiento abierto para crear o editar agentes."
          : message || "No se pudo guardar el agente.",
      );
    } finally {
      setAgentSaving(false);
    }
  }

  async function openAgent(agent: OrgAgent) {
    setSelected(agent);
    setAutomations([]);
    setFlowError("");
    setFlowLoading(true);
    try {
      const data = await platformApi<{ automations: Automation[] }>(
        `/api/v1/platform/organizations/${orgId}/agents/${agent.id}/automations`,
        { token },
      );
      setAutomations(data.automations ?? []);
    } catch (e) {
      setFlowError(
        e instanceof Error ? e.message : "No se pudieron cargar los flujos del agente.",
      );
    } finally {
      setFlowLoading(false);
    }
  }

  async function toggleFlow(flow: Automation) {
    setBusyFlow(flow.workflow_id);
    setFlowError("");
    try {
      const grant = readGrant(orgId);
      await platformApi(`/api/v1/platform/workflows/${flow.workflow_id}/status`, {
        method: "POST",
        token,
        headers: grant ? { "X-Change-Token": grant.token } : undefined,
        body: JSON.stringify({
          status: flow.status === "active" ? "paused" : "active",
        }),
      });
      if (selected) await openAgent(selected);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setFlowError(
        message.includes("change_grant_required")
          ? "Tomá un requerimiento abierto para pausar o activar flujos."
          : message || "No se pudo cambiar el estado del flujo.",
      );
    } finally {
      setBusyFlow("");
    }
  }

  const reloadAgents = useCallback(async () => {
    if (!token || !orgId) return;
    setLoading(true);
    setError("");
    try {
      const data = await platformApi<{ agents: OrgAgent[] }>(
        `/api/v1/platform/organizations/${orgId}/agents`,
        { token },
      );
      setAgents(data.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los agentes.");
    } finally {
      setLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    void reloadAgents();
  }, [reloadAgents]);

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
      key: "flows",
      header: "Flujos",
      align: "right",
      render: (agent) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            void openAgent(agent);
          }}
        >
          Ver flujos
        </Button>
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
          description="Agentes de la organización. Abrí uno para ver sus flujos de trabajo, editarlos y pausarlos."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={openNewAgent}
              >
                Nuevo agente
              </Button>
              <ButtonLink
                to={`/control-center/org/${orgId}/flujos/nuevo`}
                size="sm"
              >
                Nuevo flujo
              </ButtonLink>
            </div>
          }
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
            bare
            columns={columns}
            rows={rows}
            rowKey={(agent) => agent.id}
            caption="Agentes de la organización"
            onRowClick={(agent) => void openAgent(agent)}
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

      <Drawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected ? `Flujos de ${selected.name}` : "Flujos del agente"}
        description="Automatizaciones ligadas a este agente. Se pueden pausar o activar sin salir del contexto."
        width={520}
        footer={
          selected && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void openEditAgent()}>
                Editar agente
              </Button>
              <ButtonLink
                to={`/control-center/org/${orgId}/flujos/nuevo?agente=${selected.id}`}
                size="sm"
              >
                Nuevo flujo con este agente
              </ButtonLink>
            </div>
          )
        }
      >
        {flowError && <ErrorInline message={flowError} />}
        {flowLoading ? (
          <SkeletonBlock rows={3} />
        ) : automations.length === 0 ? (
          <EmptyState
            icon={Robot}
            title="Sin flujos"
            body="Este agente todavía no tiene automatizaciones."
            compact
          />
        ) : (
          <ul className="space-y-2">
            {automations.map((flow) => (
              <li
                key={flow.workflow_id}
                className="rounded-md border border-border bg-soft px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text">{flow.name}</span>
                  <Badge
                    tone={
                      flow.status === "active"
                        ? "ok"
                        : flow.status === "error"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {AUTOMATION_LABEL[flow.status] ?? flow.status}
                  </Badge>
                  <span className="ml-auto text-xs text-faint tabular-nums">
                    {flow.runs_7d} ejec. · {flow.success_rate ?? "—"}%
                  </span>
                </div>
                {flow.when && (
                  <p className="mt-1 text-xs text-muted">Cuando {flow.when.toLowerCase()}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ButtonLink
                    to={`/control-center/org/${orgId}/flujos/${flow.workflow_id}`}
                    variant="secondary"
                    size="sm"
                  >
                    Abrir editor
                  </ButtonLink>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyFlow === flow.workflow_id}
                    onClick={() => void toggleFlow(flow)}
                  >
                    {busyFlow === flow.workflow_id
                      ? "Cambiando…"
                      : flow.status === "active"
                        ? "Pausar"
                        : "Activar"}
                  </Button>
                  {flow.last_activity && (
                    <span className="text-xs text-faint">
                      Última actividad {fmtDateTime(flow.last_activity)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

      </Drawer>

      <Modal
        open={agentModal !== null}
        onOpenChange={(open) => !open && setAgentModal(null)}
        title={agentModal === "edit" ? "Editar agente" : "Nuevo agente"}
        description="El prompt define cómo responde. El flujo se enlaza después desde el editor, eligiendo este agente en el nodo LLM."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAgentModal(null)}>
              Cancelar
            </Button>
            <Button
              disabled={agentSaving || agentForm.name.trim().length < 2}
              onClick={() => void saveAgent()}
            >
              {agentSaving ? "Guardando…" : "Guardar agente"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input
              value={agentForm.name}
              onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })}
              placeholder="Ej. Ventas WhatsApp"
            />
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Input
              value={agentForm.description}
              onChange={(event) =>
                setAgentForm({ ...agentForm, description: event.target.value })
              }
              placeholder="Para qué sirve este agente"
            />
          </Field>
          <Field
            label="Prompt del sistema"
            hint="Cómo responde, qué tono usa y qué no debe hacer."
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={agentForm.system_prompt}
              onChange={(event) =>
                setAgentForm({ ...agentForm, system_prompt: event.target.value })
              }
            />
          </Field>
          <Field label="Modelo" hint="Vacío = modelo por defecto de la organización">
            <Input
              value={agentForm.model}
              onChange={(event) => setAgentForm({ ...agentForm, model: event.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>
          <Field label="Estado">
            <label className="flex h-9 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={agentForm.is_active}
                onChange={(event) =>
                  setAgentForm({ ...agentForm, is_active: event.target.checked })
                }
              />
              Agente activo
            </label>
          </Field>
          <Field
            label="Conocimiento"
            hint="Colecciones de conocimiento a las que puede mirar."
            className="sm:col-span-2"
          >
            {kbs.length === 0 ? (
              <p className="text-xs text-muted">La organización no tiene colecciones.</p>
            ) : (
              <ul className="space-y-1">
                {kbs.map((kb) => (
                  <li key={kb.id}>
                    <label className="flex items-center gap-2 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={agentForm.knowledge_base_ids.includes(kb.id)}
                        onChange={(event) =>
                          setAgentForm({
                            ...agentForm,
                            knowledge_base_ids: event.target.checked
                              ? [...agentForm.knowledge_base_ids, kb.id]
                              : agentForm.knowledge_base_ids.filter((id) => id !== kb.id),
                          })
                        }
                      />
                      {kb.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
        {agentError && <ErrorInline message={agentError} className="mt-3" />}
      </Modal>
    </div>
  );
}
