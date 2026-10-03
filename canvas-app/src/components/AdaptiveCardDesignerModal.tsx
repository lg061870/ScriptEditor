export * from './AdaptiveCardFormEditor';
import {
  AdaptiveCardFormEditor,
} from './AdaptiveCardFormEditor';

export interface AdaptiveCardDesignerModalProps {
  nodeId: string;
  nodeTitle: string;
  initialFieldsJson?: string;
  onSave: (fieldsJson: string) => void;
  onClose: () => void;
}

export function AdaptiveCardDesignerModal({
  nodeId,
  nodeTitle,
  initialFieldsJson,
  onSave,
  onClose,
}: AdaptiveCardDesignerModalProps) {
  let draft = initialFieldsJson || '';

  return (
    <div
      data-testid="adaptive-card-designer-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '94vw',
          maxWidth: 680,
          maxHeight: '90vh',
          background: '#1e1e1e',
          borderRadius: 8,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #3c3c3c',
        }}
      >
        <div
          style={{
            height: 40,
            background: '#2d2d2d',
            borderBottom: '1px solid #333333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, color: '#ffffff', fontSize: 13 }}>
            Adaptive Card Designer — {nodeTitle}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              data-testid="save-card-btn"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              style={{
                background: '#107c41',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ✓ Save & Sync Model
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                color: '#cccccc',
                border: 'none',
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <AdaptiveCardFormEditor
            nodeId={nodeId}
            nodeTitle={nodeTitle}
            initialFieldsJson={initialFieldsJson}
            onChange={(json) => {
              draft = json;
            }}
            onSave={(json) => {
              draft = json;
            }}
          />
        </div>
      </div>
    </div>
  );
}
