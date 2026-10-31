import {
  visiblePlatformNav,
  screenCodeForPath,
  PLATFORM_NAV,
} from "../lib/platformNav";
import { describe, expect, it } from "vitest";

describe("visiblePlatformNav", () => {
  it("devuelve todo cuando no hay permisos (fail-open visual)", () => {
    expect(visiblePlatformNav(undefined)).toEqual(PLATFORM_NAV);
    expect(visiblePlatformNav([])).toEqual(PLATFORM_NAV);
  });

  it("filtra items sin permiso y grupos vacíos", () => {
    const out = visiblePlatformNav(["audit.read"]);
    // General: Seguridad y Configuración piden permisos que no están.
    const general = out.find((g) => g.label === "General");
    expect(general?.items.find((i) => i.label === "Seguridad")).toBeUndefined();
    expect(general?.items.find((i) => i.label === "Configuración")).toBeUndefined();
    // Auditoría sí, bajo Operación.
    const ops = out.find((g) => g.label === "Operación");
    expect(ops?.items.find((i) => i.label === "Auditoría")).toBeDefined();
    // Organizaciones (tenant.read) no concedido -> General sin ese item.
    expect(general?.items.find((i) => i.label === "Organizaciones")).toBeUndefined();
  });

  it("super_admin (permiso '*') ve todo", () => {
    const out = visiblePlatformNav(["*"]);
    expect(out).toEqual(PLATFORM_NAV);
  });
});

describe("visiblePlatformNav — pantallas asignadas", () => {
  it("sin pantallas no muestra nada (default-deny)", () => {
    expect(visiblePlatformNav(undefined, [])).toEqual([]);
  });

  it("muestra solo las pantallas asignadas y descarta grupos vacíos", () => {
    const out = visiblePlatformNav(undefined, ["tenants", "staff"]);
    const items = out.flatMap((group) => group.items.map((item) => item.to));
    expect(items).toEqual(["/control-center/tenants", "/control-center/staff"]);
    expect(out.map((group) => group.label)).toEqual(["General"]);
  });

  it("exige pantalla y permiso a la vez", () => {
    // `tenants` pide `tenant.read`; `security` pide `platform.users.manage`.
    const out = visiblePlatformNav(["tenant.read"], ["tenants", "security"]);
    const items = out.flatMap((group) => group.items.map((item) => item.to));
    expect(items).toEqual(["/control-center/tenants"]);
  });

  it("mapea la raíz a la pantalla overview", () => {
    expect(screenCodeForPath("/control-center")).toBe("overview");
    expect(screenCodeForPath("/control-center/dr")).toBe("dr");
  });
});
