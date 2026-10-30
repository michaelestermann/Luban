import { PAGE_EDITOR } from '../../../constants';

/**
 * The three steps of the Laser/CNC editor stepper.
 *
 * - design:    PAGE_EDITOR (model view)
 * - toolpaths: PAGE_PROCESS while the toolpaths need a preview, no G-code exists yet, or the
 *              user went (back) to the toolpaths step (`viewingToolpaths`, the G-code is kept)
 * - gcode:     PAGE_PROCESS with generated G-code (output/file view)
 */
export type EditorStep = 'design' | 'toolpaths' | 'gcode';

export const EDITOR_STEPS: EditorStep[] = ['design', 'toolpaths', 'gcode'];

export interface EditorStepState {
    page?: string;
    needToPreview?: boolean;
    gcodeFile?: unknown;
    // UI flag: the user chose the toolpaths step although G-code exists
    viewingToolpaths?: boolean;
}

export function getEditorStep(state: EditorStepState | undefined): EditorStep {
    if (!state || state.page === PAGE_EDITOR || !state.page) {
        return 'design';
    }
    if (state.needToPreview || !state.gcodeFile || state.viewingToolpaths) {
        return 'toolpaths';
    }
    return 'gcode';
}

export function getStepIndex(step: EditorStep): number {
    return EDITOR_STEPS.indexOf(step);
}
