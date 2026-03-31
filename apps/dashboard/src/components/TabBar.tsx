interface TabBarProps {
  active: string;
  onSelect: (tab: string) => void;
  counts: Record<string, number>;
}

const TABS = [
  { id: 'track', label: 'Track' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'intervene', label: 'Intervene' },
];

export function TabBar({ active, onSelect, counts }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {counts[tab.id] > 0 && (
            <span style={{ marginLeft: 6, opacity: 0.6 }}>{counts[tab.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
