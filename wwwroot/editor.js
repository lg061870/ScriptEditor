(() => {
    const __now = performance?.now?.() ?? Date.now();

    window.__scriptEditorInitStartedAt =
        window.__scriptEditorInitStartedAt ?? __now;

    window.__scriptEditorInitStartedISO =
        window.__scriptEditorInitStartedISO ?? new Date().toISOString();

    const earlyAllowDrop = (event) => {
        if (!event) return;
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    };
    ['dragenter', 'dragover', 'drop'].forEach((type) => {
        document.addEventListener(type, earlyAllowDrop, true);
    });

    window.__scriptEditorMarks = window.__scriptEditorMarks || {};

    function mark(label) {
        const ts = performance?.now?.() ?? Date.now();
        const iso = new Date().toISOString();
        window.__scriptEditorMarks[label] = { ts, iso };
        return window.__scriptEditorMarks[label];
    }

    window.scriptEditor = window.scriptEditor || {};
    window.scriptEditor.mark = mark;

    if (!window.EditorCore) {
        (function () {
            const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
            const asNumber = (v, f = 0) => { const n = Number.parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : f; };
            const optionalNum = (v) => { const n = Number.parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
            const normalizeTypeKey = (type) => String(type ?? '').trim().toLowerCase();
            const EXCEPTION_PORT_EXCLUDED_TYPES = new Set(['on-error-activity', 'onerroractivity']);
            const shouldAddExceptionPort = (nodeType) => !EXCEPTION_PORT_EXCLUDED_TYPES.has(normalizeTypeKey(nodeType));
            const NODE_MIN_WIDTHS = { 'chat-input': 320, 'prompt': 320, 'language-model': 320, 'chat-output': 280, 'delay': 240, 'simple-activity': 300, 'repeat-activity': 340, 'composite-activity': 340, 'wait-for-user-input': 320, 'semantic-response': 340, 'prompt-activity': 360, 'adaptive-card-activity': 360, 'adaptive-card': 360, 'conditional-quick-answer': 360, 'quick-answer': 320, 'conditional-trigger-topic': 340, 'trigger-topic': 320, 'generic': 220 };
            const NODE_MIN_HEIGHTS = { 'chat-input': 260, 'prompt': 260, 'language-model': 720, 'chat-output': 230, 'delay': 230, 'simple-activity': 390, 'repeat-activity': 430, 'composite-activity': 410, 'wait-for-user-input': 420, 'semantic-response': 420, 'prompt-activity': 470, 'adaptive-card-activity': 470, 'adaptive-card': 470, 'conditional-quick-answer': 420, 'quick-answer': 430, 'conditional-trigger-topic': 430, 'trigger-topic': 320, 'generic': 180 };
            const minNodeWidth = (type) => { const key = String(type ?? '').trim().toLowerCase(); if (NODE_MIN_WIDTHS[key] != null) return NODE_MIN_WIDTHS[key]; if (key.endsWith('-activity')) return 340; return NODE_MIN_WIDTHS.generic; };
            const minNodeHeight = (type) => { const key = String(type ?? '').trim().toLowerCase(); if (NODE_MIN_HEIGHTS[key] != null) return NODE_MIN_HEIGHTS[key]; if (key.endsWith('-activity')) return 280; return NODE_MIN_HEIGHTS.generic; };
            function normalizeNodeSize(value, min, max) { if (value == null) return null; const n = Number.parseFloat(String(value)); if (!Number.isFinite(n)) return null; return clamp(n, min, max); }
            function parseDoc(input) { if (typeof input === 'string') { if (!input.trim()) return null; try { return JSON.parse(input); } catch { return null; } } return input && typeof input === 'object' ? input : null; }
            function endpointPort(raw) { if (raw == null) return ''; if (typeof raw === 'string') return raw.trim(); if (typeof raw === 'object') { const candidate = raw.port ?? raw.id; return typeof candidate === 'string' ? candidate.trim() : ''; } return ''; }
            function endpointNode(raw) { if (raw && typeof raw === 'object' && typeof raw.node === 'string') return raw.node.trim(); return ''; }
            function normalizeType(type) { const value = String(type ?? '').trim().toLowerCase(); return value.length ? value : 'string'; }
            function hasExceptionPort(node) { return node.ports.some((port) => String(port.name ?? '').toLowerCase() === 'exception'); }
            function nextExceptionPortId(node) { const baseId = `${String(node?.id ?? 'node').trim() || 'node'}-exception-out`; if (!Array.isArray(node?.ports) || node.ports.every((port) => String(port?.id ?? '') !== baseId)) { return baseId; } let counter = 2; let candidate = `${baseId}-${counter}`; while (node.ports.some((port) => String(port?.id ?? '') === candidate)) { counter += 1; candidate = `${baseId}-${counter}`; } return candidate; }
            const safeNormPort = (raw, ni, pi) => {
                if (window.EditorPorts?.normPort) { return window.EditorPorts.normPort(raw, ni, pi); }
                const dir = String(raw?.direction || 'input').toLowerCase() === 'output' ? 'output' : 'input';
                return {
                    id: String(raw?.id || `node-${ni + 1}-port-${pi + 1}`),
                    name: String(raw?.name || `Port ${pi + 1}`),
                    direction: dir,
                    type: normalizeType(raw?.type),
                    position: String(raw?.position || (dir === 'output' ? 'right' : 'left')),
                    portGender: String(raw?.portGender || '')
                };
            };
            function ensureExceptionPort(node) {
                if (!node || !shouldAddExceptionPort(node.type)) return false;
                node.ports = Array.isArray(node.ports) ? node.ports : [];
                if (hasExceptionPort(node)) return false;
                node.ports.push({
                    id: nextExceptionPortId(node),
                    name: 'Exception',
                    direction: 'output',
                    type: 'any',
                    position: 'custom-bottom-85'
                });
                return true;
            }
            function normAdaptiveModelProperty(raw, mi, pi) { if (!raw || typeof raw !== 'object') return null; return { name: String(raw.name || `field${pi + 1}`), type: normalizeType(raw.type), required: Boolean(raw.required), defaultValue: raw.defaultValue == null ? null : String(raw.defaultValue), description: raw.description == null ? null : String(raw.description) }; }
            function normAdaptiveModel(raw, i) { if (!raw || typeof raw !== 'object') return null; const properties = Array.isArray(raw.properties) ? raw.properties : []; return { id: String(raw.id || `adaptive-model-${i + 1}`), name: String(raw.name || raw.id || `AdaptiveModel${i + 1}`), baseType: String(raw.baseType || 'BaseCardModel'), properties: properties.map((p, j) => normAdaptiveModelProperty(p, i, j)).filter(Boolean) }; }
            function normAdaptiveCardField(raw, ci, fi) { if (!raw || typeof raw !== 'object') return null; return { id: String(raw.id || `field-${fi + 1}`), label: String(raw.label || raw.id || `Field ${fi + 1}`), inputType: String(raw.inputType || 'text').toLowerCase(), placeholder: raw.placeholder == null ? null : String(raw.placeholder), required: Boolean(raw.required) }; }
            function normAdaptiveCard(raw, i) { if (!raw || typeof raw !== 'object') return null; const fields = Array.isArray(raw.fields) ? raw.fields : []; return { id: String(raw.id || `adaptive-card-${i + 1}`), name: String(raw.name || raw.id || `AdaptiveCard${i + 1}`), baseType: String(raw.baseType || 'AdaptiveFormCardLayout'), modelRef: String(raw.modelRef || ''), fields: fields.map((f, j) => normAdaptiveCardField(f, i, j)).filter(Boolean) }; }
            function normEdge(raw, i) { if (!raw || typeof raw !== 'object') return null; const from = endpointPort(raw.from); if (!from) return null; const to = endpointPort(raw.to); if (!to) return null; const fromNode = endpointNode(raw.from); const toNode = endpointNode(raw.to); return { id: String(raw.id || `edge-${i + 1}`), from, to, fromNode: fromNode || null, toNode: toNode || null, looseX: raw.looseX == null ? null : asNumber(raw.looseX, 0), looseY: raw.looseY == null ? null : asNumber(raw.looseY, 0) }; }
            function normNode(raw, i) {
                if (!raw || typeof raw !== 'object') return null;
                const ports = Array.isArray(raw.ports) ? raw.ports : [];
                const node = {
                    id: String(raw.id || `node-${i + 1}`),
                    name: raw.name == null ? null : String(raw.name),
                    type: String(raw.type || raw.nodeType || 'generic').trim().toLowerCase(),
                    x: optionalNum(raw.x) ?? 0,
                    y: optionalNum(raw.y) ?? 0,
                    width: normalizeNodeSize(raw.width, minNodeWidth(raw.type), 1200) ?? minNodeWidth(raw.type),
                    height: normalizeNodeSize(raw.height, minNodeHeight(raw.type), 1200) ?? minNodeHeight(raw.type),
                    collapsed: Boolean(raw.collapsed),
                    reads: Array.isArray(raw.reads) ? raw.reads.map((r) => String(r)).filter(Boolean) : [],
                    writes: Array.isArray(raw.writes) ? raw.writes.map((w) => String(w)).filter(Boolean) : [],
                    ports: ports.map((p, j) => safeNormPort(p, i, j)).filter(Boolean),
                    data: raw.data && typeof raw.data === 'object' ? raw.data : {},
                    flags: raw.flags && typeof raw.flags === 'object' ? raw.flags : {},
                    layout: raw.layout && typeof raw.layout === 'object' ? raw.layout : {},
                    icon: raw.icon == null ? null : String(raw.icon),
                    displayName: raw.displayName == null ? null : String(raw.displayName)
                };
                if (node.width < minNodeWidth(node.type)) node.width = minNodeWidth(node.type);
                if (node.height < minNodeHeight(node.type)) node.height = minNodeHeight(node.type);
                ensureExceptionPort(node);
                if (node.type === 'adaptive-card-activity') {
                    const required = [
                        { id: `${node.id}-card-in`, name: 'Card', direction: 'input', type: 'adaptive-card', position: 'custom-right-30', portGender: undefined },
                        { id: `${node.id}-model-in`, name: 'Model', direction: 'input', type: 'adaptive-model', position: 'custom-right-60', portGender: undefined },
                        { id: `${node.id}-out`, name: 'Submit', direction: 'output', type: 'adaptive-submission', position: 'custom-right-90', portGender: undefined }
                    ];
                    required.forEach((req, idx) => {
                        const existing = node.ports.find((p) => p.id === req.id);
                        if (existing) {
                            existing.position = req.position;
                            existing.portGender = req.portGender;
                            existing.direction = req.direction;
                            existing.type = req.type;
                            existing.name = existing.name || req.name;
                        } else {
                            node.ports.push(safeNormPort(req, i, node.ports.length + idx));
                        }
                    });
                }
                const typeKey = normalizeTypeKey(node.type);
                const inputExceptions = new Set(['chat-input']);
                const outputExceptions = new Set(['chat-output', 'end-activity']);
                const hasInput = node.ports.some((p) => p.direction === 'input');
                const hasOutput = node.ports.some((p) => p.direction === 'output');
                if (!hasInput && !inputExceptions.has(typeKey)) {
                    node.ports.push(safeNormPort({ id: `${node.id}-in`, name: 'Input', direction: 'input', type: 'string', position: 'custom-left-50' }, i, node.ports.length));
                }
                if (!hasOutput && !outputExceptions.has(typeKey)) {
                    node.ports.push(safeNormPort({ id: `${node.id}-out`, name: 'Output', direction: 'output', type: 'string', position: 'custom-right-50' }, i, node.ports.length));
                }
                return node;
            }
            function normalizeDoc(raw) {
                const doc = raw && typeof raw === 'object' ? raw : {};
                const vp = doc.viewport && typeof doc.viewport === 'object' ? doc.viewport : {};
                const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
                const edges = Array.isArray(doc.edges) ? doc.edges : [];
                const cards = Array.isArray(doc.cards) ? doc.cards : [];
                const models = Array.isArray(doc.models) ? doc.models : [];
                return {
                    viewport: { panX: asNumber(vp.panX, 24), panY: asNumber(vp.panY, 18), zoom: clamp(asNumber(vp.zoom, 1), 0.55, 1.9) },
                    nodes: nodes.map((n, i) => normNode(n, i)).filter(Boolean),
                    edges: edges.map((e, i) => normEdge(e, i)).filter(Boolean),
                    cards: cards.map((c, i) => normAdaptiveCard(c, i)).filter(Boolean),
                    models: models.map((m, i) => normAdaptiveModel(m, i)).filter(Boolean)
                };
            }
            window.EditorCore = { normalizeDoc, normNode, normAdaptiveCard, normAdaptiveModel, normAdaptiveCardField, normAdaptiveModelProperty };
        })();
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const editors = new WeakMap();
    let rootElement = null;
    let stage = null;
    let canvasScroller = null;
    let content = null;
    let nodesLayer = null;
    let svg = null;
    let zoomValue = null;
    let state = null;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const asElement = (t) => t instanceof Element ? t : null;
    const num = (v, f = 0) => { const n = Number.parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : f; };
    const esc = (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    const selEsc = (v) => window.CSS?.escape ? window.CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&');
    const optionalNum = (v) => { const n = Number.parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
    const normalizeTypeKey = (type) => String(type ?? '').trim().toLowerCase();
    const PORT_HOLD_MS = 320;
    const PORT_CONNECT_MOVE_THRESHOLD = 6;
    const PORT_CONNECT_SNAP_RADIUS = 40;
    const EXCEPTION_PORT_EXCLUDED_TYPES = new Set(['on-error-activity', 'onerroractivity']);
    const shouldAddExceptionPort = (nodeType) => !EXCEPTION_PORT_EXCLUDED_TYPES.has(normalizeTypeKey(nodeType));

    const NODE_MIN_WIDTHS = {
        'chat-input': 320,
        'prompt': 320,
        'language-model': 320,
        'chat-output': 280,
        'delay': 240,
        'simple-activity': 300,
        'repeat-activity': 340,
        'composite-activity': 340,
        'wait-for-user-input': 320,
        'semantic-response': 340,
        'prompt-activity': 360,
        'adaptive-card-activity': 360,
        'adaptive-card': 360,
        'conditional-quick-answer': 360,
        'quick-answer': 320,
        'conditional-trigger-topic': 340,
        'trigger-topic': 320,
        'generic': 220
    };

    const NODE_MIN_HEIGHTS = {
        'chat-input': 260,
        'prompt': 260,
        'language-model': 720,
        'chat-output': 230,
        'delay': 230,
        'simple-activity': 390,
        'repeat-activity': 430,
        'composite-activity': 410,
        'wait-for-user-input': 420,
        'semantic-response': 420,
        'prompt-activity': 470,
        'adaptive-card-activity': 470,
        'adaptive-card': 470,
        'conditional-quick-answer': 420,
        'quick-answer': 430,
        'conditional-trigger-topic': 430,
        'trigger-topic': 320,
        'generic': 180
    };

    const minNodeWidth = (type) => {
        const key = String(type ?? '').trim().toLowerCase();
        if (NODE_MIN_WIDTHS[key] != null) return NODE_MIN_WIDTHS[key];
        if (key.endsWith('-activity')) return 340;
        return NODE_MIN_WIDTHS.generic;
    };

    const minNodeHeight = (type) => {
        const key = String(type ?? '').trim().toLowerCase();
        if (NODE_MIN_HEIGHTS[key] != null) return NODE_MIN_HEIGHTS[key];
        if (key.endsWith('-activity')) return 280;
        return NODE_MIN_HEIGHTS.generic;
    };

    function normalizeNodeSize(value, min, max) {
        if (value == null) return null;
        const n = Number.parseFloat(String(value));
        if (!Number.isFinite(n)) return null;
        return clamp(n, min, max);
    }
    //////////
    function parseDoc(input) {
        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (!trimmed) return null;
            try {
                return JSON.parse(trimmed);
            } catch {
                return null;
            }
        }
        return input && typeof input === 'object' ? input : null;
    }

    function typesCompatible(outputType, inputType) {
        return window.EditorTypes.typesCompatible(outputType, inputType);
    }

    function normalizeDoc(raw) {
        return window.EditorCore.normalizeDoc(raw);
    }

    function normNode(raw, i) {
        return window.EditorCore.normNode(raw, i);
    }

    function normPort(raw, ni, pi) {
        return window.EditorPorts.normPort(raw, ni, pi);
    }

    function toSerializableDoc(doc) {
        const portToNode = new Map();
        for (const node of doc.nodes) {
            for (const port of node.ports) {
                portToNode.set(port.id, node.id);
            }
        }

        return {
            viewport: { ...doc.viewport },
            nodes: doc.nodes.map((node) => {
                const serializedNode = {
                    id: node.id,
                    type: node.type,
                    x: node.x,
                    y: node.y,
                    data: { ...node.data },
                    context: {
                        reads: Array.isArray(node.context?.reads) ? [...node.context.reads] : [],
                        writes: Array.isArray(node.context?.writes) ? [...node.context.writes] : []
                    },
                    ports: node.ports.map((port) => ({
                        id: port.id,
                        name: port.name,
                        direction: port.direction,
                        type: port.type,
                        position: port.position,
                        portGender: port.portGender
                    }))
                };
                if (typeof node.name === 'string' && node.name.trim().length > 0) {
                    serializedNode.name = node.name.trim();
                }
                if (node.collapsed === true) serializedNode.collapsed = true;
                if (node.width != null && Number.isFinite(node.width)) serializedNode.width = node.width;
                if (node.height != null && Number.isFinite(node.height)) serializedNode.height = node.height;
                return serializedNode;
            }),
            edges: doc.edges.map((edge) => ({
                id: edge.id,
                from: { node: edge.fromNode || portToNode.get(edge.from) || '', port: edge.from },
                to: edge.to ? { node: edge.toNode || portToNode.get(edge.to) || '', port: edge.to } : null,
                looseX: edge.looseX,
                looseY: edge.looseY
            })),
            cards: (Array.isArray(doc.cards) ? doc.cards : []).map((card) => ({
                id: String(card.id ?? ''),
                name: String(card.name ?? ''),
                baseType: String(card.baseType ?? ''),
                modelRef: String(card.modelRef ?? ''),
                fields: Array.isArray(card.fields)
                    ? card.fields.map((field) => ({
                        id: String(field.id ?? ''),
                        label: String(field.label ?? ''),
                        inputType: String(field.inputType ?? 'text'),
                        placeholder: field.placeholder == null ? null : String(field.placeholder),
                        required: Boolean(field.required)
                    }))
                    : []
            })),
            models: (Array.isArray(doc.models) ? doc.models : []).map((model) => ({
                id: String(model.id ?? ''),
                name: String(model.name ?? ''),
                baseType: String(model.baseType ?? ''),
                properties: Array.isArray(model.properties)
                    ? model.properties.map((prop) => ({
                        name: String(prop.name ?? ''),
                        type: String(prop.type ?? 'string'),
                        required: Boolean(prop.required),
                        defaultValue: prop.defaultValue == null ? null : String(prop.defaultValue),
                        description: prop.description == null ? null : String(prop.description)
                    }))
                    : []
            }))
        };
    }

    const serialize = (doc) => JSON.stringify(toSerializableDoc(doc), null, 2);

    const normalizeLayoutDirection = (mode) =>
        String(mode ?? '').trim().toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';

    const positionForPortDirection = (direction, layoutDirection) => {
        const dir = String(direction ?? '').trim().toLowerCase() === 'output' ? 'output' : 'input';
        return layoutDirection === 'vertical'
            ? (dir === 'output' ? 'bottom' : 'top')
            : (dir === 'output' ? 'right' : 'left');
    };

    const CUSTOM_PORT_PATTERN = /^custom-(top|right|bottom|left)-(-?\d+(?:\.\d+)?)$/i;

    const STANDARD_PORT_ANCHORS = {
        'left-upper': { edge: 'left', ratio: 24 },
        'left-lower': { edge: 'left', ratio: 76 },
        'left': { edge: 'left', ratio: 50 },
        'right-upper': { edge: 'right', ratio: 24 },
        'right-lower': { edge: 'right', ratio: 76 },
        'right-middle': { edge: 'right', ratio: 50 },
        'right': { edge: 'right', ratio: 50 },
        'top-left': { edge: 'top', ratio: 24 },
        'top-right': { edge: 'top', ratio: 76 },
        'top': { edge: 'top', ratio: 50 },
        'bottom-left': { edge: 'bottom', ratio: 24 },
        'bottom-right': { edge: 'bottom', ratio: 76 },
        'bottom': { edge: 'bottom', ratio: 50 }
    };

    function parseCustomPortPosition(position) {
        const match = CUSTOM_PORT_PATTERN.exec(String(position ?? '').trim().toLowerCase());
        if (!match) return null;
        return { edge: match[1], ratio: clamp(Number.parseFloat(match[2]), 0, 100) };
    }

    function parsePortAnchor(position) {
        const custom = parseCustomPortPosition(position);
        if (custom) return custom;
        const standard = STANDARD_PORT_ANCHORS[String(position ?? '').trim().toLowerCase()];
        return standard ? { ...standard } : null;
    }

    function buildCustomPortPosition(edge, ratio) {
        return `custom-${edge}-${clamp(ratio, 0, 100).toFixed(2)}`;
    }

    function hasExceptionPort(node) {
        if (!node || !Array.isArray(node.ports)) return false;
        return node.ports.some((port) => {
            const direction = String(port?.direction ?? '').trim().toLowerCase();
            if (direction !== 'output') return false;
            const id = String(port?.id ?? '').trim().toLowerCase();
            const name = String(port?.name ?? '').trim().toLowerCase();
            return id.includes('exception') || id.endsWith('-ex') || name.includes('exception') || name === 'error';
        });
    }

    function isExceptionPort(port) {
        if (!port || typeof port !== 'object') return false;
        const direction = String(port.direction ?? '').trim().toLowerCase();
        if (direction !== 'output') return false;
        const id = String(port.id ?? '').trim().toLowerCase();
        const name = String(port.name ?? '').trim().toLowerCase();
        return id.includes('exception') || id.endsWith('-ex') || name.includes('exception') || name === 'error';
    }

    function nextExceptionPortId(node) {
        const baseId = `${String(node?.id ?? 'node').trim() || 'node'}-exception-out`;
        if (!Array.isArray(node?.ports) || node.ports.every((port) => String(port?.id ?? '') !== baseId)) {
            return baseId;
        }

        let counter = 2;
        let candidate = `${baseId}-${counter}`;
        while (node.ports.some((port) => String(port?.id ?? '') === candidate)) {
            counter += 1;
            candidate = `${baseId}-${counter}`;
        }
        return candidate;
    }

    function ensureExceptionPort(node) {
        if (!node || !shouldAddExceptionPort(node.type)) return false;
        node.ports = Array.isArray(node.ports) ? node.ports : [];
        if (hasExceptionPort(node)) return false;

        node.ports.push({
            id: nextExceptionPortId(node),
            name: 'Exception',
            direction: 'output',
            type: 'any',
            position: 'custom-bottom-85'
        });
        return true;
    }

    function assignDirectionalPortPositions(ports, direction, layoutDirection) {
        if (!Array.isArray(ports) || ports.length === 0) return;
        const movablePorts = ports.filter((port) => !parseCustomPortPosition(port.position));
        if (movablePorts.length === 0) return;

        const isOutput = direction === 'output';
        const positions = layoutDirection === 'vertical'
            ? (isOutput ? ['bottom-left', 'bottom', 'bottom-right'] : ['top-left', 'top', 'top-right'])
            : (isOutput ? ['right-upper', 'right', 'right-lower'] : ['left-upper', 'left', 'left-lower']);

        if (movablePorts.length === 1) {
            movablePorts[0].position = positions[1];
            return;
        }

        if (movablePorts.length === 2) {
            movablePorts[0].position = positions[0];
            movablePorts[1].position = positions[2];
            return;
        }

        movablePorts.forEach((port, index) => {
            if (index === 0) {
                port.position = positions[0];
                return;
            }

            if (index === movablePorts.length - 1) {
                port.position = positions[2];
                return;
            }

            port.position = positions[1];
        });
    }

    function createEmptyDndDebugStats() {
        return {
            sessionStartedAt: new Date().toISOString(),
            lastUpdatedAt: '',
            initStartedAt: '',
            initReadyAt: '',
            initElapsedMs: null,
            initStartAt: '',
            initParseDoneAt: '',
            initParseElapsedMs: null,
            initListenersReadyAt: '',
            initListenersElapsedMs: null,
            blazorAfterRenderAt: '',
            beforeInitializeAt: '',
            afterInitializeInvokeAt: '',
            restoreStartedAt: '',
            restoreDoneAt: '',
            restoreElapsedMs: null,
            pointerDownCount: 0,
            dragStartCount: 0,
            dragEnterCount: 0,
            dragOverCount: 0,
            dropCount: 0,
            dropAcceptedCount: 0,
            dropRejectedMissingTemplateCount: 0,
            dropRejectedUnknownTemplateCount: 0,
            dragEndCount: 0,
            lastTemplate: '',
            recentEvents: []
        };
    }

    function bumpDndCounter(key, delta = 1) {
        if (!state?.dndDebug) return;
        const next = (state.dndDebug[key] || 0) + delta;
        state.dndDebug[key] = Number.isFinite(next) ? next : 0;
        state.dndDebug.lastUpdatedAt = new Date().toISOString();
    }

    function recordDndEvent(type, detail = '') {
        if (!state?.dndDebug) return;
        const now = new Date().toISOString();
        state.dndDebug.lastUpdatedAt = now;
        state.dndDebug.recentEvents.unshift({
            at: now,
            type: String(type || 'event'),
            detail: String(detail || '')
        });
        if (state.dndDebug.recentEvents.length > 30) {
            state.dndDebug.recentEvents.length = 30;
        }
    }

    function worldFromClient(x, y) {
        if (!(stage instanceof Element) || !state?.doc?.viewport) return { x: 0, y: 0 };
        const r = stage.getBoundingClientRect();
        const lx = x - r.left;
        const ly = y - r.top;
        return {
            x: (lx - state.doc.viewport.panX) / state.doc.viewport.zoom,
            y: (ly - state.doc.viewport.panY) / state.doc.viewport.zoom
        };
    }

    function applyTransform() {
        if (!(content instanceof Element) || !state?.doc?.viewport) return;
        content.style.transform = `translate(${state.doc.viewport.panX}px, ${state.doc.viewport.panY}px) scale(${state.doc.viewport.zoom})`;
        if (zoomValue instanceof Element) {
            zoomValue.textContent = `${Math.round(state.doc.viewport.zoom * 100)}%`;
        }
    }

    function applyScope(el) {
        if (!(el instanceof Element)) return;
        if (!state?.scopeAttr) return;
        el.setAttribute(state.scopeAttr, '');
        el.querySelectorAll('*').forEach((c) => c.setAttribute(state.scopeAttr, ''));
    }
    function decorateNodeElement(el) {
        if (!(el instanceof HTMLElement)) return;
        const header = el.querySelector('.node-header');
        if (header instanceof HTMLElement && !header.querySelector('.node-header-actions')) {
            const actions = document.createElement('div');
            actions.className = 'node-header-actions';

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'node-delete';
            deleteBtn.dataset.nodeDelete = 'true';
            deleteBtn.title = 'Delete node';
            deleteBtn.setAttribute('aria-label', 'Delete node');
            deleteBtn.textContent = '×';
            actions.appendChild(deleteBtn);

            const play = header.querySelector('.node-play');
            if (play instanceof HTMLElement) actions.appendChild(play);
            header.appendChild(actions);
        }

        if (!el.querySelector('.node-resize-handle')) {
            const handle = document.createElement('span');
            handle.className = 'node-resize-handle';
            handle.dataset.nodeResize = 'true';
            el.appendChild(handle);
        }
    }
    function notifyNodeSelected(nodeId) {
        if (!state?.dotNetRef) return;
        state.dotNetRef.invokeMethodAsync('OnCanvasNodeSelected', nodeId ?? '').catch(() => { });
    }
    function applySelectedNodeStyles() {
        if (!(nodesLayer instanceof Element) || !state) return;
        nodesLayer.querySelectorAll('.node.is-selected').forEach((el) => el.classList.remove('is-selected'));
        if (!state.selectedNodeId) return;
        const selected = nodesLayer.querySelector(`.node[data-node-id="${selEsc(state.selectedNodeId)}"]`);
        if (selected instanceof HTMLElement) selected.classList.add('is-selected');
    }
    function applyInvalidPortStyle() {
        if (!state?.invalidPortId) return;
        const port = portById(state.invalidPortId);
        if (port) port.classList.add('port-invalid');
    }
    function applyContextFocusStyles() { }
    function notifyNow() {
        if (!state?.dotNetRef || !state?.doc) return;
        state.dotNetRef.invokeMethodAsync('OnCanvasDocumentChanged', serialize(state.doc)).catch(() => { });
    }
    function scheduleNotify(immediate = false) {
        if (!state) return;
        if (immediate) {
            if (state.notifyTimer) {
                window.clearTimeout(state.notifyTimer);
                state.notifyTimer = null;
            }
            notifyNow();
            return;
        }
        if (state.notifyTimer) window.clearTimeout(state.notifyTimer);
        state.notifyTimer = window.setTimeout(() => {
            state.notifyTimer = null;
            notifyNow();
        }, 40);
    }
    function clearInteraction(pointerId = null) {
        if (!state) return;
        if (pointerId != null && state.pointerId !== pointerId) return;
        if (state.portHoldTimer) {
            window.clearTimeout(state.portHoldTimer);
            state.portHoldTimer = null;
        }
        setConnectHover(null);
        setResizeCursorActive(false);
        if (state.resizeNodeId) {
            setNodeResizingState(state.resizeNodeId, false);
        }
        state.pointerId = null;
        state.mode = null;
        state.activePortId = null;
        state.activePortNodeId = null;
        state.activePortDirection = null;
        state.connectFromPortId = null;
        state.connectEdgeId = null;
        state.reconnectEdge = null;
        state.activeConnectTargetId = null;
        state.hoverInputPortId = null;
        state.resizeNodeId = null;
        if (stage instanceof HTMLElement) {
            stage.style.cursor = '';
        }
        if (pointerId != null) {
            relCapture(pointerId);
        }
    }
    function onStageDown(event) {
        if (!state) return;
        if (event.button !== 0) return;
        const target = asElement(event.target);
        if (target?.closest('.node, .zoom-badge')) return;
        state.pointerId = event?.pointerId ?? null;
        state.mode = 'pan';
        state.startClientX = event?.clientX ?? 0;
        state.startClientY = event?.clientY ?? 0;
        state.startPanX = num(state.doc?.viewport?.panX, 0);
        state.startPanY = num(state.doc?.viewport?.panY, 0);
        selectNode(null);
        setCapture(state.pointerId);
    }
    function onNodeDown(event) {
        if (!state || event.button !== 0) return;
        const target = asElement(event.target);
        if (target?.closest('button, input, textarea, select, a, .port, .node-resize-handle')) return;
        const nodeEl = event.currentTarget;
        const nodeId = nodeEl?.dataset?.nodeId;
        const node = nodeId ? nodeById(nodeId) : null;
        if (!node) return;
        event.stopPropagation();
        state.pointerId = event.pointerId;
        state.mode = 'drag';
        state.activeNodeId = nodeId;
        state.startClientX = event.clientX;
        state.startClientY = event.clientY;
        state.nodeStartX = num(node.x, 0);
        state.nodeStartY = num(node.y, 0);
        selectNode(nodeId);
        setCapture(event.pointerId);
    }
    function onNodeFieldInput(event) {
        const field = event.currentTarget;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
        const key = String(field.dataset.nodeFieldKey || '').trim();
        if (!key) return;
        const nodeEl = field.closest('.node[data-node-id]');
        const nodeId = nodeEl?.dataset?.nodeId;
        const node = nodeId ? nodeById(nodeId) : null;
        if (!node) return;
        if (!node.data || typeof node.data !== 'object') node.data = {};
        node.data[key] = field.value;
        if (event.type !== 'input') scheduleNotify();
    }
    function onDeleteNodeClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const nodeEl = asElement(event.currentTarget)?.closest('.node[data-node-id]');
        const nodeId = nodeEl?.dataset?.nodeId;
        if (!nodeId) return;
        removeNode(nodeId);
    }
    function onResizeHandleDown(event) {
        if (!state || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const nodeEl = asElement(event.currentTarget)?.closest('.node[data-node-id]');
        if (!(nodeEl instanceof HTMLElement)) return;
        const nodeId = nodeEl.dataset.nodeId;
        const node = nodeId ? nodeById(nodeId) : null;
        if (!node || !nodeId) return;

        selectNode(nodeId);

        const startWidth = node.width ?? nodeEl.offsetWidth;
        const startHeight = node.height ?? nodeEl.offsetHeight;
        setNodeSize(nodeId, startWidth, startHeight);
        setResizeCursorActive(true);
        setNodeResizingState(nodeId, true);

        state.pointerId = event.pointerId;
        state.mode = 'resize';
        state.resizeNodeId = nodeId;
        state.startClientX = event.clientX;
        state.startClientY = event.clientY;
        state.resizeStartWidth = startWidth;
        state.resizeStartHeight = startHeight;
        state.resizeMinWidth = minNodeWidth(node.type);
        state.resizeMinHeight = minNodeHeight(node.type);
        setCapture(event.pointerId);
    }
    function onPortDown(event) {
        if (!state || event.button !== 0) return;
        const portId = event.currentTarget?.dataset?.portId;
        if (!portId) return;
        event.preventDefault();
        event.stopPropagation();
        startPortGesture(event.pointerId, portId, event.clientX, event.clientY);
    }
    function bindNode(el) {
        if (!(el instanceof HTMLElement)) return;
        el.addEventListener('pointerdown', onNodeDown);
        el.querySelector('[data-node-delete="true"]')?.addEventListener('click', onDeleteNodeClick);
        el.querySelector('[data-node-resize="true"]')?.addEventListener('pointerdown', onResizeHandleDown);
        el.querySelectorAll('.node-field-input, .node-field-textarea').forEach((field) => {
            field.addEventListener('input', onNodeFieldInput);
            field.addEventListener('change', onNodeFieldInput);
        });
        el.querySelectorAll('.port[data-port-id]').forEach((port) => {
            port.addEventListener('pointerdown', onPortDown);
        });
    }
    function computePerimeterAnchor(nodeId, clientX, clientY, activePortId) {
        const node = nodeById(nodeId);
        const nodeEl = nodeId
            ? nodesLayer.querySelector(`.node[data-node-id="${selEsc(nodeId)}"]`)
            : null;
        if (!node || !(nodeEl instanceof HTMLElement)) return null;

        const rect = nodeEl.getBoundingClientRect();
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);
        const localX = clamp(clientX - rect.left, 0, width);
        const localY = clamp(clientY - rect.top, 0, height);

        const distances = {
            left: localX,
            right: Math.max(0, width - localX),
            top: localY,
            bottom: Math.max(0, height - localY)
        };

        let edge = 'left';
        let minDistance = distances.left;
        for (const candidate of ['right', 'top', 'bottom']) {
            if (distances[candidate] < minDistance) {
                minDistance = distances[candidate];
                edge = candidate;
            }
        }

        let ratio = edge === 'left' || edge === 'right'
            ? (localY / height) * 100
            : (localX / width) * 100;
        ratio = clamp(ratio, 3, 97);

        const occupied = node.ports
            .filter((port) => String(port.id) !== String(activePortId))
            .map((port) => parsePortAnchor(port.position))
            .filter((anchor) => anchor && anchor.edge === edge)
            .map((anchor) => anchor.ratio);

        const minGap = 5;
        const isFree = (candidate) => occupied.every((value) => Math.abs(value - candidate) >= minGap);
        if (!isFree(ratio)) {
            let resolved = ratio;
            let found = false;
            for (let step = 1; step <= 80; step += 1) {
                const up = clamp(ratio + (step * 1.2), 3, 97);
                if (isFree(up)) { resolved = up; found = true; break; }
                const down = clamp(ratio - (step * 1.2), 3, 97);
                if (isFree(down)) { resolved = down; found = true; break; }
            }
            ratio = found ? resolved : ratio;
        }

        return buildCustomPortPosition(edge, ratio);
    }
    function onMove(event) {
        if (!state || state.pointerId !== event.pointerId || !state.mode) return;
        const dx = event.clientX - state.startClientX;
        const dy = event.clientY - state.startClientY;
        if (state.mode === 'pan') {
            state.doc.viewport.panX = state.startPanX + dx;
            state.doc.viewport.panY = state.startPanY + dy;
            applyTransform();
            return;
        }
        if (state.mode === 'drag' && state.activeNodeId) {
            const zoom = num(state.doc.viewport.zoom, 1) || 1;
            setNodePos(
                state.activeNodeId,
                state.nodeStartX + (dx / zoom),
                state.nodeStartY + (dy / zoom)
            );
            renderAll();
            return;
        }
        if (state.mode === 'resize' && state.resizeNodeId) {
            const zoom = num(state.doc.viewport.zoom, 1) || 1;
            const nextWidth = Math.round(clamp(
                state.resizeStartWidth + (dx / zoom),
                state.resizeMinWidth,
                1500
            ));
            const nextHeight = Math.round(clamp(
                state.resizeStartHeight + (dy / zoom),
                state.resizeMinHeight,
                1200
            ));
            setNodeSize(state.resizeNodeId, nextWidth, nextHeight);
            renderAll();
            return;
        }
        if (state.mode === 'port-hold') {
            if (Math.hypot(dx, dy) >= PORT_CONNECT_MOVE_THRESHOLD) {
                const startedConnect = beginConnectFromActivePort(event.clientX, event.clientY);
                if (!startedConnect) {
                    clearPortHoldTimer();
                    state.mode = 'port-drag';
                    if (stage instanceof HTMLElement) stage.style.cursor = 'grabbing';
                }
            }
            return;
        }
        if (state.mode === 'port-drag' && state.activePortId && state.activePortNodeId) {
            const anchor = computePerimeterAnchor(
                state.activePortNodeId,
                event.clientX,
                event.clientY,
                state.activePortId
            );
            if (anchor) {
                const meta = portMeta(state.activePortId);
                if (meta) {
                    meta.port.position = anchor;
                    renderAll();
                }
            }
            return;
        }
        if (state.mode === 'connect') {
            const targetPort = resolveInputPortTarget(
                event.clientX,
                event.clientY,
                state.connectFromPortId,
                state.connectEdgeId
            );
            const targetPortId = targetPort?.dataset?.portId ?? null;
            setConnectHover(targetPortId);
            if (targetPort) {
                const snapped = portPoint(targetPort);
                if (snapped) {
                    state.previewX = snapped.x;
                    state.previewY = snapped.y;
                }
            } else {
                const world = worldFromClient(event.clientX, event.clientY);
                state.previewX = world.x;
                state.previewY = world.y;
            }
            renderEdges();
        }
    }
    function onUp(event) {
        const mode = state?.mode;
        let needsEdgeRefresh = false;
        if (mode === 'connect') {
            const target = resolveInputPortTarget(
                event.clientX,
                event.clientY,
                state.connectFromPortId,
                state.connectEdgeId
            );
            const targetPortId =
                target?.dataset?.portId ||
                state.hoverInputPortId ||
                state.activeConnectTargetId ||
                null;
            finishConnect(targetPortId);
            setConnectHover(null);
            renderEdges();
            scheduleNotify();
            needsEdgeRefresh = true;
        }
        if (mode === 'port-hold') {
            const movedDistance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
            if (movedDistance < PORT_CONNECT_MOVE_THRESHOLD) {
                const startedConnect = beginConnectFromActivePort(event.clientX, event.clientY);
                if (startedConnect) {
                    const target = resolveInputPortTarget(
                        event.clientX,
                        event.clientY,
                        state.connectFromPortId,
                        state.connectEdgeId
                    );
                    const targetPortId =
                target?.dataset?.portId ||
                state.hoverInputPortId ||
                state.activeConnectTargetId ||
                null;
            finishConnect(targetPortId);
                    renderEdges();
                    scheduleNotify();
                }
            }
        }
        if (mode === 'pan' || mode === 'drag' || mode === 'port-drag' || mode === 'resize') {
            scheduleNotify();
        }
        clearPortHoldTimer();
        clearInteraction(event?.pointerId ?? null);
        if (needsEdgeRefresh) {
            renderEdges();
        }
    }
    function onWheel(event) {
        if (!state || !stage) return;
        event.preventDefault();
        const nextZoom = state.doc.viewport.zoom * (event.deltaY < 0 ? 1.08 : 0.92);
        const zoom = clamp(nextZoom, 0.55, 1.9);
        const rect = stage.getBoundingClientRect();
        const lx = event.clientX - rect.left;
        const ly = event.clientY - rect.top;
        const wx = (lx - state.doc.viewport.panX) / state.doc.viewport.zoom;
        const wy = (ly - state.doc.viewport.panY) / state.doc.viewport.zoom;
        state.doc.viewport.zoom = zoom;
        state.doc.viewport.panX = lx - wx * zoom;
        state.doc.viewport.panY = ly - wy * zoom;
        applyTransform();
        scheduleNotify();
    }
    function selectNode(nodeId) {
        if (!state) return;
        state.selectedNodeId = nodeId || null;
        applySelectedNodeStyles();
        notifyNodeSelected(state.selectedNodeId);
    }

    function cloneDoc(doc) {
        return normalizeDoc(parseDoc(serialize(doc)));
    }

    function hardResetPositionState(doc) {
        if (!Array.isArray(doc?.nodes)) return;
        doc.nodes.forEach((node) => {
            node.x = Math.round(num(node.x, 0));
            node.y = Math.round(num(node.y, 0));
        });
    }

    function applyPortLayoutForDoc(doc, mode) {
        const normalized = normalizeLayoutDirection(mode);
        if (!Array.isArray(doc?.nodes)) return normalized;
        for (const node of doc.nodes) {
            ensureExceptionPort(node);
            const inputPorts = node.ports.filter((port) => String(port.direction ?? '').toLowerCase() === 'input');
            const outputPorts = node.ports.filter((port) => String(port.direction ?? '').toLowerCase() === 'output');
            assignDirectionalPortPositions(inputPorts, 'input', normalized);
            assignDirectionalPortPositions(outputPorts, 'output', normalized);
        }
        return normalized;
    }

    function applyPortLayout(mode) {
        if (!state?.doc) return normalizeLayoutDirection(mode);
        const nextDoc = cloneDoc(state.doc);
        const normalized = applyPortLayoutForDoc(nextDoc, mode);
        state.doc = nextDoc;
        state.layoutDirection = normalized;
        return normalized;
    }

    function createDelay(x, y) {
        createActivityNode('delay', 'delay', x, y, { offsetX: 140, offsetY: 88, width: 290, height: 230, data: { durationMs: '1000' }, context: { reads: [], writes: [] } });
    }

    function createChatInput(x, y) {
        createActivityNode('chat-input', 'chat-input', x, y, { offsetX: 220, offsetY: 90, width: 500, height: 280, data: { inputText: 'Hello' }, context: { reads: [], writes: ['UserMessage'] } });
    }

    function createChatOutput(x, y) {
        createActivityNode('chat-output', 'chat-output', x, y, { offsetX: 190, offsetY: 86, width: 370, height: 230, data: {}, context: { reads: ['ModelResponse'], writes: [] } });
    }

    function setContextFocusInternal(value) {
        if (!state) return;
        state.contextFocusVar = String(value ?? '').trim();
        applyContextFocusStyles();
    }

    function getDndDebugStatsInternal() {
        return state?.dndDebug ? JSON.parse(JSON.stringify(state.dndDebug)) : null;
    }

    function resetDndDebugStatsInternal() {
        if (!state) return false;
        state.dndDebug = createEmptyDndDebugStats();
        recordDndEvent('reset', 'Diagnostics reset.');
        return true;
    }

    function renderPorts(node) {
        return window.EditorRendering.renderPorts(node);
    }

    function renderNode(node, doc) {
        return window.EditorRendering.renderNode(node, doc);
    }

    function nodeById(id) {
        return state.doc.nodes.find((n) => n.id === id) || null;
    }

    function edgeById(id) {
        return state.doc.edges.find((e) => e.id === id) || null;
    }

    function inputEdge(portId) {
        return state.doc.edges.find((e) => e.to === portId) || null;
    }

    function portMeta(portId) {
        for (const node of state.doc.nodes) {
            const port = node.ports.find((p) => p.id === portId);
            if (port) return { node, port };
        }
        return null;
    }

    function canAttach(portId, currentEdgeId) {
        return !state.doc.edges.some((edge) => edge.to === portId && edge.id !== currentEdgeId);
    }

    function canConnectPorts(fromPortId, toPortId, currentEdgeId = null) {
        const source = portMeta(fromPortId);
        const target = portMeta(toPortId);
        if (!source || !target) return false;
        if (source.port.direction !== 'output' || target.port.direction !== 'input') return false;
        if (!typesCompatible(source.port.type, target.port.type)) return false;
        return canAttach(toPortId, currentEdgeId);
    }

    function clearConnectHover() {
        if (!(nodesLayer instanceof Element)) return;
        nodesLayer.querySelectorAll('.port.port-connect-target').forEach((port) => {
            port.classList.remove('port-connect-target');
        });
        nodesLayer.querySelectorAll('.port-match').forEach((port) => {
            port.classList.remove('port-match');
        });
    }

    function setConnectHover(portId) {
        if (state.hoverInputPortId === portId) return;
        state.hoverInputPortId = portId || null;
        state.activeConnectTargetId = portId || null;
        clearConnectHover();
        if (!state.hoverInputPortId) return;
        const target = portById(state.hoverInputPortId);
        if (target) target.classList.add('port-connect-target');
    }

    function resolveInputPortTarget(clientX, clientY, fromPortId, currentEdgeId = null) {
        if (!fromPortId) return null;
        const pointed = asElement(document.elementFromPoint(clientX, clientY))?.closest('.port[data-port-direction="input"]');
        if (pointed instanceof HTMLElement) {
            const pointedId = pointed.dataset?.portId;
            if (pointedId && canConnectPorts(fromPortId, pointedId, currentEdgeId)) {
                return pointed;
            }
        }

        let nearest = null;
        let minDistance = Number.POSITIVE_INFINITY;
        const inputPorts = nodesLayer.querySelectorAll('.port[data-port-direction="input"]');
        inputPorts.forEach((candidate) => {
            if (!(candidate instanceof HTMLElement)) return;
            const candidateId = candidate.dataset?.portId;
            if (!candidateId || !canConnectPorts(fromPortId, candidateId, currentEdgeId)) return;
            const rect = candidate.getBoundingClientRect();
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);
            const distance = Math.hypot(clientX - centerX, clientY - centerY);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = candidate;
            }
        });

        return minDistance <= PORT_CONNECT_SNAP_RADIUS ? nearest : null;
    }

    function clearInvalidPort() {
        if (state.invalidTimer) {
            window.clearTimeout(state.invalidTimer);
            state.invalidTimer = null;
        }
        if (!state.invalidPortId) return;
        const previous = portById(state.invalidPortId);
        if (previous) previous.classList.remove('port-invalid');
        state.invalidPortId = null;
    }

    function markPortInvalid(portId) {
        clearInvalidPort();
        state.invalidPortId = portId;
        const next = portById(portId);
        if (next) next.classList.add('port-invalid');
        state.invalidTimer = window.setTimeout(() => {
            clearInvalidPort();
        }, 420);
    }
    //////////
    const portById = (id) => {
        if (!id) return null;
        return nodesLayer.querySelector(`[data-port-id="${selEsc(id)}"]`);
    };

    function portPoint(port) {
        if (!(port instanceof HTMLElement)) return null;

        const nodeEl = port.closest('.node[data-node-id]');
        if (!(nodeEl instanceof HTMLElement)) return null;

        const nodeId = nodeEl.dataset.nodeId;
        const node = nodeId ? nodeById(nodeId) : null;
        if (!node) return null;

        const left = port.offsetLeft + port.offsetWidth / 2;
        const top = port.offsetTop + port.offsetHeight / 2;
        const yOffset = 8;

        return {
            x: node.x + left,
            y: node.y + top - yOffset
        };
    }

    function renderEdges() {
        return window.EditorRendering.renderEdges({
            state,
            svg,
            portById,
            portMeta,
            isExceptionPort,
            portPoint,
            SVG_NS
        });
    }

    const renderNodes = () => {
        nodesLayer.innerHTML = '';

        state.doc.nodes.forEach((node) => {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderNode(node, state.doc).trim();

            const el = wrapper.firstElementChild;
            if (!(el instanceof HTMLElement)) return;

            el.dataset.nodeId = node.id;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;

            if (node.width != null) el.style.width = `${node.width}px`;
            if (node.height != null) el.style.height = `${node.height}px`;

            decorateNodeElement(el);

            const reads = (Array.isArray(node.context?.reads) ? node.context.reads : [])
                .map((v) => String(v ?? '').trim())
                .filter((v) => v.length > 0);

            const writes = (Array.isArray(node.context?.writes) ? node.context.writes : [])
                .map((v) => String(v ?? '').trim())
                .filter((v) => v.length > 0);

            el.dataset.ctxReads = reads.join('|');
            el.dataset.ctxWrites = writes.join('|');

            applyScope(el);
            nodesLayer.appendChild(el);
            bindNode(el);
        });

        applySelectedNodeStyles();
        applyInvalidPortStyle();
        applyContextFocusStyles();

        nodesLayer.querySelectorAll('.port-match').forEach((p) => {
            p.classList.remove('port-match');
        });

        if (state.activeConnectTargetId) {
            const target = portById(state.activeConnectTargetId);
            if (target) target.classList.add('port-match');

            const source = portById(state.connectFromPortId);
            if (source) source.classList.add('port-match');
        }

        if (state.hoverInputPortId) {
            const targetPort = portById(state.hoverInputPortId);
            if (targetPort) targetPort.classList.add('port-connect-target');
        }
    };

    const recalcCounter = () => {
        state.edgeCounter = state.doc.edges.reduce((max, e) => {
            const match = /^edge-(\d+)$/i.exec(e.id || '');
            return Math.max(max, match ? Number.parseInt(match[1], 10) : 0);
        }, 0);
    };

    const runPortGeometryCheck = () => {
        if (!nodesLayer || !state?.dndDebug) return;
        const readPxVar = (name, fallback) => {
            const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const n = Number.parseFloat(raw.replace('px', '').trim());
            return Number.isFinite(n) ? n : fallback;
        };
        const half = readPxVar('--se-port-half', 9);
        const bottomOut = readPxVar('--se-port-bottom-out', 18);
        const ports = nodesLayer.querySelectorAll('.port');
        let issues = 0;
        ports.forEach((port) => {
            const cs = getComputedStyle(port);
            if (port.classList.contains('port-top') && Math.abs(parseFloat(cs.top) - 0) > 0.75) issues += 1;
            if (port.classList.contains('port-right') && Math.abs(parseFloat(cs.right) + half) > 0.75) issues += 1;
            if (port.classList.contains('port-left') && Math.abs(parseFloat(cs.left) + half) > 0.75) issues += 1;
            if (port.classList.contains('port-bottom') && Math.abs(parseFloat(cs.bottom) + bottomOut) > 0.75) issues += 1;
        });
        state.dndDebug.portGeometryIssues = issues;
    };

    const renderAll = () => {
        renderNodes();
        renderEdges();
        applyTransform();
        recalcCounter();
        runPortGeometryCheck();
    };

    const nextEdgeId = () => {
        state.edgeCounter += 1;
        return `edge-${state.edgeCounter}`;
    };

    const nextNodeId = (prefix) => {
        let i = 1;
        while (state.doc.nodes.some((n) => n.id === `${prefix}-${i}`)) i += 1;
        return `${prefix}-${i}`;
    };

    const setNodePos = (nodeId, x, y) => {
        const n = nodeById(nodeId);
        if (!n) return;
        n.x = x;
        n.y = y;
    };

    const setNodeSize = (nodeId, width, height) => {
        const n = nodeById(nodeId);
        if (!n) return;

        n.width = normalizeNodeSize(width, minNodeWidth(n.type), 1500);
        n.height = normalizeNodeSize(height, minNodeHeight(n.type), 1200);
    };

    const setResizeCursorActive = (active) => {
        if (rootElement instanceof Element) {
            rootElement.classList.toggle('is-resizing-cursor', Boolean(active));
        }
    };

    const setNodeResizingState = (nodeId, active) => {
        if (!nodeId) return;

        const nodeEl = nodesLayer.querySelector(`.node[data-node-id="${selEsc(nodeId)}"]`);
        if (nodeEl instanceof HTMLElement) {
            nodeEl.classList.toggle('is-resizing', Boolean(active));
        }
    };

    const removeNode = (nodeId) => {
        const node = nodeById(nodeId);
        if (!node) return;

        const portIds = new Set(node.ports.map((p) => p.id));

        state.doc.nodes = state.doc.nodes.filter((n) => n.id !== nodeId);

        state.doc.edges = state.doc.edges.filter((edge) => {
            if (portIds.has(edge.from)) return false;
            if (edge.to && portIds.has(edge.to)) return false;
            if (edge.fromNode === nodeId || edge.toNode === nodeId) return false;
            return true;
        });

        if (state.selectedNodeId === nodeId) selectNode(null);

        renderAll();
        scheduleNotify();
    };

    const setCapture = (id) => {
        try { stage.setPointerCapture?.(id); } catch { }
    };

    const relCapture = (id) => {
        try {
            if (stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
        } catch { }
    };

    const clearPortHoldTimer = () => {
        if (state.portHoldTimer) {
            window.clearTimeout(state.portHoldTimer);
            state.portHoldTimer = null;
        }
    };

    const startPortGesture = (pointerId, portId, clientX, clientY) => {
        const meta = portMeta(portId);
        if (!meta) return;

        clearPortHoldTimer();

        state.pointerId = pointerId;
        state.mode = 'port-hold';
        state.activePortId = portId;
        state.activePortNodeId = meta.node.id;
        state.activePortDirection = String(meta.port.direction ?? '').toLowerCase();
        state.startClientX = clientX;
        state.startClientY = clientY;

        setCapture(pointerId);

        state.portHoldTimer = window.setTimeout(() => {
            if (
                state.pointerId !== pointerId ||
                state.mode !== 'port-hold' ||
                state.activePortId !== portId
            ) return;

            state.mode = 'port-drag';
            if (stage instanceof HTMLElement) {
                stage.style.cursor = 'grabbing';
            }
        }, PORT_HOLD_MS);
    };

    const beginReconnect = (pointerId, edgeId, clientX, clientY) => {
        const index = state.doc.edges.findIndex((edge) => edge.id === edgeId);
        if (index < 0) return;
        const [edge] = state.doc.edges.splice(index, 1);
        startConnect(pointerId, edge.from, clientX, clientY, edge);
    };

    const startConnect = (pointerId, fromPortId, clientX, clientY, reconnectEdge = null) => {
        const world = worldFromClient(clientX, clientY);
        state.pointerId = pointerId;
        state.mode = 'connect';
        state.connectFromPortId = fromPortId;
        state.connectEdgeId = reconnectEdge?.id ?? null;
        state.reconnectEdge = reconnectEdge;
        state.previewX = world.x;
        state.previewY = world.y;
        setCapture(pointerId);
        renderEdges();
    };

    const beginConnectFromActivePort = (clientX, clientY) => {
        const portId = state.activePortId;
        if (!portId) return false;
        clearPortHoldTimer();
        if (state.activePortDirection === 'output') {
            startConnect(state.pointerId, portId, clientX, clientY);
            return true;
        }
        const existingInputEdge = inputEdge(portId);
        if (existingInputEdge) {
            beginReconnect(state.pointerId, existingInputEdge.id, clientX, clientY);
            return true;
        }
        return false;
    };

    const addEdge = (fromPortId, toPortId = null, loose = null) => {
        if (!toPortId) return false;
        if (state.doc.edges.some((edge) => edge.from === fromPortId && edge.to === toPortId)) return false;
        const sourceMeta = portMeta(fromPortId);
        const targetMeta = portMeta(toPortId);
        state.doc.edges.push({
            id: nextEdgeId(),
            from: fromPortId,
            to: toPortId,
            fromNode: sourceMeta?.node.id ?? null,
            toNode: targetMeta?.node.id ?? null,
            looseX: loose ? loose.x : null,
            looseY: loose ? loose.y : null
        });
        return true;
    };

    const finishConnect = (targetPortId) => {
        if (!state.connectFromPortId) return;
        const previewPoint = { x: state.previewX, y: state.previewY };
        const sourceMeta = portMeta(state.connectFromPortId);
        const targetMeta = targetPortId ? portMeta(targetPortId) : null;

        if (state.reconnectEdge) {
            const originalEdge = { ...state.reconnectEdge };
            const nextEdge = {
                ...state.reconnectEdge,
                from: state.connectFromPortId,
                fromNode: sourceMeta?.node.id ?? null,
                to: null,
                toNode: null,
                looseX: previewPoint.x,
                looseY: previewPoint.y
            };
            if (targetPortId && canConnectPorts(state.connectFromPortId, targetPortId, state.connectEdgeId)) {
                nextEdge.to = targetPortId;
                nextEdge.toNode = targetMeta?.node.id ?? null;
                nextEdge.looseX = null;
                nextEdge.looseY = null;
                state.doc.edges.push(nextEdge);
            } else {
                if (targetPortId) markPortInvalid(targetPortId);
                if (originalEdge.to) state.doc.edges.push(originalEdge);
            }
            state.reconnectEdge = null;
            return;
        }

        if (targetPortId) {
            if (canConnectPorts(state.connectFromPortId, targetPortId, state.connectEdgeId)) {
                addEdge(state.connectFromPortId, targetPortId);
            } else {
                markPortInvalid(targetPortId);
            }
        }
    };
    /////
    const rememberDraggedTemplate = (template) => {
        const normalized = String(template ?? '').trim().toLowerCase();
        if (!normalized) return;

        state.draggedActivityTemplate = normalized;
        state.lastDraggedActivityTemplate = normalized;
        state.lastDraggedActivityAt = Date.now();

        if (state.dndDebug) {
            state.dndDebug.lastTemplate = normalized;
            state.dndDebug.lastUpdatedAt = new Date().toISOString();
        }
    };

    const activityFromTransfer = (dt) => {
        if (dt) {
            const values = [
                dt.getData('text/activity-template'),
                dt.getData('application/x-activity-template'),
                dt.getData('text/plain')
            ];

            for (const v of values) {
                if (v && v.trim()) {
                    const normalized = v.trim().toLowerCase();
                    rememberDraggedTemplate(normalized);
                    return normalized;
                }
            }
        }

        if (state.draggedActivityTemplate && String(state.draggedActivityTemplate).trim()) {
            return String(state.draggedActivityTemplate).toLowerCase();
        }

        if (
            state.lastDraggedActivityTemplate &&
            (Date.now() - state.lastDraggedActivityAt <= 3000)
        ) {
            return String(state.lastDraggedActivityTemplate).toLowerCase();
        }

        return null;
    };

    const hasActivityPayload = (dt) => {
        if (state.draggedActivityTemplate && String(state.draggedActivityTemplate).trim()) {
            return true;
        }

        if (!dt) return false;

        const types = Array.from(dt.types || []);
        return (
            types.includes('text/activity-template') ||
            types.includes('application/x-activity-template') ||
            types.includes('text/plain')
        );
    };

    const resolveActivityTemplateItem = (event) => {
        const pick = (node) => {
            if (!(node instanceof Element)) return null;
            if (node.dataset?.activityTemplate) return node;
            return node.closest?.('[data-activity-template]') || null;
        };

        const direct = pick(event?.target);
        if (direct) return direct;

        const current = pick(event?.currentTarget);
        if (current) return current;

        if (typeof event?.composedPath === 'function') {
            for (const node of event.composedPath()) {
                const found = pick(node);
                if (found) return found;
            }
        }

        let n = event?.target;
        while (n) {
            if (n instanceof Element && n.dataset?.activityTemplate) return n;
            n = n.parentNode;
        }

        return null;
    };

    const onPaletteDragStart = (event) => {
        const item = resolveActivityTemplateItem(event) || event.currentTarget;
        const t = item?.dataset?.activityTemplate;
        if (!t) return;

        const normalized = String(t).trim().toLowerCase();
        rememberDraggedTemplate(normalized);

        bumpDndCounter('dragStartCount');
        recordDndEvent('dragstart', `template=${normalized}`);

        if (event.dataTransfer) {
            event.dataTransfer.setData('text/activity-template', normalized);
            event.dataTransfer.setData('application/x-activity-template', normalized);
            event.dataTransfer.setData('text/plain', normalized);
            event.dataTransfer.effectAllowed = 'copy';
        }
    };

    const onPalettePointerDown = (event) => {
        const item = resolveActivityTemplateItem(event);
        if (!item) return;

        const t = item.dataset?.activityTemplate;
        if (!t) return;

        const normalized = String(t).trim().toLowerCase();

        bumpDndCounter('pointerDownCount');
        recordDndEvent('pointerdown', `template=${normalized}`);
        rememberDraggedTemplate(normalized);
    };

    const onPaletteDragEnd = () => {
        bumpDndCounter('dragEndCount');
        recordDndEvent('dragend', `template=${String(state.lastDraggedActivityTemplate || '')}`);

        window.setTimeout(() => {
            state.draggedActivityTemplate = null;
        }, 450);
    };

    const onRootDragStart = (event) => {
        const item = resolveActivityTemplateItem(event);
        if (!item) return;
        onPaletteDragStart(event);
    };

    const createActivityNode = (prefix, type, x, y, options = {}) => {
        const nodeId = nextNodeId(prefix);

        state.doc.nodes.push({
            id: nodeId,
            type,
            name: typeof options.name === 'string' ? options.name : '',
            collapsed: Boolean(options.collapsed),
            x: Math.round(x - (options.offsetX ?? 170)),
            y: Math.round(y - (options.offsetY ?? 110)),
            width: options.width ?? null,
            height: options.height ?? null,
            data: options.data ?? {},
            context: options.context ?? { reads: [], writes: [] },
            ports: options.ports ?? [
                { id: `${nodeId}-in`, name: 'Input', direction: 'input', type: 'string', position: 'left' },
                { id: `${nodeId}-out`, name: 'Output', direction: 'output', type: 'string', position: 'right' }
            ]
        });
    };

    const onDragEnter = (event) => {
        event.preventDefault();
        event.stopPropagation();

        bumpDndCounter('dragEnterCount');

        const tag = asElement(event.target)?.tagName?.toLowerCase?.() || 'unknown';
        recordDndEvent('dragenter', `target=${tag}`);

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    const onDragOver = (event) => {
        event.preventDefault();
        event.stopPropagation();
        bumpDndCounter('dragOverCount');

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    };

    const onDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();

        bumpDndCounter('dropCount');

        const t = activityFromTransfer(event.dataTransfer);
        if (!t) {
            bumpDndCounter('dropRejectedMissingTemplateCount');

            const transferTypes = event.dataTransfer
                ? Array.from(event.dataTransfer.types || []).join(',')
                : 'none';

            recordDndEvent('drop-rejected-missing-template', `transferTypes=${transferTypes || 'none'}`);
            state.draggedActivityTemplate = null;
            return;
        }

        if (state.dndDebug) {
            state.dndDebug.lastTemplate = t;
        }

        const beforeNodeCount = state.doc.nodes.length;
        const p = worldFromClient(event.clientX, event.clientY);

        const map = {
            'delay': createDelay,
            'delayactivity': createDelay,
            'chat-input': createChatInput,
            'chatinput': createChatInput,
            'input': createChatInput,
            'chat-output': createChatOutput,
            'chatoutput': createChatOutput,
            'output': createChatOutput
        };

        const fn = map[t];
        if (!fn) {
            const safePrefix = String(t || 'activity')
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'activity';

            createActivityNode(safePrefix, t, p.x, p.y, {
                width: minNodeWidth(t),
                height: minNodeHeight(t),
                data: {},
                context: { reads: [], writes: [] }
            });

            bumpDndCounter('dropRejectedUnknownTemplateCount');
            recordDndEvent('drop-fallback-generic', `template=${t}`);
        } else {
            fn(p.x, p.y);
        }

        bumpDndCounter('dropAcceptedCount');

        const createdNode =
            state.doc.nodes.length > beforeNodeCount
                ? state.doc.nodes[state.doc.nodes.length - 1]
                : null;

        recordDndEvent('drop-accepted', `template=${t}; node=${createdNode?.id || 'unknown'}`);

        applyPortLayout(state.layoutDirection);
        renderAll();
        scheduleNotify(true);

        window.setTimeout(() => {
            state.draggedActivityTemplate = null;
        }, 120);
    };

    const bindPalette = () => { };
    //////
    const applyDocumentInternal = (json) => {
        const parsed = parseDoc(json);
        if (!parsed) return false;

        const rawEdgeCount = Array.isArray(parsed.edges) ? parsed.edges.length : 0;

        state.doc = normalizeDoc(parsed);
        applyPortLayout(state.layoutDirection);

        clearInteraction(state.pointerId);
        renderAll();
        selectNode(state.selectedNodeId);

        if (rawEdgeCount !== state.doc.edges.length) {
            scheduleNotify(true);
        }

        return true;
    };

    const arrangeDocument = (mode = 'horizontal') => {
        const layoutMode = normalizeLayoutDirection(mode);
        const engine = window.scriptEditorLayout;

        if (!engine || typeof engine.arrangeDocument !== 'function') return false;

        const workingDoc = cloneDoc(state.doc);
        const arranged = engine.arrangeDocument(workingDoc, layoutMode);
        if (!arranged || typeof arranged !== 'object') return false;

        const nextDoc = normalizeDoc(arranged);

        state.layoutDirection = applyPortLayoutForDoc(nextDoc, layoutMode);
        hardResetPositionState(nextDoc);

        state.doc = nextDoc;

        clearInteraction(state.pointerId);
        renderAll();
        selectNode(state.selectedNodeId);
        scheduleNotify(true);

        return true;
    };

    const alignDocument = (mode = 'vertical') => {
        const layoutMode = normalizeLayoutDirection(mode);
        const nextDoc = cloneDoc(state.doc);

        if (!Array.isArray(nextDoc.nodes) || nextDoc.nodes.length === 0) return false;

        if (layoutMode === 'vertical') {
            const avgCenterX =
                nextDoc.nodes.reduce((sum, node) => {
                    const width = node.width ?? minNodeWidth(node.type);
                    return sum + node.x + width / 2;
                }, 0) / nextDoc.nodes.length;

            nextDoc.nodes.forEach((node) => {
                const width = node.width ?? minNodeWidth(node.type);
                node.x = Math.round(avgCenterX - width / 2);
            });
        } else {
            const avgCenterY =
                nextDoc.nodes.reduce((sum, node) => {
                    const height = node.height ?? minNodeHeight(node.type);
                    return sum + node.y + height / 2;
                }, 0) / nextDoc.nodes.length;

            nextDoc.nodes.forEach((node) => {
                const height = node.height ?? minNodeHeight(node.type);
                node.y = Math.round(avgCenterY - height / 2);
            });
        }

        state.layoutDirection = applyPortLayoutForDoc(nextDoc, layoutMode);
        hardResetPositionState(nextDoc);

        state.doc = nextDoc;

        clearInteraction(state.pointerId);
        renderAll();
        selectNode(state.selectedNodeId);
        scheduleNotify(true);

        return true;
    };

    const setLayoutDirectionInternal = (mode) => {
        state.layoutDirection = applyPortLayout(mode);

        clearInteraction(state.pointerId);
        renderAll();
        selectNode(state.selectedNodeId);
        scheduleNotify();

        return state.layoutDirection;
    };

    const updateNodeVisualsInternal = (nodeId, name, collapsed, rearrange = false) => {
        const normalizedId = String(nodeId ?? '').trim();
        if (!normalizedId) return false;

        const node = nodeById(normalizedId);
        if (!node) return false;

        node.name = String(name ?? '').trim();
        node.collapsed = Boolean(collapsed);

        if (rearrange) {
            const arranged = arrangeDocument(state.layoutDirection);
            if (!arranged) {
                clearInteraction(state.pointerId);
                renderAll();
                selectNode(normalizedId);
                scheduleNotify();
            }
            return true;
        }

        clearInteraction(state.pointerId);
        renderAll();
        selectNode(normalizedId);
        scheduleNotify();

        return true;
    };

    function initializeEditorInternal(root, initialJson, dotNetRef) {
        rootElement = root;
        stage = root.querySelector('[data-editor-stage]');
        canvasScroller = stage?.closest?.('.canvas-scroller') || null;
        content = root.querySelector('[data-editor-content]');
        nodesLayer = root.querySelector('[data-nodes-layer]');
        svg = root.querySelector('.connections');
        zoomValue = root.querySelector('[data-zoom-value]');

        if (!(stage instanceof Element) || !(content instanceof Element) || !(nodesLayer instanceof Element) || !(svg instanceof SVGElement)) {
            return null;
        }

        if (!state) {
            const parsed = parseDoc(initialJson);
            state = {
                doc: normalizeDoc(parsed || {}),
                dotNetRef: dotNetRef ?? null,
                layoutDirection: 'vertical',
                edgeCounter: 0,
                pointerId: null,
                mode: null,
                notifyTimer: null,
                activeConnectTargetId: null,
                connectFromPortId: null,
                connectEdgeId: null,
                reconnectEdge: null,
                hoverInputPortId: null,
                previewX: 0,
                previewY: 0,
                invalidPortId: null,
                invalidTimer: null,
                resizeNodeId: null,
                resizeStartWidth: 0,
                resizeStartHeight: 0,
                resizeMinWidth: 0,
                resizeMinHeight: 0,
                selectedNodeId: null,
                draggedActivityTemplate: null,
                lastDraggedActivityTemplate: null,
                lastDraggedActivityAt: 0,
                scopeAttr: root.getAttributeNames().find((n) => n.startsWith('b-')) || null,
                dndDebug: createEmptyDndDebugStats()
            };
        } else if (dotNetRef != null) {
            state.dotNetRef = dotNetRef;
        }

        if (initialJson !== undefined && initialJson !== null) {
            applyDocumentInternal(initialJson);
        }

        if (!state.dndDebug) {
            const nowIso = new Date().toISOString();
            state.dndDebug = {
                sessionStartedAt: nowIso,
                lastUpdatedAt: nowIso,
                initStartedAt: '',
                initStartAt: '',
                initReadyAt: '',
                initElapsedMs: null,
                initParseDoneAt: '',
                initParseElapsedMs: null,
                initListenersReadyAt: '',
                initListenersElapsedMs: null,
                blazorAfterRenderAt: '',
                beforeInitializeAt: '',
                afterInitializeInvokeAt: '',
                restoreStartedAt: '',
                restoreDoneAt: '',
                restoreElapsedMs: null,
                pointerDownCount: 0,
                dragStartCount: 0,
                dragEnterCount: 0,
                dragOverCount: 0,
                dropCount: 0,
                dropAcceptedCount: 0,
                dropRejectedMissingTemplateCount: 0,
                dropRejectedUnknownTemplateCount: 0,
                dragEndCount: 0,
                lastTemplate: '',
                recentEvents: []
            };
        }

        const initStartMark = mark('init-started');
        state.dndDebug.initStartedAt = initStartMark.iso;
        state.dndDebug.initStartAt = initStartMark.iso;
        state.dndDebug.lastUpdatedAt = initStartMark.iso;

        applyPortLayout(state.layoutDirection);
        renderAll();
        bindPalette();

        root.addEventListener('pointerdown', onPalettePointerDown, true);
        root.addEventListener('dragstart', onRootDragStart, true);
        root.addEventListener('dragend', onPaletteDragEnd, true);

        stage.addEventListener('pointerdown', onStageDown);
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerup', onUp);
        stage.addEventListener('pointercancel', onUp);
        stage.addEventListener('wheel', onWheel, { passive: false });
        stage.addEventListener('dragenter', onDragEnter);
        stage.addEventListener('dragover', onDragOver);
        stage.addEventListener('drop', onDrop);

        if (canvasScroller && canvasScroller !== stage) {
            canvasScroller.addEventListener('dragenter', onDragEnter);
            canvasScroller.addEventListener('dragover', onDragOver);
            canvasScroller.addEventListener('drop', onDrop);
        }

        const listenersReadyMark = mark('listeners-ready');
        state.dndDebug.initListenersReadyAt = listenersReadyMark.iso;
        state.dndDebug.initListenersElapsedMs = Math.round(
            Math.max(
                0,
                (listenersReadyMark.ts ?? 0) - (window.__scriptEditorInitStartedAt ?? listenersReadyMark.ts ?? 0)
            )
        );
        state.dndDebug.lastUpdatedAt = listenersReadyMark.iso;

        const instance = {
            applyDocument: applyDocumentInternal,
            arrangeDocument,
            alignDocument,
            setLayoutDirection: setLayoutDirectionInternal,
            setContextFocus: setContextFocusInternal,
            updateNodeVisuals: updateNodeVisualsInternal,
            getDndDebugStats: getDndDebugStatsInternal,
            resetDndDebugStats: resetDndDebugStatsInternal,
            setDotNetRef: (ref) => { state.dotNetRef = ref; }
        };

        editors.set(root, instance);

        const readyMark = mark('init-ready');
        state.dndDebug.initReadyAt = readyMark.iso;
        state.dndDebug.initElapsedMs = Math.round(
            Math.max(
                0,
                (readyMark.ts ?? 0) - (window.__scriptEditorInitStartedAt ?? readyMark.ts ?? 0)
            )
        );
        state.dndDebug.lastUpdatedAt = readyMark.iso;
        return instance;
    }

    function createEditorInstance(root, initialJson, dotNetRef) {
        const existing = editors.get(root);
        if (existing) {
            if (dotNetRef != null && typeof existing.setDotNetRef === 'function') {
                existing.setDotNetRef(dotNetRef);
            }
            if (initialJson !== undefined && initialJson !== null && typeof existing.applyDocument === 'function') {
                existing.applyDocument(initialJson);
            }
            return existing;
        }

        return initializeEditorInternal(root, initialJson, dotNetRef);
    }

    function initialize(root, initialJson, dotNetRef) {
        if (!(root instanceof Element)) return;
        return createEditorInstance(root, initialJson, dotNetRef);
    }

    /////
    function applyDocument(root, json) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        return editor ? editor.applyDocument(json) : false;
    }

    function arrange(root, mode) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        return editor && typeof editor.arrangeDocument === 'function'
            ? editor.arrangeDocument(mode)
            : false;
    }

    function align(root, mode) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        return editor && typeof editor.alignDocument === 'function'
            ? editor.alignDocument(mode)
            : false;
    }

    function setLayoutDirection(root, mode) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        if (!editor || typeof editor.setLayoutDirection !== 'function') return false;
        editor.setLayoutDirection(mode);
        return true;
    }

    function setContextFocus(root, value) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        if (!editor || typeof editor.setContextFocus !== 'function') return false;
        editor.setContextFocus(value);
        return true;
    }

    function updateNodeVisuals(root, nodeId, name, collapsed, rearrange) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        if (!editor || typeof editor.updateNodeVisuals !== 'function') return false;
        return editor.updateNodeVisuals(nodeId, name, collapsed, rearrange);
    }

    function getDndDebugStats(root) {
        if (!(root instanceof Element)) return null;
        const editor = editors.get(root);
        if (!editor || typeof editor.getDndDebugStats !== 'function') return null;
        return editor.getDndDebugStats();
    }

    function resetDndDebugStats(root) {
        if (!(root instanceof Element)) return false;
        const editor = editors.get(root);
        if (!editor || typeof editor.resetDndDebugStats !== 'function') return false;
        return editor.resetDndDebugStats();
    }

    window.scriptEditor = window.scriptEditor || {};

    Object.assign(window.scriptEditor, {
        initialize,
        applyDocument,
        arrange,
        align,
        setLayoutDirection,
        setContextFocus,
        updateNodeVisuals,
        getDndDebugStats,
        resetDndDebugStats,
        __ready: true
    });

})();

