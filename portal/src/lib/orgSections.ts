/**
 * Nivel 2 — secciones del contexto de una organización.
 *
 * Según la propuesta de reorganización (§5): configuración de agentes, gestión
 * de agentes, aplicaciones e integraciones, parámetros, ingesta de información
 * y monitoreo de consumo.
 */
export const ORG_SECTIONS = [
  { id: "resumen", label: "Resumen" },
  { id: "agentes", label: "Agentes" },
  { id: "ia", label: "Configuración de IA" },
  { id: "aplicaciones", label: "Aplicaciones e integraciones" },
  { id: "parametros", label: "Parámetros" },
  { id: "ingesta", label: "Ingesta de información" },
  { id: "consumo", label: "Monitoreo de consumo" },
] as const;

export type OrgSectionId = (typeof ORG_SECTIONS)[number]["id"];

export const DEFAULT_ORG_SECTION: OrgSectionId = "resumen";

export function sectionLabel(id: string | null | undefined): string {
  return (
    ORG_SECTIONS.find((section) => section.id === id)?.label ??
    ORG_SECTIONS[0].label
  );
}

export function parseOrgSection(value: string | null): OrgSectionId {
  const found = ORG_SECTIONS.find((section) => section.id === value);
  return found ? found.id : DEFAULT_ORG_SECTION;
}
