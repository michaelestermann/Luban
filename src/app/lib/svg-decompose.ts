/**
 * Decompose an SVG object one level at a time.
 *
 * The pure part (`splitOneLevel`, `reframePart`, `readFrame`,
 * `computePartTransformation`) works on SVG text with an injectable DOM
 * parser/serializer, so it runs in the browser (native DOMParser) and in
 * node tests (@xmldom/xmldom). The browser-only helpers (`measurePartBBox`,
 * `loadDecomposeInfo`) are used by the editor action and the UI.
 */

import log from './log';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Elements that draw something and can become a part.
const RENDERABLE_TAGS = new Set([
    'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'use', 'image', 'svg', 'a', 'switch'
]);

// Definitions every part needs to render the same (gradients, CSS, clip paths, ...).
const DEFINITION_TAGS = new Set([
    'defs', 'style', 'symbol', 'clipPath', 'mask', 'linearGradient', 'radialGradient',
    'pattern', 'marker', 'filter'
]);

const CONTAINER_TAGS = new Set(['g', 'a', 'switch', 'svg']);

export interface DomDeps {
    parser?: { parseFromString(text: string, type: string): Document };
    serializer?: { serializeToString(node: Node): string };
}

export interface BBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Frame {
    viewBox: [number, number, number, number];
    preserveAspectRatio: string | null;
}

export interface PartTransformation {
    positionX: number;
    positionY: number;
    rotationZ: number;
    scaleX: number;
    scaleY: number;
    width: number;
    height: number;
}

const resolveDeps = (deps: DomDeps = {}) => ({
    parser: deps.parser || new DOMParser(),
    serializer: deps.serializer || new XMLSerializer()
});

const tagName = (el: Element): string => (el.localName || el.nodeName).replace(/^.*:/, '');

const elementChildren = (node: Node): Element[] => {
    const result: Element[] = [];
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === 1) {
            result.push(children[i] as Element);
        }
    }
    return result;
};

const isSvgElement = (el: Element) => !el.namespaceURI || el.namespaceURI === SVG_NS;

const isHidden = (el: Element) => {
    if ((el.getAttribute('display') || '').trim() === 'none') {
        return true;
    }
    const style = el.getAttribute('style') || '';
    return /(^|;)\s*display\s*:\s*none\s*(;|$)/i.test(style);
};

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const isVisual = (el: Element): boolean => isSvgElement(el) && RENDERABLE_TAGS.has(tagName(el)) && !isHidden(el) && hasGeometry(el);

function hasGeometry(el: Element): boolean {
    const tag = tagName(el);
    if (CONTAINER_TAGS.has(tag)) {
        return elementChildren(el).some(isVisual);
    }
    if (tag === 'path') {
        return (el.getAttribute('d') || '').trim() !== '';
    }
    if (tag === 'polyline' || tag === 'polygon') {
        return (el.getAttribute('points') || '').trim() !== '';
    }
    if (tag === 'text') {
        return (el.textContent || '').trim() !== '';
    }
    return true;
}

const parseRoot = (svgText: string, parser: DomDeps['parser']): Element | null => {
    if (!svgText || !svgText.trim()) {
        return null;
    }
    try {
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const root = doc && doc.documentElement;
        if (!root || tagName(root) !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
            return null;
        }
        return root;
    } catch (e) {
        return null;
    }
};

/**
 * Split an SVG one level: the visual children of the root (after skipping
 * single wrapper <g>s) each become a complete standalone SVG string.
 * Each part keeps the source root (same viewBox, root attributes), all
 * definitions of the root and the skipped wrappers, and shallow copies of
 * the skipped wrappers (transform, inherited presentation attributes,
 * class, style) around the part's element.
 */
export function splitOneLevel(svgText: string, deps?: DomDeps): { parts: string[]; canSplit: boolean } {
    const { parser, serializer } = resolveDeps(deps);
    const root = parseRoot(svgText, parser);
    if (!root) {
        return { parts: [], canSplit: false };
    }

    const wrappers: Element[] = [];
    const definitions: Element[] = [];
    let level: Element = root;
    let visual: Element[];
    for (;;) {
        const children = elementChildren(level);
        definitions.push(...children.filter((el) => isSvgElement(el) && DEFINITION_TAGS.has(tagName(el))));
        visual = children.filter(isVisual);
        if (visual.length === 1 && tagName(visual[0]) === 'g') {
            wrappers.push(visual[0]);
            level = visual[0];
        } else {
            break;
        }
    }

    const parts = visual.map((child) => {
        const partRoot = root.cloneNode(false);
        for (const definition of definitions) {
            partRoot.appendChild(definition.cloneNode(true));
        }
        let parent: Node = partRoot;
        for (const wrapper of wrappers) {
            const copy = wrapper.cloneNode(false);
            parent.appendChild(copy);
            parent = copy;
        }
        parent.appendChild(child.cloneNode(true));
        return serializer.serializeToString(partRoot);
    });

    return { parts, canSplit: parts.length >= 2 };
}

const ABSOLUTE_LENGTH = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i;

/**
 * Size attribute of a part `size` user units wide, in the unit of the source
 * root: a 66.5mm wide source with a viewBox 66.5 wide makes 0.2 units
 * "0.2mm". Plain user units when the source size cannot scale them (no
 * viewBox, a relative or missing size).
 */
function partSize(sourceSize: string | null, viewBoxSize: number, size: number): string {
    const match = ABSOLUTE_LENGTH.exec(sourceSize || '');
    const sourceValue = match ? parseFloat(match[1]) : NaN;
    if (!(sourceValue > 0) || !(viewBoxSize > 0)) {
        return `${size}`;
    }
    return `${Number((size * sourceValue / viewBoxSize).toPrecision(12))}${match[2] || ''}`;
}

/**
 * Give a part a tight frame: its viewBox becomes its own bounding box (in
 * the source's user units) and it is stretched exactly onto that frame. Its
 * size keeps the source's unit per user unit (the canvas draws non-scaling
 * strokes relative to it: tiny parts sized in px instead of mm vanished).
 */
export function reframePart(svgText: string, bbox: BBox, deps?: DomDeps): string {
    const { parser, serializer } = resolveDeps(deps);
    const root = parseRoot(svgText, parser);
    if (!root) {
        return svgText;
    }
    const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite);
    root.setAttribute('width', partSize(root.getAttribute('width'), hasViewBox ? viewBox[2] : NaN, bbox.width));
    root.setAttribute('height', partSize(root.getAttribute('height'), hasViewBox ? viewBox[3] : NaN, bbox.height));
    root.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    root.setAttribute('preserveAspectRatio', 'none');
    root.removeAttribute('x');
    root.removeAttribute('y');
    return serializer.serializeToString(root);
}

/**
 * The user-space frame of an SVG: its viewBox (or 0 0 width height) and the
 * preserveAspectRatio of its root.
 */
export function readFrame(svgText: string, deps?: DomDeps): Frame | null {
    const { parser } = resolveDeps(deps);
    const root = parseRoot(svgText, parser);
    if (!root) {
        return null;
    }
    const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(parseFloat);
    const frame = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
        ? viewBox
        : [0, 0, parseFloat(root.getAttribute('width')) || 100, parseFloat(root.getAttribute('height')) || 100];
    return {
        viewBox: frame as [number, number, number, number],
        preserveAspectRatio: root.getAttribute('preserveAspectRatio') || null
    };
}

/**
 * How the canvas <image> of a model fits its SVG: the unscaled image size
 * (width / |scaleX|, height / |scaleY|), the scale from user units to image
 * pixels and the offset of the viewBox inside the image (letterboxing of the
 * default xMidYMid meet).
 */
function fitViewBox(original: { width: number; height: number; scaleX?: number; scaleY?: number },
    viewBox: [number, number, number, number], preserveAspectRatio: string | null) {
    const { scaleX = 1, scaleY = 1, width, height } = original;
    const [, , vbWidth, vbHeight] = viewBox;
    const imageWidth = Math.abs(width / scaleX);
    const imageHeight = Math.abs(height / scaleY);
    if ((preserveAspectRatio || '').trim().startsWith('none')) {
        return { imageWidth, imageHeight, sx: imageWidth / vbWidth, sy: imageHeight / vbHeight, offsetX: 0, offsetY: 0 };
    }
    // Default xMidYMid meet
    const s = Math.min(imageWidth / vbWidth, imageHeight / vbHeight);
    return {
        imageWidth,
        imageHeight,
        sx: s,
        sy: s,
        offsetX: (imageWidth - vbWidth * s) / 2,
        offsetY: (imageHeight - vbHeight * s) / 2
    };
}

/**
 * Transformation of a part so its content stays exactly where it was drawn
 * inside the original object (same rotation, flips and scale).
 *
 * Mirrors how Luban draws an SVG model: an <image> of unscaled size
 * (width / |scaleX|, height / |scaleY|) centred at the model position,
 * transformed by scale(scaleX, scaleY) then rotate(-rotationZ) around the
 * centre; model y points up, SVG y points down.
 */
export function computePartTransformation({ original, viewBox, preserveAspectRatio, bbox }: {
    original: PartTransformation;
    viewBox: [number, number, number, number];
    preserveAspectRatio: string | null;
    bbox: BBox;
}): PartTransformation {
    const { positionX, positionY, rotationZ = 0, scaleX = 1, scaleY = 1 } = original;
    const [vbX, vbY] = viewBox;
    const { imageWidth, imageHeight, sx, sy, offsetX, offsetY } = fitViewBox(original, viewBox, preserveAspectRatio);

    // Part centre relative to the image centre, in unscaled SVG pixels (y down)
    const dx = -imageWidth / 2 + offsetX + (bbox.x + bbox.width / 2 - vbX) * sx;
    const dy = -imageHeight / 2 + offsetY + (bbox.y + bbox.height / 2 - vbY) * sy;

    const vx = dx * scaleX;
    const vy = dy * scaleY;
    const cos = Math.cos(-rotationZ);
    const sin = Math.sin(-rotationZ);
    const rx = cos * vx - sin * vy;
    const ry = sin * vx + cos * vy;

    return {
        positionX: positionX + rx,
        positionY: positionY - ry,
        rotationZ,
        scaleX,
        scaleY,
        width: bbox.width * sx * Math.abs(scaleX),
        height: bbox.height * sy * Math.abs(scaleY)
    };
}

export interface Margins {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** A single element is decomposable when it is more than this (mm) away from the object frame on a side. */
export const DECOMPOSE_MARGIN_MM = 0.1;

/**
 * Empty space (mm, after the model's scale) between a part's bounding box
 * and the frame of the object on the canvas, per side as seen on the canvas
 * (a flipped model swaps left/right or top/bottom; rotation turns the frame
 * with the content, so it changes nothing). Negative when content reaches
 * beyond the frame.
 */
export function partMargins({ original, viewBox, preserveAspectRatio, bbox }: {
    original: { width: number; height: number; scaleX?: number; scaleY?: number };
    viewBox: [number, number, number, number];
    preserveAspectRatio: string | null;
    bbox: BBox;
}): Margins {
    const { scaleX = 1, scaleY = 1 } = original;
    const [vbX, vbY] = viewBox;
    const { imageWidth, imageHeight, sx, sy, offsetX, offsetY } = fitViewBox(original, viewBox, preserveAspectRatio);
    const left = (offsetX + (bbox.x - vbX) * sx) * Math.abs(scaleX);
    const right = (imageWidth - offsetX - (bbox.x + bbox.width - vbX) * sx) * Math.abs(scaleX);
    const top = (offsetY + (bbox.y - vbY) * sy) * Math.abs(scaleY);
    const bottom = (imageHeight - offsetY - (bbox.y + bbox.height - vbY) * sy) * Math.abs(scaleY);
    return {
        left: scaleX < 0 ? right : left,
        right: scaleX < 0 ? left : right,
        top: scaleY < 0 ? bottom : top,
        bottom: scaleY < 0 ? top : bottom
    };
}

/** Whether any side has more than `threshold` mm of empty space. */
export function hasMargin(margins: Margins | null | undefined, threshold = DECOMPOSE_MARGIN_MM): boolean {
    if (!margins) {
        return false;
    }
    // a hair of tolerance so a computed 0.1000000000001 still counts as 0.1
    const limit = threshold + 1e-9;
    return margins.left > limit || margins.right > limit || margins.top > limit || margins.bottom > limit;
}

/**
 * Whether an SVG with `partCount` parts can be decomposed: two or more parts,
 * or one part that has a margin to the object frame (it gets a tight frame).
 */
export function isDecomposable(partCount: number, margins: Margins | null | undefined): boolean {
    return partCount >= 2 || (partCount === 1 && hasMargin(margins));
}

/**
 * Geometry bounding box (strokes ignored) of a part's content in the
 * source's user units: renders the part in a hidden off-screen <svg>.
 * Browser only. Returns null for parts without size.
 */
export function measurePartBBox(partSvg: string): BBox | null {
    const root = parseRoot(partSvg, new DOMParser());
    if (!root) {
        return null;
    }
    const host = document.createElementNS(SVG_NS, 'svg');
    host.setAttribute('style', 'position:absolute;left:-10000px;top:-10000px;width:10px;height:10px;visibility:hidden;overflow:hidden');
    const group = document.createElementNS(SVG_NS, 'g');
    host.appendChild(group);
    for (const child of elementChildren(root)) {
        group.appendChild(document.importNode(child, true));
    }
    document.body.appendChild(host);
    try {
        const { x, y, width, height } = group.getBBox();
        if (!(width > 0) && !(height > 0)) {
            return null;
        }
        // A straight line has no extent in one direction; give it a hair so
        // the frame stays valid while its centre stays put.
        const min = Math.max(width, height) * 1e-3;
        const w = Math.max(width, min);
        const h = Math.max(height, min);
        return { x: x - (w - width) / 2, y: y - (h - height) / 2, width: w, height: h };
    } finally {
        host.remove();
    }
}

// --- model level -----------------------------------------------------------

/**
 * What `loadDecomposeInfo` found in the processed SVG of a model: whether it
 * has 2+ parts, and for an SVG with a single drawn element its frame and the
 * element's bounding box (user units), so the margin can follow the model's
 * current scale.
 */
export interface DecomposeInfo {
    href: string;
    canSplit: boolean;
    single?: { viewBox: [number, number, number, number]; bbox: BBox } | null;
}

interface DecomposableModel {
    sourceType?: string;
    visible?: boolean;
    elem?: { nodeName: string; getAttribute(name: string): string | null } | null;
    transformation?: { width: number; height: number; scaleX?: number; scaleY?: number };
    decomposeInfo?: DecomposeInfo;
}

/** href of the processed SVG an imported SVG model shows, or null. */
export function getDecomposeHref(model: DecomposableModel | null): string | null {
    if (!model || model.sourceType !== 'svg' || !model.elem || model.elem.nodeName !== 'image') {
        return null;
    }
    const href = model.elem.getAttribute('href');
    if (!href || !/\.svg(\?.*)?$/i.test(href)) {
        return null;
    }
    return href;
}

/** Margins of a single-element SVG model at its current size, or null. */
function singleElementMargins(model: DecomposableModel): Margins | null {
    const single = model.decomposeInfo?.single;
    if (!single || !model.transformation) {
        return null;
    }
    return partMargins({
        original: model.transformation,
        viewBox: single.viewBox,
        // The canvas <image> decides how the SVG is fitted (default xMidYMid meet)
        preserveAspectRatio: model.elem.getAttribute('preserveAspectRatio'),
        bbox: single.bbox
    });
}

/**
 * Whether this model can be decomposed: an imported SVG whose processed SVG
 * has at least 2 parts, or a single drawn element with a margin of more than
 * 0.1 mm to the object frame (after the model's scale). Uses the result
 * cached on the model by `loadDecomposeInfo` (false until it is loaded).
 */
export function canDecompose(model: DecomposableModel | null): boolean {
    const href = getDecomposeHref(model);
    if (!href || model.decomposeInfo?.href !== href) {
        return false;
    }
    return model.decomposeInfo.canSplit === true || isDecomposable(1, singleElementMargins(model));
}

/** Whether the decompose action is enabled for this selection and editor mode. */
export function canDecomposeSelection(
    selectedModels: DecomposableModel[] | null | undefined,
    { isRotate = false, isOnABPosition = false, isSVGClipping = false }: { isRotate?: boolean; isOnABPosition?: boolean; isSVGClipping?: boolean }
): boolean {
    if (isRotate || isOnABPosition || isSVGClipping) {
        return false;
    }
    if (!selectedModels || selectedModels.length !== 1 || selectedModels[0].visible === false) {
        return false;
    }
    return canDecompose(selectedModels[0]);
}

export async function fetchSvgText(href: string): Promise<string> {
    const res = await fetch(href);
    return res.text();
}

/**
 * Decompose info of an SVG text (browser only: a single element is measured
 * with `measurePartBBox`).
 */
export function readDecomposeInfo(href: string, svgText: string): DecomposeInfo {
    const { parts, canSplit } = splitOneLevel(svgText);
    let single: DecomposeInfo['single'] = null;
    if (parts.length === 1) {
        const frame = readFrame(svgText);
        const bbox = measurePartBBox(parts[0]);
        single = frame && bbox ? { viewBox: frame.viewBox, bbox } : null;
    }
    return { href, canSplit, single };
}

const pending = new Map<string, Promise<DecomposeInfo>>();

/**
 * Fetch the model's processed SVG once and cache on the model what it holds
 * (`model.decomposeInfo`). Resolves to `canDecompose(model)`.
 */
export async function loadDecomposeInfo(model: DecomposableModel | null): Promise<boolean> {
    const href = getDecomposeHref(model);
    if (!href) {
        return false;
    }
    if (model.decomposeInfo?.href === href) {
        return canDecompose(model);
    }
    if (!pending.has(href)) {
        pending.set(href, fetchSvgText(href)
            .then((text) => readDecomposeInfo(href, text))
            .catch(() => ({ href, canSplit: false, single: null }))
            .finally(() => pending.delete(href)));
    }
    model.decomposeInfo = await pending.get(href);
    return canDecompose(model);
}

/**
 * Create `count` parts one after another, all or nothing: if a part cannot
 * be created (null/undefined result or an exception), every part already
 * created is discarded (newest first) and null is returned.
 */
export async function createAllOrNone<T>(
    count: number,
    create: (index: number) => Promise<T | null | undefined>,
    discard: (part: T) => void
): Promise<T[] | null> {
    const created: T[] = [];
    let complete = true;
    try {
        for (let i = 0; i < count; i++) {
            // eslint-disable-next-line no-await-in-loop
            const part = await create(i);
            if (part === null || part === undefined) {
                complete = false;
                break;
            }
            created.push(part);
        }
    } catch (e) {
        log.error('Failed to create decomposed part:', e);
        complete = false;
    }
    if (complete) {
        return created;
    }
    for (let i = created.length - 1; i >= 0; i--) {
        try {
            discard(created[i]);
        } catch (e) {
            log.error('Failed to discard decomposed part:', e); // keep discarding the others
        }
    }
    return null;
}
