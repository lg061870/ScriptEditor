import { useState, useEffect, useRef, useMemo } from 'react';
import { ACTIVITY_CATALOG, type CatalogEntry } from '../registry/activityCatalog';
import {
  getActivityDefinition,
  getActivityIcon,
  getActivityDescription,
} from '../registry/activityDefinitions';

export interface ActivityPickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectActivity: (type: string, namePrefix: string, initialData: Record<string, string>) => void;
}

interface FilterCategory {
  label: string;
  matchCategories?: string[];
}

const CATEGORY_TABS: FilterCategory[] = [
  { label: 'All' },
  { label: 'Messaging & I/O', matchCategories: ['I/O'] },
  { label: 'Flow & Pause', matchCategories: ['Sequence'] },
  { label: 'Variables & State', matchCategories: ['Variables & State'] },
  { label: 'Subtopics & Events', matchCategories: ['Events & Subroutines'] },
  { label: 'AI & Semantic', matchCategories: ['Semantic/AI'] },
  { label: 'Logic & Branching', matchCategories: ['Selection', 'Iteration', 'Concurrency'] },
  { label: 'Error Handling', matchCategories: ['Exception Handling'] },
];

export function ActivityPickerPopover({
  isOpen,
  onClose,
  onSelectActivity,
}: ActivityPickerPopoverProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens and reset search
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveCategory('All');
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Dismiss on Escape key or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const items = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const activeTab = CATEGORY_TABS.find((t) => t.label === activeCategory);

    return ACTIVITY_CATALOG.filter((entry: CatalogEntry) => {
      // Category filter
      if (activeTab && activeTab.matchCategories) {
        if (!activeTab.matchCategories.includes(entry.category)) {
          return false;
        }
      }

      // Search query filter
      if (!query) return true;

      const def = getActivityDefinition(entry.type);
      const title = def?.title ?? entry.type;
      const desc = getActivityDescription(entry.type);
      const cat = entry.category;

      return (
        title.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query) ||
        desc.toLowerCase().includes(query) ||
        cat.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, activeCategory]);

  if (!isOpen) return null;

  const handlePick = (entry: CatalogEntry) => {
    const def = getActivityDefinition(entry.type);
    let namePrefix = entry.type.replace(/Activity$/, '');
    if (entry.type === 'SimpleActivity') namePrefix = 'BotMessage';
    else if (entry.type === 'DelayActivity') namePrefix = 'PauseStep';
    else if (entry.type === 'PromptActivity') namePrefix = 'AskStep';
    else if (entry.type === 'SetVariableActivity') namePrefix = 'SetVar';
    else if (entry.type === 'TriggerTopicActivity') namePrefix = 'CallSubtopic';
    else if (entry.type === 'AdaptiveCardActivity') namePrefix = 'CardStep';

    const initialData: Record<string, string> = def?.defaultData
      ? { ...def.defaultData }
      : {};

    onSelectActivity(entry.type, namePrefix, initialData);
  };

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 6,
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.2), 0 4px 10px rgba(0, 0, 0, 0.08)',
        zIndex: 50,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="activity-picker-popover"
    >
      {/* Header with Search Box and Category Chips */}
      <div
        style={{
          padding: '10px 10px 8px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Search Input */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: 9,
              color: '#94a3b8',
              fontSize: 12,
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type to filter activities (e.g. prompt, delay)..."
            style={{
              width: '100%',
              padding: '6px 26px 6px 28px',
              border: '1.5px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 11.5,
              outline: 'none',
              color: '#1e293b',
              background: '#ffffff',
              boxSizing: 'border-box',
            }}
            data-testid="activity-picker-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                inputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: 6,
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 4px',
                lineHeight: 1,
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Category Tabs/Chips */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.label;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveCategory(tab.label)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? '#2563eb' : '#ffffff',
                  border: isActive ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  color: isActive ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.12s ease',
                }}
                data-testid={`activity-picker-cat-${tab.label}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Activities List */}
      <div
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
        data-testid="activity-picker-list"
      >
        {items.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: 11.5,
            }}
          >
            No activities match "{searchQuery}"
          </div>
        ) : (
          items.map((entry) => {
            const def = getActivityDefinition(entry.type);
            const title = def?.title ?? entry.type;
            const desc = getActivityDescription(entry.type);
            const icon = getActivityIcon(entry.type);
            const color = def?.color ?? '#3b82f6';

            return (
              <div
                key={entry.type}
                onClick={() => handlePick(entry)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease, border-color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#eff6ff';
                  e.currentTarget.style.borderColor = '#bfdbfe';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
                data-testid={`activity-picker-item-${entry.type}`}
                title={`Add ${title} (${entry.type})`}
              >
                {/* Icon Badge */}
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    flexShrink: 0,
                    background: `${color}18`,
                    border: `1px solid ${color}40`,
                  }}
                >
                  {icon}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: '#1e293b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {title}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: '#64748b',
                        background: '#f1f5f9',
                        padding: '1px 5px',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {entry.category}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: 1,
                    }}
                  >
                    {desc}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Popover Footer */}
      <div
        style={{
          padding: '6px 10px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          fontSize: 10,
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {items.length} {items.length === 1 ? 'activity' : 'activities'} available
        </span>
        <span>
          Press <kbd style={{ background: '#e2e8f0', padding: '1px 3px', borderRadius: 3, color: '#475569' }}>Esc</kbd> to close
        </span>
      </div>
    </div>
  );
}
