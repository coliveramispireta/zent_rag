import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgIngestion } from "./OrgIngestion";

vi.mock("../../api", () => ({ platformApi: vi.fn() }));
vi.mock("../../platformAuth", () => ({
  usePlatformAuth: () => ({ session: { token: "t" } }),
}));

import { platformApi } from "../../api";

describe("OrgIngestion (Nivel 2)", () => {
  beforeEach(() => {
    vi.mocked(platformApi).mockResolvedValue({
      sources: [
        {
          id: "s1",
          name: "inventario.xlsx",
          type: "excel",
          status: "ready",
          last_success_at: "2026-02-10T12:00:00Z",
          created_at: "2026-02-01T09:00:00Z",
        },
        {
          id: "s2",
          name: "facturas.csv",
          type: "csv",
          status: "pending",
          last_success_at: null,
          created_at: "2026-02-05T10:00:00Z",
        },
      ],
      knowledge_bases: [
        {
          id: "kb1",
          name: "Operaciones",
          chunking_strategy: "semantic",
          retrieval_strategy: "hybrid",
          created_at: "2026-02-01T09:00:00Z",
        },
      ],
    });
  });

  it("muestra fuentes, estado de ingesta y colecciones", async () => {
    render(<OrgIngestion orgId="org-1" />);

    expect(await screen.findByText("inventario.xlsx")).toBeInTheDocument();
    expect(screen.getByText("facturas.csv")).toBeInTheDocument();
    expect(screen.getByText("nunca")).toBeInTheDocument();
    expect(screen.getByText("Operaciones")).toBeInTheDocument();
    expect(vi.mocked(platformApi)).toHaveBeenCalledWith(
      "/api/v1/platform/organizations/org-1/sources",
      { token: "t" },
    );
  });
});
