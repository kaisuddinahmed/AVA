// ============================================================================
// CoachingConfigPanel — merchant coaching for the AVA virtual salesperson.
// Thinking Layer step 9 (2026-05-19).
//
// Reads + writes /api/merchant-coaching for the active siteUrl. The form
// is intentionally minimal: tone select, three comma-separated arrays,
// a discount-floor number, and a notes textarea. The think/ module reads
// this on every LLM-driven move so the salesperson stays merchant-specific.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../hooks/use-api";

type Tone =
  | "unspecified"
  | "luxury"
  | "playful"
  | "no_nonsense"
  | "warm"
  | "technical";

interface CoachingView {
  siteUrl: string;
  tone: Tone;
  alwaysUpsell: string[];
  neverDiscountBelowPct: number;
  forbiddenClaims: string[];
  priorityObjections: string[];
  freeformNotes: string | null;
  updatedAt: string | null;
}

interface CoachingResponse {
  siteUrl: string;
  coaching: CoachingView;
}

const TONE_OPTIONS: Tone[] = [
  "unspecified",
  "warm",
  "playful",
  "luxury",
  "no_nonsense",
  "technical",
];

export function CoachingConfigPanel({ siteUrl }: { siteUrl: string | null }) {
  const [view, setView] = useState<CoachingView | null>(null);
  const [tone, setTone] = useState<Tone>("unspecified");
  const [alwaysUpsell, setAlwaysUpsell] = useState("");
  const [forbiddenClaims, setForbiddenClaims] = useState("");
  const [priorityObjections, setPriorityObjections] = useState("");
  const [neverDiscountBelowPct, setNeverDiscountBelowPct] = useState("0");
  const [freeformNotes, setFreeformNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!siteUrl) return;
    try {
      const r = await apiFetch<CoachingResponse>(
        `/merchant-coaching?siteUrl=${encodeURIComponent(siteUrl)}`,
      );
      setView(r.coaching);
      setTone((r.coaching.tone ?? "unspecified") as Tone);
      setAlwaysUpsell((r.coaching.alwaysUpsell ?? []).join(", "));
      setForbiddenClaims((r.coaching.forbiddenClaims ?? []).join(", "));
      setPriorityObjections((r.coaching.priorityObjections ?? []).join(", "));
      setNeverDiscountBelowPct(String(r.coaching.neverDiscountBelowPct ?? 0));
      setFreeformNotes(r.coaching.freeformNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    }
  }, [siteUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!siteUrl) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        siteUrl,
        tone,
        alwaysUpsell: csvToArray(alwaysUpsell),
        forbiddenClaims: csvToArray(forbiddenClaims),
        priorityObjections: csvToArray(priorityObjections),
        neverDiscountBelowPct: Number.parseInt(neverDiscountBelowPct, 10) || 0,
        freeformNotes: freeformNotes.trim() || null,
      };
      const r = await apiFetch<CoachingResponse>("/merchant-coaching", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setView(r.coaching);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }, [
    siteUrl,
    tone,
    alwaysUpsell,
    forbiddenClaims,
    priorityObjections,
    neverDiscountBelowPct,
    freeformNotes,
  ]);

  if (!siteUrl) {
    return (
      <div style={{ opacity: 0.6, fontSize: 12 }}>
        Select a site to configure coaching.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
        Coach the salesperson for <code>{siteUrl}</code>. Saved values are read
        by AVA on every move.
      </p>

      <Field label="Tone">
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value as Tone)}
          style={inputStyle}
        >
          {TONE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Always upsell (comma-separated)">
        <input
          type="text"
          value={alwaysUpsell}
          onChange={(e) => setAlwaysUpsell(e.target.value)}
          placeholder="warranty, gift wrap, expedited shipping"
          style={inputStyle}
        />
      </Field>

      <Field label="Never discount below %">
        <input
          type="number"
          min={0}
          max={100}
          value={neverDiscountBelowPct}
          onChange={(e) => setNeverDiscountBelowPct(e.target.value)}
          style={{ ...inputStyle, width: 80 }}
        />
      </Field>

      <Field label="Forbidden claims (comma-separated)">
        <input
          type="text"
          value={forbiddenClaims}
          onChange={(e) => setForbiddenClaims(e.target.value)}
          placeholder="lowest price, fastest shipping"
          style={inputStyle}
        />
      </Field>

      <Field label="Top 3 priority objections (price, fit, trust, delivery, choice, timing)">
        <input
          type="text"
          value={priorityObjections}
          onChange={(e) => setPriorityObjections(e.target.value)}
          placeholder="price, fit, trust"
          style={inputStyle}
        />
      </Field>

      <Field label="Notes (free-form)">
        <textarea
          value={freeformNotes}
          onChange={(e) => setFreeformNotes(e.target.value)}
          placeholder="Always finish with a soft close. Never apologize for the price."
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={buttonStyle(saving)}
        >
          {saving ? "Saving..." : "Save coaching"}
        </button>
        {savedAt && !saving && (
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            Saved {fmtRelative(savedAt)}.
          </span>
        )}
        {view?.updatedAt && (
          <span style={{ fontSize: 11, opacity: 0.5 }}>
            Server last updated{" "}
            {new Date(view.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            color: "var(--tier-escalate, #c0392b)",
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function csvToArray(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function fmtRelative(ts: number): string {
  const dt = Math.max(0, Date.now() - ts);
  if (dt < 5_000) return "just now";
  if (dt < 60_000) return `${Math.floor(dt / 1000)}s ago`;
  return `${Math.floor(dt / 60_000)}m ago`;
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4,
  background: "transparent",
  color: "inherit",
  fontSize: 13,
};

function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    border: "1px solid var(--accent, #e89b3b)",
    borderRadius: 4,
    background: "var(--accent, #e89b3b)",
    color: "#000",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 600,
    fontSize: 12,
  };
}
