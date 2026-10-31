import {
  ChartLineUp,
  Cpu,
  Database,
  Gear,
  Plugs,
  Robot,
  SquaresFour,
  type Icon,
} from "@phosphor-icons/react";
import { Link, NavLink } from "react-router-dom";
import { ORG_SECTIONS, type OrgSectionId } from "../../lib/orgSections";
import { cn } from "../ui/cn";

const ICONS: Record<OrgSectionId, Icon> = {
  resumen: SquaresFour,
  agentes: Robot,
  ia: Cpu,
  aplicaciones: Plugs,
  parametros: Gear,
  ingesta: Database,
  consumo: ChartLineUp,
};

/**
 * Segundo sidebar del Control Center: el menú propio de la organización
 * (Nivel 2). Vive pegado al sidebar general y solo aparece dentro de
 * `/control-center/org/:orgId`.
 */
export function OrgSidebar({
  orgId,
  orgName,
  activeSection,
}: {
  orgId: string;
  orgName: string;
  activeSection: OrgSectionId;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-3 py-3">
        <p className="eyebrow">Organización</p>
        <p className="mt-1 truncate text-sm font-medium text-text" title={orgName}>
          {orgName}
        </p>
        <p className="mono mt-0.5 truncate text-[10px] text-faint">{orgId}</p>
      </div>

      <nav
        aria-label="Secciones de la organización"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3"
      >
        {ORG_SECTIONS.map((section) => {
          const IconEl = ICONS[section.id];
          const active = section.id === activeSection;
          const to =
            section.id === "resumen"
              ? `/control-center/org/${orgId}`
              : `/control-center/org/${orgId}?seccion=${section.id}`;
          return (
            <Link
              key={section.id}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-8 items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-soft/70 font-medium text-text"
                  : "text-muted hover:bg-soft/45 hover:text-text",
              )}
            >
              <IconEl size={15} aria-hidden />
              <span className="truncate">{section.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <NavLink
          to="/control-center"
          className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-text"
        >
          <span aria-hidden>‹</span> Salir a Zent
        </NavLink>
        <NavLink
          to={`/control-center/tenants/${orgId}`}
          className="mt-2 flex items-center gap-2 text-xs text-muted transition-colors hover:text-text"
        >
          Ficha 360 de la organización
        </NavLink>
      </div>
    </div>
  );
}
