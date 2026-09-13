import { ACTIVITY_CATEGORIES, catalogByCategory } from '../registry/activityCatalog';
import { getActivityDefinition } from '../registry/activityDefinitions';

export const PALETTE_DND_TYPE = 'application/scripteditor-activity-type';

/** Category-grouped sidebar (Phase 1.3). Every one of the 36 catalog shapes
 * is listed and draggable; only the 6 seeded types (registry/
 * activityDefinitions.ts) get a friendly title/color -- everything else
 * shows its raw type name, per this task's "list all, flesh out later"
 * scope (full-catalog behavior parity is Phase 5). */
export function Palette() {
  const grouped = catalogByCategory();

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid #e5e7eb',
        overflowY: 'auto',
        padding: 8,
        background: '#fafafa',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Activities</div>
      {ACTIVITY_CATEGORIES.map((category) => {
        const entries = grouped.get(category) ?? [];
        if (entries.length === 0) return null;

        return (
          <div key={category} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: 4,
                textTransform: 'uppercase',
                fontSize: 10,
                letterSpacing: 0.4,
              }}
            >
              {category}
            </div>
            {entries.map((entry) => {
              const definition = getActivityDefinition(entry.type);
              return (
                <div
                  key={entry.type}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PALETTE_DND_TYPE, entry.type);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  title={entry.type}
                  style={{
                    padding: '6px 8px',
                    marginBottom: 4,
                    border: '1px solid #e5e7eb',
                    borderRadius: 4,
                    background: '#fff',
                    cursor: 'grab',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {definition?.title ?? entry.type}
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
