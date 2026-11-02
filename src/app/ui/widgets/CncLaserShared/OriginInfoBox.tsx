import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { originActions, originNameContext, t } from '../../../flux/editor/actions-origin';
import { unionBox } from '../../../lib/object-origin';
import { extentFromOrigin, originOffset } from '../../../lib/work-origin';
import { getEditorStep } from '../../pages/CncLaserShared/editor-step';
import { describeOrigin, formatOriginNumber, offsetText } from '../../SVGEditor/origin/origin-labels';
import ps from './properties.styl';

const K = 'key-CncLaser/Origin-';
const span = (a: number, b: number) => `${formatOriginNumber(a)} … ${formatOriginNumber(b)}`;

/**
 * Step 3 (G-code preview), read-only: what the work origin is on, its offset and the job extent from it, with
 * "Change in Design" (back to step 1 with the work origin dialog open).
 */
const OriginInfoBox: React.FC<{ headType: 'laser' | 'cnc' }> = ({ headType }) => {
    const dispatch = useDispatch();
    const editor = useSelector(state => state[headType]);
    const step = getEditorStep(editor);
    const origin = editor?.origin;
    if (step !== 'gcode' || !origin || editor?.materials?.isRotate) {
        return null;
    }
    const toolPathGroup = editor.toolPathGroup;
    const zero = toolPathGroup?.getWorkOriginPoint?.(origin) || { x: 0, y: 0 };
    const job = unionBox(toolPathGroup?.getOriginContext?.()?.allBoxes?.() || []);
    const extent = extentFromOrigin(job, zero);
    const { label } = describeOrigin(origin, originNameContext(editor.modelGroup), t);
    return (
        <div className={ps['origin-info']} data-origin-info>
            <div className={ps['work-origin-head']}>
                <span className={ps['geometry-title']}>{t(`${K}Work origin`)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
                </svg>
            </div>
            <b data-origin-info-label>{label}</b>
            <span data-origin-info-offset>{t(`${K}Offset {{offset}} mm`, { offset: offsetText(originOffset(origin)) })}</span>
            {extent && (
                <span data-origin-info-extent>
                    {t(`${K}Extent X {{x}} · Y {{y}}`, { x: span(extent.minX, extent.maxX), y: span(extent.minY, extent.maxY) })}
                </span>
            )}
            <button
                type="button"
                className={ps['origin-info-link']}
                onClick={() => dispatch(originActions.openOriginDialogInDesign(headType, 'point', 'preview'))}
                data-origin-info-change
            >
                {t(`${K}Change in Design`)}
            </button>
        </div>
    );
};

export default OriginInfoBox;
