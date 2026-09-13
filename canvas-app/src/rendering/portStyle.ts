import type { CSSProperties } from 'react';
import type { DiagramPortRole, DiagramPortSide } from '../schema/diagram';

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

export interface PortStackPosition {
  /** 0-based position within the ports sharing this port's side. */
  index: number;
  /** Total ports sharing this port's side. */
  count: number;
}

/**
 * Phase 4.3: groups ports by side and returns each port's 0-based index
 * within its side group and that group's total count, in the same order
 * as the input array -- the basis for auto-spacing multiple same-side
 * ports, replacing the old custom-{side}-{ratio} hand-set percentage
 * scheme (wwwroot/editor/rendering/renderPorts.js's CUSTOM_PORT_PATTERN)
 * with one computed from index/count. The v2 schema never had that scheme
 * to begin with -- DiagramPortSide is a closed 4-value enum, not a
 * free-form ratio string -- so this function is the only piece actually
 * missing: something has to turn "3 ports on the left" into 3 different
 * positions, since react-flow's own default puts every handle on a given
 * side at the identical center point.
 */
export function computePortStackPositions(ports: { position: DiagramPortSide }[]): PortStackPosition[] {
  const counts = new Map<DiagramPortSide, number>();
  for (const port of ports) {
    counts.set(port.position, (counts.get(port.position) ?? 0) + 1);
  }

  const seen = new Map<DiagramPortSide, number>();
  return ports.map((port) => {
    const index = seen.get(port.position) ?? 0;
    seen.set(port.position, index + 1);
    return { index, count: counts.get(port.position)! };
  });
}

/**
 * Evenly spaces `count` ports along one side, avoiding the exact corners
 * (e.g. 2 ports land at 33%/67%, not 0%/100%). Overrides react-flow's
 * default single-handle-per-side 50% via `top` (left/right sides) or
 * `left` (top/bottom sides) -- deliberately never `transform`, for the
 * same handle-position cascade-conflict reason documented on
 * portHandleStyle above. A side with only one port is left alone (react-
 * flow's own centered default is already correct for that case).
 */
export function portStackOffsetStyle(side: DiagramPortSide, index: number, count: number): CSSProperties {
  if (count <= 1) return {};

  const fraction = ((index + 1) / (count + 1)) * 100;
  const percent = `${fraction.toFixed(2)}%`;
  return side === 'left' || side === 'right' ? { top: percent } : { left: percent };
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
