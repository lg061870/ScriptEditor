import { NodeEditor, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { VuePlugin, Presets as VuePresets, type VueArea2D } from 'rete-vue-plugin';

type Schemes = { Node: ClassicPreset.Node; Connection: ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node> };
type AreaExtra = VueArea2D<Schemes>;

function makeCaseNode(label: string, cases: string[]) {
  const node = new ClassicPreset.Node(label);
  node.addInput('in', new ClassicPreset.Input(new ClassicPreset.Socket('flow')));
  cases.forEach((c, i) => {
    node.addOutput(`case-${i}`, new ClassicPreset.Output(new ClassicPreset.Socket('flow'), c));
  });
  return node;
}

export async function createEditor(container: HTMLElement) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new VuePlugin<Schemes, AreaExtra>();

  connection.addPreset(ConnectionPresets.classic.setup());
  render.addPreset(VuePresets.classic.setup());

  editor.use(area);
  area.use(connection);
  area.use(render);

  const switchNode = makeCaseNode('SwitchActivity', ['Case A', 'Case B', 'Case C']);
  const middleNode = makeCaseNode('SimpleActivity', ['Output']);
  const farNode = makeCaseNode('RepeatActivity', ['Output']);

  await editor.addNode(switchNode);
  await editor.addNode(middleNode);
  await editor.addNode(farNode);

  await area.translate(switchNode.id, { x: 0, y: 0 });
  await area.translate(middleNode.id, { x: 320, y: 0 });
  await area.translate(farNode.id, { x: 640, y: 0 });

  await editor.addConnection(new ClassicPreset.Connection(switchNode, 'case-0', middleNode, 'in'));
  await editor.addConnection(new ClassicPreset.Connection(middleNode, 'case-0', farNode, 'in'));
  // Proof connection: does Rete's connection plugin give us a way to route this
  // around middleNode, or only a straight/bezier line through it? Record the
  // finding either way — this is the crux of the comparison.
  await editor.addConnection(new ClassicPreset.Connection(farNode, 'case-0', switchNode, 'in'));

  AreaExtensions.zoomAt(area, editor.getNodes());
  return editor;
}
