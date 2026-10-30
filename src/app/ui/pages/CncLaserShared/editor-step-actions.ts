import { PAGE_EDITOR, PAGE_PROCESS } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import { EditorStep, getEditorStep } from './editor-step';

/**
 * Go to a step of the Laser/CNC editor stepper, reusing the existing page actions.
 * Generated G-code is never discarded by moving between steps.
 *
 * - design:    switchToPage(editor) + showModelGroupObject (= the former "Edit" tab)
 * - toolpaths: switchToPage(process) (= the former "Next" / "Process" tab) and set the UI flag
 *              `viewingToolpaths`, so a still valid G-code file is kept but step 2 is shown
 * - gcode:     switchToPage(process) and clear `viewingToolpaths`; a valid G-code file shows
 *              step 3 again without regenerating. Without valid G-code: preview (= the former
 *              "Generate G-code and Preview"); the preview starts the progress and ends in
 *              G-code generation (shouldGenerateGcodeCounter -> Output -> commitGenerateGcode)
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
    dispatch(editorActions.updateState(headType, { viewingToolpaths: false }));
    const { needToPreview, gcodeFile, isGcodeGenerating } = getState()[headType];
    if (needToPreview || (!gcodeFile && !isGcodeGenerating)) {
        await dispatch(editorActions.preview(headType));
    }
};
