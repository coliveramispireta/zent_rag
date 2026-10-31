import { useEffect, useState } from "react";
import { platformApi } from "../../api";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorInline,
  Field,
  Input,
  Metric,
  MetricGrid,
  PageHeader,
  Panel,
  PanelHeader,
  Select,
  SkeletonBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  type Column,
} from "../../components/ui";
import { fmtCurrency, fmtNum } from "../../lib/format";
import { usePlatformAuth } from "../../platformAuth";

type Dash = {
  decisions: {
    decisions_today: number;
    rules_pct: number;
    jev_pct: number;
    small_llm_pct: number;
    reasoning_llm_pct: number;
    average_confidence: number;
    fallback_rate: number;
    average_latency_ms: number;
  };
  usage: {
    requests: number;
    tokens: number;
    cost: number;
    average_cost: number;
    weighted_average_cost: number;
    by_event_type: { event_type: string; requests: number; cost: number }[];
    by_provider: { provider: string; requests: number; cost: number }[];
  };
  efficiency: {
    score: number;
    components: { quality: number; cost: number; latency: number; fallback: number };
    weights: { quality: number; cost: number; latency: number; fallback: number };
    formula: string;
  };
  llm_calls_avoided_estimate: number;
  flags: Record<string, string | number>;
};

type Price = {
  provider: string;
  model: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  embedding_cost_per_1k: number;
  request_cost: number;
  cost_kind: string;
  currency: string;
  updated_at: string;
};

type Cap = {
  id: string;
  name: string;
  handler: string;
  risk: string;
  cost_class: string;
  availability: string;
};

export default function AdminRuntimePage() {
  const { session } = usePlatformAuth();
  const token = session?.token;
  const [dash, setDash] = useState<Dash | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [labInput, setLabInput] = useState(
    '[{"request":"hola","expected_capability":"respond_directly"}]',
  );
  const [labOut, setLabOut] = useState<string>("");
  const [edit, setEdit] = useState<Partial<Price>>({
    provider: "jev",
    model: "jev-latest",
    input_cost_per_1k: 0,
    output_cost_per_1k: 0,
    embedding_cost_per_1k: 0,
    request_cost: 0,
    cost_kind: "provider",
    currency: "USD",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [board, providers, capabilities] = await Promise.all([
          platformApi<Dash>("/api/v1/platform/runtime/dashboard", { token }),
          platformApi<{ prices: Price[] }>("/api/v1/platform/runtime/providers", { token }),
          platformApi<{ items: Cap[] }>("/api/v1/platform/runtime/capabilities", { token }),
        ]);
        if (cancelled) return;
        setDash(board);
        setPrices(providers.prices || []);
        setCaps(capabilities.items || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load runtime");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function savePrice() {
    if (!token) return;
    try {
      await platformApi("/api/v1/platform/runtime/providers", {
        token,
        method: "PUT",
        body: JSON.stringify(edit),
      });
      const providers = await platformApi<{ prices: Price[] }>("/api/v1/platform/runtime/providers", {
        token,
      });
      setPrices(providers.prices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el precio");
    }
  }

  async function runLab() {
    if (!token) return;
    try {
      const cases = JSON.parse(labInput);
      const out = await platformApi("/api/v1/platform/runtime/experiments", {
        token,
        method: "POST",
        body: JSON.stringify({ cases }),
      });
      setLabOut(JSON.stringify(out, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falló el experimento");
    }
  }

  const priceCols: Column<Price>[] = [
    { key: "provider", header: "Proveedor", render: (row) => row.provider },
    { key: "model", header: "Modelo", render: (row) => row.model },
    { key: "kind", header: "Tipo", render: (row) => row.cost_kind },
    {
      key: "in",
      header: "Entrada / 1k",
      align: "right",
      render: (row) => fmtCurrency(row.input_cost_per_1k),
    },
    {
      key: "out",
      header: "Salida / 1k",
      align: "right",
      render: (row) => fmtCurrency(row.output_cost_per_1k),
    },
    {
      key: "req",
      header: "Por solicitud",
      align: "right",
      render: (row) => fmtCurrency(row.request_cost || 0),
    },
  ];

  const capCols: Column<Cap>[] = [
    { key: "id", header: "Capacidad", render: (row) => row.id },
    { key: "handler", header: "Manejador", render: (row) => row.handler || "—" },
    { key: "risk", header: "Riesgo", render: (row) => row.risk },
    { key: "cost", header: "Costo", render: (row) => row.cost_class },
    { key: "availability", header: "Disponibilidad", render: (row) => row.availability },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Runtime de IA"
        subtitle="Conocimiento, agentes, herramientas y flujos de trabajo son capacidades del mismo runtime. JEV decide; el orquestador ejecuta."
      />
      {error ? <ErrorInline message={error} /> : null}
      {loading ? <SkeletonBlock rows={5} /> : null}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="providers">Proveedores</TabsTrigger>
          <TabsTrigger value="capabilities">Capacidades</TabsTrigger>
          <TabsTrigger value="lab">Laboratorio de experimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {dash ? (
            <div className="flex flex-col gap-4">
              <MetricGrid>
                <Metric label="Solicitudes de hoy" value={fmtNum(dash.usage.requests)} />
                <Metric label="Decisiones" value={fmtNum(dash.decisions.decisions_today)} />
                <Metric label="JEV %" value={`${dash.decisions.jev_pct}%`} />
                <Metric label="Reglas %" value={`${dash.decisions.rules_pct}%`} />
                <Metric label="LLM pequeño %" value={`${dash.decisions.small_llm_pct}%`} />
                <Metric label="LLM grande %" value={`${dash.decisions.reasoning_llm_pct}%`} />
                <Metric label="Costo promedio por solicitud" value={fmtCurrency(dash.usage.average_cost)} />
                <Metric
                  label="Costo ponderado por solicitud"
                  value={fmtCurrency(dash.usage.weighted_average_cost)}
                />
                <Metric label="Tokens" value={fmtNum(dash.usage.tokens)} />
                <Metric label="Costo del proveedor" value={fmtCurrency(dash.usage.cost)} />
                <Metric
                  label="Llamadas LLM evitadas (est.)"
                  value={fmtNum(dash.llm_calls_avoided_estimate)}
                />
                <Metric label="Índice de eficiencia de IA" value={dash.efficiency.score.toFixed(3)} />
              </MetricGrid>
              <Panel>
                <PanelHeader title="Componentes de eficiencia" />
                <p className="mb-3 text-[12px] text-muted">{dash.efficiency.formula}</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  {(["quality", "cost", "latency", "fallback"] as const).map((key) => (
                    <div key={key}>
                      <div className="text-xs text-muted">{key}</div>
                      <div>{dash.efficiency.components[key].toFixed(3)}</div>
                      <div className="text-xs text-faint">
                        peso {dash.efficiency.weights[key].toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel>
                <PanelHeader title="Banderas" />
                <div className="flex flex-wrap gap-2">
                  {Object.entries(dash.flags).map(([key, value]) => (
                    <Badge key={key} tone="neutral">
                      {key}: {String(value)}
                    </Badge>
                  ))}
                </div>
              </Panel>
              <Panel>
                <PanelHeader title="Forma del trace" />
                <p className="text-[13px] leading-relaxed text-muted">
                  Usuario → Decisión JEV → Búsqueda de conocimiento → Gate de evidencia → Respuesta.
                  El chat ejecuta conocimiento y SQL; agentes, flujos de trabajo y herramientas
                  corren con objetivo explícito (agent_id / workflow_id / tool) vía
                  CapabilityDispatcher. Cada paso registra duración, tokens, costo, confianza y
                  estado en decision_traces y rag_trace.
                </p>
              </Panel>
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="providers">
          <Panel>
            <PanelHeader title="Costos por proveedor" />
              <DataTable
                columns={priceCols}
                rows={prices}
                rowKey={(row) => `${row.provider}:${row.model}`}
                empty={<EmptyState title="Sin precios" body="El registro de pricing_models está vacío." />}
              />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Proveedor">
                <Input
                  value={String(edit.provider || "")}
                  onChange={(e) => setEdit({ ...edit, provider: e.target.value })}
                />
              </Field>
              <Field label="Modelo">
                <Input
                  value={String(edit.model || "")}
                  onChange={(e) => setEdit({ ...edit, model: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <Select
                  value={String(edit.cost_kind || "provider")}
                  onChange={(e) => setEdit({ ...edit, cost_kind: e.target.value })}
                >
                  <option value="provider">proveedor</option>
                  <option value="internal">interno</option>
                  <option value="customer">cliente</option>
                </Select>
              </Field>
              <Field label="Entrada / 1k">
                <Input
                  type="number"
                  value={String(edit.input_cost_per_1k ?? 0)}
                  onChange={(e) => setEdit({ ...edit, input_cost_per_1k: Number(e.target.value) })}
                />
              </Field>
              <Field label="Salida / 1k">
                <Input
                  type="number"
                  value={String(edit.output_cost_per_1k ?? 0)}
                  onChange={(e) => setEdit({ ...edit, output_cost_per_1k: Number(e.target.value) })}
                />
              </Field>
              <Field label="Por solicitud">
                <Input
                  type="number"
                  value={String(edit.request_cost ?? 0)}
                  onChange={(e) => setEdit({ ...edit, request_cost: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Button className="mt-3" onClick={() => void savePrice()}>
              Guardar precio
            </Button>
          </Panel>
        </TabsContent>
        <TabsContent value="capabilities">
          <Panel>
            <PanelHeader title="Registro de capacidades" />
              <DataTable
                columns={capCols}
                rows={caps}
                rowKey={(row) => row.id}
                empty={<EmptyState title="Sin capacidades" body="El catálogo no devolvió especificaciones." />}
              />
          </Panel>
        </TabsContent>
        <TabsContent value="lab">
          <Panel>
            <PanelHeader title="Laboratorio de experimentos" />
            <p className="mb-3 text-[13px] text-muted">
              Compara reglas, JEV, LLM pequeño y LLM de razonamiento sobre un dataset. No es tráfico
              de producción.
            </p>
            <Textarea rows={8} value={labInput} onChange={(e) => setLabInput(e.target.value)} />
            <Button className="mt-3" onClick={() => void runLab()}>
              Ejecutar comparación
            </Button>
            {labOut ? (
              <pre className="mt-4 overflow-auto rounded-md bg-soft p-3 text-[12px]">{labOut}</pre>
            ) : null}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
