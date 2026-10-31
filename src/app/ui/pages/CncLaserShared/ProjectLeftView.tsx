import React from 'react';
import { useSelector } from 'react-redux';

import { HEAD_CNC, HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import i18n from '../../../lib/i18n';
import CncLaserObjectList from '../../widgets/CncLaserList/ObjectList';
import OperationsPanel from '../../widgets/CncLaserList/OperationsPanel';
import ToolPathListBox from '../../widgets/CncLaserList/ToolPathList';
import GcodeFilesPanel from '../../widgets/CncLaserOutput/GcodeFilesPanel';
import { getEditorStep } from './editor-step';
import PanelChrome from './PanelChrome';
import panelStyles from './styles/panel-chrome.styl';

interface ProjectLeftViewProps {
    headType: 'laser' | 'cnc';
    collapsed: boolean;
    onToggleCollapsed: () => void;
    // laser SVG clipping or A-B position mode (page state): no membership edits
    modeBlocked?: boolean;
    // opens the workspace popup (step 3: "Load to workspace" on a G-code file)
    onOpenWorkspace?: (count?: number) => void;
}

const ObjectsIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" />
    </svg>
);

const FilesIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />
    </svg>
);

const OperationsIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 18c4 0 4-12 8-12s4 12 8 12" />
    </svg>
);

/**
 * Left panel of the Laser/CNC editor.
 * - Step 1 (design): the object list (moved here from the bottom-left card of the canvas),
 *   then the operations with their objects.
 * - Steps 2/3 (process page): the toolpath list as cards in milling order (moved here from
 *   the right panel; select, show/hide, edit dialog, context menu, delete, prioritize,
 *   create), then the object list (objects are still selected here to create a toolpath
 *   while the canvas shows the toolpath preview).
 * - Step 3 (G-code): the generated G-code files (CncLaserOutput/GcodeFilesPanel).
 */
const ProjectLeftView: React.FC<ProjectLeftViewProps> = ({
    headType, collapsed, onToggleCollapsed, modeBlocked = false, onOpenWorkspace = () => undefined
}) => {
    const objectsLabel = i18n._('key-CncLaser/ObjectList_Title-Object List');
    const operationsLabel = i18n._('key-CncLaser/Operations-Operations');
    const filesLabel = i18n._('key-CncLaser/GcodeFiles-Files');
    const page = useSelector(state => state[headType]?.page);
    const needToPreview = useSelector(state => state[headType]?.needToPreview);
    const gcodeFile = useSelector(state => state[headType]?.gcodeFile);
    const viewingToolpaths = useSelector(state => state[headType]?.viewingToolpaths);
    const gcodeRequested = useSelector(state => state[headType]?.gcodeRequested);
    const fileCount = useSelector(state => (state[headType]?.gcodeFiles || []).length);
    const isOnABPosition = useSelector(state => headType === HEAD_LASER && !!state[HEAD_LASER]?.isOnABPosition);
    const step = getEditorStep({ page, needToPreview, gcodeFile, viewingToolpaths, gcodeRequested });
    const isDesign = page === PAGE_EDITOR;
    const isGcode = step === 'gcode';
    const operationsItem = { key: 'operations', label: operationsLabel, icon: <OperationsIcon /> };
    const objectsItem = { key: 'objects', label: objectsLabel, icon: <ObjectsIcon /> };
    const filesItem = { key: 'files', label: filesLabel, icon: <FilesIcon /> };
    let railItems = isDesign ? [objectsItem, operationsItem] : [operationsItem, objectsItem];
    let title = isDesign ? objectsLabel : i18n._('key-CncLaser/Operations-Operations · order');
    if (isGcode) {
        railItems = [filesItem];
        title = headType === HEAD_CNC && fileCount > 1 ? i18n._('key-CncLaser/GcodeFiles-Files · change tool between them') : filesLabel;
    }
    return (
        <PanelChrome
            side="left"
            title={title}
            hint={isDesign ? i18n._('key-CncLaser/Group-Ctrl+G group') : undefined}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            collapseLabel={i18n._('key-CncLaser/Panel-Collapse left panel')}
            expandLabel={i18n._('key-CncLaser/Panel-Expand left panel')}
            railItems={railItems}
        >
            {isDesign && (
                <>
                    <div className="padding-horizontal-8">
                        <CncLaserObjectList headType={headType} fill />
                    </div>
                    <OperationsPanel headType={headType} blocked={isOnABPosition || modeBlocked} />
                </>
            )}
            {isGcode && <GcodeFilesPanel headType={headType} onOpenWorkspace={onOpenWorkspace} />}
            {!isDesign && !isGcode && (
                <>
                    {/* widget-list-intro: starter guide hook on the container holding the toolpath list */}
                    <div className="widget-list-intro">
                        <ToolPathListBox headType={headType} />
                    </div>
                    <span className={panelStyles['section-label']}>{objectsLabel}</span>
                    <div className="padding-horizontal-8">
                        <CncLaserObjectList headType={headType} fill />
                    </div>
                </>
            )}
        </PanelChrome>
    );
};

export default ProjectLeftView;
