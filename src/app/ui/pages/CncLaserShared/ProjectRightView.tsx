import { Machine } from '@snapmaker/luban-platform';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { RootState } from '../../../flux/index.def';
import i18n from '../../../lib/i18n';
import { renderWidgetList } from '../../utils';
import CNCPathWidget from '../../widgets/CNCPath';
import ToolPathListBox from '../../widgets/CncLaserList/ToolPathList';
import CncLaserOutputWidget from '../../widgets/CncLaserOutput';
import LaserParamsWidget from '../../widgets/LaserParams';
import LaserTestFocusWidget from '../../widgets/LaserTestFocus';
import VisualizerWidget from '../../widgets/WorkspaceVisualizer';
import { LoadGcodeOptions } from '../../widgets/CncLaserOutput/Output';
import { SnapmakerRayMachine } from '../../../machines';
import PanelChrome from './PanelChrome';

const allWidgets = {
    'visualizer': VisualizerWidget,
    'laser-params': LaserParamsWidget,
    'laser-test-focus': LaserTestFocusWidget,
    'cnc-path': CNCPathWidget,
    'toolpath-list': ToolPathListBox,
};

interface ProjectRightViewProps {
    headType: 'laser' | 'cnc';
    page: string;
    widgets: string[];
    listActions: {
        [actionName: string]: () => void;
    };
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
}

/**
 * Right panel of the Laser/CNC editor. The former Edit/Process tabs are replaced by the
 * stepper (CncLaserShared/Stepper): the widgets show themselves by `page` (step 1 = Edit
 * widgets, steps 2 and 3 = Process widgets) and the Output widget stays mounted in every
 * step (G-code generation, thumbnail, export menu event).
 */
const RenderProjectRightView: React.FC<ProjectRightViewProps> = ({
    headType, page, widgets, listActions, collapsed = false, onToggleCollapsed = () => undefined
}) => {
    const activeMachine: Machine | null = useSelector((state: RootState) => state.machine.activeMachine);

    const widgetProps = { headType };

    const loadGcodeOptions: LoadGcodeOptions = useMemo(() => {
        return {
            renderImmediately: activeMachine?.identifier === SnapmakerRayMachine.identifier,
        };
    }, [activeMachine?.identifier]);

    return (
        <PanelChrome
            side="right"
            title={page === PAGE_EDITOR ? i18n._('key-CncLaser/Panel-Properties') : i18n._('key-CncLaser/RightSidebar-Process')}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            collapseLabel={i18n._('key-CncLaser/Panel-Collapse right panel')}
            expandLabel={i18n._('key-CncLaser/Panel-Expand right panel')}
            className="laser-intro-edit-panel" // for starter guide
        >
            <div className={classNames('sm-flex sm-flex-direction-c')}>
                {renderWidgetList(headType, 'default', widgets, allWidgets, listActions, widgetProps)}
                <CncLaserOutputWidget
                    headType={headType}
                    loadGcodeOptions={loadGcodeOptions}
                />
            </div>
        </PanelChrome>
    );
};

export default RenderProjectRightView;
