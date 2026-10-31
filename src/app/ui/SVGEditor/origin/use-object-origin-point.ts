import { useSelector } from 'react-redux';

type Point = { x: number; y: number } | null;

const samePoint = (a: Point, b: Point) => (!a && !b)
    || (!!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6);

/**
 * Point (model coordinates) of an object origin, following its objects as they move or resize;
 * null when the workpiece origin applies (other origin type, objects deleted).
 */
export function useObjectOriginPoint(headType: string): Point {
    return useSelector((state) => {
        const editor = state[headType];
        // renderingTimestamp changes with every model change: the point is computed again
        if (!editor || editor.renderingTimestamp === undefined) {
            return null;
        }
        return editor.toolPathGroup?.getObjectOriginPoint?.(editor.origin) || null;
    }, samePoint);
}
