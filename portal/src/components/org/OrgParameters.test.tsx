import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrgParameters } from "./OrgParameters";

vi.mock("../../api", () => ({ platformApi: vi.fn() }));
vi.mock("../../platformAuth", () => ({
  usePlatformAuth: () => ({ session: { token: "t" } }),
}));

import { platformApi } from "../../api";

const PARAMS = {
  id: "org-1",
  name: "Bodega Los Andes",
  status: "active",
  rate_limit_per_minute: 600,
  max_tokens_per_request: 100000,
  llm_model_override: "gpt-4o-mini",
  embedding_model_override: null,
  created_at: "2026-01-05T09:30:00Z",
};

describe("OrgParameters (Nivel 2)", () => {
  beforeEach(() => {
    vi.mocked(platformApi).mockReset();
    vi.mocked(platformApi).mockResolvedValue(PARAMS);
  });

  it("carga los parámetros y los guarda", async () => {
    render(<OrgParameters orgId="org-1" />);

    const limit = await screen.findByLabelText(/Solicitudes por minuto/);
    expect(limit).toHaveValue(600);
    expect(screen.getByLabelText(/Modelo de chat/)).toHaveValue("gpt-4o-mini");

    await userEvent.clear(limit);
    await userEvent.type(limit, "900");
    await userEvent.click(screen.getByRole("button", { name: "Guardar parámetros" }));

    await waitFor(() =>
      expect(vi.mocked(platformApi)).toHaveBeenCalledWith(
        "/api/v1/platform/organizations/org-1/parameters",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(await screen.findByText("Parámetros guardados.")).toBeInTheDocument();
  });
});
