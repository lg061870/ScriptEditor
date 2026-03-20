(function () {
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    const CUSTOM_PORT_PATTERN = /^custom-(top|right|bottom|left)-(-?\d+(?:\.\d+)?)$/i;

    const esc = (v) => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    function readPxVar(name, fallback) {
        const root = document?.documentElement;
        if (!root) return fallback;
        const raw = getComputedStyle(root).getPropertyValue(name).trim();
        const value = Number.parseFloat(raw.replace('px', '').trim());
        return Number.isFinite(value) ? value : fallback;
    }

    function getPortGeometry() {
        return {
            half: readPxVar('--se-port-half', 9),
            bottomOut: readPxVar('--se-port-bottom-out', 18)
        };
    }

    function parseCustomPortPosition(position) {
        const match = CUSTOM_PORT_PATTERN.exec(String(position ?? '').trim().toLowerCase());
        if (!match) return null;

        return {
            edge: match[1],
            ratio: clamp(Number.parseFloat(match[2]), 0, 100)
        };
    }

    function portCls(position) {
        const pos = String(position ?? '').toLowerCase();
        const custom = parseCustomPortPosition(pos);

        if (custom) {
            return `port-${custom.edge}`;
        }

        switch (pos) {
            case 'top-left': return 'port-top port-top--left';
            case 'top-right': return 'port-top port-top--right';
            case 'bottom-left': return 'port-bottom port-bottom--left';
            case 'bottom-right': return 'port-bottom port-bottom--right';
            case 'left-upper': return 'port-left port-left--upper';
            case 'left-lower': return 'port-left port-left--lower';
            case 'right-upper': return 'port-right port-right--upper';
            case 'right-lower': return 'port-right port-right--lower';
            case 'right-middle': return 'port-right port-right--middle';
            case 'right': return 'port-right';
            case 'top': return 'port-top';
            case 'bottom': return 'port-bottom';
            default: return 'port-left';
        }
    }

    function portStyle(position) {
        const custom = parseCustomPortPosition(position);
        if (!custom) return '';
        const geo = getPortGeometry();

        const ratio = clamp(custom.ratio, 0, 100).toFixed(2);

        switch (custom.edge) {
            case 'top':
                return `left: calc(${ratio}% - ${geo.half}px); top: 0;`;
            case 'right':
                return `right: -${geo.half}px; top: calc(${ratio}% - ${geo.half}px);`;
            case 'bottom':
                return `left: calc(${ratio}% - ${geo.half}px); bottom: -${geo.bottomOut}px;`;
            case 'left':
                return `left: -${geo.half}px; top: calc(${ratio}% - ${geo.half}px);`;
            default:
                return '';
        }
    }

    function isExceptionPortLocal(port) {
        if (!port || typeof port !== 'object') return false;

        const direction = String(port.direction ?? '').trim().toLowerCase();
        if (direction !== 'output') return false;

        const id = String(port.id ?? '').trim().toLowerCase();
        const name = String(port.name ?? '').trim().toLowerCase();

        return (
            id.includes('exception') ||
            id.endsWith('-ex') ||
            name.includes('exception') ||
            name === 'error'
        );
    }

    function getPortGenderClass(port) {
        const g = String(port?.portGender ?? '').toLowerCase();

        if (g === 'female') return ' port-female';
        if (g === 'male') return ' port-male';
        if (String(port?.direction ?? '').toLowerCase() === 'input') return ' port-female';
        if (String(port?.direction ?? '').toLowerCase() === 'output') return ' port-male';

        return '';
    }

    function renderPorts(node) {
        if (!node || !Array.isArray(node.ports)) return '';

        return node.ports.map((p) => {
            if (!p || !p.id) return '';

            const isException = isExceptionPortLocal(p);
            const exceptionClass = isException ? ' port-exception' : '';
            const directionClass = String(p.direction ?? '').toLowerCase() === 'input' ? ' port-input' : '';
            const controlClass =
                String(p.type ?? '').toLowerCase() === 'control' ||
                String(p.name ?? '').toLowerCase().includes('control') ||
                String(p.id ?? '').toLowerCase().includes('control')
                    ? ' port-control'
                    : '';
            const typeClass = isException
                ? ' port-kind-exception'
                : controlClass
                    ? ' port-kind-control'
                    : (String(p.direction ?? '').toLowerCase() === 'input' ? ' port-kind-input' : ' port-kind-output');
            const baseClass = portCls(p.position);

            const style = portStyle(p.position);
            const styleAttr = style ? ` style="${esc(style)}"` : '';

            return `
        <span
          class="port ${baseClass}${exceptionClass}${directionClass}${controlClass}${typeClass}"
          ${styleAttr}
          title="${esc(p.name || p.id)}"
          aria-label="${esc(p.name || p.id)}"
          data-port-id="${esc(p.id)}"
          data-port-direction="${esc(p.direction)}"
          data-port-gender="${esc(p.portGender || '')}">
        </span>
      `.trim();

        }).join('');
    }

    window.EditorRendering = window.EditorRendering || {};
    window.EditorRendering.renderPorts = renderPorts;
    window.EditorRendering.isExceptionPort = isExceptionPortLocal;

})();
