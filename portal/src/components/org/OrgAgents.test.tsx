import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgAgents } from "./OrgAgents";

vi.mock("../../api", () => ({ platformApi: vi.fn() }));
vi.mock("../../platformAuth", () => ({
  usePlatformAuth: () => ({ session: { token: "t" } }),
}));

import { platformApi } from "../../api";

const AGENTS = [
  {
    id: "a1",
    name: "Ventas WhatsApp",
    model: "gpt-4o-mini",
    is_active: true,
    created_at: "2026-01-05T09:30:00Z",
    deployments: 2,
  },
  {
    id: "a2",
    name: "Soporte interno",
    model: null,
    is_active: false,
    created_at: "2026-02-10T12:00:00Z",
    deployments: 0,
  },
];

describe("OrgAgents (Nivel 2)", () => {
  beforeEach(() => {
    vi.mocked(platformApi).mockResolvedValue({ agents: AGENTS });
  });

  it("lista los agentes de la organización con su estado", async () => {
    render(<OrgAgents orgId="org-1" />);

    expect(await screen.findByText("Ventas WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Soporte interno")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
    expect(vi.mocked(platformApi)).toHaveBeenCalledWith(
      "/api/v1/platform/organizations/org-1/agents",
      { token: "t" },
    );
  });

  it("filtra por estado y por nombre", async () => {
    render(<OrgAgents orgId="org-1" />);
    await screen.findByText("Ventas WhatsApp");

    await userEvent.selectOptions(
      screen.getByLabelText("Filtrar por estado"),
      "inactive",
    );
    await waitFor(() =>
      expect(screen.queryByText("Ventas WhatsApp")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Soporte interno")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Filtrar por estado"),
      "all",
    );
    await userEvent.type(screen.getByLabelText("Buscar agente"), "ventas");
    await waitFor(() =>
      expect(screen.queryByText("Soporte interno")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Ventas WhatsApp")).toBeInTheDocument();
  });
});
