import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgApplications } from "./OrgApplications";

vi.mock("../../api", () => ({ platformApi: vi.fn() }));
vi.mock("../../platformAuth", () => ({
  usePlatformAuth: () => ({ session: { token: "t" } }),
}));

import { platformApi } from "../../api";

describe("OrgApplications (Nivel 2)", () => {
  beforeEach(() => {
    vi.mocked(platformApi).mockResolvedValue({
      applications: [
        {
          id: "app-1",
          code: "mentora",
          name: "Mentora",
          kind: "product",
          status: "active",
          api_keys: 2,
          last_used_at: "2026-02-10T12:00:00Z",
        },
      ],
      direct_access_keys: 1,
    });
  });

  it("muestra las aplicaciones y el acceso directo", async () => {
    render(<OrgApplications orgId="org-1" />);

    expect(await screen.findByText("Mentora")).toBeInTheDocument();
    expect(screen.getByText("mentora")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    // El acceso directo se informa como métrica; ya no hay panel vacío.
    expect(screen.getAllByText("Acceso directo").length).toBeGreaterThan(0);
    expect(vi.mocked(platformApi)).toHaveBeenCalledWith(
      "/api/v1/platform/organizations/org-1/applications",
      { token: "t" },
    );
  });
});
