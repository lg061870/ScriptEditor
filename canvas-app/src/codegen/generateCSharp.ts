import type { DiagramDocument } from '../schema/diagram';

/**
 * Phase 2.4 static template: a plain string-building function, not Roslyn.
 * Proves the "instant text update" half of the dual-speed lifecycle
 * (docs/CONCEPT_OF_OPERATIONS.md §4.6) -- this can run on every keystroke
 * since it's synchronous and cheap. Real, syntax-correct, compilable C#
 * generation via Roslyn SyntaxFactory (or equivalent) is Phase 3.1; this
 * function does not need to produce code that actually compiles, only to
 * visibly react to the JSON changing.
 *
 * Walks `document.nodes` in array order -- not edge/topological order.
 * BuildWorkflow()'s real statement order will need to follow the graph
 * (Phase 3.1's job); this is a template, not a transcriber.
 */
export function generateCSharp(document: DiagramDocument, className = 'MainConversation'): string {
  const statements = document.nodes.map((node) => `        ${generateAddStatement(node)}`);

  const body = statements.length > 0 ? statements.join('\n') : '        // (no activities yet)';

  return [
    `public partial class ${className} : TopicFlow`,
    '{',
    '    protected override void BuildWorkflow()',
    '    {',
    body,
    '    }',
    '}',
  ].join('\n');
}

function generateAddStatement(node: DiagramDocument['nodes'][number]): string {
  const args: string[] = [];
  if (node.name) {
    args.push(csharpStringLiteral(node.name));
  }

  const properties = Object.entries(node.data)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${capitalize(key)} = ${csharpValueLiteral(value)}`);

  const initializer = properties.length > 0 ? ` { ${properties.join(', ')} }` : '';

  return `Add(new ${node.type}(${args.join(', ')})${initializer});`;
}

function capitalize(key: string): string {
  return key.length === 0 ? key : key[0].toUpperCase() + key.slice(1);
}

/** `true`/`false` and plain numbers render as bare literals; everything
 * else as a quoted, escaped string. A heuristic, not a real type system --
 * matches DiagramNode.data's Dictionary<string,string> shape, which has no
 * type information to begin with. */
function csharpValueLiteral(value: string): string {
  if (value === 'true' || value === 'false') return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return csharpStringLiteral(value);
}

function csharpStringLiteral(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
  return `"${escaped}"`;
}
