import { useEffect, useState } from "react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  Button,
  ErrorInline,
  Field,
  Input,
  Panel,
  PanelHeader,
  SkeletonBlock,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";
import { readGrant } from "../../lib/changeGrant";

type OrgParameters = {
  id: string;
  name: string;
  status: string;
  rate_limit_per_minute: number;
  max_tokens_per_request: number;
  llm_model_override: string | null;
  embedding_model_override: string | null;
  created_at: string | null;
};

/**
 * Nivel 2 — Parámetros de la organización.
 *
 * Límites de uso y overrides de modelo. Son los valores con los que Zent atiende
 * a esta organización; no cambian la configuración general de la plataforma.
 */
export function OrgParameters({ orgId }: { orgId: string }) {
  const { session } = usePlatformAuth();
  const [data, setData] = useState<OrgParameters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rate_limit_per_minute: "600",
    max_tokens_per_request: "100000",
    llm_model_override: "",
    embedding_model_override: "",
  });

  const token = session?.token ?? "";

  useEffect(() => {
    if (!token || !orgId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    platformApi<OrgParameters>(
      `/api/v1/platform/organizations/${orgId}/parameters`,
      { token },
    )
      .then((params) => {
        if (cancelled) return;
        setData(params);
        setForm({
          rate_limit_per_minute: String(params.rate_limit_per_minute ?? ""),
          max_tokens_per_request: String(params.max_tokens_per_request ?? ""),
          llm_model_override: params.llm_model_override ?? "",
          embedding_model_override: params.embedding_model_override ?? "",
        });
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "No se pudieron cargar los parámetros.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgId]);

  async function save() {
    if (!session) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const grant = readGrant(orgId);
      const updated = await platformApi<OrgParameters>(
        `/api/v1/platform/organizations/${orgId}/parameters`,
        {
          method: "PUT",
          token: session.token,
          headers: grant ? { "X-Change-Token": grant.token } : undefined,
          body: JSON.stringify({
            rate_limit_per_minute: Number(form.rate_limit_per_minute),
            max_tokens_per_request: Number(form.max_tokens_per_request),
            llm_model_override: form.llm_model_override.trim() || null,
            embedding_model_override: form.embedding_model_override.trim() || null,
          }),
        },
      );
      setData(updated);
      setNotice("Parámetros guardados.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message.includes("change_grant_required")
          ? "Tomá un requerimiento abierto para modificar la configuración de esta organización."
          : message || "No se pudieron guardar los parámetros.",
      );
    } finally {
      setSaving(false);
    }
  }

  const invalid =
    !form.rate_limit_per_minute ||
    !form.max_tokens_per_request ||
    Number(form.rate_limit_per_minute) < 1 ||
    Number(form.max_tokens_per_request) < 1;

  if (loading) {
    return <SkeletonBlock rows={4} />;
  }

  return (
    <div className="space-y-4">
      {error && <ErrorInline message={error} />}
      {notice && (
        <p className="text-xs text-ok" role="status">
          {notice}
        </p>
      )}

      <Panel>
        <PanelHeader
          title="Límites de uso"
          description="Valores con los que Zent atiende a esta organización. Aplican a su API y a sus agentes."
        />
        <div className="grid gap-3 px-4 pt-4 sm:grid-cols-2">
          <Field label="Solicitudes por minuto" hint="1 a 1.000.000">
            <Input
              type="number"
              min={1}
              value={form.rate_limit_per_minute}
              onChange={(event) =>
                setForm({ ...form, rate_limit_per_minute: event.target.value })
              }
            />
          </Field>
          <Field label="Tokens máximos por solicitud" hint="1 a 10.000.000">
            <Input
              type="number"
              min={1}
              value={form.max_tokens_per_request}
              onChange={(event) =>
                setForm({ ...form, max_tokens_per_request: event.target.value })
              }
            />
          </Field>
          <Field label="Modelo de chat" hint="Vacío = modelo por defecto de la plataforma">
            <Input
              value={form.llm_model_override}
              placeholder="gpt-4o-mini"
              onChange={(event) =>
                setForm({ ...form, llm_model_override: event.target.value })
              }
            />
          </Field>
          <Field label="Modelo de embeddings" hint="Vacío = modelo por defecto">
            <Input
              value={form.embedding_model_override}
              placeholder="baai/bge-m3"
              onChange={(event) =>
                setForm({ ...form, embedding_model_override: event.target.value })
              }
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-3">
          <Button onClick={() => void save()} disabled={saving || invalid}>
            {saving ? "Guardando…" : "Guardar parámetros"}
          </Button>
          <span className="text-xs text-faint">
            Los cambios quedan auditados con el usuario que los hizo.
          </span>
        </div>
      </Panel>

      {data && (
        <Panel>
          <PanelHeader title="Identidad de la organización" />
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Nombre</dt>
              <dd className="text-text">{data.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Estado</dt>
              <dd>
                <Badge tone={data.status === "active" ? "ok" : "neutral"}>
                  {data.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Alta</dt>
              <dd className="text-text">{fmtDateTime(data.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Identificador</dt>
              <dd className="mono text-xs text-muted">{data.id}</dd>
            </div>
          </dl>
        </Panel>
      )}
    </div>
  );
}
