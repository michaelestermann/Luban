/**
 * Geometry of editor models (reads the DOM element and, for imported SVG files, their source).
 */
import svgPath from 'svgpath';

import { GeometryInfo, outlineDLength, ParsedShape, shapesLength } from './geometry-length';
import { rectElementRadius } from '../path-edit/rect-corners';

interface GeometryModel {
    modelID: string;
    type: string;
    sourceType: string;
    mode?: string;
    elem: SVGElement;
    config: { svgNodeName?: string };
    transformation: { width: number; height: number; scaleX: number; scaleY: number };
    resource?: { originalFile: { path: string } };
    children?: GeometryModel[];
}

interface ParsedSvg {
    shapes: ParsedShape[];
    viewBox: number[];
}

// parsed imported files by url; null = could not be parsed
const parsedSources = new Map<string, ParsedSvg | null>();
const pending = new Map<string, Promise<void>>();
// lengths per model and transformation
const lengthCache = new Map<string, number>();

async function parseSource(url: string): Promise<void> {
    try {
        const res = await fetch(url);
        const text = await res.text();
        // loaded on first use, the parser is only needed for imported files
        const { default: SVGParser } = await import('../../../../shared/lib/SVGParser');
        const result = await new SVGParser().parse(text);
        parsedSources.set(url, { shapes: result.shapes, viewBox: result.viewBox });
    } catch (e) {
        parsedSources.set(url, null);
    }
}

// starts loading the source; onLoaded is called once it is parsed
function loadSource(url: string, onLoaded: () => void) {
    let p = pending.get(url);
    if (!p) {
        p = parseSource(url);
        pending.set(url, p);
    }
    p.then(onLoaded);
}

function elementMatrix(elem: SVGElement): [number, number, number, number, number, number] | null {
    const list = (elem as SVGGraphicsElement).transform?.baseVal;
    if (!list || list.numberOfItems === 0) {
        return null;
    }
    // product of the items; consolidate() would merge the list, and the editor relies on its items
    let m = new DOMMatrix();
    for (let i = 0; i < list.numberOfItems; i++) {
        const t = list.getItem(i).matrix;
        m = m.multiply(new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]));
    }
    return [m.a, m.b, m.c, m.d, m.e, m.f];
}

// length of a path or line element in canvas units (mm), its transform applied
function elementLength(elem: SVGElement): number {
    const tag = elem.tagName.toLowerCase();
    let d = '';
    if (tag === 'path') {
        d = elem.getAttribute('d') || '';
    } else if (tag === 'line') {
        const n = (name: string) => Number(elem.getAttribute(name)) || 0;
        d = `M${n('x1')} ${n('y1')} L${n('x2')} ${n('y2')}`;
    }
    const matrix = elementMatrix(elem);
    if (d && matrix) {
        d = svgPath(d).matrix(matrix).toString();
    }
    return outlineDLength(d);
}

function svgLength(model: GeometryModel, width: number, height: number, onLoaded: () => void): number | null {
    const url = model.resource?.originalFile?.path;
    if (!url || !/\.svg$/i.test(url)) {
        return null;
    }
    if (!parsedSources.has(url)) {
        loadSource(url, onLoaded);
        return null;
    }
    const parsed = parsedSources.get(url);
    if (!parsed || !parsed.viewBox || !parsed.viewBox[2] || !parsed.viewBox[3]) {
        return null;
    }
    const key = `${model.modelID}|${url}|${width}|${height}`;
    if (!lengthCache.has(key)) {
        // the file is shown stretched to the model size (preserveAspectRatio none)
        lengthCache.set(key, shapesLength(parsed.shapes, width / parsed.viewBox[2], height / parsed.viewBox[3]));
    }
    return lengthCache.get(key);
}

/**
 * Geometry description of one model. onLoaded is called when a pending imported file has been parsed.
 */
export function modelGeometry(model: GeometryModel, onLoaded: () => void): GeometryInfo[] {
    if (model.children) {
        return model.children.reduce((all, child) => all.concat(modelGeometry(child, onLoaded)), [] as GeometryInfo[]);
    }
    const { width, height, scaleX, scaleY } = model.transformation;
    const w = Math.abs(width * scaleX);
    const h = Math.abs(height * scaleY);
    const tag = model.elem?.tagName?.toLowerCase();
    if (model.config?.svgNodeName === 'text') {
        return [{ kind: 'text' }];
    }
    switch (tag) {
        case 'rect': {
            // rx / ry are in the element units (mm, scale is applied to width and height)
            const radius = rectElementRadius(model.elem.getAttribute('rx'), model.elem.getAttribute('ry'), w, h);
            return [radius > 0 ? { kind: 'rect', width: w, height: h, radius } : { kind: 'rect', width: w, height: h }];
        }
        case 'circle':
            return [{ kind: 'circle', width: w, height: h }];
        case 'ellipse':
            return [{ kind: Math.abs(w - h) < 1e-6 ? 'circle' : 'ellipse', width: w, height: h }];
        case 'path':
        case 'line':
            return [{ kind: 'path', length: elementLength(model.elem) }];
        case 'image':
            // imported SVG files cut as vectors; in an image mode they are processed like pictures
            if (model.sourceType === 'svg' && model.mode === 'vector') {
                return [{ kind: 'svg', length: svgLength(model, w, h, onLoaded) }];
            }
            return [{ kind: 'image' }];
        default:
            return [{ kind: 'image' }];
    }
}
