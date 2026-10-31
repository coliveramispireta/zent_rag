import { useCallback, useEffect, useMemo, useState } from "react";
import { platformApi } from "../../api";
import { usePlatformAuth } from "../../platformAuth";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  InlineFlash,
  PageHeader,
  Section,
  Select,
} from "../../components/ui";

type ScreenLevel = "read" | "full";

type Screen = {
  code: string;
  name: string;
  category: string;
  path: string;
  sort_order: number;
};

type StaffMember = {
  id: string;
  email: string;
  roles: string[];
  is_platform_admin: boolean;
  is_platform_staff: boolean;
  disabled_at: string | null;
  screens: { code: string; level: ScreenLevel }[];
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Superadmin",
  admin: "Admin",
  operador: "Operador",
};

const ASSIGNABLE_ROLES = ["admin", "operador"] as const;

function toDraft(screens: { code: string; level: ScreenLevel }[]): Record<string, ScreenLevel> {
  return Object.fromEntries(screens.map((s) => [s.code, s.level]));
}

function ScreenGrid({
  catalog,
  value,
  onChange,
}: {
  catalog: Screen[];
  value: Record<string, ScreenLevel>;
  onChange: (next: Record<string, ScreenLevel>) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Screen[]>();
    for (const screen of catalog) {
      const list = map.get(screen.category) ?? [];
      list.push(screen);
      map.set(screen.category, list);
    }
    return [...map.entries()];
  }, [catalog]);

  return (
    <div className="space-y-5">
      {groups.map(([category, items]) => (
        <div key={category}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
            {category}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((screen) => {
              const level = value[screen.code];
              return (
                <div
                  key={screen.code}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
                >
                  <Checkbox
                    checked={Boolean(level)}
                    label={screen.name}
                    onCheckedChange={(checked) => {
                      const next = { ...value };
                      if (checked) next[screen.code] = "read";
                      else delete next[screen.code];
                      onChange(next);
                    }}
                  />
                  <Select
                    aria-label={`Permiso de ${screen.name}`}
                    className="h-8 w-[132px] text-xs"
                    disabled={!level}
                    value={level ?? "read"}
                    onChange={(event) =>
                      onChange({ ...value, [screen.code]: event.target.value as ScreenLevel })
                    }
                  >
                    <option value="read">Solo lectura</option>
                    <option value="full">Acceso total</option>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Staff() {
  const { session } = usePlatformAuth();
  const token = session?.token ?? "";

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [catalog, setCatalog] = useState<Screen[]>([]);
  const [roleScreens, setRoleScreens] = useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, ScreenLevel>>({});
  const [draftRole, setDraftRole] = useState("");
  const [roleTarget, setRoleTarget] = useState<string>(ASSIGNABLE_ROLES[0]);
  const [roleDraft, setRoleDraft] = useState<Record<string, ScreenLevel>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const [staffRes, screensRes, rolesRes] = await Promise.all([
      platformApi<{ staff: StaffMember[] }>("/api/v1/platform/staff", { token }),
      platformApi<{ screens: Screen[] }>("/api/v1/platform/screens", { token }),
      platformApi<{ roles: Record<string, string[]> }>("/api/v1/platform/role-screens", {
        token,
      }),
    ]);
    setStaff(staffRes.staff ?? []);
    setCatalog(screensRes.screens ?? []);
    setRoleScreens(rolesRes.roles ?? {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [token, load]);

  const selected = useMemo(
    () => staff.find((member) => member.id === selectedId) ?? null,
    [staff, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraft({});
      setDraftRole("");
      return;
    }
    setDraft(toDraft(selected.screens));
    setDraftRole(selected.roles[0] ?? "");
  }, [selected]);

  useEffect(() => {
    const codes = roleScreens[roleTarget] ?? [];
    setRoleDraft(Object.fromEntries(codes.map((code) => [code, "read" as ScreenLevel])));
  }, [roleScreens, roleTarget]);

  async function saveMember() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformApi(`/api/v1/platform/staff/${selected.id}/screens`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          screens: Object.entries(draft).map(([code, level]) => ({ code, level })),
        }),
      });
      const currentRole = selected.roles[0] ?? "";
      if (draftRole !== currentRole) {
        if (currentRole) {
          await platformApi(`/api/v1/platform/users/${selected.id}/roles`, {
            method: "POST",
            token,
            body: JSON.stringify({ role_name: currentRole, action: "revoke" }),
          });
        }
        if (draftRole) {
          await platformApi(`/api/v1/platform/users/${selected.id}/roles`, {
            method: "POST",
            token,
            body: JSON.stringify({ role_name: draftRole, action: "assign" }),
          });
        }
      }
      await load();
      setNotice(`Permisos de ${selected.email} guardados.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function saveRole() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await platformApi(`/api/v1/platform/roles/${roleTarget}/screens`, {
        method: "PUT",
        token,
        body: JSON.stringify({ screens: Object.keys(roleDraft) }),
      });
      await load();
      setNotice(`Pantallas del rol ${ROLE_LABELS[roleTarget] ?? roleTarget} guardadas.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el rol");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y roles"
        subtitle="Personal interno de Omnio. Ningún rol trae pantallas por defecto: las asigna el superadmin."
      />

      {error && <InlineFlash tone="danger">{error}</InlineFlash>}
      {notice && <InlineFlash tone="ok">{notice}</InlineFlash>}

      <Section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Personal</h2>
          <span className="text-xs text-faint">{staff.length} usuarios</span>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : staff.length === 0 ? (
          <EmptyState title="Sin personal" body="Todavía no hay usuarios internos." />
        ) : (
          <div className="divide-y divide-border rounded-sm border border-border">
            {staff.map((member) => {
              const active = member.id === selectedId;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedId(active ? null : member.id)}
                  className={`flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-soft/60" : "hover:bg-soft/40"
                  }`}
                >
                  <span className="min-w-0 flex-1 text-sm font-medium text-text">
                    {member.email}
                  </span>
                  {member.roles.length === 0 ? (
                    <Badge tone="neutral">Sin rol</Badge>
                  ) : (
                    member.roles.map((role) => (
                      <Badge key={role} tone={role === "super_admin" ? "accent" : "info"}>
                        {ROLE_LABELS[role] ?? role}
                      </Badge>
                    ))
                  )}
                  <span className="text-xs text-faint">
                    {member.screens.length} pantallas
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {selected && (
        <Section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text">{selected.email}</h2>
              <p className="text-xs text-faint">
                El rol define las pantallas visibles. El permiso de cada pantalla se ajusta por
                usuario.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <label className="text-xs text-muted">
                Rol
                <Select
                  className="mt-1 h-9 w-[180px]"
                  value={draftRole}
                  onChange={(event) => setDraftRole(event.target.value)}
                >
                  <option value="">Sin rol</option>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                  <option value="super_admin">{ROLE_LABELS.super_admin}</option>
                </Select>
              </label>
              <Button onClick={() => void saveMember()} disabled={busy}>
                {busy ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
          <ScreenGrid catalog={catalog} value={draft} onChange={setDraft} />
        </Section>
      )}

      <Section divider>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text">Pantallas por rol</h2>
            <p className="text-xs text-faint">
              Aplica a todos los usuarios con ese rol. Arranca vacío: nada se asigna solo.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs text-muted">
              Rol
              <Select
                className="mt-1 h-9 w-[180px]"
                value={roleTarget}
                onChange={(event) => setRoleTarget(event.target.value)}
              >
                {ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" onClick={() => void saveRole()} disabled={busy}>
              {busy ? "Guardando…" : "Guardar rol"}
            </Button>
          </div>
        </div>
        <ScreenGrid catalog={catalog} value={roleDraft} onChange={setRoleDraft} />
      </Section>
    </div>
  );
}
