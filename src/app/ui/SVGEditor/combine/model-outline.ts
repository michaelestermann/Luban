/**
 * Outlines of editor models in content group coordinates (reads the DOM element and, for imported
 * SVG files and text, their SVG source).
 */
import { getDecomposeHref } from '../../../lib/svg-decompose';
import { elementD, FLATTEN_TOLERANCE, Matrix, Outline, outlineFromD, outlineFromPolylines, unionShapes, viewBoxMatrix } from './shape-ops';
import { LruCache, toleranceBucket } from './outline-cache';
import { normalizePenPath } from '../path-edit/point-edit';
import { parsePath } from '../path-edit/path-geometry';

export interface OutlineModel {
    modelID: string;
    visible?: boolean;
    sourceType?: string;
    elem: SVGElement;
}

interface ParsedSvg {
    shapes: { visibility?: string; paths: { closed: boolean; points: number[][] }[] }[];
    viewBox: number[];
}

// the SVG parser flattens curves with this tolerance in file units (0.3 px)
const PARSER_TOLERANCE = 0.3 * 25.4 / 72;

const SHAPE_TAGS = ['path', 'rect', 'ellipse', 'circle', 'line'];

// parsed sources by url and tolerance bucket (the tolerance depends on the model's size): the most
// recently used ones only
const parsed = new LruCache<string, Promise<ParsedSvg | null>>(20);

async function parseSvg(url: string, wanted: number): Promise<ParsedSvg | null> {
    const tolerance = toleranceBucket(wanted);
    const key = `${url}|${tolerance}`;
    if (!parsed.has(key)) {
        parsed.set(key, (async () => {
            try {
                const res = await fetch(url);
                const text = await res.text();
                // loaded on first use, the parser is only needed for imported files
                const { default: SVGParser } = await import('../../../../shared/lib/SVGParser');
                const parser = new SVGParser();
                for (const tag of Object.keys(parser.tagParses)) {
                    parser.tagParses[tag].tol = tolerance;
                }
                const result = await parser.parse(text);
                return result?.viewBox ? { shapes: result.shapes || [], viewBox: result.viewBox } : null;
            } catch (e) {
                return null;
            }
        })());
    }
    return parsed.get(key);
}

const multiply = (a: Matrix, b: Matrix): Matrix => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function ownMatrix(elem: Element): Matrix {
    const list = (elem as SVGGraphicsElement).transform?.baseVal;
    let m = IDENTITY;
    if (!list) {
        return m;
    }
    // product of the items; consolidate() would merge the list, and the editor relies on its items
    for (let i = 0; i < list.numberOfItems; i++) {
        const t = list.getItem(i).matrix;
        m = multiply(m, [t.a, t.b, t.c, t.d, t.e, t.f]);
    }
    return m;
}

/** Element → content group coordinates (the element's transform and those of the groups it is in). */
export function matrixToContent(elem: Element, contentGroup: Element | null): Matrix {
    let m = IDENTITY;
    let node: Element | null = elem;
    while (node && node !== contentGroup && node.nodeName !== 'svg') {
        m = multiply(ownMatrix(node), m);
        node = node.parentElement;
    }
    return m;
}

const scaleOf = (m: Matrix) => Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));

function svgHref(model: OutlineModel): string | null {
    return getDecomposeHref(model as unknown as Parameters<typeof getDecomposeHref>[0]);
}

/** Whether the model is a vector shape: a draw tool shape, a pen path, an imported SVG or a text. */
export function isVectorShape(model: OutlineModel): boolean {
    const tag = model?.elem?.nodeName;
    if (!tag || model.visible === false) {
        return false;
    }
    if (SHAPE_TAGS.includes(tag)) {
        return true;
    }
    return tag === 'image' && !!svgHref(model);
}

/**
 * Whether the model is a closed vector shape. Imported SVG files and texts count as closed (their
 * source is read only when the action runs).
 */
// closed state of path models by their d (parsing the d of every selected path on each render is slow)
const closedPaths = new WeakMap<OutlineModel, { d: string; closed: boolean }>();

export function isClosedShape(model: OutlineModel): boolean {
    if (!isVectorShape(model)) {
        return false;
    }
    const tag = model.elem.nodeName;
    if (tag === 'line') {
        return false;
    }
    if (tag === 'path') {
        const d = model.elem.getAttribute('d') || '';
        const cached = closedPaths.get(model);
        if (cached && cached.d === d) {
            return cached.closed;
        }
        let closed = false;
        try {
            closed = normalizePenPath(parsePath(d)).some(sub => sub.closed && sub.nodes.length >= 2);
        } catch (e) {
            closed = false;
        }
        closedPaths.set(model, { d, closed });
        return closed;
    }
    return true;
}

/**
 * Outline of a vector model in content group coordinates; null if it has none. The shapes of an
 * imported file are welded, so shapes lying on top of each other are one area.
 */
export async function modelOutline(model: OutlineModel, contentGroup: Element | null): Promise<Outline | null> {
    if (!isVectorShape(model)) {
        return null;
    }
    const elem = model.elem;
    const matrix = matrixToContent(elem, contentGroup);
    if (elem.nodeName !== 'image') {
        const d = elementD(elem.nodeName, (name) => elem.getAttribute(name));
        return d ? outlineFromD(d, matrix) : null;
    }
    const url = svgHref(model);
    let svg = await parseSvg(url, PARSER_TOLERANCE);
    if (!svg) {
        return null;
    }
    const num = (name: string) => Number(elem.getAttribute(name)) || 0;
    const box = { x: num('x'), y: num('y'), width: num('width'), height: num('height') };
    let toContent = multiply(matrix, viewBoxMatrix(svg.viewBox, box, elem.getAttribute('preserveAspectRatio')));
    // finer flattening when the file is drawn larger than its units
    const scale = scaleOf(toContent);
    if (PARSER_TOLERANCE * scale > FLATTEN_TOLERANCE) {
        svg = (await parseSvg(url, FLATTEN_TOLERANCE / scale)) || svg;
        toContent = multiply(matrix, viewBoxMatrix(svg.viewBox, box, elem.getAttribute('preserveAspectRatio')));
    }
    return unionShapes(svg.shapes
        .filter(shape => shape.visibility !== 'hidden')
        .map(shape => outlineFromPolylines(shape.paths, toContent)));
}

export interface SelectionGroup {
    getSelectedModelArray: () => OutlineModel[];
    getModels: () => OutlineModel[];
    getParentGroup?: (modelID: string) => unknown;
}

/** The items sorted by their place in order (one index map: O(n log n), not indexOf in the comparator). */
export function inLayerOrder<T>(items: T[], order: T[]): T[] {
    const index = new Map<T, number>();
    order.forEach((item, i) => index.set(item, i));
    const at = (item: T) => index.get(item) ?? -1;
    return items.slice().sort((a, b) => at(a) - at(b));
}

// selected models in layer order (back to front)
export function selectedInLayerOrder(modelGroup: SelectionGroup): OutlineModel[] {
    const selected = modelGroup?.getSelectedModelArray?.() || [];
    return selected.length > 1 ? inLayerOrder(selected, modelGroup.getModels()) : selected.slice();
}

/** Combine inputs among the selected models in layer order: all closed, none in a group, at least two. */
export function combinableFrom(models: OutlineModel[], modelGroup: SelectionGroup): OutlineModel[] {
    if (models.length < 2 || models.some(m => !isClosedShape(m) || modelGroup.getParentGroup?.(m.modelID))) {
        return [];
    }
    return models;
}

/** Offset inputs among the selected models in layer order: all vector shapes. */
export function offsetFrom(models: OutlineModel[]): OutlineModel[] {
    return models.every(isVectorShape) ? models : [];
}

/** Inputs of Combine: at least two selected closed vector shapes, none of them in a group; back to front. */
export function combinableModels(modelGroup: SelectionGroup): OutlineModel[] {
    return modelGroup ? combinableFrom(selectedInLayerOrder(modelGroup), modelGroup) : [];
}

/** Inputs of Offset: the selected vector shapes (closed or open); back to front. */
export function offsetModels(modelGroup: SelectionGroup): OutlineModel[] {
    return modelGroup ? offsetFrom(selectedInLayerOrder(modelGroup)) : [];
}
