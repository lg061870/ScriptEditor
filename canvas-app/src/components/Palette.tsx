import { ACTIVITY_CATEGORIES, catalogByCategory } from '../registry/activityCatalog';
import { getActivityDefinition } from '../registry/activityDefinitions';

export const PALETTE_DND_TYPE = 'application/scripteditor-activity-type';

export interface PaletteProps {
  /** Non-null when a Phase 1.4 "+" click is awaiting an activity pick --
   * changes the palette's affordance from "drag onto canvas" to "click to
   * add, pre-wired to that port". */
  pendingConnectionLabel?: string | null;
  onCancelPending?: () => void;
  onPick?: (type: string) => void;
}

/** Category-grouped sidebar (Phase 1.3). Every one of the 36 catalog shapes
 * is listed and draggable; only the 6 seeded types (registry/
 * activityDefinitions.ts) get a friendly title/color -- everything else
 * shows its raw type name, per this task's "list all, flesh out later"
 * scope (full-catalog behavior parity is Phase 5). */
export function Palette({ pendingConnectionLabel, onCancelPending, onPick }: PaletteProps) {
  const grouped = catalogByCategory();
  const isPending = pendingConnectionLabel != null;

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
      {isPending && (
        <div
          style={{
            marginBottom: 10,
            padding: 8,
            borderRadius: 6,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Connecting from {pendingConnectionLabel}</div>
          <div style={{ color: '#6b7280', marginBottom: 6 }}>Pick an activity to add it, pre-wired.</div>
          <button
            type="button"
            onClick={onCancelPending}
            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}
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
                  draggable={!isPending}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PALETTE_DND_TYPE, entry.type);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={isPending ? () => onPick?.(entry.type) : undefined}
                  title={entry.type}
                  style={{
                    padding: '6px 8px',
                    marginBottom: 4,
                    border: isPending ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                    borderRadius: 4,
                    background: '#fff',
                    cursor: isPending ? 'pointer' : 'grab',
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
