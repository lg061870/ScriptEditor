import type { DiagramDocument, DiagramNode } from '../schema/diagram';
import { getActivityDefinition } from '../registry/activityDefinitions';

export type VariableType = 'int' | 'double' | 'string' | 'boolean' | 'object' | 'any';

export interface ScopeVariable {
  name: string;
  type: VariableType;
  sourceNodeId: string;
  sourceNodeType: string;
  sourceNodeName: string;
  defaultValue?: string;
}

/**
 * Infer the variable type from an assigned value string.
 */
export function inferVariableType(value: string | undefined): VariableType {
  if (value === undefined || value === null || value === '') return 'string';
  let trimmed = value.trim();
  const assignMatch = trimmed.match(/^\{?[a-zA-Z0-9_]+\}?\s*=\s*(.+)$/);
  if (assignMatch && !trimmed.includes('==')) {
    trimmed = assignMatch[1].trim();
  }
  if (trimmed === 'true' || trimmed === 'false') return 'boolean';
  if (/^-?\d+$/.test(trimmed)) return 'int';
  if (/^-?\d+\.\d+$/.test(trimmed)) return 'double';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return 'string';
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return 'object';
  if (/^(\d+|\{[a-zA-Z0-9_]+\})\s*\.\.\s*(\d+|\{[a-zA-Z0-9_]+\})$/.test(trimmed)) return 'object';
  const remainder = trimmed.replace(/\{[a-zA-Z0-9_]+\}/g, '').trim();
  if (remainder && /^[\s0-9\.\+\-\*\/\%\(\)]+$/.test(remainder) && /[\+\-\*\/\%]/.test(remainder)) {
    return remainder.includes('.') || remainder.includes('/') ? 'double' : 'int';
  }
  return 'any';
}

/**
 * Extracts variables declared or written by a given node.
 */
export function getNodeProducedVariables(node: DiagramNode): ScopeVariable[] {
  const vars: ScopeVariable[] = [];
  const def = getActivityDefinition(node.type);
  const nodeName = node.customName?.trim() || node.data?.customName?.trim() || node.name?.trim() || def?.title || node.type || node.id;

  if (node.type === 'SetVariableActivity') {
    const varName = node.data?.variableName?.trim();
    if (varName) {
      const val = node.data?.value ?? node.data?.initialValue;
      const explicitType = node.data?.variableType as VariableType;
      vars.push({
        name: varName,
        type: explicitType || inferVariableType(val),
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
        defaultValue: val,
      });
    }
  } else if (node.type === 'GlobalVariableActivity') {
    const sourceKey = node.data?.sourceKey?.trim();
    const globalKey = node.data?.globalKey?.trim();
    const targetKey =
      globalKey && globalKey !== 'Global_<Key>'
        ? globalKey
        : sourceKey
        ? sourceKey.startsWith('Global_')
          ? sourceKey
          : `Global_${sourceKey}`
        : node.data?.variableName?.trim();

    if (targetKey) {
      vars.push({
        name: targetKey,
        type: 'any',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
    }
  } else if (node.type === 'PromptActivity') {
    const key = node.data?.resultVariable?.trim() || node.data?.contextKey?.trim();
    if (key) {
      vars.push({
        name: key,
        type: 'string',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
    }
  } else if (node.type === 'AdaptiveCardActivity') {
    const cardFieldsRaw = node.data?.cardFields;
    if (cardFieldsRaw) {
      try {
        const parsed = JSON.parse(cardFieldsRaw);
        const fields = Array.isArray(parsed) ? parsed : parsed.fields || [];
        for (const f of fields) {
          if (f.id) {
            let t: VariableType = 'string';
            if (f.type === 'input-number') t = 'double';
            if (f.type === 'input-toggle') t = 'boolean';
            vars.push({
              name: f.id,
              type: t,
              sourceNodeId: node.id,
              sourceNodeType: node.type,
              sourceNodeName: nodeName,
            });
          }
        }
      } catch {
        // malformed JSON fallback
      }
    }
    const submissionKey = node.data?.submissionContextKey?.trim();
    if (submissionKey) {
      vars.push({
        name: submissionKey,
        type: 'object',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
    }
  } else if (node.type === 'QuickAnswerActivity') {
    const outputVar = node.data?.outputVariable?.trim() || node.data?.submissionContextKey?.trim() || 'selectedChoice';
    if (outputVar) {
      vars.push({
        name: outputVar,
        type: 'string',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
    }
  } else if (node.type === 'InvokeToolActivity') {
    const key = node.data?.resultContextKey?.trim();
    if (key) {
      vars.push({
        name: key,
        type: 'object',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
    }
  } else if (node.type === 'RepeatActivity' || node.type === 'RepeatLoopActivity') {
    const iterVar = node.data?.iterationVariable?.trim() || 'count';
    vars.push({
      name: iterVar,
      type: 'int',
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      sourceNodeName: nodeName,
      defaultValue: '1',
    });
    if (node.data?.loopMode === 'for_each') {
      vars.push({
        name: node.data?.itemKey?.trim() || 'item',
        type: 'any',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
      });
      vars.push({
        name: node.data?.indexKey?.trim() || 'index',
        type: 'int',
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        sourceNodeName: nodeName,
        defaultValue: '0',
      });
    }
  } else if (node.type === 'ForEachActivity') {
    vars.push({
      name: node.data?.itemKey?.trim() || 'item',
      type: 'any',
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      sourceNodeName: nodeName,
    });
    vars.push({
      name: node.data?.indexKey?.trim() || 'index',
      type: 'int',
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      sourceNodeName: nodeName,
      defaultValue: '0',
    });
    vars.push({
      name: 'count',
      type: 'int',
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      sourceNodeName: nodeName,
      defaultValue: '1',
    });
  }

  // Support generic context writes if defined
  if (node.context?.writes) {
    for (const w of node.context.writes) {
      if (w && !vars.some((v) => v.name === w)) {
        vars.push({
          name: w,
          type: 'any',
          sourceNodeId: node.id,
          sourceNodeType: node.type,
          sourceNodeName: nodeName,
        });
      }
    }
  }

  return vars;
}

/**
 * Finds all paths from any entry node (in-degree 0 in the connected component)
 * that lead to `targetNodeId`.
 * If the targetNode is itself an entry node or has no incoming edges, returns [].
 */
function findAllPathsToNode(
  document: DiagramDocument,
  targetNodeId: string
): string[][] {
  const nodeMap = new Map(document.nodes.map((n) => [n.id, n]));
  if (!nodeMap.has(targetNodeId)) return [];

  // Build incoming adjacency: node -> list of predecessor nodes
  const predMap = new Map<string, string[]>();
  for (const edge of document.edges) {
    if (!edge.to) continue;
    const fromId = edge.from.node || (edge.from as any).nodeId;
    const toId = edge.to.node || (edge.to as any).nodeId;
    if (!fromId || !toId) continue;
    if (!predMap.has(toId)) predMap.set(toId, []);
    predMap.get(toId)!.push(fromId);
  }

  // If target has no incoming edges, it is an entry node or disconnected; nothing is upstream.
  if (!predMap.has(targetNodeId) || predMap.get(targetNodeId)!.length === 0) {
    return [];
  }

  // Backwards DFS from targetNodeId to find all paths back to roots
  const allPaths: string[][] = [];

  function dfs(currId: string, currentPath: string[], visited: Set<string>) {
    if (visited.has(currId)) {
      // Cycle detected; stop recursion along this cycle
      return;
    }
    visited.add(currId);
    currentPath.unshift(currId);

    const preds = predMap.get(currId) || [];
    if (preds.length === 0) {
      // Reached a root
      allPaths.push([...currentPath]);
    } else {
      for (const p of preds) {
        dfs(p, currentPath, new Set(visited));
      }
    }

    currentPath.shift();
  }

  const initialPreds = predMap.get(targetNodeId) || [];
  for (const p of initialPreds) {
    dfs(p, [], new Set([targetNodeId]));
  }

  return allPaths;
}

/**
 * Computes all variables that are guaranteed to exist at `targetNodeId`.
 * A variable is guaranteed to exist if and only if it is defined along EVERY
 * incoming execution path from a root node to `targetNodeId`.
 */
export function getGuaranteedUpstreamVariables(
  document: DiagramDocument,
  targetNodeId: string
): ScopeVariable[] {
  const paths = findAllPathsToNode(document, targetNodeId);
  if (paths.length === 0) return [];

  const nodeMap = new Map(document.nodes.map((n) => [n.id, n]));

  // For each path, collect the map of variable names -> ScopeVariable
  const pathVarSets: Map<string, ScopeVariable>[] = [];

  for (const path of paths) {
    const varMap = new Map<string, ScopeVariable>();
    for (const nodeId of path) {
      const node = nodeMap.get(nodeId);
      if (node) {
        const produced = getNodeProducedVariables(node);
        for (const v of produced) {
          varMap.set(v.name, v);
        }
      }
    }
    pathVarSets.push(varMap);
  }

  if (pathVarSets.length === 0) return [];

  // Intersect across all paths: variable must be present in every path
  const [firstPath, ...otherPaths] = pathVarSets;
  const result: ScopeVariable[] = [];

  for (const [varName, varDef] of firstPath.entries()) {
    const presentInAll = otherPaths.every((pMap) => pMap.has(varName));
    if (presentInAll) {
      result.push(varDef);
    }
  }

  return result;
}

/**
 * Computes all available variables in scope at `targetNodeId`.
 * This includes:
 * 1. All guaranteed upstream variables on incoming paths.
 * 2. Variables defined on any incoming path (reachable upstream).
 * 3. Document-wide global variables (e.g., GlobalVariableActivity or SetVariableActivity with isGlobal).
 */
export function getAvailableUpstreamVariables(
  document: DiagramDocument,
  targetNodeId: string
): ScopeVariable[] {
  const guaranteed = getGuaranteedUpstreamVariables(document, targetNodeId);
  const seen = new Set<string>(guaranteed.map((v) => v.name));
  const result: ScopeVariable[] = [...guaranteed];

  // 1. Check all predecessors on any path
  const paths = findAllPathsToNode(document, targetNodeId);
  const nodeMap = new Map(document.nodes.map((n) => [n.id, n]));
  for (const path of paths) {
    for (const nodeId of path) {
      const node = nodeMap.get(nodeId);
      if (node) {
        for (const v of getNodeProducedVariables(node)) {
          if (!seen.has(v.name)) {
            seen.add(v.name);
            result.push(v);
          }
        }
      }
    }
  }

  // 2. Check global variables declared anywhere in the document
  for (const node of document.nodes) {
    if (node.id === targetNodeId) continue;
    if (node.type === 'GlobalVariableActivity' || (node.type === 'SetVariableActivity' && node.data?.isGlobal === 'true')) {
      for (const v of getNodeProducedVariables(node)) {
        if (!seen.has(v.name)) {
          seen.add(v.name);
          result.push(v);
        }
      }
    }
  }

  return result;
}
