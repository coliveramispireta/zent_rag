import {
  ArrowsLeftRight,
  BellSimple,
  Buildings,
  Cards,
  ChartLineUp,
  Coins,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  Lifebuoy,
  Package,
  Plugs,
  Pulse,
  RocketLaunch,
  Scroll,
  ShieldCheck,
  ShieldWarning,
  Storefront,
  TrendUp,
  UsersThree,
  Factory,
  type Icon,
} from "@phosphor-icons/react";
import { t } from "./i18n";

export type PlatformNavItem = {
  to: string;
  label: string;
  icon: Icon;
  end?: boolean;
  permission?: string;
};
export type PlatformNavGroup = { label: string; items: PlatformNavItem[] };

const BASE = "/control-center";

/**
 * Nivel 1 — menú general de Zent.
 * Textos desde el catálogo (`lib/i18n`); las claves coinciden con `screens.code`.
 */
export const PLATFORM_NAV: PlatformNavGroup[] = [
  {
    // Nivel 1: solo configuración general de la plataforma. Todo lo que es
    // configuración de una organización (agentes, IA, integraciones, ingesta,
    // consumo) vive en el segundo sidebar, dentro de su contexto.
    label: t("nav.group.general"),
    items: [
      { to: `${BASE}`, label: t("nav.item.overview"), icon: Gauge, end: true },
      { to: `${BASE}/tenants`, label: t("nav.item.tenants"), icon: Buildings, permission: "tenant.read" },
      { to: `${BASE}/applications`, label: t("nav.item.applications"), icon: Plugs, permission: "tenant.read" },
      { to: `${BASE}/change-requests`, label: t("nav.item.changeRequests"), icon: Scroll, permission: "tenant.read" },
      { to: `${BASE}/customers`, label: t("nav.item.customers"), icon: UsersThree },
      { to: `${BASE}/subscriptions`, label: t("nav.item.subscriptions"), icon: Cards },
      { to: `${BASE}/revenue`, label: t("nav.item.revenue"), icon: TrendUp },
      { to: `${BASE}/partners`, label: t("nav.item.partners"), icon: Handshake },
      { to: `${BASE}/staff`, label: t("nav.item.staff"), icon: UsersThree, permission: "platform.users.manage" },
      { to: `${BASE}/settings`, label: t("nav.item.settings"), icon: ShieldCheck, permission: "platform.settings.manage" },
      { to: `${BASE}/notifications`, label: t("nav.item.notifications"), icon: BellSimple },
    ],
  },
  {
    label: t("nav.group.monitoring"),
    items: [
      { to: `${BASE}/usage`, label: t("nav.item.usage"), icon: ChartLineUp },
      { to: `${BASE}/costs`, label: t("nav.item.costs"), icon: Coins },
      { to: `${BASE}/capacity`, label: t("nav.item.capacity"), icon: Gauge },
      { to: `${BASE}/status`, label: t("nav.item.status"), icon: Pulse },
    ],
  },
  {
    label: t("nav.group.operations"),
    items: [
      { to: `${BASE}/operations`, label: t("nav.item.operations"), icon: Gauge },
      { to: `${BASE}/ops-center`, label: t("nav.item.ops-center"), icon: ShieldCheck },
      { to: `${BASE}/regions`, label: t("nav.item.regions"), icon: Globe },
      { to: `${BASE}/dr`, label: t("nav.item.dr"), icon: Lifebuoy },
      { to: `${BASE}/migrations`, label: t("nav.item.migrations"), icon: ArrowsLeftRight },
      { to: `${BASE}/releases`, label: t("nav.item.releases"), icon: GitBranch },
      { to: `${BASE}/data-export`, label: t("nav.item.data-export"), icon: Package },
      { to: `${BASE}/audit`, label: t("nav.item.audit"), icon: Scroll, permission: "audit.read" },
      { to: `${BASE}/audit-intel`, label: t("nav.item.audit-intel"), icon: ShieldWarning },
      { to: `${BASE}/security`, label: t("nav.item.security"), icon: ShieldCheck, permission: "platform.users.manage" },
    ],
  },
  {
    label: t("nav.group.platform"),
    items: [
      { to: `${BASE}/marketplace`, label: t("nav.item.marketplace"), icon: Storefront },
      { to: `${BASE}/marketplace-factory`, label: t("nav.item.marketplace-factory"), icon: Factory },
      { to: `${BASE}/ecosystem`, label: t("nav.item.ecosystem"), icon: Storefront },
      { to: `${BASE}/onboarding`, label: t("nav.item.onboarding"), icon: RocketLaunch },
      { to: `${BASE}/trust`, label: t("nav.item.trust"), icon: ShieldCheck },
      { to: `${BASE}/security-center`, label: t("nav.item.security-center"), icon: ShieldWarning },
      { to: `${BASE}/trust-safety`, label: t("nav.item.trust-safety"), icon: ShieldWarning },
      { to: `${BASE}/risk-center`, label: t("nav.item.risk-center"), icon: ShieldWarning },
      { to: `${BASE}/governance`, label: t("nav.item.governance"), icon: ShieldCheck },
      { to: `${BASE}/compliance`, label: t("nav.item.compliance"), icon: ShieldCheck },
    ],
  },
];

/**
 * Código de pantalla de un ítem: misma clave que `screens.code` en la base.
 * `/control-center/tenants` → `tenants` · `/control-center` → `overview`.
 */
export function screenCodeForPath(to: string): string {
  if (to === BASE) return "overview";
  return to.startsWith(`${BASE}/`) ? to.slice(BASE.length + 1) : to;
}

/**
 * Filtra el menú por permisos de API y por pantallas asignadas.
 *
 * `screens === undefined` conserva el comportamiento anterior (no filtra por
 * pantalla). Un arreglo vacío no muestra nada: el modelo es default-deny.
 */
export function visiblePlatformNav(
  permissions?: string[],
  screens?: string[],
): PlatformNavGroup[] {
  const allowPerm =
    permissions && permissions.length > 0 ? new Set(permissions) : null;
  const allowScreens = screens ? new Set(screens) : null;
  if (!allowPerm && !allowScreens) return PLATFORM_NAV;
  return PLATFORM_NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      if (
        allowPerm &&
        it.permission &&
        !allowPerm.has(it.permission) &&
        !allowPerm.has("*")
      ) {
        return false;
      }
      if (allowScreens && !allowScreens.has(screenCodeForPath(it.to))) {
        return false;
      }
      return true;
    }),
  })).filter((g) => g.items.length > 0);
}

export function platformNavLeaves(): PlatformNavItem[] {
  return PLATFORM_NAV.flatMap((g) => g.items);
}

/** Grupo y hoja de navegación activos para una ruta del Control Center. */
export function platformNavContextForPath(
  pathname: string
): { group: PlatformNavGroup; item: PlatformNavItem } | null {
  for (const group of PLATFORM_NAV) {
    for (const item of group.items) {
      if (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return { group, item };
      }
    }
  }
  return null;
}
