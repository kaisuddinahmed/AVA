import type { TabId } from "../types";

interface Props {
  active: TabId;
  onSelect: (tab: TabId) => void;
  counts: Record<TabId, number>;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "track",     label: "Track" },
  { id: "evaluate",  label: "Evaluate" },
  { id: "intervene", label: "Intervene" },
];

export function TabBar({ active, onSelect, counts }: Props) {
  return (
    <div className="tab-bar">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={active === t.id ? "active" : ""}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {counts[t.id] > 0 && (
            <span style={{ marginLeft: 6, opacity: 0.6 }}>
              {counts[t.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
