import classNames from 'classnames';
import { noop } from 'lodash';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import {
    DISPLAYED_TYPE_TOOLPATH,
    PAGE_EDITOR,
} from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import { RootState } from '../../../flux/index.def';
import { actions as projectActions } from '../../../flux/project';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';
import modal from '../../../lib/modal';
import UniApi from '../../../lib/uni-api';
import { SnapmakerRayMachine } from '../../../machines';
import { Button } from '../../components/Buttons';
import Dropdown from '../../components/Dropdown';
import Menu from '../../components/Menu';
import SvgIcon from '../../components/SvgIcon';
import Workspace from '../../pages/Workspace';
import { LaserWorkspaceRay } from '../../pages/laser-workspace-ray';
import { renderPopup } from '../../utils';
import Thumbnail from '../CncLaserShared/Thumbnail';
import styles from './styles.styl';
import { loadGcodeToWorkspace } from './load-gcode-to-workspace';

export type LoadGcodeOptions = {
    renderImmediately?: boolean;
};

interface OutputViewProps {
    headType: 'laser' | 'cnc';

    loadGcodeOptions?: LoadGcodeOptions;
}

const Output: React.FC<OutputViewProps> = (props) => {
    const { headType, loadGcodeOptions } = props;

    const isOnABPosition = useSelector((state: RootState) => state.laser.isOnABPosition);
    const activeMachine = useSelector((state: RootState) => state.machine.activeMachine);

    const displayedType = useSelector((state: RootState) => state[headType]?.displayedType);
    const gcodeFile = useSelector(state => state[headType]?.gcodeFile);
    // CNC jobs with several tools: one file per tool, in milling order
    const gcodeFiles = useSelector(state => state[headType]?.gcodeFiles) || [];
    const needToPreview = useSelector(state => state[headType]?.needToPreview);
    const page = useSelector(state => state[headType]?.page);
    const previewFailed = useSelector(state => state[headType]?.previewFailed);
    const shouldGenerateGcodeCounter = useSelector(state => state[headType]?.shouldGenerateGcodeCounter);
    const hasModel = useSelector(state => state[headType]?.modelGroup.hasModel(), shallowEqual);
    const toolPathGroup = useSelector(state => state[headType]?.toolPathGroup);
    const workflowState = useSelector((state: RootState) => state.machine?.workflowState);
    const isGcodeGenerating = useSelector(state => state[headType]?.isGcodeGenerating);
    const materials = useSelector(state => state[headType]?.materials);
    const series = useSelector((state: RootState) => state.machine?.series, shallowEqual);

    // states
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [showExportOptions, setShowExportOptions] = useState(false);

    const dispatch = useDispatch();
    const thumbnail = useRef();

    const actions = {
        switchToEditPage: () => {
            if (displayedType === DISPLAYED_TYPE_TOOLPATH) {
                dispatch(editorActions.showModelGroupObject(headType));
            } else {
                dispatch(editorActions.showToolPathGroupObject(headType));
            }
        },
        onGenerateThumbnail: () => {
            dispatch(editorActions.setThumbnail(headType, thumbnail?.current?.getThumbnail(series)));
        },

        onExport: () => {
            if (gcodeFile === null) {
                return;
            }
            logGcodeExport(headType, 'local', materials.isRotate);
            dispatch(projectActions.exportFile(gcodeFile.uploadName, gcodeFile.renderGcodeFileName));
        },
        onProcess: () => {
            dispatch(editorActions.createToolPath(headType));
        },
        showToolPathObject: () => {
            dispatch(editorActions.showToolPathGroupObject(headType));
        },
        setAutoPreview: (enable) => {
            dispatch(editorActions.setAutoPreview(headType, enable));
        },
        showAndHideToolPathObject: () => {
            if (displayedType === DISPLAYED_TYPE_TOOLPATH) {
                dispatch(editorActions.showModelGroupObject(headType));
            } else {
                dispatch(editorActions.showToolPathGroupObject(headType));
            }
        },
        handleMouseOver: () => {
            setShowExportOptions(true);
        },
        handleMouseOut: () => {
            setShowExportOptions(false);
        }
    };

    const onLoadGcodeToWorkspace = useCallback(async () => {
        const loaded = await dispatch(loadGcodeToWorkspace(headType, loadGcodeOptions?.renderImmediately || false));
        if (!loaded) {
            return;
        }

        // open workspace
        setShowWorkspace(true);
        window.scrollTo(0, 0);
    }, [
        dispatch,
        headType,
        loadGcodeOptions?.renderImmediately,
    ]);

    useEffect(() => {
        UniApi.Event.on('appbar-menu:cnc-laser.export-gcode', actions.onExport);
        return () => {
            UniApi.Event.off('appbar-menu:cnc-laser.export-gcode', actions.onExport);
        };
    }, [gcodeFile]);

    useEffect(() => {
        if (previewFailed) {
            modal({
                title: i18n._('key-CncLaser/G-codeAction-Failed to preview'),
                body: i18n._('key-CncLaser/G-codeAction-Failed to preview, please modify parameters and try again.')
            });
        }
    }, [previewFailed]);
    useEffect(() => {
        actions.onGenerateThumbnail();
        dispatch(editorActions.commitGenerateGcode(headType));
    }, [shouldGenerateGcodeCounter]);


    const renderWorkspace = useCallback(() => {
        if (!showWorkspace) {
            return null;
        }

        const onClose = () => setShowWorkspace(false);

        let component = Workspace;
        if (activeMachine?.identifier === SnapmakerRayMachine.identifier) {
            component = LaserWorkspaceRay;
        }

        return showWorkspace && renderPopup({
            onClose,
            component,
        });
    }, [showWorkspace, activeMachine?.identifier]);

    const shouldRenderToolPaths = toolPathGroup.toolPaths.every(toolPath => {
        return !toolPath.visible || !toolPath.hasVisibleModels();
    });

    const isEditor = page === PAGE_EDITOR;
    // the preview toggle, file list and Export only exist once the toolpaths are previewed
    const hasVisibleContent = !isEditor && !needToPreview;

    const menu = (
        <Menu>
            <Menu.Item
                disabled={shouldRenderToolPaths || !hasModel || workflowState === 'running' || isGcodeGenerating || gcodeFile === null}
                onClick={onLoadGcodeToWorkspace}
            >
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-CncLaser/G-codeAction-Load G-code to Workspace')}
                </div>
            </Menu.Item>
            <Menu.Item
                disabled={shouldRenderToolPaths || !hasModel || workflowState === 'running' || isGcodeGenerating || gcodeFile === null}
                onClick={actions.onExport}
            >
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-CncLaser/G-codeAction-Export G-code to File')}
                </div>
            </Menu.Item>
        </Menu>
    );

    return (
        <div>
            {/* "Next" and "Generate G-code" moved to the stepper row (CncLaserShared/Stepper) */}
            <div className={classNames(styles['output-wrapper'], { 'display-none': !hasVisibleContent })}>
                {!isEditor && !needToPreview && displayedType === DISPLAYED_TYPE_TOOLPATH && !showExportOptions && (
                    <Button
                        type="default"
                        priority="level-one"
                        disabled={isOnABPosition}
                        onClick={() => {
                            actions.switchToEditPage();
                            actions.handleMouseOut();
                        }}
                        className={classNames('position-re', 'bottom-0', 'left-0')}
                    >
                        {i18n._('key-CncLaser/G-codeAction-Close Preview')}
                    </Button>
                )}
                {!isEditor && !needToPreview && displayedType !== DISPLAYED_TYPE_TOOLPATH && !showExportOptions && (
                    <Button
                        type="default"
                        priority="level-one"
                        disabled={isOnABPosition}
                        onClick={() => {
                            actions.showToolPathObject();
                        }}
                        className={classNames('position-re', 'bottom-0', 'left-0')}
                    >
                        {i18n._('key-CncLaser/G-codeAction-Preview')}
                    </Button>
                )}
                {!isEditor && !needToPreview && gcodeFiles.length > 1 && (
                    <div className="margin-top-10">
                        <div className="font-weight-bold">
                            {i18n._('key-CncLaser/G-codeAction-G-code files (change tool between files)')}
                        </div>
                        {gcodeFiles.map(file => (
                            <div key={file.uploadName} className="margin-top-4" title={file.renderGcodeFileName}>
                                {`${file.index}. ${file.toolName} – ${file.toolPathNames.join(', ')} (${Math.ceil(file.estimatedTime / 60)} min)`}
                            </div>
                        ))}
                    </div>
                )}
                {!isEditor && !needToPreview && (
                    <div
                        onKeyDown={noop}
                        role="button"
                        tabIndex={0}
                        className={classNames('position-re', 'height-40', 'margin-top-10')}
                    >
                        <Dropdown
                            overlay={menu}
                            trigger="click"
                        >
                            <Button
                                type="primary"
                                priority="level-one"
                                disabled={isOnABPosition || (shouldRenderToolPaths || !hasModel || workflowState === 'running' || isGcodeGenerating || gcodeFile === null)}
                                className={classNames(
                                    'position-absolute',
                                    // 'bottom-ne-8',
                                    // 'margin-top-10',
                                    displayedType === DISPLAYED_TYPE_TOOLPATH ? 'display-block' : 'display-none'
                                )}
                                suffixIcon={<SvgIcon name="DropdownOpen" type={['static']} color="#d5d6d9" />}
                            >
                                {i18n._('key-CncLaser/G-codeAction-Export')}
                            </Button>
                        </Dropdown>
                    </div>
                )}
            </div>
            <Thumbnail
                ref={thumbnail}
                myRef={thumbnail}
                toolPathGroup={toolPathGroup}
            />
            {renderWorkspace()}
        </div>
    );
};

Output.propTypes = {
    headType: PropTypes.string
};

export default Output;
