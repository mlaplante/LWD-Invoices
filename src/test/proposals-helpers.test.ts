import { describe, it, expect } from "vitest";
import {
  substituteVariables,
  SUPPORTED_VARIABLES,
} from "../server/routers/proposals-helpers";

describe("substituteVariables", () => {
  it("replaces {{client_name}} with actual client name", () => {
    const result = substituteVariables("Hello {{client_name}}", {
      client_name: "Acme Corp",
    });
    expect(result).toBe("Hello Acme Corp");
  });

  it("replaces multiple variables in one string", () => {
    const result = substituteVariables(
      "Project for {{client_name}} at {{client_url}}",
      { client_name: "Acme Corp", client_url: "acme.com" }
    );
    expect(result).toBe("Project for Acme Corp at acme.com");
  });

  it("leaves unknown variables as-is", () => {
    const result = substituteVariables("Hello {{unknown_var}}", {});
    expect(result).toBe("Hello {{unknown_var}}");
  });

  it("handles null content by returning null", () => {
    const result = substituteVariables(null, { client_name: "Acme" });
    expect(result).toBeNull();
  });

  it("replaces same variable multiple times", () => {
    const result = substituteVariables(
      "{{client_name}} agrees. Signed: {{client_name}}",
      { client_name: "Acme" }
    );
    expect(result).toBe("Acme agrees. Signed: Acme");
  });
});

describe("SUPPORTED_VARIABLES", () => {
  it("includes expected variable names", () => {
    expect(SUPPORTED_VARIABLES).toContain("client_name");
    expect(SUPPORTED_VARIABLES).toContain("client_url");
    expect(SUPPORTED_VARIABLES).toContain("date");
  });
});
