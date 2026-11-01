import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import {
    DISPLAYED_TYPE_TOOLPATH,
    PAGE_EDITOR,
} from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import { RootState } from '../../../flux/index.def';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';
import modal from '../../../lib/modal';
import UniApi from '../../../lib/uni-api';
import { Button } from '../../components/Buttons';
import { getEditorStep } from '../../pages/CncLaserShared/editor-step';
import { useOpenWorkspace } from '../../layouts/tab-shell/TabShell';
import Thumbnail from '../CncLaserShared/Thumbnail';
import ExportDropdown from './ExportDropdown';
import { exportGcodeFileAndLoad } from './load-gcode-to-workspace';
import styles from './styles.styl';

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

    const displayedType = useSelector((state: RootState) => state[headType]?.displayedType);
    const gcodeFile = useSelector(state => state[headType]?.gcodeFile);
    const viewingToolpaths = useSelector(state => state[headType]?.viewingToolpaths);
    const gcodeRequested = useSelector(state => state[headType]?.gcodeRequested);
    const needToPreview = useSelector(state => state[headType]?.needToPreview);
    const page = useSelector(state => state[headType]?.page);
    const previewFailed = useSelector(state => state[headType]?.previewFailed);
    const shouldGenerateGcodeCounter = useSelector(state => state[headType]?.shouldGenerateGcodeCounter);
    const toolPathGroup = useSelector(state => state[headType]?.toolPathGroup);
    const materials = useSelector(state => state[headType]?.materials);
    const series = useSelector((state: RootState) => state.machine?.series, shallowEqual);

    // states
    const [showExportOptions, setShowExportOptions] = useState(false);

    const dispatch = useDispatch();
    const thumbnail = useRef();
    // 4.17 tabs: loaded G-code (count) is shown in the Workspace tab with a toast
    const onOpenWorkspace = useOpenWorkspace(headType);

    const onExport = useCallback(async () => {
        if (!gcodeFile) {
            return;
        }
        logGcodeExport(headType, 'local', materials.isRotate);
        // 4.17: the exported file is also loaded into the Workspace, which is shown
        const renderNow = loadGcodeOptions?.renderImmediately || false;
        const count: number = await dispatch(exportGcodeFileAndLoad(headType, gcodeFile, renderNow)) as unknown as number;
        if (count > 0) {
            onOpenWorkspace(count);
            window.scrollTo(0, 0);
        }
    }, [dispatch, gcodeFile, headType, materials, loadGcodeOptions, onOpenWorkspace]);

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

        onExport,
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

    useEffect(() => {
        UniApi.Event.on('appbar-menu:cnc-laser.export-gcode', onExport);
        return () => {
            UniApi.Event.off('appbar-menu:cnc-laser.export-gcode', onExport);
        };
    }, [onExport]);

    useEffect(() => {
        if (previewFailed) {
            modal({
                title: i18n._('key-CncLaser/G-codeAction-Failed to preview'),
                body: i18n._('key-CncLaser/G-codeAction-Failed to preview, please modify parameters and try again.')
            });
        }
    }, [previewFailed]);
    // 4.17 tabs: the page of a document is mounted again on a tab switch; the G-code is generated when the
    // counter changes, not again on mount (that replaced the G-code of the document every time)
    const generatedCounter = useRef(shouldGenerateGcodeCounter);
    useEffect(() => {
        if (generatedCounter.current === shouldGenerateGcodeCounter) {
            return;
        }
        generatedCounter.current = shouldGenerateGcodeCounter;
        actions.onGenerateThumbnail();
        dispatch(editorActions.commitGenerateGcode(headType));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger only: generate G-code when the counter is bumped
    }, [shouldGenerateGcodeCounter]);


    const isEditor = page === PAGE_EDITOR;
    // the preview toggle and Export only exist once the toolpaths are previewed
    const hasVisibleContent = !isEditor && !needToPreview;
    // step 3: the G-code files (left panel) and the job panel with the Export dropdown
    // (right panel, CncLaserOutput/JobPanel) take over the file list and Export
    const isGcodeStep = getEditorStep({ page, needToPreview, gcodeFile, viewingToolpaths, gcodeRequested }) === 'gcode';

    return (
        <div>
            {/* "Next" and "Generate G-code" moved to the stepper row (CncLaserShared/Stepper),
                the CNC file list to the G-code step (CncLaserOutput/GcodeFilesPanel) */}
            <div className={classNames(styles['output-wrapper'], { 'display-none': !hasVisibleContent })}>
                {/* "Close Preview" is the stepper's "1 Design" step / Back now */}
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
                {!isEditor && !needToPreview && !isGcodeStep && (
                    <ExportDropdown
                        headType={headType}
                        renderImmediately={loadGcodeOptions?.renderImmediately || false}
                        onOpenWorkspace={onOpenWorkspace}
                        className="margin-top-10"
                    />
                )}
            </div>
            <Thumbnail
                ref={thumbnail}
                myRef={thumbnail}
                toolPathGroup={toolPathGroup}
            />
        </div>
    );
};

Output.propTypes = {
    headType: PropTypes.string
};

export default Output;
