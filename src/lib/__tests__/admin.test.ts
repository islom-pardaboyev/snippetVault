import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "../admin";

/**
 * `/admin` is gated in two independent places: this build-time constant (used by the UI) and a
 * hard-coded literal in `firestore.rules` (used to authorise reads). They cannot share a value,
 * so this test is the only thing keeping them from drifting apart silently.
 */
describe("admin email", () => {
  it("matches the email hard-coded in firestore.rules", () => {
    const rules = readFileSync(new URL("../../../firestore.rules", import.meta.url), "utf8");
    const match = rules.match(/request\.auth\.token\.email\s*==\s*'([^']+)'/);
    expect(match, "firestore.rules should hard-code an admin email").not.toBeNull();
    expect(match![1].toLowerCase()).toBe(ADMIN_EMAIL);
  });

  it("is a real address (not the .env.example placeholder left in by mistake)", () => {
    expect(ADMIN_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
