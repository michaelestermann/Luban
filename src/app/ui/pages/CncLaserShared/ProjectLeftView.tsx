import React from 'react';
import { useSelector } from 'react-redux';

import { HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import i18n from '../../../lib/i18n';
import CncLaserObjectList from '../../widgets/CncLaserList/ObjectList';
import OperationsPanel from '../../widgets/CncLaserList/OperationsPanel';
import ToolPathListBox from '../../widgets/CncLaserList/ToolPathList';
import PanelChrome from './PanelChrome';
import panelStyles from './styles/panel-chrome.styl';

interface ProjectLeftViewProps {
    headType: 'laser' | 'cnc';
    collapsed: boolean;
    onToggleCollapsed: () => void;
    // laser SVG clipping or A-B position mode (page state): no membership edits
    modeBlocked?: boolean;
}

const ObjectsIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" />
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
 */
const ProjectLeftView: React.FC<ProjectLeftViewProps> = ({ headType, collapsed, onToggleCollapsed, modeBlocked = false }) => {
    const objectsLabel = i18n._('key-CncLaser/ObjectList_Title-Object List');
    const operationsLabel = i18n._('key-CncLaser/Operations-Operations');
    const page = useSelector(state => state[headType]?.page);
    const isOnABPosition = useSelector(state => headType === HEAD_LASER && !!state[HEAD_LASER]?.isOnABPosition);
    const isDesign = page === PAGE_EDITOR;
    const operationsItem = { key: 'operations', label: operationsLabel, icon: <OperationsIcon /> };
    const objectsItem = { key: 'objects', label: objectsLabel, icon: <ObjectsIcon /> };
    const railItems = isDesign ? [objectsItem, operationsItem] : [operationsItem, objectsItem];
    return (
        <PanelChrome
            side="left"
            title={isDesign ? objectsLabel : i18n._('key-CncLaser/Operations-Operations · order')}
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
            {!isDesign && (
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
