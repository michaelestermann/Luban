import gcodeActions from '../../../flux/workspace/actions-gcode';
import { planWorkspaceLoad } from '../../../flux/workspace/gcode-file-list';
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
