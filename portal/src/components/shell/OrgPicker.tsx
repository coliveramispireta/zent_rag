import { useNavigate } from "react-router-dom";
import { Select } from "../ui";

export type OrgOption = {
  id: string;
  name: string;
  company_name: string | null;
};

/**
 * Selector de organización del Nivel 1. Al elegir una, entra a su contexto
 * (Nivel 2): `/control-center/org/:orgId`.
 */
export function OrgPicker({
  orgs,
  currentOrgId,
}: {
  orgs: OrgOption[];
  currentOrgId?: string;
}) {
  const navigate = useNavigate();

  return (
    <Select
      aria-label="Ir a una organización"
      className="h-8 w-[230px] text-xs"
      value={currentOrgId ?? ""}
      onChange={(event) => {
        const id = event.target.value;
        if (id) navigate(`/control-center/org/${id}`);
      }}
      placeholder="Ir a una organización…"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.company_name || org.name}
        </option>
      ))}
    </Select>
  );
}
