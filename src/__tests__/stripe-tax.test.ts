import { describe, expect, it } from "vitest";
import { missingTaxAddressFields } from "@/server/services/stripe-tax";

describe("missingTaxAddressFields", () => {
  const completeUS = {
    line1: "123 Main",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  };
  const completeDE = {
    line1: "Hauptstr 1",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
  };

  it("returns empty when both addresses are complete", () => {
    expect(missingTaxAddressFields({ origin: completeUS, destination: completeDE })).toEqual([]);
  });

  it("flags missing core fields on either side", () => {
    const missing = missingTaxAddressFields({
      origin: { city: "SF", country: "US", state: "CA" },
      destination: completeDE,
    });
    expect(missing).toContain("origin.line1");
    expect(missing).toContain("origin.postalCode");
  });

  it("requires state on US/CA addresses", () => {
    const usNoState = { ...completeUS, state: undefined };
    const missing = missingTaxAddressFields({
      origin: completeDE,
      destination: usNoState,
    });
    expect(missing).toContain("destination.state");
  });

  it("does not require state on non-US/CA addresses", () => {
    expect(
      missingTaxAddressFields({ origin: completeDE, destination: completeDE }),
    ).toEqual([]);
  });
});
