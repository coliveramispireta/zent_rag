import { useCallback, useEffect, useState } from "react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  Button,
  ErrorInline,
  Field,
  Input,
  Metric,
  MetricGrid,
  Panel,
  PanelHeader,
  SkeletonBlock,
} from "../ui";
import { readGrant } from "../../lib/changeGrant";

type Breakdown = { label: string; credits: number; events: number };

type BudgetData = {
  period: { from: string; to: string };
  budget: {
    monthly_credits: number;
    alert_threshold: number;
    block_on_limit: boolean;
    state: string;
  };
  consumption: {
    credits: number;
    credits_used_pct: number;
    tokens_in: number;
    tokens_out: number;
    tokens_embedding: number;
    events: number;
  };
  by_model: Breakdown[];
  by_application: Breakdown[];
  by_agent: Breakdown[];
};

const STATE_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  ok: { label: "Dentro del presupuesto", tone: "ok" },
  alerta: { label: "Cerca del límite", tone: "warn" },
  bloqueado: { label: "Bloqueado por límite", tone: "danger" },
  sin_presupuesto: { label: "Sin presupuesto definido", tone: "neutral" },
};

const fmtCredits = (value: number) =>
  value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtNumber = (value: number) => value.toLocaleString("es-PE");

function BreakdownList({ title, rows }: { title: string; rows: Breakdown[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">Sin consumo en el período.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-text">{row.label}</span>
              <span className="mono shrink-0 text-muted">{fmtCredits(row.credits)} créd.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Presupuesto de consumo en créditos (Nivel 2).
 *
 * Mide tokens reales y los convierte con la tabla de tarifas; el presupuesto es
 * mensual por organización y se define con un requerimiento tomado.
 */
export function OrgBudget({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ credits: "", threshold: "80", block: true });

  const token = session?.token ?? "";

  const load = useCallback(async () => {
    if (!token) return;
    const next = await platformApi<BudgetData>(
      `/api/v1/platform/organizations/${orgId}/budget`,
      { token },
    );
    setData(next);
    setForm({
      credits: next.budget.monthly_credits ? String(next.budget.monthly_credits) : "",
      threshold: String(Math.round(next.budget.alert_threshold * 100)),
      block: next.budget.block_on_limit,
    });
  }, [token, orgId]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer el presupuesto."))
      .finally(() => setLoading(false));
  }, [token, load]);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const grant = readGrant(orgId);
      const next = await platformApi<BudgetData>(
        `/api/v1/platform/organizations/${orgId}/budget`,
        {
          method: "PUT",
          token,
          headers: grant ? { "X-Change-Token": grant.token } : undefined,
          body: JSON.stringify({
            monthly_credits: Number(form.credits || 0),
            alert_threshold: Number(form.threshold || 80) / 100,
            block_on_limit: form.block,
          }),
        },
      );
      setData(next);
      setNotice("Presupuesto actualizado.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message.includes("change_grant_required")
          ? "Tomá un requerimiento abierto para modificar el presupuesto de esta organización."
          : message || "No se pudo guardar el presupuesto.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <SkeletonBlock rows={3} />;

  const state = STATE_LABEL[data?.budget.state ?? "sin_presupuesto"] ?? STATE_LABEL.sin_presupuesto;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Presupuesto de consumo"
          description="Se mide en tokens y se factura en créditos. Ventana: mes calendario (America/Lima)."
          actions={<Badge tone={state.tone}>{state.label}</Badge>}
        />
        <div className="space-y-4 p-4">
          {error && <ErrorInline message={error} />}
          {notice && <p className="text-xs text-ok">{notice}</p>}

          <MetricGrid>
            <Metric
              label="Créditos consumidos"
              value={fmtCredits(data?.consumption.credits ?? 0)}
              hint={`de ${fmtCredits(data?.budget.monthly_credits ?? 0)} del período`}
            />
            <Metric
              label="Del presupuesto"
              value={`${(data?.consumption.credits_used_pct ?? 0).toFixed(1)} %`}
              hint={`alerta al ${Math.round((data?.budget.alert_threshold ?? 0.8) * 100)} %`}
            />
            <Metric
              label="Tokens de entrada"
              value={fmtNumber(data?.consumption.tokens_in ?? 0)}
              hint={`${fmtNumber(data?.consumption.tokens_out ?? 0)} de salida`}
            />
            <Metric
              label="Solicitudes"
              value={fmtNumber(data?.consumption.events ?? 0)}
              hint={`${fmtNumber(data?.consumption.tokens_embedding ?? 0)} tokens de embedding`}
            />
          </MetricGrid>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Presupuesto mensual (créditos)">
              <Input
                inputMode="decimal"
                value={form.credits}
                onChange={(event) => setForm({ ...form, credits: event.target.value })}
                placeholder="0"
              />
            </Field>
            <Field label="Umbral de alerta (%)">
              <Input
                inputMode="numeric"
                value={form.threshold}
                onChange={(event) => setForm({ ...form, threshold: event.target.value })}
              />
            </Field>
            <Field label="Al llegar al límite">
              <label className="flex h-9 items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={form.block}
                  onChange={(event) => setForm({ ...form, block: event.target.checked })}
                />
                Bloquear solicitudes
              </label>
            </Field>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar presupuesto"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Desglose del período" />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <BreakdownList title="Por modelo" rows={data?.by_model ?? []} />
          <BreakdownList title="Por aplicación" rows={data?.by_application ?? []} />
          <BreakdownList title="Por agente" rows={data?.by_agent ?? []} />
        </div>
      </Panel>
    </div>
  );
}
