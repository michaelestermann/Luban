import React from 'react';
import { useSelector } from 'react-redux';

import { HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import i18n from '../../../lib/i18n';
import CncLaserObjectList from '../../widgets/CncLaserList/ObjectList';
import OperationsPanel from '../../widgets/CncLaserList/OperationsPanel';
import PanelChrome from './PanelChrome';

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
 * Left panel of the Laser/CNC editor: the object list (moved here from the bottom-left card
 * of the canvas) in every step; in step 1 (design) followed by the operations with their
 * objects. Later tasks add the toolpath list (step 2) and the G-code files (step 3).
 */
const ProjectLeftView: React.FC<ProjectLeftViewProps> = ({ headType, collapsed, onToggleCollapsed, modeBlocked = false }) => {
    const objectsLabel = i18n._('key-CncLaser/ObjectList_Title-Object List');
    const operationsLabel = i18n._('key-CncLaser/Operations-Operations');
    const page = useSelector(state => state[headType]?.page);
    const isOnABPosition = useSelector(state => headType === HEAD_LASER && !!state[HEAD_LASER]?.isOnABPosition);
    const isDesign = page === PAGE_EDITOR;
    const railItems = [{ key: 'objects', label: objectsLabel, icon: <ObjectsIcon /> }];
    if (isDesign) {
        railItems.push({ key: 'operations', label: operationsLabel, icon: <OperationsIcon /> });
    }
    return (
        <PanelChrome
            side="left"
            title={objectsLabel}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            collapseLabel={i18n._('key-CncLaser/Panel-Collapse left panel')}
            expandLabel={i18n._('key-CncLaser/Panel-Expand left panel')}
            railItems={railItems}
        >
            <div className="padding-horizontal-8">
                <CncLaserObjectList headType={headType} fill />
            </div>
            {isDesign && (
                <OperationsPanel headType={headType} blocked={isOnABPosition || modeBlocked} />
            )}
        </PanelChrome>
    );
};

export default ProjectLeftView;
