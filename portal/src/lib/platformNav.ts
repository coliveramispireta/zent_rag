import {
  ArrowsLeftRight,
  BellSimple,
  Broadcast,
  Buildings,
  Cards,
  ChartBar,
  ChartLineUp,
  ChatText,
  Coins,
  Cpu,
  Flask,
  FlowArrow,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  Lifebuoy,
  Package,
  PiggyBank,
  Pulse,
  Robot,
  RocketLaunch,
  Scroll,
  ShieldCheck,
  ShieldWarning,
  Smiley,
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
    label: t("nav.group.business"),
    items: [
      { to: `${BASE}`, label: t("nav.item.overview"), icon: Gauge, end: true },
      { to: `${BASE}/tenants`, label: t("nav.item.tenants"), icon: Buildings, permission: "tenant.read" },
      { to: `${BASE}/customers`, label: t("nav.item.customers"), icon: UsersThree },
      { to: `${BASE}/subscriptions`, label: t("nav.item.subscriptions"), icon: Cards },
      { to: `${BASE}/revenue`, label: t("nav.item.revenue"), icon: TrendUp },
      { to: `${BASE}/partners`, label: t("nav.item.partners"), icon: Handshake },
    ],
  },
  {
    label: t("nav.group.aiPlatform"),
    items: [
      { to: `${BASE}/model-gateway`, label: t("nav.item.model-gateway"), icon: Coins },
      { to: `${BASE}/decision-engine`, label: t("nav.item.decision-engine"), icon: FlowArrow },
      { to: `${BASE}/ai-runtime`, label: t("nav.item.ai-runtime"), icon: Cpu },
      { to: `${BASE}/inference-proxy`, label: t("nav.item.inference-proxy"), icon: Cpu },
      { to: `${BASE}/evals`, label: t("nav.item.evals"), icon: Flask },
      { to: `${BASE}/feedback`, label: t("nav.item.feedback"), icon: Smiley },
      { to: `${BASE}/workflows`, label: t("nav.item.workflows"), icon: FlowArrow },
      { to: `${BASE}/copilot`, label: t("nav.item.copilot"), icon: Robot },
    ],
  },
  {
    label: t("nav.group.observability"),
    items: [
      { to: `${BASE}/analytics`, label: t("nav.item.analytics"), icon: ChartBar },
      { to: `${BASE}/usage`, label: t("nav.item.usage"), icon: ChartLineUp },
      { to: `${BASE}/traces`, label: t("nav.item.traces"), icon: GitBranch },
      { to: `${BASE}/chat-insights`, label: t("nav.item.chat-insights"), icon: ChatText },
      { to: `${BASE}/model-health`, label: t("nav.item.model-health"), icon: Pulse },
      { to: `${BASE}/realtime`, label: t("nav.item.realtime"), icon: Broadcast },
    ],
  },
  {
    label: t("nav.group.finops"),
    items: [
      { to: `${BASE}/costs`, label: t("nav.item.costs"), icon: Coins },
      { to: `${BASE}/metering`, label: t("nav.item.metering"), icon: Gauge },
      { to: `${BASE}/cost-governance`, label: t("nav.item.cost-governance"), icon: PiggyBank },
      { to: `${BASE}/optimizer`, label: t("nav.item.optimizer"), icon: ChartLineUp },
      { to: `${BASE}/capacity`, label: t("nav.item.capacity"), icon: Gauge },
    ],
  },
  {
    label: t("nav.group.trust"),
    items: [
      { to: `${BASE}/trust`, label: t("nav.item.trust"), icon: ShieldCheck },
      { to: `${BASE}/security-center`, label: t("nav.item.security-center"), icon: ShieldWarning },
      { to: `${BASE}/trust-safety`, label: t("nav.item.trust-safety"), icon: ShieldWarning },
      { to: `${BASE}/risk-center`, label: t("nav.item.risk-center"), icon: ShieldWarning },
      { to: `${BASE}/governance`, label: t("nav.item.governance"), icon: ShieldCheck },
      { to: `${BASE}/compliance`, label: t("nav.item.compliance"), icon: ShieldCheck },
      { to: `${BASE}/audit`, label: t("nav.item.audit"), icon: Scroll, permission: "audit.read" },
      { to: `${BASE}/audit-intel`, label: t("nav.item.audit-intel"), icon: ShieldWarning },
    ],
  },
  {
    label: t("nav.group.operations"),
    items: [
      { to: `${BASE}/status`, label: t("nav.item.status"), icon: Pulse },
      { to: `${BASE}/ops-center`, label: t("nav.item.ops-center"), icon: ShieldCheck },
      { to: `${BASE}/operations`, label: t("nav.item.operations"), icon: Gauge },
      { to: `${BASE}/regions`, label: t("nav.item.regions"), icon: Globe },
      { to: `${BASE}/dr`, label: t("nav.item.dr"), icon: Lifebuoy },
      { to: `${BASE}/migrations`, label: t("nav.item.migrations"), icon: ArrowsLeftRight },
      { to: `${BASE}/releases`, label: t("nav.item.releases"), icon: GitBranch },
      { to: `${BASE}/data-export`, label: t("nav.item.data-export"), icon: Package },
    ],
  },
  {
    label: t("nav.group.platform"),
    items: [
      { to: `${BASE}/marketplace`, label: t("nav.item.marketplace"), icon: Storefront },
      { to: `${BASE}/marketplace-factory`, label: t("nav.item.marketplace-factory"), icon: Factory },
      { to: `${BASE}/ecosystem`, label: t("nav.item.ecosystem"), icon: Storefront },
      { to: `${BASE}/notifications`, label: t("nav.item.notifications"), icon: BellSimple },
      { to: `${BASE}/onboarding`, label: t("nav.item.onboarding"), icon: RocketLaunch },
      { to: `${BASE}/staff`, label: t("nav.item.staff"), icon: UsersThree, permission: "platform.users.manage" },
      { to: `${BASE}/security`, label: t("nav.item.security"), icon: ShieldCheck, permission: "platform.users.manage" },
      { to: `${BASE}/settings`, label: t("nav.item.settings"), icon: UsersThree, permission: "platform.settings.manage" },
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
