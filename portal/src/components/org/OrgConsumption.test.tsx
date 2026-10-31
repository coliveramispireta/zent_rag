import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgConsumption } from "./OrgConsumption";

vi.mock("../../api", () => ({ platformApi: vi.fn() }));
vi.mock("../../platformAuth", () => ({
  usePlatformAuth: () => ({ session: { token: "t" } }),
}));

import { platformApi } from "../../api";

describe("OrgConsumption (Nivel 2)", () => {
  beforeEach(() => {
    vi.mocked(platformApi).mockResolvedValue({
      period: { from: "2026-01-01", to: "2026-01-31" },
      revenue_cents: 120000,
      mrr_cents: 120000,
      costs: { llm: 12.5, embedding: 2.5, storage: 1, infra: 4 },
      gross_profit: 1180,
      gross_margin_pct: 98.3,
      economics: { requests: 1500, cost_per_request: 0.0133, revenue_per_request: 0.8 },
    });
  });

  it("muestra solicitudes, costos y desglose", async () => {
    render(<OrgConsumption orgId="org-1" />);

    expect(await screen.findByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("Desglose de costos")).toBeInTheDocument();
    expect(screen.getByText("Embeddings")).toBeInTheDocument();
    expect(screen.getByText("98.3%")).toBeInTheDocument();
    expect(vi.mocked(platformApi)).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/platform/finops/organizations/org-1?"),
      { token: "t" },
    );
  });
});
