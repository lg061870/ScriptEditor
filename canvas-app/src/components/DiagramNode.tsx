import { useState } from 'react';
import { Handle, NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import { sideToPosition, type DiagramNodeData } from '../mapping/toReactFlow';
import { getActivityDefinition, getNodeSummary, getActivityIcon, parseCompositeSteps, type CompositeChildStep } from '../registry/activityDefinitions';
import { portHandleStyle, portStackOffsetStyle, computePortStackPositions, calculateNodeDimensions } from '../rendering/portStyle';
import { useDiagramStore } from '../store/diagramStore';

import type { DiagramPortSide } from '../schema/diagram';

export type DiagramNodeType = Node<DiagramNodeData>;

const SWITCH_CASE_COLOR = '#2563eb'; // Single clean color for regular cases
const SWITCH_DEFAULT_COLOR = '#f59e0b'; // Distinct amber color for default fallback port
const EXCEPTION_PORT_COLOR = '#ef4444'; // Red by default for exception port
const PARALLEL_BRANCH_COLOR = '#0891b2'; // Cyan by default for parallel branches
const PARALLEL_DONE_COLOR = '#10b981'; // Green for completion/join port

const NEXT_SIDE: Record<DiagramPortSide, DiagramPortSide> = {
  right: 'bottom',
  bottom: 'left',
  left: 'top',
  top: 'right',
};

/** Collapsed n8n-style node (Phase 1.2): icon + title + one summary line
 * only -- no inline parameter fields. Full field editing is the Inspector
 * side panel (Phase 1.5), opened by selecting this node. */
export function DiagramNode({ id, data, selected }: NodeProps<DiagramNodeType>) {
  const definition = getActivityDefinition(data.type);
  const title = data.customName?.trim() || definition?.title || data.label || data.type;
  const summary = getNodeSummary(data.type, data.rawData);
  const color = definition?.color ?? '#6b7280';
  const connectedOutputs = new Set(data.connectedOutputPortIds);
  const connectedInputs = new Set(data.connectedInputPortIds ?? []);
  // Only render functional flow ports (main, exception, aux-config).
  const visiblePorts = (data.ports || [])
    .filter((port) => port.role !== 'control')
    .map((port) => ({
      ...port,
      position: (port.position || (port.direction === 'input' ? 'left' : (port.role === 'exception' ? 'bottom' : 'right'))) as DiagramPortSide,
    }));
  const stackPositions = computePortStackPositions(visiblePorts);
  const isCondition = data.type === 'ConditionalActivity';
  const isSwitch = data.type === 'SwitchActivity';
  const isParallel = data.type === 'ParallelActivity';
  const isRepeat = data.type === 'RepeatActivity' || data.type === 'ForEachActivity';
  const isForEach = data.type === 'ForEachActivity';
  const isStart = data.type === 'StartNode' || data.type === 'StartActivity';
  const isEnd = data.type === 'EndActivity';
  const isUmlCircle = isStart || isEnd;
  const isFreeFloating = Boolean(data.isFreeFloating);
  const conditionDisplay = data.customName?.trim() || (data.rawData?.selectorKey ? `If ${data.rawData.selectorKey}` : 'Condition');
  const dimensions = calculateNodeDimensions(data.ports, data.width, data.height, data.type, conditionDisplay);
  const [isHovered, setIsHovered] = useState(false);

  // In-place name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(isCondition ? conditionDisplay : title);

  const handleStartEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setNameInput(isCondition ? conditionDisplay : title);
    setIsEditingName(true);
  };

  const handleCommitName = () => {
    setIsEditingName(false);
    const trimmed = nameInput.trim();
    const current = isCondition ? conditionDisplay : title;
    if (trimmed && trimmed !== current) {
      if (data.onRequestRenameNode) {
        data.onRequestRenameNode(id, trimmed);
      } else {
        useDiagramStore.getState().renameNode(id, trimmed, 'Canvas');
      }
    }
  };

  const handleCancelEditing = () => {
    setIsEditingName(false);
    setNameInput(isCondition ? conditionDisplay : title);
  };

  const isComposite = data.type === 'CompositeActivity';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const compositeSteps = isComposite ? parseCompositeSteps(data.rawData) : [];

  const getStepIcon = (type: string) => getActivityIcon(type);

  const getStepSummary = (step: CompositeChildStep) => {
    if (step.type === 'SimpleActivity') return step.data.message || 'Send message';
    if (step.type === 'DelayActivity') return `${step.data.durationMs || '1000'}ms`;
    if (step.type === 'PromptActivity') return step.data.userPromptTemplate || step.data.message || 'Ask question';
    if (step.type === 'SetVariableActivity') return `${step.data.variableName || 'var'} = ${step.data.value || ''}`;
    return getNodeSummary(step.type, step.data);
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        display: isCondition || isSwitch || isParallel || isRepeat ? 'block' : 'flex',
        flexDirection: isComposite ? 'column' : 'row',
        alignItems: isComposite ? 'stretch' : 'center',
        justifyContent: isUmlCircle ? 'center' : undefined,
        gap: isComposite ? 6 : 8,
        border: isCondition || isSwitch || isParallel || isRepeat || isUmlCircle
          ? 'none'
          : selected
            ? `1.5px solid ${color}`
            : isFreeFloating
              ? '1.5px dashed #f59e0b'
              : '1px solid #d1d5db',
        borderRadius: isCondition || isSwitch || isParallel || isRepeat ? 0 : isUmlCircle ? '50%' : 8,
        background: isCondition || isUmlCircle ? 'transparent' : isSwitch || isParallel || isRepeat ? '#18181b' : '#fff',
        minWidth: isUmlCircle ? dimensions.width : isCondition ? 80 : isSwitch || isParallel || isRepeat ? 24 : isComposite ? (isCollapsed ? 220 : 270) : 200,
        maxWidth: isUmlCircle ? dimensions.width : isCondition ? undefined : isSwitch || isParallel || isRepeat ? 24 : isComposite ? 320 : Math.max(240, dimensions.width),
        width: isUmlCircle ? dimensions.width : isSwitch || isParallel || isRepeat ? 24 : dimensions.width,
        minHeight: isUmlCircle ? dimensions.height : isCondition ? 69 : isSwitch || isParallel || isRepeat ? 110 : isComposite ? (isCollapsed ? 48 : 120) : dimensions.height,
        height: isCondition || isSwitch || isParallel || isRepeat || isUmlCircle ? dimensions.height : undefined,
        boxSizing: 'border-box',
        boxShadow: isCondition || isUmlCircle
          ? 'none'
          : isSwitch || isParallel || isRepeat
            ? selected
              ? isParallel || isRepeat ? '0 0 0 2px #0891b2' : '0 0 0 2px #007acc'
              : isHovered
                ? '0 0 0 1px #64748b'
                : 'none'
            : selected
              ? `0 0 0 2px ${color}33`
              : '0 1px 2px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* Free-floating / Unconnected badge */}
      {isFreeFloating && !isCondition && !isSwitch && !isParallel && (
        <span
          data-testid={`free-floating-badge-${id}`}
          style={{
            position: 'absolute',
            top: isUmlCircle ? -16 : -9,
            left: isUmlCircle ? '50%' : 12,
            transform: isUmlCircle ? 'translateX(-50%)' : undefined,
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
            borderRadius: 4,
            padding: '0 4px',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1.3,
            zIndex: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Unconnected
        </span>
      )}
      {/* Resizer for ConditionalActivity when selected */}
      {isCondition && (
        <NodeResizer
          isVisible={selected}
          minWidth={80}
          minHeight={69}
          keepAspectRatio={true}
          onResizeEnd={(_event, params) => {
            data.onRequestResizeNode?.(id, params.width, params.height);
          }}
          lineStyle={{ borderColor: '#ec4899', borderWidth: 1, borderStyle: 'dashed' }}
          handleStyle={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#ec4899', border: '1px solid #ffffff' }}
        />
      )}

      {/* SVG Diamond Polygon Contour for ConditionalActivity */}
      {isCondition && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
          data-testid={`condition-diamond-${id}`}
        >
          <polygon
            points={`2,${dimensions.height / 2} ${dimensions.width / 2},2 ${dimensions.width - 2},${dimensions.height / 2} ${dimensions.width / 2},${dimensions.height - 2}`}
            fill="#ffffff"
            stroke={selected ? color : isHovered ? '#94a3b8' : '#d1d5db'}
            strokeWidth={selected ? 2 : 1.5}
            strokeLinejoin="round"
            style={{
              filter: selected
                ? `drop-shadow(0 0 5px ${color}55)`
                : isHovered
                  ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))'
                  : 'drop-shadow(0 1px 3px rgba(0,0,0,0.06))',
              transition: 'stroke 0.15s ease, filter 0.15s ease',
            }}
          />
        </svg>
      )}

      {visiblePorts.map((port, index) => {
        const { index: sideIndex, count: sideCount } = stackPositions[index];
        const isInput = port.direction === 'input';
        const isOutput = port.direction === 'output';
        const isExc = port.role === 'exception';
        const isDefault = isOutput && (port.name.toLowerCase() === 'default' || port.id.endsWith('case-default'));
        const isDone = isParallel && isOutput && (port.name.toLowerCase() === 'done' || port.id.includes('done'));
        const defaultPortColor = isSwitch ? SWITCH_DEFAULT_COLOR : '#f59e0b';
        const isConnected = isInput ? connectedInputs.has(port.id) : connectedOutputs.has(port.id);
        const switchCaseColor = isDefault ? SWITCH_DEFAULT_COLOR : SWITCH_CASE_COLOR;
        const parallelPortColor = isDone ? PARALLEL_DONE_COLOR : PARALLEL_BRANCH_COLOR;
        const portColor = isExc
          ? EXCEPTION_PORT_COLOR
          : isSwitch
            ? switchCaseColor
            : isParallel
              ? parallelPortColor
              : isDefault
                ? defaultPortColor
                : color;
        const offsetStyle = portStackOffsetStyle(port.position, sideIndex, sideCount);

        const handleElement = isOutput && !isConnected ? (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={sideToPosition(port.position)}
            title={isExc ? `Add node from Exception (${port.name}) · Alt+Click to move side` : isDefault ? `Add node from Default Fallback (${port.name}) · Alt+Click to move side` : isDone ? `Add node from Completion (${port.name}) · Alt+Click to move side` : `Add node from ${port.name} (${port.position}) · Alt+Click to move side`}
            onClick={(event) => {
              if (event.altKey) {
                event.stopPropagation();
                event.preventDefault();
                const nextSide = NEXT_SIDE[port.position] || 'right';
                useDiagramStore.getState().updatePortSide(id, port.id, nextSide, 'Canvas');
                return;
              }
              event.stopPropagation();
              data.onRequestAddNode?.(id, port.id);
            }}
            style={{
              width: isUmlCircle ? 10 : 14,
              height: isUmlCircle ? 10 : 14,
              minWidth: isUmlCircle ? 10 : 14,
              minHeight: isUmlCircle ? 10 : 14,
              borderRadius: '50%',
              backgroundColor: isSwitch || isParallel || isUmlCircle ? '#18181b' : '#ffffff',
              border: isUmlCircle ? '1px solid #ffffff' : `2px solid ${portColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 5,
              boxSizing: 'border-box',
              padding: 0,
              ...offsetStyle,
            }}
          >
            <svg
              width={isUmlCircle ? 6 : 8}
              height={isUmlCircle ? 6 : 8}
              viewBox={isUmlCircle ? '0 0 6 6' : '0 0 8 8'}
              fill="none"
              stroke={isUmlCircle ? '#ffffff' : portColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{ pointerEvents: 'none', display: 'block' }}
            >
              {isUmlCircle ? (
                <>
                  <line x1="3" y1="1" x2="3" y2="5" />
                  <line x1="1" y1="3" x2="5" y2="3" />
                </>
              ) : (
                <>
                  <line x1="4" y1="1" x2="4" y2="7" />
                  <line x1="1" y1="4" x2="7" y2="4" />
                </>
              )}
            </svg>
          </Handle>
        ) : (
          <Handle
            key={port.id}
            id={port.id}
            type={port.direction === 'input' ? 'target' : 'source'}
            position={sideToPosition(port.position)}
            title={isExc ? `Exception (${port.position}) · Alt+Click to move side` : isDefault ? `Default Fallback (${port.name}, ${port.position}) · ${isConnected ? 'Connected' : 'Unconnected'} · Alt+Click to move side` : isDone ? `Completion (${port.name}, ${port.position}) · ${isConnected ? 'Connected' : 'Unconnected'} · Alt+Click to move side` : `${port.name} (${port.position}) · ${isConnected ? 'Connected' : 'Unconnected'} · Alt+Click to move side`}
            onClick={(event) => {
              if (event.altKey) {
                event.stopPropagation();
                event.preventDefault();
                const nextSide = NEXT_SIDE[port.position] || 'right';
                useDiagramStore.getState().updatePortSide(id, port.id, nextSide, 'Canvas');
              }
            }}
            style={{
              ...portHandleStyle(port.role, isConnected),
              ...offsetStyle,
              ...(isUmlCircle
                ? {
                    width: 7,
                    height: 7,
                    minWidth: 7,
                    minHeight: 7,
                    backgroundColor: isConnected ? '#18181b' : '#ffffff',
                    border: '1px solid #18181b',
                  }
                : isDefault || isSwitch || isParallel
                  ? isConnected
                    ? { backgroundColor: portColor, border: '1.5px solid #ffffff' }
                    : { borderColor: portColor, backgroundColor: '#ffffff' }
                  : {}),
            }}
          />
        );

        if (isParallel && isOutput && !isExc) {
          const textColor = isDone ? PARALLEL_DONE_COLOR : PARALLEL_BRANCH_COLOR;
          const testId = isDone ? `parallel-done-badge-${port.id}` : `parallel-branch-badge-${port.id}`;
          return (
            <div key={port.id} style={{ display: 'contents' }}>
              {handleElement}
              <span
                data-testid={testId}
                style={{
                  position: 'absolute',
                  right: -6,
                  top: offsetStyle.top ?? '50%',
                  transform: 'translate(100%, -100%)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  lineHeight: 1.2,
                }}
              >
                {port.name}
              </span>
            </div>
          );
        }

        if (isSwitch && isOutput && !isExc) {
          const textColor = isDefault ? SWITCH_DEFAULT_COLOR : SWITCH_CASE_COLOR;
          const testId = isDefault ? `default-port-badge-${port.id}` : `switch-case-badge-${port.id}`;
          return (
            <div key={port.id} style={{ display: 'contents' }}>
              {handleElement}
              <span
                data-testid={testId}
                style={{
                  position: 'absolute',
                  right: -6,
                  top: offsetStyle.top ?? '50%',
                  transform: 'translate(100%, -100%)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  lineHeight: 1.2,
                }}
              >
                {port.name}
              </span>
            </div>
          );
        }

        if (isRepeat && isOutput && !isExc) {
          const isDone = port.id.includes('done') || port.name.toLowerCase() === 'done';
          const textColor = isDone ? '#10b981' : '#0891b2';
          const testId = isDone ? `repeat-done-badge-${port.id}` : `repeat-loop-badge-${port.id}`;
          return (
            <div key={port.id} style={{ display: 'contents' }}>
              {handleElement}
              <span
                data-testid={testId}
                style={{
                  position: 'absolute',
                  right: -6,
                  top: offsetStyle.top ?? '50%',
                  transform: 'translate(100%, -100%)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  lineHeight: 1.2,
                }}
              >
                {port.name}
              </span>
            </div>
          );
        }

        if (isDefault && !isCondition) {
          const isRight = port.position === 'right';
          const isBottom = port.position === 'bottom';
          return (
            <div key={port.id} style={{ display: 'contents' }}>
              {handleElement}
              <span
                data-testid={`default-port-badge-${port.id}`}
                style={{
                  position: 'absolute',
                  ...(isRight
                    ? {
                        right: 18,
                        top: offsetStyle.top ?? '50%',
                        transform: 'translateY(-50%)',
                      }
                    : isBottom
                      ? {
                          bottom: 16,
                          left: offsetStyle.left ?? '50%',
                          transform: 'translateX(-50%)',
                        }
                      : {
                          right: 18,
                          top: offsetStyle.top ?? '50%',
                          transform: 'translateY(-50%)',
                        }),
                  fontSize: 7.5,
                  fontWeight: 800,
                  padding: '1px 3px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  lineHeight: 1.1,
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  border: '0.8px solid #fde68a',
                  zIndex: 6,
                }}
              >
                Default
              </span>
            </div>
          );
        }

        if (isCondition && isOutput && !isExc) {
          const lower = port.name.toLowerCase();
          const isTrueCase = lower === 'true' || lower === 'yes' || lower === 'case-a';
          const isFalseCase = lower === 'false' || lower === 'no' || lower === 'case-b';
          const badgeText =
            lower === 'yes'
              ? 'Yes'
              : lower === 'no'
                ? 'No'
                : lower === 'true'
                  ? 'True'
                  : lower === 'false'
                    ? 'False'
                    : lower === 'case-a'
                      ? 'Case A'
                      : lower === 'case-b'
                        ? 'Case B'
                        : port.name;

          const isRight = port.position === 'right';
          const isBottom = port.position === 'bottom';

          return (
            <div key={port.id} style={{ display: 'contents' }}>
              {handleElement}
              <span
                data-testid={`branch-badge-${port.id}`}
                style={{
                  position: 'absolute',
                  ...(isRight
                    ? {
                        right: 14,
                        top: '50%',
                        transform: 'translateY(-50%)',
                      }
                    : isBottom
                      ? {
                          bottom: 12,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }
                      : {
                          right: 14,
                          top: offsetStyle.top ?? '50%',
                          transform: 'translateY(-50%)',
                        }),
                  fontSize: 5,
                  fontWeight: 800,
                  padding: '0px 2px',
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  lineHeight: 1.2,
                  backgroundColor: isTrueCase ? '#ecfdf5' : isFalseCase ? '#fef2f2' : '#f8fafc',
                  color: isTrueCase ? '#059669' : isFalseCase ? '#dc2626' : '#475569',
                  border: isTrueCase
                    ? '0.8px solid #a7f3d0'
                    : isFalseCase
                      ? '0.8px solid #fecaca'
                      : '0.8px solid #cbd5e1',
                  zIndex: 6,
                }}
              >
                {badgeText}
              </span>
            </div>
          );
        }

        return handleElement;
      })}

      {isCondition ? (
        <div
          data-testid={`condition-diamond-content-${id}`}
          style={{
            position: 'absolute',
            inset: '6px 12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            zIndex: 2,
            pointerEvents: 'auto',
          }}
        >
          {isEditingName ? (
            <input
              type="text"
              className="nodrag"
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleCommitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitName();
                else if (e.key === 'Escape') handleCancelEditing();
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 8.5,
                fontWeight: 600,
                padding: '1px 2px',
                border: '1.5px solid #8b5cf6',
                borderRadius: 3,
                outline: 'none',
                width: '85%',
                maxWidth: Math.max(50, dimensions.width - 36),
                textAlign: 'center',
                background: '#ffffff',
              }}
              data-testid={`inline-node-name-input-${id}`}
            />
          ) : (
            <div
              onDoubleClick={handleStartEditing}
              title="Double-click to edit condition"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                width: '100%',
                maxWidth: Math.max(56, dimensions.width - 32),
                background: '#f8fafc',
                padding: '2px 5px',
                borderRadius: 5,
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
                If
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, width: '100%' }}>
                <span
                  data-testid={`node-title-${id}`}
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    color: '#1e293b',
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word',
                    whiteSpace: 'normal',
                    lineHeight: 1.2,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    maxHeight: Math.max(26, dimensions.height - 36),
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {conditionDisplay.startsWith('If ') ? conditionDisplay.slice(3).trim() : conditionDisplay}
                </span>
                {isHovered && (
                  <button
                    type="button"
                    className="nodrag"
                    data-testid={`rename-node-button-${id}`}
                    aria-label="Edit condition"
                    title="Edit condition"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditing();
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : isParallel ? (
        <>
          {/* Top Title Label (Clean, unformatted text) */}
          <div
            data-testid={`parallel-variable-chip-${id}`}
            style={{
              position: 'absolute',
              top: -18,
              left: 0,
              fontSize: 11,
              fontWeight: 600,
              color: '#334155',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            title={`Parallel: ${data.rawData?.customName || title}`}
          >
            <span data-testid={`node-title-${id}`}>
              {data.rawData?.customName ? data.rawData.customName : title}
            </span>
          </div>

          {/* Vertical Parallel Text along the Spine */}
          <div
            data-testid={`parallel-spine-rail-${id}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-testid={`parallel-rail-text-${id}`}
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                color: '#ffffff',
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              Parallel
            </span>
          </div>
        </>
      ) : isSwitch ? (
        <>
          {/* Top Variable Label (Clean, unformatted text) */}
          <div
            data-testid={`switch-variable-chip-${id}`}
            style={{
              position: 'absolute',
              top: -18,
              left: 0,
              fontSize: 11,
              fontWeight: 600,
              color: '#334155',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            title={`Switch variable: ${data.rawData?.valueContextKey || 'Not set'}`}
          >
            <span data-testid={`node-title-${id}`}>
              {data.rawData?.valueContextKey ? data.rawData.valueContextKey : title}
            </span>
          </div>

          {/* Vertical Switch Text along the Spine */}
          <div
            data-testid={`switch-spine-rail-${id}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-testid={`switch-rail-text-${id}`}
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                color: '#ffffff',
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              Switch
            </span>
          </div>
        </>
      ) : isRepeat ? (
        <>
          {/* Top Mode Label */}
          <div
            data-testid={`repeat-mode-chip-${id}`}
            style={{
              position: 'absolute',
              top: -18,
              left: 0,
              fontSize: 11,
              fontWeight: 600,
              color: '#0891b2',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
            title={isForEach ? `For Each: ${data.rawData?.collectionKey || 'Items'}` : `While mode: ${data.rawData?.loopMode || 'User Prompt'}`}
          >
            <span data-testid={`node-title-${id}`}>
              {isForEach
                ? (data.rawData?.customName || `For each ${data.rawData?.itemKey || 'item'} in ${data.rawData?.collectionKey || 'Items'}`)
                : data.rawData?.loopMode === 'fixed_count'
                ? `While: ${data.rawData.iterations || 3}x`
                : data.rawData?.continuePrompt
                ? `Prompt: "${data.rawData.continuePrompt}"`
                : (data.rawData?.customName || title)}
            </span>
          </div>

          {/* Vertical Text along the Spine */}
          <div
            data-testid={`repeat-spine-rail-${id}`}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-testid={`repeat-rail-text-${id}`}
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                color: '#ffffff',
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                userSelect: 'none',
              }}
            >
              {isForEach ? 'For Each' : 'While'}
            </span>
          </div>
        </>
      ) : isUmlCircle ? (
        <>
          {isStart ? (
            <div
              data-testid={`uml-start-node-${id}`}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: '#18181b',
                boxShadow: selected
                  ? '0 0 0 3px #3b82f6, 0 0 8px rgba(59, 130, 246, 0.4)'
                  : isHovered
                    ? '0 0 0 2px #94a3b8'
                    : '0 1px 2px rgba(0,0,0,0.25)',
                transition: 'box-shadow 0.15s ease',
              }}
            />
          ) : (
            <div
              data-testid={`uml-end-node-${id}`}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: isFreeFloating ? '1.5px dashed #f59e0b' : '1.5px solid #18181b',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: selected
                  ? '0 0 0 2.5px #3b82f6, 0 0 6px rgba(59, 130, 246, 0.4)'
                  : isHovered
                    ? '0 0 0 1.5px #94a3b8'
                    : '0 1px 2px rgba(0,0,0,0.15)',
                transition: 'box-shadow 0.15s ease',
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: '#18181b',
                }}
              />
            </div>
          )}

          {/* Underneath title label */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'auto',
            }}
          >
            {isEditingName ? (
              <input
                type="text"
                className="nodrag"
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleCommitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitName();
                  else if (e.key === 'Escape') handleCancelEditing();
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 4px',
                  border: '1.5px solid #3b82f6',
                  borderRadius: 3,
                  outline: 'none',
                  textAlign: 'center',
                  background: '#fff',
                  width: 80,
                }}
                data-testid={`inline-node-name-input-${id}`}
              />
            ) : (
              <span
                data-testid={`node-title-${id}`}
                onDoubleClick={handleStartEditing}
                title="Double-click to rename"
                style={{
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#374151',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                  lineHeight: 1.2,
                }}
              >
                {data.customName?.trim() || (isStart ? 'Start' : (data.rawData?.endMessage || 'End'))}
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div
              aria-hidden
              style={{
                width: isComposite ? 22 : 28,
                height: isComposite ? 22 : 28,
                borderRadius: 6,
                background: color,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isComposite ? 10 : 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {title.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1, paddingRight: isHovered || selected ? 18 : 0, transition: 'padding-right 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isEditingName ? (
                  <input
                    type="text"
                    className="nodrag"
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={handleCommitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitName();
                      else if (e.key === 'Escape') handleCancelEditing();
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '1px 4px',
                      border: '1.5px solid #3b82f6',
                      borderRadius: 4,
                      outline: 'none',
                      width: '100%',
                      background: '#fff',
                    }}
                    data-testid={`inline-node-name-input-${id}`}
                  />
                ) : (
                  <div
                    onDoubleClick={handleStartEditing}
                    title="Double-click to rename"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                  >
                    <span
                      data-testid={`node-title-${id}`}
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#111827',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {title}
                    </span>
                    {data.rawData?.hasScopeError === 'true' && (
                      <span
                        data-testid={`node-scope-error-${id}`}
                        title="Contains out-of-scope variables that cannot resolve"
                        style={{
                          fontSize: 11,
                          cursor: 'help',
                          flexShrink: 0,
                        }}
                      >
                        ⚠️
                      </span>
                    )}
                    {isHovered && (
                      <button
                        type="button"
                        className="nodrag"
                        data-testid={`rename-node-button-${id}`}
                        aria-label={`Rename ${title}`}
                        title="Rename activity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditing();
                        }}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#9ca3af',
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11.5 2.5a1.768 1.768 0 0 1 2.5 2.5L5 14H2v-3L11.5 2.5z" />
                          <path d="M9.5 4.5l2 2" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                {isComposite && data.rawData?.isolateContext === 'true' && (
                  <span style={{ fontSize: 9, background: '#059669', color: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>
                    ISOLATED
                  </span>
                )}
              </div>

              {!isComposite && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#6b7280',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {summary}
                </div>
              )}
            </div>

            {/* Expand / Collapse toggle for Composite Sequence */}
            {isComposite && (
              <button
                type="button"
                className="nodrag"
                data-testid={`toggle-composite-${id}`}
                title={isCollapsed ? 'Expand Steps' : 'Collapse Steps'}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCollapsed(!isCollapsed);
                }}
                style={{
                  border: 'none',
                  background: '#f3f4f6',
                  color: '#4b5563',
                  borderRadius: 4,
                  fontSize: 10,
                  padding: '1px 5px',
                  cursor: 'pointer',
                  marginRight: isHovered || selected ? 20 : 0,
                }}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
            )}
          </div>

          {/* Embedded Sequential Pipeline Body for CompositeActivity */}
          {isComposite && !isCollapsed && (
            <div
              data-testid={`composite-expanded-steps-${id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: '#f9fafb',
                borderRadius: 6,
                padding: '6px 8px',
                border: '1px solid #e5e7eb',
                marginTop: 2,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {compositeSteps.length} Sequential Steps
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {compositeSteps.map((step, idx) => (
                  <div key={step.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 4,
                        padding: '3px 6px',
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          background: '#3b82f6',
                          color: '#ffffff',
                          fontSize: 8,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 11 }}>{getStepIcon(step.type)}</span>
                      <span style={{ fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {step.name}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: 10, marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>
                        {getStepSummary(step)}
                      </span>
                    </div>
                    {idx < compositeSteps.length - 1 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 8, lineHeight: 1, margin: '-1px 0' }}>
                        ↓
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {data.rawData?.completeMessage && (
                <div style={{ fontSize: 9.5, color: '#059669', fontWeight: 500, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  💬 "{data.rawData.completeMessage}"
                </div>
              )}
            </div>
          )}

          {/* Collapsed Pill Sequence for CompositeActivity */}
          {isComposite && isCollapsed && (
            <div
              data-testid={`composite-collapsed-strip-${id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: '#f9fafb',
                padding: '3px 6px',
                borderRadius: 4,
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}
            >
              {compositeSteps.map((step, idx) => (
                <span key={step.id || idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#1e40af' }}>
                  <span>{getStepIcon(step.type)}</span>
                  {idx < compositeSteps.length - 1 && <span style={{ color: '#9ca3af', fontSize: 9 }}>➔</span>}
                </span>
              ))}
              <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 'auto' }}>
                ({compositeSteps.length} steps)
              </span>
            </div>
          )}
        </>
      )}

      {/* Delete node 'x' button */}
      {!isStart && (
        <button
          type="button"
          className="nodrag"
          data-testid={`delete-node-${id}`}
          aria-label={`Delete ${title} node`}
          title={`Delete ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            if (data.onRequestDeleteNode) {
              data.onRequestDeleteNode(id);
            } else {
              useDiagramStore.getState().removeNodes([id], 'Canvas');
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fee2e2';
            e.currentTarget.style.color = '#dc2626';
            e.currentTarget.style.borderColor = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isHovered || selected ? '#f3f4f6' : 'transparent';
            e.currentTarget.style.color = isHovered || selected ? '#6b7280' : 'transparent';
            e.currentTarget.style.borderColor = isHovered || selected ? '#e5e7eb' : 'transparent';
          }}
          style={{
            position: 'absolute',
            top: isUmlCircle ? -6 : isCondition ? -4 : isSwitch ? -10 : 5,
            right: isUmlCircle ? -6 : isCondition ? -4 : isSwitch ? -10 : 5,
            width: isUmlCircle ? 11 : 14,
            height: isUmlCircle ? 11 : 14,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: isHovered || selected ? '#e5e7eb' : 'transparent',
            background: isHovered || selected ? '#f3f4f6' : 'transparent',
            color: isHovered || selected ? '#6b7280' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isHovered || selected ? 'pointer' : 'default',
            padding: 0,
            lineHeight: 1,
            zIndex: 10,
            opacity: isHovered || selected ? 1 : 0,
            transition: 'all 0.15s ease',
            pointerEvents: isHovered || selected ? 'auto' : 'none',
          }}
        >
          <svg
            width={isUmlCircle ? 5 : 7}
            height={isUmlCircle ? 5 : 7}
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      )}
    </div>
  );
}
