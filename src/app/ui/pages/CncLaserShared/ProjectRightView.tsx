import { Machine } from '@snapmaker/luban-platform';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { RootState } from '../../../flux/index.def';
import i18n from '../../../lib/i18n';
import { renderWidgetList } from '../../utils';
import CNCPathWidget from '../../widgets/CNCPath';
import ToolPathSettings from '../../widgets/CncLaserList/ToolPathList/ToolPathSettings';
import CncLaserOutputWidget from '../../widgets/CncLaserOutput';
import JobPanel from '../../widgets/CncLaserOutput/JobPanel';
import LaserParamsWidget from '../../widgets/LaserParams';
import LaserTestFocusWidget from '../../widgets/LaserTestFocus';
import VisualizerWidget from '../../widgets/WorkspaceVisualizer';
import { LoadGcodeOptions } from '../../widgets/CncLaserOutput/Output';
import { SnapmakerRayMachine } from '../../../machines';
import { getEditorStep } from './editor-step';
import PanelChrome from './PanelChrome';
import chromeStyles from './styles/panel-chrome.styl';

const allWidgets = {
    'visualizer': VisualizerWidget,
    'laser-params': LaserParamsWidget,
    'laser-test-focus': LaserTestFocusWidget,
    'cnc-path': CNCPathWidget,
};

// the toolpath list moved to the left panel (step 2); its settings are rendered below
const LEFT_PANEL_WIDGETS = ['toolpath-list'];

interface ProjectRightViewProps {
    headType: 'laser' | 'cnc';
    page: string;
    widgets: string[];
    listActions: {
        [actionName: string]: () => void;
    };
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
    // opens the workspace popup (step 3: Export > Load G-code to Workspace)
    onOpenWorkspace?: () => void;
}

/**
 * Right panel of the Laser/CNC editor. The former Edit/Process tabs are replaced by the
 * stepper (CncLaserShared/Stepper): the widgets show themselves by `page` (step 1 = Edit
 * widgets), steps 2 and 3 show the settings of the selected toolpath (titled with its
 * number and name), step 3 shows the machine/job panel (CncLaserOutput/JobPanel), and the
 * Output widget stays mounted in every step (G-code generation, thumbnail, export menu
 * event, preview toggle).
 */
const RenderProjectRightView: React.FC<ProjectRightViewProps> = ({
    headType, page, widgets, listActions, collapsed = false, onToggleCollapsed = () => undefined,
    onOpenWorkspace = () => undefined
}) => {
    const activeMachine: Machine | null = useSelector((state: RootState) => state.machine.activeMachine);

    const widgetProps = { headType };
    const isDesign = page === PAGE_EDITOR;
    const needToPreview = useSelector((state: RootState) => state[headType]?.needToPreview);
    const gcodeFile = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const viewingToolpaths = useSelector((state: RootState) => state[headType]?.viewingToolpaths);
    const gcodeRequested = useSelector((state: RootState) => state[headType]?.gcodeRequested);
    const isGcode = getEditorStep({ page, needToPreview, gcodeFile, viewingToolpaths, gcodeRequested }) === 'gcode';
    const rightWidgets = useMemo(() => (widgets || []).filter(id => !LEFT_PANEL_WIDGETS.includes(id)), [widgets]);

    // toolpaths are mutable: renderingTimestamp re-renders on renames
    useSelector((state: RootState) => state[headType]?.renderingTimestamp);
    const toolPaths = useSelector((state: RootState) => state[headType]?.toolPathGroup?.getToolPaths(), shallowEqual) || [];
    const selectedToolPathIds: string[] = useSelector((state: RootState) => state[headType]?.toolPathGroup?.selectedToolPathArray, shallowEqual) || [];
    const selectedIndex = selectedToolPathIds.length === 1 ? toolPaths.findIndex(toolPath => toolPath.id === selectedToolPathIds[0]) : -1;

    let title = i18n._('key-CncLaser/Panel-Properties');
    if (isGcode) {
        title = i18n._('key-CncLaser/JobPanel-Machine');
    } else if (!isDesign) {
        title = selectedIndex >= 0
            ? `${selectedIndex + 1} · ${toolPaths[selectedIndex].name}`
            : i18n._('key-CncLaser/RightSidebar-Process');
    }

    const loadGcodeOptions: LoadGcodeOptions = useMemo(() => {
        return {
            renderImmediately: activeMachine?.identifier === SnapmakerRayMachine.identifier,
        };
    }, [activeMachine?.identifier]);

    return (
        <PanelChrome
            side="right"
            title={title}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            collapseLabel={i18n._('key-CncLaser/Panel-Collapse right panel')}
            expandLabel={i18n._('key-CncLaser/Panel-Expand right panel')}
            className="laser-intro-edit-panel" // for starter guide
            bodyClassName={isDesign ? chromeStyles.properties : undefined}
        >
            <div className={classNames('sm-flex sm-flex-direction-c')}>
                {isGcode && <JobPanel headType={headType} onOpenWorkspace={onOpenWorkspace} />}
                {!isDesign && !isGcode && <ToolPathSettings headType={headType} />}
                {renderWidgetList(headType, 'default', rightWidgets, allWidgets, listActions, widgetProps)}
                <CncLaserOutputWidget
                    headType={headType}
                    loadGcodeOptions={loadGcodeOptions}
                />
            </div>
        </PanelChrome>
    );
};

export default RenderProjectRightView;
