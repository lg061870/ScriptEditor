import type { CSSProperties } from 'react';
import type { DiagramPortRole } from '../schema/diagram';

/**
 * Phase 4.2: per-role port shape + edge line style, entirely visual --
 * distinguishes a port/edge's role (docs/n8n-feature-gap-analysis.md §3)
 * without relying on hover text. Exact mapping is this task's acceptance
 * criteria, verbatim:
 *
 *   main       = solid circle / solid line
 *   exception  = solid circle / dashed red line
 *   control    = solid square / solid line
 *   aux-config = diamond      / dashed line
 *
 * Port shape and edge line style are deliberately separate lookups (not
 * one combined table) -- a port's shape is a property of the node it sits
 * on, but an edge's line style is a property of the connection, resolved
 * from its *source* port's role (mapping/toReactFlow.ts).
 */

const HANDLE_SIZE = 9;

/** Style for the <Handle> itself -- overrides react-flow's default plain
 * circle (style.css's .react-flow__handle) per role. `main` and
 * `exception` are both circles per the acceptance criteria above; only
 * their connected edge differs.
 *
 * Deliberately never sets `transform`: react-flow positions each handle
 * via a `transform: translate(...)` rule on its own `.react-flow__handle-*`
 * side class (style.css), and an inline `style.transform` on the element
 * wins the cascade over that class rule, silently discarding the
 * translate and leaving the handle mispositioned -- confirmed empirically
 * (two aux-config handles landed exactly on top of each other instead of
 * each centered on its own side). `clip-path` achieves the diamond shape
 * without touching `transform` at all. */
export function portHandleStyle(role: DiagramPortRole): CSSProperties {
  const base: CSSProperties = {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    minWidth: HANDLE_SIZE,
    minHeight: HANDLE_SIZE,
  };

  switch (role) {
    case 'control':
      return { ...base, borderRadius: 0 };
    case 'aux-config':
      return { ...base, borderRadius: 0, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
    case 'exception':
    case 'main':
    default:
      return { ...base, borderRadius: '50%' };
  }
}

export interface EdgeLineStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const EXCEPTION_RED = '#dc2626';
const DEFAULT_STROKE = '#64748b';

/** Style for the edge path -- resolved from the edge's *source* port role. */
export function edgeLineStyle(role: DiagramPortRole | undefined): EdgeLineStyle {
  switch (role) {
    case 'exception':
      return { stroke: EXCEPTION_RED, strokeWidth: 1.5, strokeDasharray: '6 4' };
    case 'aux-config':
      return { stroke: DEFAULT_STROKE, strokeWidth: 1.5, strokeDasharray: '4 3' };
    case 'control':
    case 'main':
    default:
      return { stroke: DEFAULT_STROKE, strokeWidth: 1.5 };
  }
}
