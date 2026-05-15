// ============================================================================
// robots.txt parser — unit tests.
// ============================================================================

import { describe, it, expect } from "vitest";
import { parseRobotsTxt, isAllowed, crawlDelayFor } from "./robots.parser.js";

// ── Parse ───────────────────────────────────────────────────────────────────

describe("parseRobotsTxt — basic shapes", () => {
  it("parses a single User-agent block with allow/disallow rules", () => {
    const r = parseRobotsTxt(`
      User-agent: *
      Disallow: /admin
      Allow: /admin/public
    `);
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].userAgents).toEqual(["*"]);
    expect(r.groups[0].rules).toEqual([
      { type: "disallow", pattern: "/admin" },
      { type: "allow", pattern: "/admin/public" },
    ]);
  });

  it("groups consecutive User-agent lines together", () => {
    const r = parseRobotsTxt(`
      User-agent: Googlebot
      User-agent: Bingbot
      Disallow: /private
    `);
    expect(r.groups.length).toBe(1);
    expect(r.groups[0].userAgents).toEqual(["googlebot", "bingbot"]);
    expect(r.groups[0].rules).toHaveLength(1);
  });

  it("opens a new group when a UA line follows a rule line", () => {
    const r = parseRobotsTxt(`
      User-agent: A
      Disallow: /a

      User-agent: B
      Disallow: /b
    `);
    expect(r.groups.length).toBe(2);
    expect(r.groups[0].userAgents).toEqual(["a"]);
    expect(r.groups[1].userAgents).toEqual(["b"]);
  });

  it("collects Sitemap: directives at the top level (host-scoped)", () => {
    const r = parseRobotsTxt(`
      User-agent: *
      Disallow:
      Sitemap: https://example.com/sitemap.xml
      Sitemap: https://example.com/news-sitemap.xml
    `);
    expect(r.sitemaps).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/news-sitemap.xml",
    ]);
  });

  it("parses Crawl-delay as a number scoped to its UA group", () => {
    const r = parseRobotsTxt(`
      User-agent: Slowbot
      Crawl-delay: 10
      Disallow: /slow

      User-agent: *
      Crawl-delay: 1
    `);
    expect(r.groups[0].crawlDelaySec).toBe(10);
    expect(r.groups[1].crawlDelaySec).toBe(1);
  });
});

describe("parseRobotsTxt — tolerance", () => {
  it("handles BOM + CRLF + trailing whitespace", () => {
    const r = parseRobotsTxt("﻿  User-agent: *  \r\n  Disallow: /a  \r\n");
    expect(r.groups[0].rules[0].pattern).toBe("/a");
  });

  it("strips inline # comments", () => {
    const r = parseRobotsTxt(`
      User-agent: * # all bots
      Disallow: /admin # internal
    `);
    expect(r.groups[0].rules[0].pattern).toBe("/admin");
  });

  it("ignores blank lines and malformed directives", () => {
    const r = parseRobotsTxt(`
      garbage line no colon
      :missing-key
      User-agent: *
      Disallow: /ok
    `);
    expect(r.groups[0].rules).toEqual([{ type: "disallow", pattern: "/ok" }]);
  });

  it("returns empty result for empty/whitespace/garbage input", () => {
    expect(parseRobotsTxt("").groups).toEqual([]);
    expect(parseRobotsTxt("   \n\n").groups).toEqual([]);
    expect(parseRobotsTxt("not a robots file").groups).toEqual([]);
  });
});

// ── Match ───────────────────────────────────────────────────────────────────

describe("isAllowed — wildcard groups", () => {
  const r = parseRobotsTxt(`
    User-agent: *
    Disallow: /admin
    Allow: /admin/public
  `);

  it("blocks /admin and subpaths", () => {
    expect(isAllowed(r, "AnyBot", "/admin")).toBe(false);
    expect(isAllowed(r, "AnyBot", "/admin/orders")).toBe(false);
  });

  it("allows /admin/public via longest-match", () => {
    expect(isAllowed(r, "AnyBot", "/admin/public")).toBe(true);
    expect(isAllowed(r, "AnyBot", "/admin/public/details")).toBe(true);
  });

  it("allows everything else", () => {
    expect(isAllowed(r, "AnyBot", "/products/x")).toBe(true);
    expect(isAllowed(r, "AnyBot", "/")).toBe(true);
  });
});

describe("isAllowed — specific UA beats wildcard", () => {
  const r = parseRobotsTxt(`
    User-agent: *
    Disallow: /

    User-agent: Googlebot
    Allow: /
    Disallow: /secret
  `);

  it("uses the most specific UA block (case-insensitive prefix match)", () => {
    expect(isAllowed(r, "Googlebot/2.1", "/products")).toBe(true);
    expect(isAllowed(r, "Googlebot/2.1", "/secret")).toBe(false);
  });

  it("falls back to * for unknown UAs", () => {
    expect(isAllowed(r, "OtherBot", "/products")).toBe(false);
  });

  it("treats empty Disallow as allow-all", () => {
    const empty = parseRobotsTxt(`
      User-agent: *
      Disallow:
    `);
    expect(isAllowed(empty, "AnyBot", "/anything")).toBe(true);
  });
});

describe("isAllowed — wildcards in patterns", () => {
  const r = parseRobotsTxt(`
    User-agent: *
    Disallow: /*.json$
    Disallow: /private/*/draft
    Allow: /*.html$
  `);

  it("blocks paths ending in .json", () => {
    expect(isAllowed(r, "B", "/data/a.json")).toBe(false);
    expect(isAllowed(r, "B", "/data/a.json?x=1")).toBe(true); // $ anchored
  });

  it("blocks paths matching mid-wildcard patterns", () => {
    expect(isAllowed(r, "B", "/private/a/draft")).toBe(false);
    expect(isAllowed(r, "B", "/private/anything-here/draft")).toBe(false);
    expect(isAllowed(r, "B", "/private/a/published")).toBe(true);
  });

  it("longest-match resolves allow vs disallow", () => {
    // /*.html$ (len 8) wins over no other rule
    expect(isAllowed(r, "B", "/page.html")).toBe(true);
  });
});

// ── Crawl-delay ─────────────────────────────────────────────────────────────

describe("crawlDelayFor", () => {
  const r = parseRobotsTxt(`
    User-agent: Slowbot
    Crawl-delay: 10

    User-agent: *
    Crawl-delay: 2
  `);

  it("returns the UA-specific delay when matched", () => {
    expect(crawlDelayFor(r, "Slowbot/1.0")).toBe(10);
  });

  it("falls back to wildcard delay for unknown UAs", () => {
    expect(crawlDelayFor(r, "AnyOtherBot")).toBe(2);
  });

  it("returns undefined when no group has a crawl-delay", () => {
    const r2 = parseRobotsTxt(`User-agent: *\nDisallow: /`);
    expect(crawlDelayFor(r2, "B")).toBeUndefined();
  });
});

// ── Real-world sanity ──────────────────────────────────────────────────────

describe("parseRobotsTxt — real-world Shopify shape", () => {
  it("handles a typical Shopify robots.txt", () => {
    // Trimmed from a real Shopify storefront — covers UA groups, wildcards,
    // Sitemap directives, and the /search disallow + /collections allow.
    const sample = `
      # Shopify robots.txt
      User-agent: *
      Disallow: /admin
      Disallow: /cart
      Disallow: /orders
      Disallow: /checkouts/
      Disallow: /checkout
      Disallow: /carts
      Disallow: /account
      Disallow: /collections/*+*
      Disallow: /search
      Disallow: /apple-app-site-association
      Allow: /collections/all
      Sitemap: https://example.myshopify.com/sitemap.xml

      User-agent: Nutch
      Disallow: /
    `;
    const r = parseRobotsTxt(sample);
    expect(r.sitemaps).toEqual(["https://example.myshopify.com/sitemap.xml"]);
    expect(r.groups.length).toBe(2);

    // AVA's UA: wildcard rules apply.
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/products/raw-linen-tee")).toBe(true);
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/collections/tops")).toBe(true);
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/cart")).toBe(false);
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/checkouts/abc")).toBe(false);
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/admin/dashboard")).toBe(false);
    expect(isAllowed(r, "AVA-Onboarding/1.0", "/collections/all")).toBe(true); // explicit allow

    // Nutch bot blocked entirely.
    expect(isAllowed(r, "Nutch/2.0", "/products/anything")).toBe(false);
  });
});
