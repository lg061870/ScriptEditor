import { useState, useMemo } from 'react';
import { ACTIVITY_CATEGORIES, catalogByCategory, type ActivityCategory, type CatalogEntry } from '../registry/activityCatalog';
import {
  getActivityDefinition,
  getActivityIcon,
  getActivityDescription,
} from '../registry/activityDefinitions';

export const PALETTE_DND_TYPE = 'application/scripteditor-activity-type';

export interface PaletteProps {
  /** Non-null when a Phase 1.4 "+" click is awaiting an activity pick --
   * changes the palette's affordance from "drag onto canvas" to "click to
   * add, pre-wired to that port". */
  pendingConnectionLabel?: string | null;
  onCancelPending?: () => void;
  onPick?: (type: string) => void;
  width?: number;
  isActive?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Category-grouped sidebar toolbox with Dashicons-style icon menu tiles,
 * live search box, and category filtering.
 */
export function Palette({
  pendingConnectionLabel,
  onCancelPending,
  onPick,
  width = 220,
  isActive = false,
  isCollapsed = false,
  onToggleCollapse,
}: PaletteProps) {
  const grouped = catalogByCategory();
  const isPending = pendingConnectionLabel != null;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Toggle group collapse
  const toggleGroup = (category: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Filter items respecting search query and category dropdown
  const filteredGrouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result = new Map<ActivityCategory, CatalogEntry[]>();

    for (const category of ACTIVITY_CATEGORIES) {
      if (selectedCategory !== 'All' && selectedCategory !== category) {
        continue;
      }

      const rawEntries = grouped.get(category) ?? [];
      const matching = rawEntries.filter((entry) => {
        if (!query) return true;

        const def = getActivityDefinition(entry.type);
        const title = def?.title ?? entry.type;
        const desc = getActivityDescription(entry.type);

        return (
          title.toLowerCase().includes(query) ||
          entry.type.toLowerCase().includes(query) ||
          desc.toLowerCase().includes(query) ||
          category.toLowerCase().includes(query)
        );
      });

      if (matching.length > 0) {
        result.set(category, matching);
      }
    }

    return result;
  }, [searchQuery, selectedCategory, grouped]);

  const totalFilteredCount = useMemo(() => {
    let count = 0;
    for (const entries of filteredGrouped.values()) {
      count += entries.length;
    }
    return count;
  }, [filteredGrouped]);

  if (isCollapsed) {
    return (
      <aside
        style={{
          width: 28,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          boxShadow: isActive ? 'inset 0 0 0 1px #6264a7' : undefined,
          background: '#f3f4f6',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflow: 'hidden',
          height: '100%',
          userSelect: 'none',
          cursor: 'pointer',
        }}
        data-testid="toolbox-panel"
        data-collapsed="true"
        data-active={isActive ? 'true' : 'false'}
        onClick={onToggleCollapse}
        title="Click to expand Toolbox"
      >
        <button
          type="button"
          data-testid="expand-toolbox-button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          title="Expand Toolbox (right)"
          aria-label="Expand Toolbox"
          style={{
            width: 28,
            height: 28,
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #e5e7eb',
            color: '#4b5563',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ▶
        </button>
        <div
          style={{
            marginTop: 16,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
          }}
        >
          <span>TOOLBOX</span>
          <span style={{ transform: 'rotate(90deg)', fontSize: 12 }}>🧰</span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        borderRight: '1px solid #e5e7eb',
        boxShadow: isActive ? 'inset 0 0 0 1px #6264a7' : undefined,
        background: '#f8fafc',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        transition: 'box-shadow 0.15s ease',
      }}
      data-testid="toolbox-panel"
      data-collapsed="false"
      data-active={isActive ? 'true' : 'false'}
    >
      {/* Tool Window Header */}
      <div
        style={{
          height: 28,
          background: isActive ? '#f0f1fa' : '#f1f5f9',
          borderBottom: isActive ? '1px solid #c7c9e5' : '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 10px',
          fontSize: 11,
          fontWeight: 700,
          color: isActive ? '#2e3058' : '#334155',
          letterSpacing: '0.02em',
          userSelect: 'none',
          flexShrink: 0,
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isActive ? '#6264a7' : '#94a3b8',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12 }}>🧰</span> TOOLBOX
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            data-testid="collapse-toolbox-button"
            onClick={onToggleCollapse}
            title="Collapse Toolbox (left)"
            aria-label="Collapse Toolbox"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 5px',
              borderRadius: 3,
              color: isActive ? '#4b4d75' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ◀
          </button>
          <span
            style={{ color: isActive ? '#6264a7' : '#94a3b8', fontSize: 11, cursor: 'default' }}
            title="Docked"
          >
            📌
          </span>
        </div>
      </div>

      {/* Filter & Search Toolbar (Image 1 Dashicons style) */}
      <div
        style={{
          padding: '7px 8px',
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Category dropdown & Search input row */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            title="Filter by Category"
            aria-label="Filter activities by category"
            style={{
              height: 26,
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: 90,
              flexShrink: 0,
            }}
          >
            <option value="All">All ({grouped.size > 0 ? Array.from(grouped.values()).flat().length : 36})</option>
            {ACTIVITY_CATEGORIES.map((cat) => {
              const count = grouped.get(cat)?.length ?? 0;
              return (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              );
            })}
          </select>

          {/* Search box with icon and clear */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                position: 'absolute',
                left: 6,
                fontSize: 11,
                color: '#94a3b8',
                pointerEvents: 'none',
                lineHeight: 1,
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              title="Search shapes by title, keyword, or type"
              aria-label="Search shapes"
              style={{
                width: '100%',
                height: 26,
                padding: '2px 20px 2px 22px',
                border: '1px solid #cbd5e1',
                borderRadius: 4,
                fontSize: 11,
                color: '#1e293b',
                background: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                title="Clear search"
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 4,
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: 0,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pending Connection Banner (Phase 1.4 "+" connection pick) */}
      {isPending && (
        <div
          style={{
            margin: '8px 8px 0',
            padding: 8,
            borderRadius: 6,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 2 }}>
            Connecting from {pendingConnectionLabel}
          </div>
          <div style={{ color: '#3b82f6', marginBottom: 6 }}>Click an icon tile to connect.</div>
          <button
            type="button"
            onClick={onCancelPending}
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Scrollable Icon Grid Palette */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 16px' }}>
        {totalFilteredCount === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 8px',
              color: '#64748b',
              fontSize: 11,
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              No shapes found
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10 }}>
              No activities matched &ldquo;{searchQuery}&rdquo;
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#2563eb',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          ACTIVITY_CATEGORIES.map((category) => {
            const entries = filteredGrouped.get(category);
            if (!entries || entries.length === 0) return null;

            const isCollapsedGroup = !searchQuery && Boolean(collapsedGroups[category]);

            return (
              <div key={category} style={{ marginBottom: 12 }}>
                {/* Group Section Header */}
                <div
                  onClick={() => toggleGroup(category)}
                  title={`${isCollapsedGroup ? 'Expand' : 'Collapse'} ${category}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '3px 4px',
                    marginBottom: 6,
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderRadius: 4,
                    color: '#475569',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#e2e8f0')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: 10,
                      letterSpacing: 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 9, color: '#94a3b8' }}>
                      {isCollapsedGroup ? '▶' : '▼'}
                    </span>
                    {category}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#64748b',
                      background: '#e2e8f0',
                      borderRadius: 8,
                      padding: '1px 5px',
                    }}
                  >
                    {entries.length}
                  </span>
                </div>

                {/* Grid of Dashicons-style Cards */}
                {!isCollapsedGroup && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
                      gap: 6,
                    }}
                  >
                    {entries.map((entry) => {
                      const definition = getActivityDefinition(entry.type);
                      const icon = getActivityIcon(entry.type);
                      const title = definition?.title ?? entry.type;
                      const description = getActivityDescription(entry.type);
                      const accentColor = definition?.color ?? '#6366f1';

                      return (
                        <div
                          key={entry.type}
                          data-testid={`palette-item-${entry.type}`}
                          draggable={!isPending}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(PALETTE_DND_TYPE, entry.type);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={isPending ? () => onPick?.(entry.type) : undefined}
                          title={`${title} (${entry.type})\n${description}`}
                          style={{
                            height: 76,
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 5,
                            border: isPending ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                            background: '#ffffff',
                            cursor: isPending ? 'pointer' : 'grab',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = isPending ? '#3b82f6' : accentColor;
                            e.currentTarget.style.boxShadow =
                              '0 4px 10px rgba(0, 0, 0, 0.09), 0 1px 3px rgba(0, 0, 0, 0.04)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = isPending ? '#93c5fd' : '#e2e8f0';
                            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                        >
                          {/* Top accent color bar */}
                          <div
                            style={{
                              height: 2.5,
                              width: '100%',
                              background: accentColor,
                              flexShrink: 0,
                            }}
                          />

                          {/* Icon Container Area */}
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 21,
                              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                              lineHeight: 1,
                            }}
                          >
                            <span role="img" aria-label={title}>
                              {icon}
                            </span>
                          </div>

                          {/* Bottom Caption Pill (wrapped title) */}
                          <div
                            style={{
                              borderTop: '1px solid #f1f5f9',
                              background: '#f8fafc',
                              padding: '2px 3px',
                              textAlign: 'center',
                              fontSize: 9,
                              fontWeight: 600,
                              color: '#334155',
                              lineHeight: 1.15,
                              minHeight: 25,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                wordBreak: 'break-word',
                                overflowWrap: 'break-word',
                                whiteSpace: 'normal',
                              }}
                            >
                              {title}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

