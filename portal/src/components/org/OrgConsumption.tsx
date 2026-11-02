import { useEffect, useMemo, useState } from "react";
import { ChartLineUp } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Metric,
  MetricGrid,
  Panel,
  PanelHeader,
  SkeletonBlock,
} from "../../components/ui";
import { fmtCurrency, fmtCurrencyCents, fmtDate } from "../../lib/format";

type FinopsOrg = {
  period?: { from?: string; to?: string };
  revenue_cents: number;
  mrr_cents: number;
  costs?: { llm: number; embedding: number; storage: number; infra: number };
  gross_profit: number;
  gross_margin_pct: number | null;
  economics?: {
    requests: number;
    cost_per_request: number | null;
    revenue_per_request: number | null;
  };
};

type CostRow = { id: string; label: string; amount: number };

const RANGES = [
  { id: "7", label: "7 días", days: 7 },
  { id: "30", label: "30 días", days: 30 },
  { id: "90", label: "90 días", days: 90 },
] as const;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Nivel 2 — Monitoreo de consumo de la organización.
 *
 * Muestra el consumo medido por la plataforma (costos y solicitudes) para el
 * período elegido. La unidad de negocio del consumo (créditos) queda pendiente
 * de definición: hoy se informa en dólares y solicitudes.
 */
export function OrgConsumption({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [range, setRange] = useState<string>("30");
  const [data, setData] = useState<FinopsOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token = session?.token ?? "";
  const days = useMemo(
    () => RANGES.find((item) => item.id === range)?.days ?? 30,
    [range],
  );

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      start: isoDaysAgo(days),
      end: new Date().toISOString().slice(0, 10),
    });
    platformApi<FinopsOrg>(
      `/api/v1/platform/finops/organizations/${orgId}?${params.toString()}`,
      { token },
    )
      .then((report) => {
        if (!cancelled) setData(report);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No se pudo cargar el consumo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId, days]);

  const totalCost = useMemo(() => {
    if (!data) return 0;
    return (
      (data.costs?.llm ?? 0) +
      (data.costs?.embedding ?? 0) +
      (data.costs?.storage ?? 0) +
      (data.costs?.infra ?? 0)
    );
  }, [data]);

  const rows: CostRow[] = useMemo(
    () => [
      { id: "llm", label: "LLM", amount: data?.costs?.llm ?? 0 },
      { id: "embedding", label: "Embeddings", amount: data?.costs?.embedding ?? 0 },
      { id: "storage", label: "Almacenamiento", amount: data?.costs?.storage ?? 0 },
      { id: "infra", label: "Infraestructura", amount: data?.costs?.infra ?? 0 },
    ],
    [data],
  );

  const columns: Column<CostRow>[] = [
    { key: "label", header: "Concepto", render: (row) => row.label },
    {
      key: "amount",
      header: "Costo",
      align: "right",
      render: (row) => <span className="mono text-xs">{fmtCurrency(row.amount, 4)}</span>,
    },
    {
      key: "share",
      header: "% del total",
      align: "right",
      render: (row) =>
        totalCost > 0 ? `${((row.amount / totalCost) * 100).toFixed(1)}%` : "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setRange(item.id)}
            aria-pressed={range === item.id}
            className={
              range === item.id
                ? "rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-text"
                : "rounded-sm border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:bg-soft/60 hover:text-text"
            }
          >
            {item.label}
          </button>
        ))}
        {data?.period?.from && (
          <span className="text-xs text-faint">
            {fmtDate(data.period.from)} — {fmtDate(data.period.to)}
          </span>
        )}
      </div>

      {error && <ErrorInline message={error} />}
      {loading ? (
        <SkeletonBlock rows={4} />
      ) : !data ? (
        <EmptyState
          icon={ChartLineUp}
          title="Sin datos de consumo"
          body="No se pudo obtener el reporte de la organización para el período."
        />
      ) : (
        <>
          <MetricGrid>
            <Metric label="Solicitudes" value={(data.economics?.requests ?? 0).toLocaleString()} />
            <Metric label="Costo total" value={fmtCurrency(totalCost, 4)} />
            <Metric label="Costo de IA" value={fmtCurrency(data.costs?.llm ?? 0, 4)} />
            <Metric label="Ingresos" value={fmtCurrencyCents(data.revenue_cents ?? 0)} />
            <Metric
              label="Margen bruto"
              value={fmtCurrency(data.gross_profit ?? 0, 2)}
              hint={
                data.gross_margin_pct != null
                  ? `${data.gross_margin_pct.toFixed(1)}%`
                  : "sin ingresos en el período"
              }
            />
            <Metric
              label="Costo por solicitud"
              value={
                data.economics?.cost_per_request != null
                  ? fmtCurrency(data.economics.cost_per_request, 6)
                  : "—"
              }
            />
          </MetricGrid>

          <Panel>
            <PanelHeader
              title="Desglose de costos"
              description="Consumo medido por la plataforma en el período. La unidad de negocio (créditos) se define en la Fase 4."
            />
            <DataTable
              bare
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              caption="Costos por concepto"
            />
          </Panel>
        </>
      )}
    </div>
  );
}
