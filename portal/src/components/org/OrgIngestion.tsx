import { useEffect, useMemo, useState } from "react";
import { Database } from "@phosphor-icons/react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  type Column,
  DataTable,
  EmptyState,
  ErrorInline,
  Input,
  Metric,
  MetricGrid,
  Panel,
  PanelHeader,
  SkeletonBlock,
  StatusBadge,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

type OrgSource = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  last_success_at: string | null;
  created_at: string | null;
};

type OrgCollection = {
  id: string;
  name: string;
  chunking_strategy: string | null;
  retrieval_strategy: string | null;
  created_at: string | null;
};

/**
 * Nivel 2 — Ingesta de información de la organización: qué fuentes entraron,
 * cuándo se sincronizaron por última vez y qué colecciones existen.
 *
 * Solo lectura: la reingesta se dispara desde la app del cliente; el operador
 * supervisa el resultado.
 */
export function OrgIngestion({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [sources, setSources] = useState<OrgSource[]>([]);
  const [collections, setCollections] = useState<OrgCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const token = session?.token ?? "";

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    platformApi<{ sources: OrgSource[]; knowledge_bases: OrgCollection[] }>(
      `/api/v1/platform/organizations/${orgId}/sources`,
      { token },
    )
      .then((data) => {
        if (cancelled) return;
        setSources(data.sources ?? []);
        setCollections(data.knowledge_bases ?? []);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No se pudo cargar la ingesta.");
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
    if (!needle) return sources;
    return sources.filter((source) =>
      `${source.name} ${source.type ?? ""}`.toLowerCase().includes(needle),
    );
  }, [sources, query]);

  const withSuccess = sources.filter((source) => source.last_success_at).length;

  const sourceColumns: Column<OrgSource>[] = [
    {
      key: "name",
      header: "Fuente",
      render: (source) => <span className="font-medium text-text">{source.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (source) => (
        <span className="mono text-xs text-muted">{source.type || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (source) => <StatusBadge status={source.status || "unknown"} />,
    },
    {
      key: "last",
      header: "Última ingesta correcta",
      align: "right",
      render: (source) => (
        <span className="text-xs text-muted">
          {source.last_success_at ? fmtDateTime(source.last_success_at) : "nunca"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Alta",
      align: "right",
      render: (source) => (
        <span className="text-xs text-muted">{fmtDateTime(source.created_at)}</span>
      ),
    },
  ];

  const collectionColumns: Column<OrgCollection>[] = [
    {
      key: "name",
      header: "Colección",
      render: (collection) => (
        <span className="font-medium text-text">{collection.name}</span>
      ),
    },
    {
      key: "chunking",
      header: "Fragmentación",
      render: (collection) => (
        <span className="mono text-xs text-muted">
          {collection.chunking_strategy || "—"}
        </span>
      ),
    },
    {
      key: "retrieval",
      header: "Recuperación",
      render: (collection) => (
        <span className="mono text-xs text-muted">
          {collection.retrieval_strategy || "—"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Alta",
      align: "right",
      render: (collection) => (
        <span className="text-xs text-muted">{fmtDateTime(collection.created_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <MetricGrid>
        <Metric label="Fuentes" value={sources.length} />
        <Metric label="Con ingesta correcta" value={withSuccess} />
        <Metric label="Sin ingesta" value={sources.length - withSuccess} />
        <Metric label="Colecciones" value={collections.length} />
      </MetricGrid>

      <Panel>
        <PanelHeader
          title="Fuentes de la organización"
          description="El operador supervisa la ingesta; reingestar o cargar archivos se hace desde la app del cliente."
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o tipo"
            aria-label="Buscar fuente"
            className="h-9 w-[260px]"
          />
          <span className="text-xs text-faint">
            {rows.length} de {sources.length}
          </span>
        </div>

        {error && <ErrorInline message={error} />}
        {loading ? (
          <SkeletonBlock rows={4} />
        ) : (
          <DataTable
            columns={sourceColumns}
            rows={rows}
            rowKey={(source) => source.id}
            caption="Fuentes de datos"
            empty={
              <EmptyState
                icon={Database}
                title={sources.length === 0 ? "Sin fuentes" : "Sin coincidencias"}
                body={
                  sources.length === 0
                    ? "Esta organización todavía no conectó fuentes de datos."
                    : "Ajustá la búsqueda."
                }
              />
            }
          />
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Colecciones de conocimiento"
          description="Agrupaciones donde se materializa el conocimiento de las fuentes."
        />
        {loading ? (
          <SkeletonBlock rows={3} />
        ) : (
          <DataTable
            columns={collectionColumns}
            rows={collections}
            rowKey={(collection) => collection.id}
            caption="Colecciones de la organización"
            empty={
              <EmptyState
                compact
                title="Sin colecciones"
                body="Cuando la organización cargue conocimiento, las colecciones aparecen acá."
              />
            }
          />
        )}
      </Panel>
    </div>
  );
}
