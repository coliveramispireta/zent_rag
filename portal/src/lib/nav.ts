import {
  Bell,
  Buildings,
  ChartBar,
  ChartLineUp,
  ChatCircleDots,
  ChatsCircle,
  ClipboardText,
  Code,
  Compass,
  CreditCard,
  Database,
  Eye,
  FolderSimple,
  FlowArrow,
  Gear,
  GraduationCap,
  Key,
  Lifebuoy,
  NotePencil,
  Plugs,
  Pulse,
  Robot,
  Rocket,
  RocketLaunch,
  StackSimple,
  Scales,
  ShieldCheck,
  ShieldStar,
  Sparkle,
  SquaresFour,
  Storefront,
  Swap,
  Target,
  UserCircle,
  UsersThree,
  WarningOctagon,
  WebhooksLogo,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";
import type { Session } from "../api";
import { t } from "./i18n";

export type NavLeaf = { to: string; label: string; icon: Icon; end?: boolean; key?: string };
export type NavSection = { heading: string; items: NavLeaf[] };
export type NavGroup = {
  label: string | null;
  items?: NavLeaf[];
  sections?: NavSection[];
  collapsible?: boolean;
  /** Arranca colapsado (el usuario puede abrirlo; se recuerda su elección). */
  defaultCollapsed?: boolean;
};

/**
 * Information architecture del workspace.
 *
 * Clusters por modelo mental, no por organigrama:
 * Inicio (qué está pasando) → Conocimiento (qué sabe Zent) → Construir (qué creo)
 * → Operar (qué corre solo) → Evaluar (qué tan bien responde) → Desarrollar (cómo integro)
 * → Gobernar (cómo lo controlo) → Gestionar (quién entra, qué se paga).
 *
 * Las rutas no cambian: esto es jerarquía visual y de descubrimiento.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: t("nav.tenant.group.inicio"),
    items: [
      { to: "/", label: t("nav.tenant.item.dashboard"), icon: SquaresFour, end: true },
      { to: "/intelligence", label: t("nav.tenant.item.intelligence"), icon: Sparkle },
      { to: "/chat-insights", label: t("nav.tenant.item.chatInsights"), icon: ChatsCircle },
    ],
  },
  {
    label: t("nav.tenant.group.conocimiento"),
    items: [
      { to: "/knowledge", label: t("nav.tenant.item.knowledge"), icon: Database },
      { to: "/integrations", label: t("nav.tenant.item.integrations"), icon: Plugs },
      { to: "/connectors", label: t("nav.tenant.item.connectors"), icon: Plugs, key: "connectors" },
    ],
  },
  {
    label: t("nav.tenant.group.construir"),
    items: [
      { to: "/chat", label: t("nav.tenant.item.playground"), icon: ChatCircleDots },
      { to: "/agents", label: t("nav.tenant.item.agents"), icon: Robot },
      { to: "/roles", label: t("nav.tenant.item.roles"), icon: UserCircle },
      { to: "/workflows", label: t("nav.tenant.item.workflows"), icon: FlowArrow },
      { to: "/prompts", label: t("nav.tenant.item.prompts"), icon: NotePencil, key: "prompts" },
      { to: "/copilot", label: t("nav.tenant.item.copilot"), icon: Sparkle },
    ],
  },
  {
    label: t("nav.tenant.group.operar"),
    items: [
      { to: "/assistants", label: t("nav.tenant.item.assistants"), icon: Pulse },
      { to: "/operations", label: t("nav.tenant.item.operations"), icon: Pulse },
      { to: "/watchers", label: t("nav.tenant.item.watchers"), icon: Eye },
      { to: "/deployments", label: t("nav.tenant.item.deployments"), icon: RocketLaunch },
      { to: "/environments", label: t("nav.tenant.item.environments"), icon: StackSimple },
      { to: "/usage", label: t("nav.tenant.item.analytics"), icon: ChartLineUp },
    ],
  },
  {
    label: t("nav.tenant.group.evaluar"),
    items: [
      { to: "/ai-quality", label: t("nav.tenant.item.aiQuality"), icon: Target },
      { to: "/evaluation", label: t("nav.tenant.item.evaluation"), icon: ChartBar, key: "eval_ui" },
    ],
  },
  {
    label: t("nav.tenant.group.desarrollar"),
    items: [
      { to: "/keys", label: t("nav.tenant.item.keys"), icon: Key, key: "keys" },
      { to: "/webhooks", label: t("nav.tenant.item.webhooks"), icon: WebhooksLogo, key: "keys" },
      { to: "/developers", label: t("nav.tenant.item.developers"), icon: Code },
      { to: "/developers/tools", label: t("nav.tenant.item.tools"), icon: Wrench },
      { to: "/developers/mcp", label: t("nav.tenant.item.mcp"), icon: Plugs },
    ],
  },
  {
    label: t("nav.tenant.group.gobernar"),
    items: [
      { to: "/security", label: t("nav.tenant.item.security"), icon: ShieldCheck, key: "audit" },
      { to: "/security-center", label: t("nav.tenant.item.securityCenter"), icon: ShieldStar },
      { to: "/risk-center", label: t("nav.tenant.item.riskCenter"), icon: WarningOctagon },
      { to: "/governance", label: t("nav.tenant.item.governance"), icon: Scales },
      { to: "/audit/compliance", label: t("nav.tenant.item.compliance"), icon: ClipboardText },
      { to: "/disaster-recovery", label: t("nav.tenant.item.disasterRecovery"), icon: Lifebuoy },
    ],
  },
  {
    label: t("nav.tenant.group.gestionar"),
    collapsible: true,
    defaultCollapsed: true,
    items: [
      { to: "/team", label: t("nav.tenant.item.team"), icon: UsersThree, key: "users" },
      { to: "/billing", label: t("nav.tenant.item.billing"), icon: CreditCard, key: "billing" },
      { to: "/settings", label: t("nav.tenant.item.settings"), icon: Gear, key: "settings" },
      { to: "/workspaces", label: t("nav.tenant.item.workspaces"), icon: Buildings },
      { to: "/projects", label: t("nav.tenant.item.projects"), icon: FolderSimple },
      { to: "/marketplace", label: t("nav.tenant.item.marketplace"), icon: Storefront },
      { to: "/releases", label: t("nav.tenant.item.releases"), icon: Rocket },
      { to: "/migrations", label: t("nav.tenant.item.migrations"), icon: Swap },
      { to: "/training", label: t("nav.tenant.item.training"), icon: GraduationCap },
      { to: "/onboarding", label: t("nav.tenant.item.onboarding"), icon: Compass },
      { to: "/demos", label: t("nav.tenant.item.demos"), icon: Sparkle },
      { to: "/notifications", label: t("nav.tenant.item.notifications"), icon: Bell },
    ],
  },
];

type Entitlements = Record<string, boolean | number | null>;

function isViewerOnly(roles: string[] | undefined): boolean {
  const r = roles || [];
  if (r.some((role) => role === "owner" || role === "admin" || role === "member")) {
    return false;
  }
  return r.includes("viewer");
}

export function canSeeNavItem(
  session: Session | null,
  key?: string,
  entitlements: Entitlements = {}
): boolean {
  if (!key) return true;
  const roles = session?.roles || [];
  const perms = session?.permissions || [];
  const orgAdmin = roles.includes("owner") || roles.includes("admin");
  if (key === "users" || key === "keys") return orgAdmin;
  if (key === "billing" || key === "settings") return orgAdmin;
  if (key === "audit") return orgAdmin || perms.includes("audit:read");
  if (key === "prompts" || key === "connectors") return !isViewerOnly(roles);
  if (key === "eval_ui") return entitlements.eval_ui === true;
  return true;
}

export function navLeaves(group: NavGroup): NavLeaf[] {
  return [...(group.items ?? []), ...(group.sections ?? []).flatMap((s) => s.items)];
}

export function visibleNavLeaves(session: Session | null, entitlements: Entitlements = {}): NavLeaf[] {
  return NAV_GROUPS.flatMap((g) =>
    navLeaves(g).filter((item) => canSeeNavItem(session, item.key, entitlements))
  );
}

/** Grupo y hoja de navegación activos para una ruta (título, breadcrumbs, contexto). */
export function navContextForPath(
  pathname: string
): { group: NavGroup; leaf: NavLeaf } | null {
  for (const group of NAV_GROUPS) {
    for (const leaf of navLeaves(group)) {
      if (leaf.end ? pathname === leaf.to : pathname === leaf.to || pathname.startsWith(`${leaf.to}/`)) {
        return { group, leaf };
      }
    }
  }
  return null;
}
