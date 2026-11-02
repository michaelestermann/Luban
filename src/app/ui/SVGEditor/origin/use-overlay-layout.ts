import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Matrix = DOMMatrix | SVGMatrix;

function layoutKey(root: HTMLElement | null, getScreenCTM: () => Matrix | null): string {
    const ctm = getScreenCTM();
    if (!root || !ctm) {
        return '';
    }
    const r = root.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height, ctm.a, ctm.d, ctm.e, ctm.f].map(v => Math.round(v * 100) / 100).join(',');
}

/**
 * The origin overlays place their parts from the overlay's screen rect and the canvas CTM, read while
 * rendering. When the layout changes without a store change (a panel or the tab strip settles, the canvas is
 * resized), they render again, so the marker never stays a few pixels off its point.
 */
export function useOverlayLayout(rootRef: RefObject<HTMLElement>, getScreenCTM: () => Matrix | null, active: boolean): void {
    const [, setTick] = useState(0);
    const rendered = useRef('');
    // after every render: the layout read while rendering must still hold (settles in one extra render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        if (!active) {
            return undefined;
        }
        const key = layoutKey(rootRef.current, getScreenCTM);
        if (key !== rendered.current) {
            rendered.current = key;
            setTick(n => n + 1);
        }
        // and once more after the browser settled the layout of this frame
        const frame = requestAnimationFrame(() => {
            if (layoutKey(rootRef.current, getScreenCTM) !== rendered.current) {
                setTick(n => n + 1);
            }
        });
        return () => cancelAnimationFrame(frame);
    });
    // later size changes of the canvas area
    useEffect(() => {
        const root = rootRef.current;
        if (!active || !root || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver(() => setTick(n => n + 1));
        observer.observe(root);
        return () => observer.disconnect();
    }, [active, rootRef]);
}
