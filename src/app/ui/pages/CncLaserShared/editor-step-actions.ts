import { PAGE_EDITOR, PAGE_PROCESS } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import { EditorStep, getEditorStep } from './editor-step';

/**
 * Go to a step of the Laser/CNC editor stepper, reusing the existing page actions.
 *
 * - design:    switchToPage(editor) + showModelGroupObject (= the former "Edit" tab)
 * - toolpaths: switchToPage(process) (= the former "Next" / "Process" tab); coming back
 *              from the G-code step clears the generated G-code so the step mapping
 *              returns to "toolpaths" (the toolpath preview stays valid)
 * - gcode:     switchToPage(process), then preview when the toolpaths need it (preview
 *              triggers G-code generation, = the former "Generate G-code and Preview");
 *              when the preview is up to date but no G-code exists, bump the generate
 *              counter so the mounted Output widget creates the thumbnail and calls
 *              commitGenerateGcode exactly as after a preview
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
        if (getEditorStep(getState()[headType]) === 'gcode') {
            dispatch(editorActions.clearGcodeFile(headType));
        }
        return;
    }

    // step === 'gcode'
    const { needToPreview, gcodeFile, isGcodeGenerating, shouldGenerateGcodeCounter } = getState()[headType];
    if (needToPreview) {
        await dispatch(editorActions.preview(headType));
    } else if (!gcodeFile && !isGcodeGenerating) {
        dispatch(editorActions.showToolPathGroupObject(headType));
        dispatch(editorActions.updateState(headType, {
            shouldGenerateGcodeCounter: shouldGenerateGcodeCounter + 1
        }));
    }
};
