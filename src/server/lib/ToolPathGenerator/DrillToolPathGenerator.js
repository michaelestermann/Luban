/**
 * CNC drill toolpaths: peck drilling at the center of every closed shape.
 *
 * LunarTPP (the toolpath engine) has no drilling mode, so drill toolpaths are generated
 * here and written in the engine's toolpath JSON format. Downstream G-code generation
 * consumes them unchanged.
 */
import { flip, rotate, scale } from '../../../shared/lib/SVGParser';

const DUPLICATE_TOLERANCE = 0.01; // mm

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Transform the SVG like CncToolPathGenerator._processSVG and return the bounding box
 * center of each closed, visible path, relative to the model center (mm, Y up).
 */
export function getDrillPoints(svg, modelInfo) {
    const { sourceType, transformation } = modelInfo;
    const { scaleX, scaleY, rotationZ } = transformation;

    if (sourceType !== 'dxf') {
        flip(svg, 1);
    }
    scale(svg, {
        x: (scaleX > 0 ? 1 : -1) * transformation.width / svg.width,
        y: (scaleY > 0 ? 1 : -1) * transformation.height / svg.height
    });
    rotate(svg, rotationZ);

    const centerX = svg.viewBox[0] + svg.viewBox[2] / 2;
    const centerY = svg.viewBox[1] + svg.viewBox[3] / 2;

    const points = [];
    for (const shape of svg.shapes) {
        if (shape.visibility === false) {
            continue;
        }
        for (const path of shape.paths) {
            if (!path.closed || path.points.length === 0) {
                continue;
            }
            const xs = path.points.map(p => p[0]);
            const ys = path.points.map(p => p[1]);
            const point = {
                x: (Math.min(...xs) + Math.max(...xs)) / 2 - centerX,
                y: (Math.min(...ys) + Math.max(...ys)) / 2 - centerY
            };
            if (!points.some(p => distance(p, point) < DUPLICATE_TOLERANCE)) {
                points.push(point);
            }
        }
    }
    return points;
}

/**
 * Nearest-neighbour ordering starting with the first point.
 */
export function orderPoints(points) {
    const remaining = points.slice(1);
    const ordered = points.slice(0, 1);
    while (remaining.length > 0) {
        const last = ordered[ordered.length - 1];
        let nearest = 0;
        for (let i = 1; i < remaining.length; i++) {
            if (distance(last, remaining[i]) < distance(last, remaining[nearest])) {
                nearest = i;
            }
        }
        ordered.push(remaining.splice(nearest, 1)[0]);
    }
    return ordered;
}
