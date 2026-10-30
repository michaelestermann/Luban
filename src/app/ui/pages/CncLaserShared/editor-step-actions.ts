import { PAGE_EDITOR, PAGE_PROCESS } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import { EditorStep, getEditorStep, planGoToGcode } from './editor-step';

/**
 * Go to a step of the Laser/CNC editor stepper, reusing the existing page actions.
 * Generated G-code is never discarded by moving between steps.
 *
 * - design:    switchToPage(editor) + showModelGroupObject (= the former "Edit" tab)
 * - toolpaths: switchToPage(process) (= the former "Next" / "Process" tab) and set the UI flag
 *              `viewingToolpaths`, so a still valid G-code file is kept but step 2 is shown
 * - gcode:     switchToPage(process); an up-to-date G-code file shows step 3 again without
 *              regenerating (clears `viewingToolpaths`). Otherwise (needs preview, no file, or the
 *              toolpaths changed since the file was generated) clear the old file, set
 *              `gcodeRequested` and preview (planGoToGcode)
 *              (= the former "Generate G-code and Preview"); the preview starts the progress and
 *              ends in G-code generation (shouldGenerateGcodeCounter -> Output -> commitGenerateGcode).
 *              Step 3 is shown when the new file arrives (onGenerateGcode -> stateAfterNewGcode).
 */
export const goToStep = (headType: 'laser' | 'cnc', step: EditorStep) => async (dispatch, getState) => {
    const current = getEditorStep(getState()[headType]);
    if (current === step) {
        return;
    }

    if (step === 'design') {
        dispatch(editorActions.switchToPage(headType, PAGE_EDITOR));
        dispatch(editorActions.showModelGroupObject(headType));
        return;
    }

    if (getState()[headType].page !== PAGE_PROCESS) {
        dispatch(editorActions.switchToPage(headType, PAGE_PROCESS));
    }

    if (step === 'toolpaths') {
        dispatch(editorActions.updateState(headType, { viewingToolpaths: true }));
        return;
    }

    // step === 'gcode'
    const plan = planGoToGcode(getState()[headType]);
    if (!plan.request) {
        // the file is up to date: show it again
        dispatch(editorActions.updateState(headType, { viewingToolpaths: false, gcodeRequested: false }));
        return;
    }
    // no stale file during the regeneration or after a failure: the next click regenerates
    if (plan.clearGcodeFile) {
        dispatch(editorActions.clearGcodeFile(headType));
    }
    // stay on the toolpaths step until the new file arrives (stateAfterNewGcode); a failure
    // keeps the toolpaths step (stateAfterGcodeFailure)
    dispatch(editorActions.updateState(headType, { gcodeRequested: true }));
    if (plan.preview) {
        await dispatch(editorActions.preview(headType));
    }
};
