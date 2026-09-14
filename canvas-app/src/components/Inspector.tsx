import type { DiagramNode } from '../schema/diagram';
import { getActivityDefinition, type ActivityFieldDef } from '../registry/activityDefinitions';

export interface InspectorProps {
  node: DiagramNode;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  onClose: () => void;
}

/** Phase 1.5 side panel: full field editing for the selected node. Seeded
 * types (registry/activityDefinitions.ts) get a real form control per
 * field, matching that type's parameter table. Unseeded types (every
 * other one of the 36 activity-shapes.md shapes, pending Phase 5) fall
 * back to a raw key/value editor over DiagramNode.data -- still editable,
 * just not schema-driven yet. Every edit calls onUpdateData, which
 * App.tsx applies to the JSON document; the canvas node's summary line
 * updates from the same state on the next render. */
export function Inspector({ node, onUpdateData, onClose }: InspectorProps) {
  const definition = getActivityDefinition(node.type);
  const title = definition?.title ?? node.type;

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: '1px solid #e5e7eb',
        overflowY: 'auto',
        padding: 12,
        background: '#fff',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#6b7280' }}
        >
          ×
        </button>
      </div>
      <div style={{ color: '#9ca3af', fontFamily: 'monospace', marginBottom: 12 }}>{node.type}</div>

      {definition ? (
        definition.fields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={node.data[field.key] ?? ''}
            onChange={(value) => onUpdateData(node.id, field.key, value)}
          />
        ))
      ) : (
        <RawDataEditor data={node.data} onChange={(key, value) => onUpdateData(node.id, key, value)} />
      )}
    </aside>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ActivityFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>{field.label}</div>
      {field.kind === 'textarea' && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'text' && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'number' && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
        />
      )}
      {field.kind === 'boolean' && (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
      )}
    </label>
  );
}

function RawDataEditor({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(data);
  return (
    <div>
      <div style={{ color: '#9ca3af', marginBottom: 8 }}>
        No form defined yet for this activity type (Phase 5) -- editing raw parameters:
      </div>
      {entries.length === 0 && <div style={{ color: '#9ca3af' }}>(no parameters)</div>}
      {entries.map(([key, value]) => (
        <label key={key} style={{ display: 'block', marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 3, color: '#374151' }}>{key}</div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(key, e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 6, border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        </label>
      ))}
    </div>
  );
}
