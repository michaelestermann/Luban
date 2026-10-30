import { PAGE_EDITOR } from '../../../constants';

/**
 * The three steps of the Laser/CNC editor stepper.
 *
 * - design:    PAGE_EDITOR (model view)
 * - toolpaths: PAGE_PROCESS while the toolpaths need a preview, no G-code exists yet, the
 *              user went (back) to the toolpaths step (`viewingToolpaths`, the G-code is kept),
 *              or the user asked for G-code that is still being generated (`gcodeRequested`)
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
    // UI flag: the user asked for (new) G-code ("Generate G-code" / "3 G-code"); step 3 is shown
    // only once the new file has arrived
    gcodeRequested?: boolean;
    isGcodeGenerating?: boolean;
    isChangedAfterGcodeGenerating?: boolean;
}

export function getEditorStep(state: EditorStepState | undefined): EditorStep {
    if (!state || state.page === PAGE_EDITOR || !state.page) {
        return 'design';
    }
    if (state.needToPreview || !state.gcodeFile || state.viewingToolpaths || state.gcodeRequested) {
        return 'toolpaths';
    }
    return 'gcode';
}

export function getStepIndex(step: EditorStep): number {
    return EDITOR_STEPS.indexOf(step);
}

/**
 * Whether going to the G-code step has to (re)generate the G-code: the toolpaths need a preview,
 * or there is no file / the toolpaths changed (order, visibility, settings) since the file was
 * generated and no generation is already running.
 */
export function needsGcodeRegeneration(state: EditorStepState): boolean {
    if (state.needToPreview) {
        return true;
    }
    if (state.isGcodeGenerating) {
        return false;
    }
    return !state.gcodeFile || !!state.isChangedAfterGcodeGenerating;
}

/**
 * The stepper flags to write when a new G-code file arrives. Only a generation the user asked for
 * moves to the G-code step; any other regeneration (an edit in step 2, auto-preview) keeps the
 * step the user is on.
 */
export function stateAfterNewGcode(state: EditorStepState): Pick<EditorStepState, 'viewingToolpaths' | 'gcodeRequested'> {
    if (state.gcodeRequested) {
        return { viewingToolpaths: false, gcodeRequested: false };
    }
    return { viewingToolpaths: getEditorStep(state) !== 'gcode', gcodeRequested: false };
}

/**
 * The stepper flags to write when a toolpath or G-code generation fails. A failed request ends and
 * keeps the toolpaths step, so the old (stale) G-code files are not shown as the result.
 */
export function stateAfterGcodeFailure(state: EditorStepState): Pick<EditorStepState, 'viewingToolpaths' | 'gcodeRequested'> {
    if (state.gcodeRequested) {
        return { viewingToolpaths: true, gcodeRequested: false };
    }
    return {};
}

export interface GoToGcodePlan {
    // drop the old (stale) G-code file(s) first, so they are never shown or loaded meanwhile
    clearGcodeFile: boolean;
    // start the preview (toolpaths + G-code)
    preview: boolean;
    // set `gcodeRequested`: show step 3 once the new file arrives (else show step 3 now)
    request: boolean;
}

/**
 * What goToStep('gcode') does. An up-to-date file is shown again as it is. Otherwise the old
 * file is cleared before regenerating (or before waiting for a generation that is already
 * running), so neither the regeneration nor a failure leaves stale G-code that a later click
 * would show as current.
 */
export function planGoToGcode(state: EditorStepState): GoToGcodePlan {
    const upToDate = !!state.gcodeFile && !state.needToPreview && !state.isChangedAfterGcodeGenerating
        && !state.isGcodeGenerating;
    if (upToDate) {
        return { clearGcodeFile: false, preview: false, request: false };
    }
    return { clearGcodeFile: true, preview: needsGcodeRegeneration(state), request: true };
}
