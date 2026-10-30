import React from 'react';

import i18n from '../../../lib/i18n';
import CncLaserObjectList from '../../widgets/CncLaserList/ObjectList';
import PanelChrome from './PanelChrome';

interface ProjectLeftViewProps {
    headType: 'laser' | 'cnc';
    collapsed: boolean;
    onToggleCollapsed: () => void;
}

const ObjectsIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4" />
    </svg>
);

/**
 * Left panel of the Laser/CNC editor: the object list (moved here from the bottom-left card
 * of the canvas) in every step. Later tasks add the operations (step 1), the toolpath list
 * (step 2) and the G-code files (step 3).
 */
const ProjectLeftView: React.FC<ProjectLeftViewProps> = ({ headType, collapsed, onToggleCollapsed }) => {
    const objectsLabel = i18n._('key-CncLaser/ObjectList_Title-Object List');
    return (
        <PanelChrome
            side="left"
            title={objectsLabel}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            collapseLabel={i18n._('key-CncLaser/Panel-Collapse left panel')}
            expandLabel={i18n._('key-CncLaser/Panel-Expand left panel')}
            railItems={[{ key: 'objects', label: objectsLabel, icon: <ObjectsIcon /> }]}
        >
            <div className="padding-horizontal-8">
                <CncLaserObjectList headType={headType} fill />
            </div>
        </PanelChrome>
    );
};

export default ProjectLeftView;
