import classNames from 'classnames';
import React, { useCallback, useEffect } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { RootState } from '../../../flux/index.def';
import i18n from '../../../lib/i18n';
import { loadGcodeToWorkspace } from '../../widgets/CncLaserOutput/load-gcode-to-workspace';
import { goToStep } from './editor-step-actions';
import { EDITOR_STEPS, EditorStep, getEditorStep, getStepIndex, stepForShortcutKey } from './editor-step';
import styles from './styles/stepper.styl';

type HeadType = 'laser' | 'cnc';

/**
 * What the stepper and its primary action may do, derived from the same state the former
 * Output buttons ("Next", "Generate G-code and Preview", "Load G-code to Workspace") used.
 */
function useStepAvailability(headType: HeadType, blocked: boolean) {
    const page = useSelector((state: RootState) => state[headType]?.page);
    const needToPreview = useSelector((state: RootState) => state[headType]?.needToPreview);
    const gcodeFile = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const viewingToolpaths = useSelector((state: RootState) => state[headType]?.viewingToolpaths);
    const gcodeRequested = useSelector((state: RootState) => state[headType]?.gcodeRequested);
    const gcodeFiles = useSelector((state: RootState) => state[headType]?.gcodeFiles) || [];
    const isGcodeGenerating = useSelector((state: RootState) => state[headType]?.isGcodeGenerating);
    const hasModel = useSelector((state: RootState) => state[headType]?.modelGroup.hasModel(), shallowEqual);
    const toolPathGroup = useSelector((state: RootState) => state[headType]?.toolPathGroup);
    const workflowState = useSelector((state: RootState) => state.machine?.workflowState);
    // toolPathGroup is mutable: re-evaluate the toolpath checks on every render tick
    useSelector((state: RootState) => state[headType]?.renderingTimestamp);

    const step = getEditorStep({ page, needToPreview, gcodeFile, viewingToolpaths, gcodeRequested });

    const hasToolPath = toolPathGroup.toolPaths.length > 0;
    const noVisibleToolPath = toolPathGroup.toolPaths.every(toolPath => {
        return !toolPath.visible || !toolPath.hasVisibleModels();
    });

    const canEnter: Record<EditorStep, boolean> = {
        design: !blocked,
        // = former "Next"
        toolpaths: !blocked && !!hasModel,
        // = former "Generate G-code and Preview"
        gcode: !blocked && hasToolPath && !noVisibleToolPath && !isGcodeGenerating,
    };
    // = former "Load G-code to Workspace"
    const canLoadToWorkspace = !blocked && !noVisibleToolPath && !!hasModel && workflowState !== 'running'
        && !isGcodeGenerating && !!gcodeFile;

    return { step, canEnter, canLoadToWorkspace, fileCount: gcodeFiles.length };
}

const Check: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="M5 12l5 5 9-10" />
    </svg>
);

const Chevron: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa1b0" strokeWidth="2" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
    </svg>
);

const stepLabels = (): Record<EditorStep, string> => ({
    design: i18n._('key-CncLaser/Stepper-Design'),
    toolpaths: i18n._('key-CncLaser/Stepper-Toolpaths'),
    gcode: i18n._('key-CncLaser/Stepper-G-code'),
});

interface StepperProps {
    headType: HeadType;
    // A-B position mode, SVG clipping mode
    blocked?: boolean;
}

/**
 * 1 Design > 2 Toolpaths > 3 G-code. Replaces the former Edit/Process tabs.
 */
export const Stepper: React.FC<StepperProps> = ({ headType, blocked = false }) => {
    const dispatch = useDispatch();
    const { step, canEnter } = useStepAvailability(headType, blocked);
    const currentIndex = getStepIndex(step);
    const labels = stepLabels();

    // keys 1, 2, 3 open the steps (like a click on them), not while a dialog is open
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = stepForShortcutKey({ ...event, key: event.key, target: event.target as HTMLElement });
            if (!target || target === step || !canEnter[target] || event.repeat) {
                return;
            }
            const dialogOpen = [...document.querySelectorAll('.ant-modal-wrap')]
                .some(wrap => getComputedStyle(wrap).display !== 'none');
            if (dialogOpen) {
                return;
            }
            event.preventDefault();
            dispatch(goToStep(headType, target));
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dispatch, headType, step, canEnter]);

    return (
        <nav className={styles.stepper} aria-label={i18n._('key-CncLaser/Stepper-Workflow steps')}>
            {EDITOR_STEPS.map((item, index) => {
                const isCurrent = item === step;
                const isDone = index < currentIndex;
                const disabled = !isCurrent && !canEnter[item];
                return (
                    <React.Fragment key={item}>
                        {index > 0 && <Chevron />}
                        <button
                            type="button"
                            className={classNames(styles.step, {
                                [styles.current]: isCurrent,
                                [styles.done]: isDone,
                            })}
                            aria-current={isCurrent ? 'step' : undefined}
                            aria-keyshortcuts={String(index + 1)}
                            title={i18n._('key-CncLaser/Stepper-Key {{key}}', { key: index + 1 })}
                            disabled={disabled}
                            onClick={() => {
                                if (!isCurrent) {
                                    dispatch(goToStep(headType, item));
                                }
                            }}
                        >
                            {/* an invisible copy of the widest form (check + bold text) sizes the step: the steps never move */}
                            <span className={styles['step-cell']}>
                                <span className={styles['step-ghost']} aria-hidden="true"><Check />{`${index + 1} ${labels[item]}`}</span>
                                <span className={styles['step-content']}>{isDone && <Check />}{`${index + 1} ${labels[item]}`}</span>
                            </span>
                        </button>
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

interface StepperActionsProps {
    headType: HeadType;
    blocked?: boolean;
    renderImmediately?: boolean;
    // shows the Workspace tab (and the toast) after `count` files were loaded
    onOpenWorkspace: (count?: number) => void;
}

/**
 * Back + primary action of the current step: "Next: Toolpaths", "Generate G-code",
 * "Load all to workspace".
 */
export const StepperActions: React.FC<StepperActionsProps> = ({ headType, blocked = false, renderImmediately = false, onOpenWorkspace }) => {
    const dispatch = useDispatch();
    const { step, canEnter, canLoadToWorkspace, fileCount } = useStepAvailability(headType, blocked);

    const onLoadToWorkspace = useCallback(async () => {
        const count: number = await dispatch(loadGcodeToWorkspace(headType, renderImmediately)) as unknown as number;
        if (count) {
            onOpenWorkspace(count);
            window.scrollTo(0, 0);
        }
    }, [dispatch, headType, renderImmediately, onOpenWorkspace]);

    let primary: { label: string; disabled: boolean; onClick: () => void };
    if (step === 'design') {
        primary = {
            label: i18n._('key-CncLaser/Stepper-Next: Toolpaths'),
            disabled: !canEnter.toolpaths,
            onClick: () => dispatch(goToStep(headType, 'toolpaths')),
        };
    } else if (step === 'toolpaths') {
        primary = {
            label: i18n._('key-CncLaser/Stepper-Generate G-code'),
            disabled: !canEnter.gcode,
            onClick: () => dispatch(goToStep(headType, 'gcode')),
        };
    } else {
        primary = {
            label: fileCount > 1
                ? i18n._('key-CncLaser/Stepper-Load all to workspace')
                : i18n._('key-CncLaser/G-codeAction-Load G-code to Workspace'),
            disabled: !canLoadToWorkspace,
            onClick: onLoadToWorkspace,
        };
    }

    let previous: EditorStep | null = null;
    if (step === 'gcode') {
        previous = 'toolpaths';
    } else if (step === 'toolpaths') {
        previous = 'design';
    }

    // every label the group can show: invisible copies in the same grid cell give it the width of
    // its widest state, so the steps left of it never move when the step changes
    const sizerLabels = [
        i18n._('key-CncLaser/Stepper-Next: Toolpaths'),
        i18n._('key-CncLaser/Stepper-Generate G-code'),
        i18n._('key-CncLaser/Stepper-Load all to workspace'),
        i18n._('key-CncLaser/G-codeAction-Load G-code to Workspace'),
    ];

    return (
        <div className={styles['actions-slot']}>
            {sizerLabels.map(label => (
                <div key={label} className={classNames(styles.actions, styles.sizer)} aria-hidden="true">
                    <span className={styles.secondary}>{i18n._('key-CncLaser/Stepper-Back')}</span>
                    <span className={styles.primary}>{label}</span>
                </div>
            ))}
            {/* starter guide: the "Generate G-code and Preview" and "Export" steps point at this group */}
            <div className={classNames(styles.actions, `${headType}-preview-export-intro-part`)}>
                {previous && (
                    <button
                        type="button"
                        className={styles.secondary}
                        disabled={blocked}
                        onClick={() => dispatch(goToStep(headType, previous))}
                    >
                        {i18n._('key-CncLaser/Stepper-Back')}
                    </button>
                )}
                <button
                    type="button"
                    className={styles.primary}
                    disabled={primary.disabled}
                    onClick={primary.onClick}
                >
                    {primary.label}
                </button>
            </div>
        </div>
    );
};

export default Stepper;
