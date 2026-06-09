import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseValidatedJson, AiOutputError } from "@/server/services/ai-structured-output";

const schema = z.object({ flags: z.array(z.string()) });

describe("parseValidatedJson", () => {
  it("parses and validates well-formed JSON", () => {
    expect(parseValidatedJson('{"flags":["a","b"]}', schema)).toEqual({ flags: ["a", "b"] });
  });

  it("throws AiOutputError on non-JSON", () => {
    expect(() => parseValidatedJson("not json", schema)).toThrow(AiOutputError);
  });

  it("throws AiOutputError when the shape is wrong", () => {
    expect(() => parseValidatedJson('{"flags":"nope"}', schema)).toThrow(AiOutputError);
  });
});
