import { actions as projectActions } from '../../../flux/project';
import workspaceBaseActions from '../../../flux/workspace/actions-base';
import gcodeActions from '../../../flux/workspace/actions-gcode';
import {
    JobSource,
    isJobRunning,
    planSingleFileWorkspaceLoad,
    planWorkspaceLoad,
    removeSourceFiles,
    tagJobSource,
} from '../../../flux/workspace/gcode-file-list';
import { TabsState, documentDisplayName } from '../../../flux/project/tabs-model';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';

type GcodeFileLike = { uploadName?: string; jobName?: string; sourceDocId?: string };

/** The project (tab) whose G-code is loaded: the live document of the mode. */
const jobSourceOf = (state, headType: string): JobSource | null => {
    const tabs: TabsState | undefined = state.project?.tabs;
    const id = tabs?.activeDocByHead?.[headType];
    const meta = id ? tabs.documents[id] : undefined;
    if (!meta) {
        return null;
    }
    return { sourceDocId: id, sourceName: documentDisplayName(meta, i18n._('key-Tabs/Untitled')) };
};

/**
 * Put the files of a job into the workspace list, tagged with their project. That project's files of
 * an earlier load are replaced (`keepUploadNames` stay). File 1 is previewed and becomes the active
 * file; while a job runs on the machine, the files only go into the list. Returns the number of files.
 */
export const sendJobToWorkspace = (
    headType: string,
    files: GcodeFileLike[],
    renderImmediately = false,
    keepUploadNames: string[] = []
) => async (dispatch, getState): Promise<number> => {
    if (files.length === 0) {
        return 0;
    }
    const { workflowStatus, gcodeFile: runningFile, gcodeFiles: workspaceFiles = [] } = getState().workspace;
    const running = isJobRunning(workflowStatus);
    const source = jobSourceOf(getState(), headType);
    const tagged: GcodeFileLike[] = source ? tagJobSource(files, source) : files;
    if (source) {
        // a running job's file stays in the list
        const keep = running && runningFile?.uploadName ? [...keepUploadNames, runningFile.uploadName] : keepUploadNames;
        dispatch(workspaceBaseActions.updateState({ gcodeFiles: removeSourceFiles(workspaceFiles, source.sourceDocId, keep) }));
    } else {
        dispatch(gcodeActions.removeGcodeFilesOfJob(files[0].jobName));
    }
    const { listOnly, active } = planWorkspaceLoad(tagged, running);
    listOnly.forEach(file => dispatch(gcodeActions.addGCodeFile(file as never)));
    if (active) {
        await dispatch(gcodeActions.renderGcodeFile(active as never, true, renderImmediately));
    }
    return tagged.length;
};

/**
 * Load the generated G-code of the Laser/CNC editor into the workspace.
 *
 * CNC jobs with several tools: replace the project's earlier files, list all files with
 * file 1 on top, and preview/activate only file 1.
 *
 * Returns the number of files loaded (0 when there is no G-code). The caller opens the workspace.
 */
export const loadGcodeToWorkspace = (headType: 'laser' | 'cnc', renderImmediately = false) => async (dispatch, getState): Promise<number> => {
    const { gcodeFile, gcodeFiles = [], materials } = getState()[headType];
    if (!gcodeFile) {
        return 0;
    }

    logGcodeExport(headType, 'workspace', materials?.isRotate);

    const files: GcodeFileLike[] = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile];
    return dispatch(sendJobToWorkspace(headType, files, renderImmediately));
};

/**
 * Load one file of the generated job into the workspace (G-code step, "Load to workspace" on a
 * file card). The file goes on top of the workspace list, like file 1 of "Load all"; files
 * of the same job sent before stay, files of an earlier generation of the job are dropped.
 *
 * Returns 1, or 0 when the file is not part of the current G-code. The caller opens the workspace.
 */
export const loadGcodeFileToWorkspace = (headType: 'laser' | 'cnc', uploadName: string, renderImmediately = false) => async (dispatch, getState): Promise<number> => {
    const { gcodeFile, gcodeFiles = [], materials } = getState()[headType];
    const jobFiles: GcodeFileLike[] = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile].filter(Boolean);
    const { keep, active } = planSingleFileWorkspaceLoad(getState().workspace.gcodeFiles || [], jobFiles, uploadName);
    if (!active) {
        return 0;
    }

    logGcodeExport(headType, 'workspace', materials?.isRotate);

    if (jobSourceOf(getState(), headType)) {
        // the project's files of this generation stay, older ones go (sendJobToWorkspace)
        return dispatch(sendJobToWorkspace(headType, [active], renderImmediately, jobFiles.map(file => file.uploadName)));
    }
    dispatch(workspaceBaseActions.updateState({ gcodeFiles: keep }));
    await dispatch(gcodeActions.renderGcodeFile(active as never, true, renderImmediately));
    return 1;
};

/**
 * "Export G-code to File": saves the file where the user picks, then loads that file into the workspace
 * like "Load to workspace" on its card (4.17: Export also lands in the Workspace). Returns the number of
 * files loaded: 0 when the save dialog was cancelled. The caller opens the workspace.
 */
export const exportGcodeFileAndLoad = (
    headType: 'laser' | 'cnc',
    file: { uploadName: string; renderGcodeFileName?: string },
    renderImmediately = false
) => async (dispatch): Promise<number> => {
    const saved: boolean = await dispatch(projectActions.exportFile(file.uploadName, file.renderGcodeFileName));
    if (!saved) {
        return 0;
    }
    return dispatch(loadGcodeFileToWorkspace(headType, file.uploadName, renderImmediately));
};
