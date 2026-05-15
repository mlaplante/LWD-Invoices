import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEMPLATES,
  fillTemplate,
  TOUCH_TYPE_LABELS,
} from "../server/services/check-in-templates";

describe("fillTemplate", () => {
  it("substitutes client_first_name", () => {
    const out = fillTemplate("Hi {{ client_first_name }}", { clientFirstName: "Sam" });
    expect(out).toBe("Hi Sam");
  });

  it("falls back to 'there' when first name missing", () => {
    const out = fillTemplate("Hi {{ client_first_name }}", { clientFirstName: null });
    expect(out).toBe("Hi there");
  });

  it("substitutes project_name with placeholder when missing", () => {
    const out = fillTemplate("Re: {{ project_name }}", { projectName: null });
    expect(out).toBe("Re: [project]");
  });

  it("handles flexible whitespace inside braces", () => {
    const out = fillTemplate("{{client_name}} / {{ client_name }} / {{  client_name  }}", {
      clientName: "Acme",
    });
    expect(out).toBe("Acme / Acme / Acme");
  });

  it("leaves unknown variables alone", () => {
    const out = fillTemplate("{{ unknown_thing }}", {});
    expect(out).toBe("{{ unknown_thing }}");
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("has a template for every touch type", () => {
    const types = Object.keys(TOUCH_TYPE_LABELS) as Array<keyof typeof TOUCH_TYPE_LABELS>;
    for (const t of types) {
      expect(DEFAULT_TEMPLATES[t]).toBeDefined();
      expect(DEFAULT_TEMPLATES[t].subject.length).toBeGreaterThan(0);
      expect(DEFAULT_TEMPLATES[t].body.length).toBeGreaterThan(0);
    }
  });

  it("references variables that fillTemplate knows about", () => {
    const known = ["client_name", "client_first_name", "client_company", "project_name", "sender_name"];
    for (const tmpl of Object.values(DEFAULT_TEMPLATES)) {
      const referenced = [...tmpl.body.matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((m) => m[1]);
      for (const v of referenced) {
        expect(known).toContain(v);
      }
    }
  });
});
