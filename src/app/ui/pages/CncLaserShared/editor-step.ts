import { PAGE_EDITOR } from '../../../constants';

/**
 * The three steps of the Laser/CNC editor stepper.
 *
 * - design:    PAGE_EDITOR (model view)
 * - toolpaths: PAGE_PROCESS while the toolpaths need a preview or no G-code exists yet
 * - gcode:     PAGE_PROCESS with generated G-code (output/file view)
 */
export type EditorStep = 'design' | 'toolpaths' | 'gcode';

export const EDITOR_STEPS: EditorStep[] = ['design', 'toolpaths', 'gcode'];

export interface EditorStepState {
    page?: string;
    needToPreview?: boolean;
    gcodeFile?: unknown;
}

export function getEditorStep(state: EditorStepState | undefined): EditorStep {
    if (!state || state.page === PAGE_EDITOR || !state.page) {
        return 'design';
    }
    if (state.needToPreview || !state.gcodeFile) {
        return 'toolpaths';
    }
    return 'gcode';
}

export function getStepIndex(step: EditorStep): number {
    return EDITOR_STEPS.indexOf(step);
}
