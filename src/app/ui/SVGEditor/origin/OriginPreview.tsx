import React from 'react';

import { BoxLike, Point } from '../../../lib/object-origin';
import { formatOriginNumber, Translate } from './origin-labels';
import { PreviewZoom, previewBoxes, previewFit } from './origin-dialog-model';
import styles from './origin.styl';

export const PREVIEW_W = 440;
export const PREVIEW_H = 300;
const MARGIN = 28;
const ARROW = 34;

interface OriginPreviewProps {
    workpiece: BoxLike | null;
    objects: BoxLike[];
    reference: BoxLike | null;
    /** the reference point before the offset */
    point: Point | null;
    /** the work origin (G-code zero) */
    zero: Point | null;
    extent: { minX: number; maxX: number; minY: number; maxY: number } | null;
    /** the job (for the extent dimension lines) */
    job: BoxLike | null;
    zoom: PreviewZoom;
    onZoom: (zoom: PreviewZoom) => void;
    t: Translate;
}

const span = (a: number, b: number) => `${formatOriginNumber(a)} … ${formatOriginNumber(b)}`;

const Axes: React.FC<{ at: Point; ghost?: boolean; labels?: boolean }> = ({ at, ghost = false, labels = false }) => (
    <g opacity={ghost ? 0.45 : 1} data-preview-axes={ghost ? 'ghost' : 'origin'}>
        <line x1={at.x} y1={at.y} x2={at.x + ARROW - 6} y2={at.y} stroke="#d92d20" strokeWidth={2} />
        <path d={`M${at.x + ARROW} ${at.y} l-7 -4 v8 z`} fill="#d92d20" />
        <line x1={at.x} y1={at.y} x2={at.x} y2={at.y - ARROW + 6} stroke="#16803c" strokeWidth={2} />
        <path d={`M${at.x} ${at.y - ARROW} l-4 7 h8 z`} fill="#16803c" />
        {labels && <text x={at.x + ARROW + 3} y={at.y + 4} fontSize={11} fontWeight={700} fill="#d92d20">X</text>}
        {labels && <text x={at.x - 4} y={at.y - ARROW - 4} fontSize={11} fontWeight={700} fill="#16803c">Y</text>}
        <circle cx={at.x} cy={at.y} r={6} fill="#d92d20" stroke="#fff" strokeWidth={2} />
    </g>
);

/**
 * The mini preview of the work origin dialog: workpiece, objects as boxes, the reference frame (dashed blue),
 * the work origin with X/Y arrows, the offset as a dotted line from the reference point and the job extent
 * from the origin as dimension lines. Zoom: the workpiece or the reference frame (an outside zero stays in view).
 */
const OriginPreview: React.FC<OriginPreviewProps> = ({ workpiece, objects, reference, point, zero, extent, job, zoom, onZoom, t }) => {
    const fit = previewFit(previewBoxes(zoom, { workpiece, reference, zero }), { w: PREVIEW_W, h: PREVIEW_H }, MARGIN);
    const P = (p: Point): Point => ({ x: p.x * fit.scale + fit.tx, y: -p.y * fit.scale + fit.ty });
    const rect = (b: BoxLike) => {
        const a = P({ x: b.min.x, y: b.max.y });
        return { x: a.x, y: a.y, width: (b.max.x - b.min.x) * fit.scale, height: (b.max.y - b.min.y) * fit.scale };
    };
    const z = zero ? P(zero) : null;
    const pt = point ? P(point) : null;
    const hasOffset = !!(z && pt && Math.hypot(z.x - pt.x, z.y - pt.y) > 0.5);
    const j = job ? rect(job) : null;
    return (
        <div className={styles['preview-box']}>
            <svg
                width={PREVIEW_W}
                height={PREVIEW_H}
                viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
                role="img"
                aria-label={t('key-CncLaser/Origin-Work origin')}
                data-origin-preview
                data-preview-scale={fit.scale}
            >
                {workpiece && <rect {...rect(workpiece)} fill="#ffffff" stroke="#9aa1b0" strokeWidth={1.2} data-preview-workpiece />}
                {objects.map((b, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <rect key={i} {...rect(b)} fill="#f8fafc" stroke="#1f2430" strokeWidth={1.2} />
                ))}
                {reference && <rect {...rect(reference)} fill="none" stroke="#1d4ed8" strokeWidth={1.4} strokeDasharray="5 3" data-preview-reference />}
                {hasOffset && <Axes at={pt} ghost />}
                {hasOffset && <line x1={pt.x} y1={pt.y} x2={z.x} y2={z.y} stroke="#d92d20" strokeWidth={1.2} strokeDasharray="4 4" opacity={0.7} data-preview-offset />}
                {z && <Axes at={z} labels />}
                {extent && j && z && (
                    <g fontSize={11} fill="#5b6170" data-preview-extent>
                        <line x1={j.x} y1={j.y + j.height + 14} x2={j.x + j.width} y2={j.y + j.height + 14} stroke="#5b6170" />
                        <line x1={j.x} y1={j.y + j.height + 10} x2={j.x} y2={j.y + j.height + 18} stroke="#5b6170" />
                        <line x1={j.x + j.width} y1={j.y + j.height + 10} x2={j.x + j.width} y2={j.y + j.height + 18} stroke="#5b6170" />
                        <text x={j.x + j.width / 2} y={j.y + j.height + 28} textAnchor="middle">{`X ${span(extent.minX, extent.maxX)}`}</text>
                        <line x1={j.x - 14} y1={j.y} x2={j.x - 14} y2={j.y + j.height} stroke="#5b6170" />
                        <line x1={j.x - 18} y1={j.y} x2={j.x - 10} y2={j.y} stroke="#5b6170" />
                        <line x1={j.x - 18} y1={j.y + j.height} x2={j.x - 10} y2={j.y + j.height} stroke="#5b6170" />
                        <text
                            x={j.x - 20}
                            y={j.y + j.height / 2}
                            textAnchor="middle"
                            transform={`rotate(-90 ${j.x - 20} ${j.y + j.height / 2})`}
                        >
                            {`Y ${span(extent.minY, extent.maxY)}`}
                        </text>
                    </g>
                )}
            </svg>
            <div className={styles.seg} role="radiogroup" aria-label={t('key-CncLaser/Origin-Preview zoom')}>
                {(['workpiece', 'reference'] as PreviewZoom[]).map(value => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={zoom === value}
                        className={zoom === value ? styles.on : undefined}
                        data-preview-zoom={value}
                        onClick={() => onZoom(value)}
                    >
                        {value === 'workpiece' ? t('key-CncLaser/Origin-Workpiece') : t('key-CncLaser/Origin-Reference')}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default OriginPreview;
