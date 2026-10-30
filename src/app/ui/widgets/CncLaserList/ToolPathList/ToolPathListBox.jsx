import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import classNames from 'classnames';
// import { cloneDeep, isNull } from 'lodash';
import SvgIcon from '../../../components/SvgIcon';
import styles from './toolpath-cards.styl';
import { actions as editorActions } from '../../../../flux/editor';
// import modal from '../../../lib/modal';
import i18n from '../../../../lib/i18n';
// import { toHump } from '../../../../../shared/lib/utils';
import TipTrigger from '../../../components/TipTrigger';
import ToolPathConfigurations from '../../../views/ToolPathConfigurations/ToolPathConfigurations';
import { getOperationMethodId, operationColor } from '../../../../toolpaths/operations-panel';
import { getToolPathCardStatus } from '../../../../toolpaths/toolpath-step';
import { methodLabel } from '../OperationsPanel';

import {
    PAGE_EDITOR,
    PAGE_PROCESS,
    DISPLAYED_TYPE_TOOLPATH
} from '../../../../constants';
import ContextMenu from '../../../components/ContextMenu';


const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M5 12l5 5 9-10" />
    </svg>
);

/**
 * Status of a toolpath card: up to date (check), needs preview, generating, failed.
 * Hidden toolpaths show no status (they are not generated).
 */
const ToolpathStatus = ({ status }) => {
    if (status === 'up-to-date') {
        const label = i18n._('key-CncLaser/ToolPathList-Preview up to date');
        return (
            <span className={classNames(styles.status, styles['status-ok'])} role="img" aria-label={label} title={label}>
                <CheckIcon />
            </span>
        );
    }
    const labels = {
        'needs-preview': i18n._('key-CncLaser/ToolPathList-needs preview'),
        'generating': i18n._('key-CncLaser/ToolPathList-generating'),
        'failed': i18n._('key-CncLaser/ToolPathList-failed')
    };
    if (!labels[status]) {
        return null;
    }
    return (
        <span className={classNames(styles.status, styles[`status-${status}`])} title={labels[status]}>{labels[status]}</span>
    );
};
ToolpathStatus.propTypes = {
    status: PropTypes.string.isRequired
};

const ToolpathItem = ({
    toolPath, index, headType, needToPreview, selectedToolPathIDArray, selectToolPathId, selectOneToolPathId, selectToolPathById,
    onClickVisible, setEditingToolpath, disabled, showContextMenu
}) => {
    if (!toolPath) {
        return null;
    }
    function handleOnDoubleClick(e) {
        e.stopPropagation();
        setEditingToolpath(toolPath);
        selectToolPathById(toolPath.id);
    }
    function handleOnClick(e) {
        e.stopPropagation();
        if (e.detail > 1) { // Check difference to double click
            return;
        }
        if (e.shiftKey) {
            selectToolPathId(toolPath.id);
        } else {
            selectOneToolPathId(toolPath.id);
        }
    }
    function handleOnKeyDown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            selectOneToolPathId(toolPath.id);
        }
    }
    function handleOnClickVisible(e) {
        e.stopPropagation();
        onClickVisible(toolPath.id, toolPath.visible, toolPath.check);
    }
    const title = `${index + 1} · ${toolPath.name}`;
    const method = methodLabel(getOperationMethodId(toolPath, headType), headType);
    const toolName = toolPath.toolParams?.definitionName ? i18n._(toolPath.toolParams.definitionName) : null;
    const subtitle = [method, toolName].filter(Boolean).join(' · ');
    const selected = selectedToolPathIDArray.includes(toolPath.id);

    return (
        <TipTrigger
            key={toolPath.id}
            title={i18n._('key-CncLaser/ToolPathList/Button/-Object')}
            content={toolPath.name}
        >
            <div
                className={classNames(
                    styles.card,
                    {
                        [styles.selected]: selected,
                        [styles.hidden]: !toolPath.visible
                    }
                )}
                role="button"
                tabIndex="0"
                aria-pressed={selected}
                onClick={handleOnClick}
                onDoubleClick={handleOnDoubleClick}
                onKeyDown={handleOnKeyDown}
                onMouseUp={(e) => {
                    if (e.button === 2) { // right click
                        // item is selected, do not select again
                        if (!(selectedToolPathIDArray.length === 1 && selectedToolPathIDArray[0] === toolPath.id)) {
                            selectOneToolPathId(toolPath.id);
                        }
                        e.persist();
                        showContextMenu(e);
                    }
                }}
            >
                <div className={styles['card-head']}>
                    <span className={styles.dot} style={{ background: operationColor(index) }} />
                    <strong className={styles['card-title']}>{title}</strong>
                    <ToolpathStatus status={getToolPathCardStatus(toolPath, needToPreview)} />
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <span className={styles.eye} onDoubleClick={(e) => e.stopPropagation()}>
                        {!toolPath.visible && (
                            <SvgIcon
                                size={24}
                                color="#BFBFBF"
                                name="HideNormal"
                                type={['static']}
                                title={i18n._('key-CncLaser/ToolPathList/Button/-Hide')}
                                onClick={handleOnClickVisible}
                                disabled={disabled}
                            />
                        )}
                        {toolPath.visible && (
                            <SvgIcon
                                type={['static']}
                                size={24}
                                name="ShowNormal"
                                title={i18n._('key-CncLaser/ToolPathList/Button/-Show')}
                                onClick={handleOnClickVisible}
                                disabled={disabled}
                            />
                        )}
                    </span>
                </div>
                {subtitle && <span className={styles['card-sub']}>{subtitle}</span>}
            </div>
        </TipTrigger>
    );
};
ToolpathItem.propTypes = {
    toolPath: PropTypes.object.isRequired,
    index: PropTypes.number.isRequired,
    headType: PropTypes.string.isRequired,
    needToPreview: PropTypes.bool,
    selectedToolPathIDArray: PropTypes.array.isRequired,
    selectToolPathId: PropTypes.func.isRequired,
    selectOneToolPathId: PropTypes.func.isRequired,
    selectToolPathById: PropTypes.func.isRequired,
    onClickVisible: PropTypes.func.isRequired,
    showContextMenu: PropTypes.func.isRequired,

    setEditingToolpath: PropTypes.func.isRequired,
    disabled: PropTypes.bool.isRequired
};


const ToolPathListBox = (props) => {
    const isOnABPosition = useSelector(state => state.laser?.isOnABPosition);
    const page = useSelector(state => state[props.headType]?.page);
    const toolPaths = useSelector(state => state[props.headType]?.toolPathGroup?.getToolPaths(), shallowEqual);
    const selectedToolPathIDArray = useSelector(state => state[props.headType]?.toolPathGroup?.selectedToolPathArray, shallowEqual);
    const inProgress = useSelector(state => state[props.headType]?.inProgress);
    const displayedType = useSelector(state => state[props.headType]?.displayedType);
    const selectedModelArray = useSelector(state => state[props.headType]?.modelGroup?.getSelectedModelArray());
    const needToPreview = useSelector(state => !!state[props.headType]?.needToPreview);
    // toolpaths are mutable (status, name, config): renderingTimestamp re-renders on every change
    useSelector(state => state[props.headType]?.renderingTimestamp);
    const dispatch = useDispatch();

    const contextMenuDisabled = (selectedToolPathIDArray.length !== 1);
    const selectedFirstToolPathId = selectedToolPathIDArray.length === 1 ? selectedToolPathIDArray[0] : null;
    const selectedFirstToolPath = toolPaths.find(d => d.id === selectedFirstToolPathId);
    const [editingToolpath, setEditingToolpath] = useState(null);
    const contextMenuRef = useRef(null);
    const contextMenuArrangementDisabled = (toolPaths.length === 1);
    const actions = {
        selectOneToolPathId: (id) => {
            dispatch(editorActions.selectOneToolPathId(props.headType, id));
        },
        selectToolPathId: (id) => {
            dispatch(editorActions.selectToolPathId(props.headType, id));
        },
        selectToolPathById: (id) => {
            dispatch(editorActions.selectToolPathById(props.headType, id));
        },
        onClickVisible: (id, visible, check) => {
            dispatch(editorActions.updateToolPath(props.headType, id, {
                visible: !visible,
                check: !check
            }));
            if (displayedType === DISPLAYED_TYPE_TOOLPATH) {
                const hasToolPathVisible = toolPaths.some((toolPath) => {
                    return (toolPath.id === id && !visible) || (toolPath.id !== id && toolPath.visible);
                });
                if (hasToolPathVisible) {
                    dispatch(editorActions.refreshToolPathPreview(props.headType));
                }
            } else {
                dispatch(editorActions.resetProcessState(props.headType));
            }
        },
        deleteToolPath: () => {
            dispatch(editorActions.deleteToolPath(props.headType, selectedToolPathIDArray));
            dispatch(editorActions.refreshToolPathPreview(props.headType));
        },
        commitGenerateToolPath: (toolPathId) => dispatch(editorActions.commitGenerateToolPath(props.headType, toolPathId)),
        toolPathToUp: () => {
            if (selectedFirstToolPathId && toolPaths[0].id !== selectedFirstToolPathId) {
                dispatch(editorActions.toolPathToUp(props.headType, selectedFirstToolPathId));
                dispatch(editorActions.refreshToolPathPreview(props.headType));
            }
        },
        toolPathToDown: () => {
            if (selectedFirstToolPathId && toolPaths[toolPaths.length - 1].id !== selectedFirstToolPathId) {
                dispatch(editorActions.toolPathToDown(props.headType, selectedFirstToolPathId));
                dispatch(editorActions.refreshToolPathPreview(props.headType));
            }
        },
        toolPathToTop: () => {
            if (selectedFirstToolPathId && toolPaths[0].id !== selectedFirstToolPathId) {
                dispatch(editorActions.toolPathToTop(props.headType, selectedFirstToolPathId));
                dispatch(editorActions.refreshToolPathPreview(props.headType));
            }
        },
        toolPathToBottom: () => {
            if (selectedFirstToolPathId && toolPaths[toolPaths.length - 1].id !== selectedFirstToolPathId) {
                dispatch(editorActions.toolPathToBottom(props.headType, selectedFirstToolPathId));
                dispatch(editorActions.refreshToolPathPreview(props.headType));
            }
        },
        createToolPath: () => {
            const toolpath = dispatch(editorActions.createToolPath(props.headType));
            setEditingToolpath(toolpath);
        },
        showContextMenu: (event) => {
            setTimeout(() => {
                contextMenuRef.current.show(event);
            }, 0);
        }
    };
    // only set when rendered as a widget (the left panel renders the list directly)
    useEffect(() => {
        props.widgetActions?.setTitle(i18n._('key-CncLaser/ToolPathList/Button/-Toolpath List'));
    }, []);
    useEffect(() => {
        if (page === PAGE_EDITOR) {
            props.widgetActions?.setDisplay(false);
        } else if (page === PAGE_PROCESS) {
            props.widgetActions?.setDisplay(true);
        }
    }, [page]);

    const blocked = isOnABPosition || inProgress;
    const canCreate = !isOnABPosition && !inProgress && selectedModelArray && selectedModelArray.length > 0;

    return (
        <div className={styles['toolpath-list']}>
            <div
                className={styles.cards}
                tabIndex="-1"
                role="button"
                onKeyDown={() => { }}
                onClick={() => {
                    actions.selectToolPathById();
                }}
            >
                {toolPaths.length === 0 && (
                    <div className={styles.empty}>
                        <SvgIcon
                            name="WarningTipsTips"
                            type={['static']}
                            color="#1890ff"
                        />
                        <span>{i18n._('key-CncLaser/ToolPathList/Button/-Select object to create toolpath')}</span>
                    </div>
                )}
                {toolPaths && toolPaths.map((toolPath, index) => {
                    return (
                        <ToolpathItem
                            toolPath={toolPath}
                            index={index}
                            headType={props.headType}
                            needToPreview={needToPreview}
                            key={toolPath.id}
                            selectedToolPathIDArray={selectedToolPathIDArray}
                            selectOneToolPathId={actions.selectOneToolPathId}
                            selectToolPathId={actions.selectToolPathId}
                            selectToolPathById={actions.selectToolPathById}
                            onClickVisible={actions.onClickVisible}
                            setEditingToolpath={setEditingToolpath}
                            showContextMenu={actions.showContextMenu}
                            disabled={blocked}
                        />
                    );
                })}
            </div>
            <div className={styles.actions}>
                <SvgIcon
                    name="Delete"
                    disabled={isOnABPosition || selectedToolPathIDArray.length < 1}
                    size={24}
                    title={i18n._('key-CncLaser/ToolPathList/Button/-Delete')}
                    onClick={() => actions.deleteToolPath(selectedFirstToolPathId)}
                />
                <span className={styles['actions-spacer']} />
                <SvgIcon
                    className={classNames(
                        'margin-horizontal-8',
                    )}
                    disabled={isOnABPosition || selectedToolPathIDArray.length !== 1}
                    title={i18n._('key-CncLaser/ToolPathList/Button/-Prioritize')}
                    onClick={() => actions.toolPathToUp(selectedToolPathIDArray)}
                    name="Prioritize"
                    size={24}
                />
                <SvgIcon
                    disabled={isOnABPosition || selectedToolPathIDArray.length !== 1}
                    title={i18n._('key-CncLaser/ToolPathList/Button/-Deprioritize')}
                    onClick={() => actions.toolPathToDown(selectedToolPathIDArray)}
                    name="Deprioritize"
                    size={24}
                />
            </div>
            <div className={styles['create-row']}>
                <button
                    type="button"
                    className={styles['create-button']}
                    onClick={actions.createToolPath}
                    disabled={!canCreate}
                >
                    {`+ ${i18n._('key-CncLaser/ToolPathList/Button/-Create Toolpath')}`}
                </button>
            </div>
            <ContextMenu
                id="toolPathListBoxContextmenu"
                ref={contextMenuRef}
                menuItems={
                    [
                        {
                            type: 'item',
                            label: i18n._('key-CncLaser/ToolPathList/Button/-Edit'),
                            disabled: contextMenuDisabled,
                            onClick: () => {
                                setEditingToolpath(selectedFirstToolPath);
                            }
                        },
                        {
                            type: 'item',
                            label: i18n._('key-CncLaser/ToolPathList/Button/-Delete'),
                            disabled: contextMenuDisabled,
                            onClick: () => actions.deleteToolPath(selectedFirstToolPathId)
                        },
                        {
                            type: 'subMenu',
                            label: i18n._('key-CncLaser/ToolPathList/Button/-Sort'),
                            disabled: contextMenuDisabled || contextMenuArrangementDisabled,
                            items: [
                                {
                                    type: 'item',
                                    label: i18n._('key-CncLaser/ToolPathList/Button/-Prioritize'),
                                    disabled: contextMenuDisabled,
                                    onClick: () => actions.toolPathToUp(selectedToolPathIDArray)
                                },
                                {
                                    type: 'item',
                                    label: i18n._('key-CncLaser/ToolPathList/Button/-Deprioritize'),
                                    disabled: contextMenuDisabled,
                                    onClick: () => actions.toolPathToDown(selectedToolPathIDArray)
                                },
                                {
                                    type: 'item',
                                    label: i18n._('key-CncLaser/ToolPathList/Button/-Top'),
                                    disabled: contextMenuDisabled,
                                    onClick: () => actions.toolPathToTop(selectedToolPathIDArray)
                                },
                                {
                                    type: 'item',
                                    label: i18n._('key-CncLaser/ToolPathList/Button/-Bottom'),
                                    disabled: contextMenuDisabled,
                                    onClick: () => actions.toolPathToBottom(selectedToolPathIDArray)
                                }
                            ]
                        }
                    ]
                }
            />
            {!isOnABPosition && editingToolpath && (
                <ToolPathConfigurations
                    headType={props.headType}
                    toolpath={editingToolpath}
                    onClose={() => setEditingToolpath(null)}
                />
            )}
        </div>
    );
};
ToolPathListBox.propTypes = {
    widgetActions: PropTypes.object,
    headType: PropTypes.string
};
export default ToolPathListBox;
