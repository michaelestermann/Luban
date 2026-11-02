import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { canEditOrigin, originActions, originNameContext, t } from '../../../flux/editor/actions-origin';
import { useWorkOriginPoint } from '../../SVGEditor/origin/use-object-origin-point';
import { workOriginSummary } from '../../SVGEditor/origin/origin-labels';
import ps from './properties.styl';

interface WorkOriginSectionProps {
    headType: 'laser' | 'cnc';
}

const K = 'key-CncLaser/Origin-';

/**
 * Properties panel, Design step: the work origin ("Logo · bottom left", where its zero is on the workpiece, the
 * offset and whether it follows the object) with the button that opens the work origin dialog.
 */
const WorkOriginSection: React.FC<WorkOriginSectionProps> = ({ headType }) => {
    const dispatch = useDispatch();
    const origin = useSelector(state => state[headType]?.origin);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    // names and objects change with every model change
    useSelector(state => state[headType]?.renderingTimestamp);
    const editable = useSelector(state => canEditOrigin(state, headType));
    const isRotate = useSelector(state => !!state[headType]?.materials?.isRotate);
    const zero = useWorkOriginPoint(headType);
    if (!origin) {
        return null;
    }
    const [label, at, offset] = workOriginSummary(origin, originNameContext(modelGroup), zero, t);
    return (
        <section className={ps['work-origin']} aria-label={t(`${K}Work origin`)} data-work-origin-section>
            <div className={ps['work-origin-head']}>
                <span className={ps['geometry-title']}>{t(`${K}Work origin`)}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
                </svg>
            </div>
            <div className={ps['work-origin-lines']}>
                <b data-work-origin-label>{label}</b>
                <span data-work-origin-at>{at}</span>
                <span data-work-origin-offset>{offset}</span>
            </div>
            <button
                type="button"
                className={ps['work-origin-button']}
                disabled={!editable}
                title={isRotate ? t(`${K}Only on flat workpieces`) : t(`${K}Origin… (Shift+O)`)}
                onClick={() => dispatch(originActions.openOriginDialog(headType, 'point', 'panel'))}
                data-work-origin-open
            >
                {t(`${K}Origin…`)}
                <kbd>{t(`${K}Shift+O`)}</kbd>
            </button>
            <span className={ps['work-origin-hint']}>
                {t(`${K}Drag the red marker on the canvas, or press ⊕ in the selection bar and click a point.`)}
            </span>
        </section>
    );
};

export default WorkOriginSection;
