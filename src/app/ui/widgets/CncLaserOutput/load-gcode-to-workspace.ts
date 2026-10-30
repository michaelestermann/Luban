import workspaceBaseActions from '../../../flux/workspace/actions-base';
import gcodeActions from '../../../flux/workspace/actions-gcode';
import { planSingleFileWorkspaceLoad, planWorkspaceLoad } from '../../../flux/workspace/gcode-file-list';
import { logGcodeExport } from '../../../lib/gaEvent';

/**
 * Load the generated G-code of the Laser/CNC editor into the workspace.
 *
 * CNC jobs with several tools: replace the job's earlier files, list all files with
 * file 1 on top, and preview/activate only file 1.
 *
 * Returns false when there is no G-code to load. The caller opens the workspace.
 */
export const loadGcodeToWorkspace = (headType: 'laser' | 'cnc', renderImmediately = false) => async (dispatch, getState) => {
    const { gcodeFile, gcodeFiles = [], materials } = getState()[headType];
    if (!gcodeFile) {
        return false;
    }

    logGcodeExport(headType, 'workspace', materials?.isRotate);

    const files: any[] = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile];
    dispatch(gcodeActions.removeGcodeFilesOfJob(files[0].jobName));
    const { listOnly, active } = planWorkspaceLoad(files);
    listOnly.forEach(file => dispatch(gcodeActions.addGCodeFile(file)));
    await dispatch(gcodeActions.renderGcodeFile(active, true, renderImmediately));
    return true;
};

/**
 * Load one file of the generated job into the workspace (G-code step, "Send via Wi-Fi" on a
 * file card). The file goes on top of the workspace list, like file 1 of "Load all"; files
 * of the same job sent before stay, files of an earlier generation of the job are dropped.
 *
 * Returns false when the file is not part of the current G-code. The caller opens the workspace.
 */
export const loadGcodeFileToWorkspace = (headType: 'laser' | 'cnc', uploadName: string, renderImmediately = false) => async (dispatch, getState) => {
    const { gcodeFile, gcodeFiles = [], materials } = getState()[headType];
    const jobFiles: any[] = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile].filter(Boolean);
    const { keep, active } = planSingleFileWorkspaceLoad(getState().workspace.gcodeFiles || [], jobFiles, uploadName);
    if (!active) {
        return false;
    }

    logGcodeExport(headType, 'workspace', materials?.isRotate);

    dispatch(workspaceBaseActions.updateState({ gcodeFiles: keep }));
    await dispatch(gcodeActions.renderGcodeFile(active, true, renderImmediately));
    return true;
};
