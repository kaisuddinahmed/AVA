// ============================================================================
// BFS crawler — unit tests with a URL-routing fetch mock.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { crawlSite } from "./bfs-crawler.service.js";

// ── Test doubles ────────────────────────────────────────────────────────────

function htmlResponse(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

interface RouteMap {
  [pathOrUrl: string]: () => Response;
}

/** Match an incoming URL against the route map keys (path or full URL). */
function buildRouter(routes: RouteMap): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === "string" ? input : (input as URL | { toString(): string }).toString();
    // Try full URL match
    if (routes[url]) return routes[url]();
    // Try pathname match (mock-friendly default)
    try {
      const p = new URL(url).pathname;
      if (routes[p]) return routes[p]();
    } catch {
      /* malformed url — fall through to 404 */
    }
    return new Response("not found", { status: 404 });
  });
}

// ── Basic BFS ───────────────────────────────────────────────────────────────

describe("crawlSite — basic walk", () => {
  it("crawls root + same-origin links and respects maxDepth", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(""),
      "/": () => htmlResponse(`
        <a href="/products/a">A</a>
        <a href="/products/b">B</a>
        <a href="/external"><!-- ignored, same origin --></a>
        <a href="https://other.example.com/x">other host</a>
      `),
      "/products/a": () => htmlResponse(`<a href="/products/a/details">A1</a>`),
      "/products/b": () => htmlResponse(``),
      "/external": () => htmlResponse(``),
      "/products/a/details": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 50,
    });

    // depth 0: /
    // depth 1: /products/a, /products/b, /external (same origin)
    // depth 2: /products/a/details should NOT appear (maxDepth=1)
    const urls = r.pages.map((p) => new URL(p.url).pathname);
    expect(urls).toContain("/");
    expect(urls).toContain("/products/a");
    expect(urls).toContain("/products/b");
    expect(urls).toContain("/external");
    expect(urls).not.toContain("/products/a/details");
    // External host never reached
    expect(urls.every((u) => !u.startsWith("https://other"))).toBe(true);
  });

  it("respects maxPages even when more links remain", async () => {
    const links = Array.from({ length: 20 }, (_, i) => `/p/${i}`);
    const routes: RouteMap = {
      "/robots.txt": () => textResponse(""),
      "/": () => htmlResponse(links.map((l) => `<a href="${l}">x</a>`).join("\n")),
    };
    for (const l of links) routes[l] = () => htmlResponse(``);
    const fetchMock = buildRouter(routes);

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 2,
      maxPages: 5,
      perRequestTimeoutMs: 5000,
    });
    expect(r.pages.length).toBe(5);
  });

  it("deduplicates visited URLs", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(""),
      "/": () => htmlResponse(`
        <a href="/a">a</a>
        <a href="/a">a-dup</a>
        <a href="/a#fragment">a-fragment</a>
      `),
      "/a": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 2,
      maxPages: 50,
    });
    expect(r.pages.map((p) => new URL(p.url).pathname).filter((p) => p === "/a").length).toBe(1);
  });
});

// ── robots.txt integration ──────────────────────────────────────────────────

describe("crawlSite — robots.txt enforcement", () => {
  it("skips URLs blocked by robots.txt and records them", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(`
        User-agent: *
        Disallow: /admin
      `),
      "/": () => htmlResponse(`
        <a href="/products/a">A</a>
        <a href="/admin/dashboard">B</a>
      `),
      "/products/a": () => htmlResponse(``),
      "/admin/dashboard": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
    });

    const fetched = r.pages.map((p) => new URL(p.url).pathname);
    expect(fetched).toContain("/products/a");
    expect(fetched).not.toContain("/admin/dashboard");
    expect(r.robotsBlocked.map((u) => new URL(u).pathname)).toContain("/admin/dashboard");
  });

  it("falls back to default behaviour when robots.txt is 404", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (new URL(url).pathname === "/") return htmlResponse(`<a href="/a">a</a>`);
      if (new URL(url).pathname === "/a") return htmlResponse(``);
      return new Response("", { status: 404 });
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
    });
    expect(r.pages.length).toBe(2);
  });

  it("ignores robots when ignoreRobots=true", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(`User-agent: *\nDisallow: /`),
      "/": () => htmlResponse(`<a href="/a">a</a>`),
      "/a": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
      ignoreRobots: true,
    });
    expect(r.pages.length).toBe(2);
    expect(r.robotsBlocked).toEqual([]);
  });

  it("collects Sitemap: directives from robots.txt", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(`
        User-agent: *
        Disallow:
        Sitemap: https://example.com/sitemap.xml
        Sitemap: https://example.com/news-sitemap.xml
      `),
      "/": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 0,
      maxPages: 5,
    });
    expect(r.sitemapsFromRobots).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/news-sitemap.xml",
    ]);
  });
});

// ── Failure isolation ───────────────────────────────────────────────────────

describe("crawlSite — failure isolation", () => {
  it("records errored URLs without halting the walk", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const p = new URL(url).pathname;
      if (p === "/robots.txt") return textResponse("");
      if (p === "/") return htmlResponse(`
        <a href="/good">g</a>
        <a href="/broken">b</a>
        <a href="/another">a</a>
      `);
      if (p === "/good") return htmlResponse(``);
      if (p === "/another") return htmlResponse(``);
      if (p === "/broken") throw new Error("connection reset");
      return new Response("", { status: 404 });
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
    });
    expect(r.errored.map((u) => new URL(u).pathname)).toContain("/broken");
    const fetched = r.pages.map((p) => new URL(p.url).pathname);
    expect(fetched).toContain("/good");
    expect(fetched).toContain("/another");
  });

  it("treats non-HTML responses as zero-link leaves", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      const p = new URL(url).pathname;
      if (p === "/robots.txt") return textResponse("");
      if (p === "/") return htmlResponse(`<a href="/data.pdf">pdf</a>`);
      if (p === "/data.pdf") return new Response("%PDF-1.4", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
      return new Response("", { status: 404 });
    });
    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 2,
      maxPages: 10,
    });
    const pdf = r.pages.find((p) => p.url.endsWith("/data.pdf"));
    expect(pdf).toBeDefined();
    expect(pdf?.html).toBe(""); // body not slurped
  });

  it("rejects malformed root URL up-front", async () => {
    await expect(crawlSite({ rootUrl: "not a url" })).rejects.toThrow(/Invalid root URL/);
  });
});

// ── Same-origin restriction ─────────────────────────────────────────────────

describe("crawlSite — same-origin enforcement", () => {
  it("rejects links to a different hostname", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(""),
      "/": () => htmlResponse(`
        <a href="/local">l</a>
        <a href="https://different.example.com/page">far</a>
        <a href="//cdn.example.com/asset">cdn</a>
      `),
      "/local": () => htmlResponse(``),
    });

    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
    });
    const hosts = new Set(r.pages.map((p) => new URL(p.url).hostname));
    expect(hosts).toEqual(new Set(["example.com"]));
  });

  it("rejects protocol mismatch (http vs https)", async () => {
    const fetchMock = buildRouter({
      "/robots.txt": () => textResponse(""),
      "/": () => htmlResponse(`<a href="http://example.com/insecure">x</a>`),
    });
    const r = await crawlSite({
      rootUrl: "https://example.com/",
      fetchImpl: fetchMock,
      maxDepth: 1,
      maxPages: 10,
    });
    expect(r.pages.length).toBe(1); // only the root, no http following
  });
});
