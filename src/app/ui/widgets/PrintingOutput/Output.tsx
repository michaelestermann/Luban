import classNames from 'classnames';
import { noop } from 'lodash';
import path from 'path';
import React, { useCallback, useEffect, useRef } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { HEAD_PRINTING } from '../../../constants';
import type { RootState } from '../../../flux/index.def';
import { actions as printingActions } from '../../../flux/printing';
import { actions as projectActions } from '../../../flux/project';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';
import { STEP_STAGE } from '../../../lib/manager/ProgressManager';
import modal from '../../../lib/modal';
import UniApi from '../../../lib/uni-api';
import { Button } from '../../components/Buttons';
import Dropdown from '../../components/Dropdown';
import Menu from '../../components/Menu';
import SvgIcon from '../../components/SvgIcon';
import { toast } from '../../components/Toast';
import { useOpenWorkspace } from '../../layouts/tab-shell/TabShell';
import { sendJobToWorkspace } from '../CncLaserOutput/load-gcode-to-workspace';
import { SceneToast } from '../../views/toasts/SceneToast';
import Thumbnail from './Thumbnail';

const Output: React.FC = () => {
    const stage = useSelector((state: RootState) => state.printing?.stage, shallowEqual);
    const modelGroup = useSelector((state: RootState) => state.printing?.modelGroup);
    const hasAnyModelVisible = useSelector(state => state?.printing?.modelGroup?.hasAnyModelVisible(), shallowEqual);
    const isAnyModelOverstepped = useSelector((state: RootState) => state.printing.isAnyModelOverstepped, shallowEqual);
    const isGcodeOverstepped = useSelector(state => state?.printing?.isGcodeOverstepped, shallowEqual);
    const gcodeLine = useSelector(state => state?.printing?.gcodeLine);
    const gcodeFile = useSelector((state: RootState) => state.printing?.gcodeFile);
    const displayedType = useSelector(state => state?.printing?.displayedType, shallowEqual);
    const defaultThumbnail = useSelector(state => state?.printing?.thumbnail);
    const leftBarOverlayVisible = useSelector(state => state?.printing?.leftBarOverlayVisible, shallowEqual);
    const outOfMemoryForRenderGcode = useSelector(state => state?.printing?.outOfMemoryForRenderGcode, shallowEqual);
    const workflowState = useSelector(state => state?.machine?.workflowState, shallowEqual);
    const series = useSelector(state => state?.machine?.series, shallowEqual);

    const dispatch = useDispatch();
    const thumbnail = useRef(null);
    // 4.17 tabs: the loaded G-code is shown in the Workspace tab (toast with "Back to …")
    const openWorkspace = useOpenWorkspace(HEAD_PRINTING);
    const loadToWorkspace = useCallback(async () => {
        if (!gcodeFile) {
            return;
        }
        if (!gcodeFile.thumbnail) {
            gcodeFile.thumbnail = thumbnail.current?.getDataURL() || defaultThumbnail;
        }
        const count: number = await dispatch(sendJobToWorkspace(HEAD_PRINTING, [gcodeFile])) as unknown as number;
        if (count > 0) {
            openWorkspace(count);
            window.scrollTo(0, 0);
        }
    }, [dispatch, gcodeFile, defaultThumbnail, openWorkspace]);
    const actions = {
        onToggleDisplayGcode: () => {
            if (displayedType === 'gcode') {
                dispatch(printingActions.displayModel());
            } else {
                dispatch(printingActions.displayGcode());
            }
        },

        onClickLoadGcode: () => {
            if (isGcodeOverstepped) {
                modal({
                    title: 'Warning',
                    body: 'Generated G-code overstepped out of the cube, please modify your model and re-generate G-code.'
                });
                return;
            }
            gcodeFile.thumbnail = thumbnail.current.getDataURL() || defaultThumbnail;
            loadToWorkspace();
            logGcodeExport(HEAD_PRINTING, 'workspace');
        },

    };
    const onClickGenerateGcode = useCallback(() => {
        const gcodeThumbnail = thumbnail.current.getThumbnail(series);
        dispatch(printingActions.generateGcode(gcodeThumbnail));
        dispatch(printingActions.generateGrayModeObject());
    }, [dispatch, series]);

    const onClickExportGcode = useCallback(async () => {
        if (isGcodeOverstepped) {
            modal({
                title: 'Warning',
                body: 'Generated G-code overstepped out of the cube, please modify your model and re-generate G-code.'
            });
            return;
        }

        // log
        logGcodeExport(HEAD_PRINTING, 'local');

        // export; 4.17: the saved file is also loaded into the Workspace, which is shown
        const filename = path.basename(gcodeFile?.name);
        const saved: boolean = await dispatch(projectActions.exportFile(filename, gcodeFile?.renderGcodeFileName)) as unknown as boolean;
        if (saved) {
            await loadToWorkspace();
        }
    }, [dispatch, isGcodeOverstepped, gcodeFile, loadToWorkspace]);

    useEffect(() => {
        UniApi.Event.on('appbar-menu:printing.export-gcode', onClickExportGcode);
        return () => {
            UniApi.Event.off('appbar-menu:printing.export-gcode', onClickExportGcode);
        };
    }, [onClickExportGcode]);


    const toastRef = useRef();
    useEffect(() => {
        if (outOfMemoryForRenderGcode) {
            window.requestAnimationFrame(() => {
                if (toastRef.current) {
                    toast.dismiss(toastRef.current);
                }
                toastRef.current = toast(
                    <SceneToast
                        type="warning"
                        text={i18n._('key-Printing/Out of memory.Failed to load preview.')}
                    />
                );
            });
        } else {
            if (toastRef.current) {
                toast.dismiss(toastRef.current);
            }
        }
    }, [outOfMemoryForRenderGcode]);


    const isSlicing = stage === STEP_STAGE.PRINTING_SLICING;
    const menu = (
        <Menu>
            <Menu.Item
                onClick={actions.onClickLoadGcode}
                key="Load G-code to Workspace"
                disabled={workflowState === 'running' || !gcodeFile}
            >
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-Printing/G-codeAction-Load G-code to Workspace')}
                </div>
            </Menu.Item>
            <Menu.Item
                key="Export G-code to File"
                disabled={!gcodeFile}
                onClick={onClickExportGcode}
            >
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-Printing/G-codeAction-Export G-code to File')}
                </div>
            </Menu.Item>
        </Menu>
    );

    return (
        <div className={classNames('border-radius-8', 'bottom-8', 'background-color-white', 'width-360', 'module-default-shadow', 'print-output-intro')}>
            <div className={classNames('position-re', 'margin-horizontal-16', 'margin-vertical-16')}>
                {
                    !gcodeFile && (
                        <Button
                            type="primary"
                            priority="level-one"
                            onClick={onClickGenerateGcode}
                            disabled={!hasAnyModelVisible || isSlicing || isAnyModelOverstepped || leftBarOverlayVisible}
                        >
                            {i18n._('key-Printing/G-codeAction-Generate G-code')}
                        </Button>
                    )
                }
                {
                    gcodeFile && !outOfMemoryForRenderGcode && (
                        <Button
                            type="default"
                            priority="level-one"
                            onClick={actions.onToggleDisplayGcode}
                            className={classNames('position-re', 'bottom-0', 'left-0')}
                        >
                            {displayedType === 'gcode' ? i18n._('key-Printing/G-codeAction-Close Preview') : i18n._('key-Printing/G-codeAction-Preview')}
                        </Button>
                    )
                }
                {
                    gcodeFile && (
                        <div
                            onKeyDown={noop}
                            role="button"
                            className={classNames('position-re', 'height-40', 'margin-top-10')}
                            tabIndex={0}
                        >
                            <Dropdown
                                overlay={menu}
                                trigger="click"
                            >
                                <Button
                                    type="primary"
                                    priority="level-one"
                                    className={classNames(
                                        'position-absolute',
                                        displayedType === gcodeLine ? 'display-block' : 'display-none'
                                    )}
                                    suffixIcon={<SvgIcon name="DropdownOpen" type={['static']} color="#D5D6D9" />}
                                >
                                    {i18n._('key-Printing/G-codeAction-Export')}
                                </Button>
                            </Dropdown>
                        </div>
                    )
                }
            </div>
            <Thumbnail
                ref={thumbnail}
                modelGroup={modelGroup}
            />
        </div>
    );
};

export default React.memo(Output);
