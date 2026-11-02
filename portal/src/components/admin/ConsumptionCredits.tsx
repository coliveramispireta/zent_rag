import { useCallback, useEffect, useState } from "react";
import { Coins, PencilSimple } from "@phosphor-icons/react";
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
  Metric,
  MetricGrid,
  Modal,
  Panel,
  PanelHeader,
  SectionHeader,
  SkeletonBlock,
} from "../ui";

type OverviewRow = {
  organization_id: string;
  name: string;
  credits: number;
  monthly_credits: number;
  credits_used_pct: number;
  events: number;
  state: string;
};

type Overview = {
  period: { from: string; to: string };
  organizations: OverviewRow[];
  totals: { credits: number; alerting: number; blocked: number; without_budget: number };
};

type Rate = {
  model: string;
  input_credits_per_1k: number;
  output_credits_per_1k: number;
  embedding_credits_per_1k: number;
};

const STATE: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  ok: { label: "OK", tone: "ok" },
  alerta: { label: "Cerca del límite", tone: "warn" },
  bloqueado: { label: "Bloqueado", tone: "danger" },
  sin_presupuesto: { label: "Sin presupuesto", tone: "neutral" },
};

const fmtCredits = (value: number) =>
  value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Nivel 1 — consumo en créditos de todas las organizaciones y tarifas de
 * conversión tokens → créditos.
 */
export function ConsumptionCredits() {
  const { session } = usePlatformAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Rate | null>(null);
  const [saving, setSaving] = useState(false);

  const token = session?.token ?? "";

  const load = useCallback(async () => {
    if (!token) return;
    const [o, r] = await Promise.all([
      platformApi<Overview>("/api/v1/platform/consumption/overview", { token }),
      platformApi<{ rates: Rate[] }>("/api/v1/platform/model-rates", { token }),
    ]);
    setOverview(o);
    setRates(r.rates ?? []);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer el consumo."))
      .finally(() => setLoading(false));
  }, [token, load]);

  async function saveRate() {
    if (!editing) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await platformApi(`/api/v1/platform/model-rates/${encodeURIComponent(editing.model)}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          input_credits_per_1k: Number(editing.input_credits_per_1k),
          output_credits_per_1k: Number(editing.output_credits_per_1k),
          embedding_credits_per_1k: Number(editing.embedding_credits_per_1k),
        }),
      });
      setEditing(null);
      setNotice("Tarifa actualizada. Aplica al consumo del período en curso.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la tarifa.");
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<OverviewRow>[] = [
    {
      key: "name",
      header: "Organización",
      render: (row) => <span className="font-medium text-text">{row.name}</span>,
    },
    {
      key: "credits",
      header: "Créditos",
      align: "right",
      render: (row) => (
        <span className="mono text-xs">
          {fmtCredits(row.credits)} / {fmtCredits(row.monthly_credits)}
        </span>
      ),
    },
    {
      key: "pct",
      header: "Del presupuesto",
      align: "right",
      render: (row) => (
        <span className="mono text-xs">{row.credits_used_pct.toFixed(1)} %</span>
      ),
    },
    {
      key: "events",
      header: "Solicitudes",
      align: "right",
      render: (row) => <span className="text-xs text-muted">{row.events}</span>,
    },
    {
      key: "state",
      header: "Estado",
      render: (row) => {
        const state = STATE[row.state] ?? STATE.sin_presupuesto;
        return <Badge tone={state.tone}>{state.label}</Badge>;
      },
    },
  ];

  const rateColumns: Column<Rate>[] = [
    { key: "model", header: "Modelo", render: (row) => <span className="mono text-xs">{row.model}</span> },
    {
      key: "input",
      header: "Entrada / 1k",
      align: "right",
      render: (row) => <span className="mono text-xs">{row.input_credits_per_1k}</span>,
    },
    {
      key: "output",
      header: "Salida / 1k",
      align: "right",
      render: (row) => <span className="mono text-xs">{row.output_credits_per_1k}</span>,
    },
    {
      key: "embedding",
      header: "Embedding / 1k",
      align: "right",
      render: (row) => <span className="mono text-xs">{row.embedding_credits_per_1k}</span>,
    },
  ];

  return (
    <section className="space-y-4" aria-labelledby="consumo-creditos">
      <SectionHeader
        title={<span id="consumo-creditos">Consumo en créditos</span>}
        description="Tokens medidos y convertidos a créditos con las tarifas vigentes. Ventana: mes calendario (America/Lima)."
      />

      {error && <ErrorInline message={error} />}
      {notice && <p className="text-xs text-ok">{notice}</p>}

      {loading ? (
        <SkeletonBlock rows={3} />
      ) : (
        <MetricGrid cols={4}>
          <Metric
            label="Créditos del período"
            value={fmtCredits(overview?.totals.credits ?? 0)}
            size="md"
            hint="Suma de todas las organizaciones"
          />
          <Metric
            label="Cerca del límite"
            value={overview?.totals.alerting ?? 0}
            size="md"
            hint="Organizaciones sobre el umbral"
          />
          <Metric
            label="Bloqueadas"
            value={overview?.totals.blocked ?? 0}
            size="md"
            hint="Agotaron su presupuesto"
          />
          <Metric
            label="Sin presupuesto"
            value={overview?.totals.without_budget ?? 0}
            size="md"
            hint="Sin límite definido"
          />
        </MetricGrid>
      )}

      <Panel>
        <PanelHeader
          title="Consumo por organización"
          actions={<Coins size={16} className="text-muted" aria-hidden />}
        />
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            columns={columns}
            rows={overview?.organizations ?? []}
            rowKey={(row) => row.organization_id}
            caption="Consumo en créditos por organización"
            empty={<EmptyState title="Sin consumo" body="No hay eventos de consumo en el período." />}
          />
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Tarifas de conversión"
          description="Créditos por cada 1 000 tokens. Cambiarlas no altera lo ya medido."
        />
        <DataTable
          columns={rateColumns}
          rows={rates}
          rowKey={(row) => row.model}
          caption="Tarifas por modelo"
          rowActions={(row) => (
            <Button
              variant="ghost"
              size="sm"
              leadingIcon={PencilSimple}
              onClick={() => setEditing({ ...row })}
            >
              Editar
            </Button>
          )}
          empty={<EmptyState title="Sin tarifas" body="Falta la fila de respaldo __default__." />}
        />
      </Panel>

      <Modal
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Editar tarifa"
        description={editing?.model}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveRate()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Entrada / 1k tokens">
              <Input
                inputMode="decimal"
                value={String(editing.input_credits_per_1k)}
                onChange={(event) =>
                  setEditing({ ...editing, input_credits_per_1k: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Salida / 1k tokens">
              <Input
                inputMode="decimal"
                value={String(editing.output_credits_per_1k)}
                onChange={(event) =>
                  setEditing({ ...editing, output_credits_per_1k: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Embedding / 1k tokens">
              <Input
                inputMode="decimal"
                value={String(editing.embedding_credits_per_1k)}
                onChange={(event) =>
                  setEditing({ ...editing, embedding_credits_per_1k: Number(event.target.value) })
                }
              />
            </Field>
          </div>
        )}
      </Modal>
    </section>
  );
}
