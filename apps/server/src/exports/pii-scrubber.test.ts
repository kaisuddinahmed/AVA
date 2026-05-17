// ============================================================================
// pii-scrubber — Phase 4.3 unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import { scrubPII, isPIIKey, isPIIValue } from "./pii-scrubber.js";

// ── isPIIKey ───────────────────────────────────────────────────────────────

describe("isPIIKey", () => {
  it("matches named PII keys (case-insensitive)", () => {
    expect(isPIIKey("email")).toBe(true);
    expect(isPIIKey("Email")).toBe(true);
    expect(isPIIKey("user_email")).toBe(true);
    expect(isPIIKey("phone")).toBe(true);
    expect(isPIIKey("phoneNumber")).toBe(true);
    expect(isPIIKey("first_name")).toBe(true);
    expect(isPIIKey("last_name")).toBe(true);
    expect(isPIIKey("address")).toBe(true);
    expect(isPIIKey("billing_address")).toBe(true);
    expect(isPIIKey("ssn")).toBe(true);
    expect(isPIIKey("dob")).toBe(true);
    expect(isPIIKey("password")).toBe(true);
    expect(isPIIKey("creditCard")).toBe(true);
    expect(isPIIKey("ip_address")).toBe(true);
  });

  it("does NOT match AVA's legitimate signal names", () => {
    expect(isPIIKey("session_id")).toBe(false);
    expect(isPIIKey("friction_id")).toBe(false);
    expect(isPIIKey("page_type")).toBe(false);
    expect(isPIIKey("cart_value")).toBe(false);
    expect(isPIIKey("event_category")).toBe(false);
    expect(isPIIKey("visitor_id")).toBe(false);
    expect(isPIIKey("x_pct")).toBe(false);
  });
});

// ── isPIIValue ─────────────────────────────────────────────────────────────

describe("isPIIValue", () => {
  it("flags email-shaped strings", () => {
    expect(isPIIValue("me@example.com")).toBe(true);
    expect(isPIIValue("notes from owner@shop.io about the order")).toBe(true);
  });

  it("flags SSN-shaped strings", () => {
    expect(isPIIValue("123-45-6789")).toBe(true);
  });

  it("flags credit-card-shaped strings", () => {
    expect(isPIIValue("4111 1111 1111 1111")).toBe(true);
    expect(isPIIValue("4111-1111-1111-1111")).toBe(true);
  });

  it("ignores non-string scalars", () => {
    expect(isPIIValue(42)).toBe(false);
    expect(isPIIValue(true)).toBe(false);
    expect(isPIIValue(null)).toBe(false);
    expect(isPIIValue(undefined)).toBe(false);
  });

  it("recurses into nested objects (JSON match)", () => {
    expect(isPIIValue({ nested: { email: "me@x.com" } })).toBe(true);
  });

  it("doesn't flag URLs or session ids", () => {
    expect(isPIIValue("https://shop.example/products/abc")).toBe(false);
    expect(isPIIValue("sess_a1b2c3d4e5f6")).toBe(false);
  });
});

// ── scrubPII ───────────────────────────────────────────────────────────────

describe("scrubPII", () => {
  it("returns {} for null / undefined / non-object input", () => {
    expect(scrubPII(null)).toEqual({});
    expect(scrubPII(undefined)).toEqual({});
  });

  it("drops PII-named keys", () => {
    const out = scrubPII({
      email: "a@b.c", phone: "555", session_id: "s1", cart_value: 99,
    });
    expect(out).toEqual({ session_id: "s1", cart_value: 99 });
  });

  it("drops fields whose VALUE matches a PII pattern even when key looks safe", () => {
    const out = scrubPII({
      session_id: "s1",
      notes: "ping me at owner@shop.io",      // value-pattern match → drop
      title: "Cool product",                  // clean → keep
    });
    expect(out).toEqual({ session_id: "s1", title: "Cool product" });
  });

  it("does NOT mutate the input object", () => {
    const input = { email: "a@b.c", keep: 1 };
    const out = scrubPII(input);
    expect(input).toEqual({ email: "a@b.c", keep: 1 });
    expect(out).toEqual({ keep: 1 });
  });

  it("protectedKeys whitelist bypasses both layers", () => {
    const out = scrubPII(
      { visitor_id: "anon_xyz", email: "a@b.c", note: "owner@shop.io" },
      { protectedKeys: new Set(["visitor_id"]) },
    );
    expect(out).toEqual({ visitor_id: "anon_xyz" });
    // protected key alone — email/note still scrubbed
  });

  it("scrubs both `name` (exact) and `fullName`/`firstName`/`lastName`", () => {
    expect(scrubPII({ name: "Kais" })).toEqual({});
    expect(scrubPII({ firstName: "A", lastName: "B", displayName: "C" })).toEqual({});
  });
});
