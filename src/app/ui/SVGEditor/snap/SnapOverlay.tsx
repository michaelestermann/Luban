import React, { useEffect, useRef, useState } from 'react';

import { CURSOR_SIZE, labelCovers, LabelPoint, placeLabel } from '../label-placement';
import styles from '../measure/measure-overlay.styl';
import { SnapGuides, subscribeSnapGuides } from './snap-session';

const PINK = '#be185d';

type Matrix = DOMMatrix | SVGMatrix;

interface SnapOverlayProps {
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
}

/**
 * Pink guide lines of the snapping (switch "Snap"), the snapped point and the distance to the neighbour.
 */
const SnapOverlay: React.FC<SnapOverlayProps> = ({ isActive, getScreenCTM }) => {
    const [guides, setGuides] = useState<SnapGuides | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    // the mouse on the screen, only followed while guides are shown: distance labels keep clear of it
    const [pointer, setPointer] = useState<LabelPoint | null>(null);

    useEffect(() => subscribeSnapGuides(setGuides), []);
    const showing = isActive && !!guides;
    useEffect(() => {
        if (!showing) {
            return undefined;
        }
        const onMove = (event: MouseEvent) => setPointer({ x: event.clientX, y: event.clientY });
        window.addEventListener('mousemove', onMove, true);
        return () => window.removeEventListener('mousemove', onMove, true);
    }, [showing]);

    const ctm = isActive && guides ? getScreenCTM() : null;
    // measured only while guides show: reading it forces a layout, and the editor re-renders often
    // (seconds of frozen UI when decompose adds many objects)
    const root = ctm ? rootRef.current?.getBoundingClientRect() : null;
    if (!ctm || !root || !guides) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const toScreen = (x: number, y: number) => ({
        x: ctm.a * x + ctm.c * y + ctm.e - root.left,
        y: ctm.b * x + ctm.d * y + ctm.f - root.top,
    });
    const p = guides.point ? toScreen(guides.point.x, guides.point.y) : null;
    const cursor = pointer ? { x: pointer.x - root.left, y: pointer.y - root.top } : null;
    const view = { x: 0, y: 0, width: root.width, height: root.height };
    return (
        <div ref={rootRef} className={styles.overlay} data-snap-guides>
            <svg className={styles.graphics} width={root.width} height={root.height} aria-hidden="true">
                {guides.guides.map((g) => {
                    const a = toScreen(g.x1, g.y1);
                    const b = toScreen(g.x2, g.y2);
                    return (
                        <line
                            key={`${g.x1},${g.y1},${g.x2},${g.y2}`}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={PINK}
                            strokeWidth={1}
                            strokeDasharray={g.kind === 'grid' ? '4 3' : undefined}
                        />
                    );
                })}
                {p && <rect x={p.x - 5} y={p.y - 5} width={10} height={10} fill="none" stroke={PINK} strokeWidth={1.6} transform={`rotate(45 ${p.x} ${p.y})`} />}
            </svg>
            {guides.guides.filter(g => g.label).map((g) => {
                const l = toScreen(g.label.x, g.label.y);
                // beside a vertical guide, above a horizontal one; beside the cursor when that is under it
                const size = { width: Math.max(40, g.label.text.length * 6.6 + 12), height: 20 };
                let at = g.x1 === g.x2 ? { x: l.x + 4, y: l.y - 10 } : { x: l.x - 20, y: l.y - 24 };
                if (cursor && labelCovers({ ...at, ...size }, [cursor, p])) {
                    at = placeLabel({ cursor, avoid: [p], size, view, cursorSize: CURSOR_SIZE });
                }
                const style = { left: at.x, top: at.y };
                return (
                    <span key={`label-${g.x1},${g.y1}`} className={styles['dimension-label']} style={style}>
                        {g.label.text}
                    </span>
                );
            })}
        </div>
    );
};

export default SnapOverlay;
