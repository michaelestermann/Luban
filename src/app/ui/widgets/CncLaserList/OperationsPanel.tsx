import { Tooltip } from 'antd';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import {
    AddSelectedState,
    canRemoveMember,
    getAddSelectedState,
    getMemberIds,
    getOperationMethodId,
    operationColor
} from '../../../toolpaths/operations-panel';
import ToolPathConfigurations from '../../views/ToolPathConfigurations/ToolPathConfigurations';
import styles from './operations-panel.styl';
import { useCardReorder } from './use-card-reorder';
import DragGrip from './DragGrip';

interface OperationsPanelProps {
    headType: 'laser' | 'cnc';
    // A-B position mode or SVG clipping mode: no membership edits, no new toolpath
    blocked: boolean;
}

const METHOD_KEYS = {
    path: 'key-Cnc/ToolpathParameters-On the Path',
    outline: 'key-Cnc/ToolpathParameters-Outline',
    drill: 'key-Cnc/ToolpathParameters-Drill',
    carve: 'key-Cnc/ToolpathParameters-Carve',
    rotation: 'key-Cnc/ToolpathParameters-Rotation',
    linkage: 'key-Cnc/ToolpathParameters-Linkage'
};

export function methodLabel(methodId: string | null, headType: string): string | null {
    if (!methodId) {
        return null;
    }
    if (methodId === 'fill') {
        return headType === 'laser' ? i18n._('key-Laser/ToolpathParameters-Fill') : i18n._('key-Cnc/ToolpathParameters-Fill');
    }
    return METHOD_KEYS[methodId] ? i18n._(METHOD_KEYS[methodId]) : null;
}

function addSelectedTip(state: AddSelectedState): string | null {
    switch (state) {
        case 'blocked':
            return i18n._('key-CncLaser/Operations-Not available while positioning or clipping.');
        case 'no-selection':
            return i18n._('key-CncLaser/Operations-Select objects to add them.');
        case 'incompatible':
            return i18n._('key-CncLaser/Operations-The selected objects do not fit this operation type.');
        case 'already-added':
            return i18n._('key-CncLaser/Operations-The selected objects are already in this operation.');
        default:
            return null;
    }
}

const CloseIcon: React.FC = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

/**
 * Step-1 Operations panel: the toolpaths in milling order as cards with their objects as
 * chips. × removes an object from the toolpath (not the last one), "+ Add selected" adds the
 * selected objects, "+ New" opens the existing create-toolpath dialog.
 */
const OperationsPanel: React.FC<OperationsPanelProps> = ({ headType, blocked }) => {
    const dispatch = useDispatch();
    // modelGroup / toolPathGroup are mutable: renderingTimestamp re-renders on every change
    useSelector(state => state[headType]?.renderingTimestamp);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const toolPathGroup = useSelector(state => state[headType]?.toolPathGroup);
    const inProgress = useSelector(state => state[headType]?.inProgress);
    const [editingToolpath, setEditingToolpath] = useState(null);

    const toolPaths = toolPathGroup?.getToolPaths() || [];
    // drag and drop sorting: the order is the milling/engraving order
    const reorder = useCardReorder((from, to) => {
        const toolPath = toolPaths[from];
        toolPath && dispatch(editorActions.moveToolPath(headType, toolPath.id, to));
    }, blocked);
    const selectedModels = modelGroup?.getSelectedModelArray?.() || [];

    // all objects by id, group children included
    const modelsById = new Map();
    (modelGroup?.models || []).forEach((model) => {
        modelsById.set(model.modelID, model);
        (model.children || []).forEach((child) => modelsById.set(child.modelID, child));
    });

    const canCreate = !blocked && !inProgress && selectedModels.length > 0;

    const onCreate = () => {
        if (!canCreate) {
            return;
        }
        const toolPath = dispatch(editorActions.createToolPath(headType)) as unknown;
        if (toolPath) {
            setEditingToolpath(toolPath);
        }
    };

    const newButton = (
        <button
            type="button"
            className={styles['new-button']}
            disabled={!canCreate}
            onClick={onCreate}
        >
            {i18n._('key-CncLaser/Operations-+ New')}
        </button>
    );

    return (
        <div className={styles['operations-panel']}>
            <div className={styles.header}>
                <span className={styles.label}>{i18n._('key-CncLaser/Operations-Operations · order')}</span>
                <Tooltip
                    title={canCreate
                        ? i18n._('key-CncLaser/Operations-Create an operation from the selected objects.')
                        : addSelectedTip(blocked ? 'blocked' : 'no-selection')}
                >
                    <span className={styles['tip-wrapper']}>{newButton}</span>
                </Tooltip>
            </div>
            <div className={styles.cards} {...reorder.containerProps}>
                {toolPaths.length === 0 && (
                    <div className={styles.empty}>
                        {i18n._('key-CncLaser/Operations-No operations yet. Select objects and click + New.')}
                    </div>
                )}
                {toolPaths.map((toolPath, index) => {
                    const memberIds = getMemberIds(toolPath);
                    const removable = canRemoveMember(memberIds.length, blocked);
                    const addState = getAddSelectedState(toolPath, selectedModels, blocked);
                    const method = methodLabel(getOperationMethodId(toolPath, headType), headType);
                    const toolName = toolPath.toolParams?.definitionName ? i18n._(toolPath.toolParams.definitionName) : null;
                    const subtitle = [method, toolName].filter(Boolean).join(' · ');
                    const label = `${index + 1} · ${toolPath.name}`;
                    return (
                        <div
                            key={toolPath.id}
                            className={classNames(styles.card, {
                                [styles.dragging]: reorder.draggingIndex === index,
                                [styles['drop-before']]: reorder.dropSide(index) === 'before',
                                [styles['drop-after']]: reorder.dropSide(index) === 'after'
                            })}
                            {...reorder.cardProps(index)}
                        >
                            <div className={styles['card-head']}>
                                {!blocked && <DragGrip className={styles.grip} />}
                                <span className={styles.dot} style={{ background: operationColor(index) }} />
                                <strong className={styles['card-title']} title={label}>{label}</strong>
                                {subtitle && <span className={styles['card-tool']} title={subtitle}>{subtitle}</span>}
                            </div>
                            <div className={styles.chips}>
                                {memberIds.map((modelId) => {
                                    const model = modelsById.get(modelId);
                                    if (!model) {
                                        return null;
                                    }
                                    const removeLabel = i18n._('key-CncLaser/Operations-Remove {{name}} from {{operation}}', {
                                        name: model.modelName,
                                        operation: toolPath.name
                                    });
                                    let removeTip = removeLabel;
                                    if (blocked) {
                                        removeTip = addSelectedTip('blocked');
                                    } else if (!removable) {
                                        removeTip = i18n._('key-CncLaser/Operations-An operation needs at least one object.');
                                    }
                                    return (
                                        <span key={modelId} className={styles.chip}>
                                            <span className={styles['chip-name']} title={model.modelName}>{model.modelName}</span>
                                            <Tooltip title={removeTip}>
                                                <span className={styles['tip-wrapper']}>
                                                    <button
                                                        type="button"
                                                        className={styles['chip-remove']}
                                                        aria-label={removeLabel}
                                                        disabled={!removable}
                                                        onClick={() => {
                                                            if (removable) {
                                                                dispatch(editorActions.removeModelFromToolPath(headType, toolPath.id, modelId));
                                                            }
                                                        }}
                                                    >
                                                        <CloseIcon />
                                                    </button>
                                                </span>
                                            </Tooltip>
                                        </span>
                                    );
                                })}
                                <Tooltip title={addSelectedTip(addState)}>
                                    <span className={styles['tip-wrapper']}>
                                        <button
                                            type="button"
                                            className={classNames(styles['add-button'])}
                                            disabled={addState !== 'ok'}
                                            onClick={() => {
                                                if (addState === 'ok') {
                                                    dispatch(editorActions.addSelectedModelsToToolPath(headType, toolPath.id));
                                                }
                                            }}
                                        >
                                            {i18n._('key-CncLaser/Operations-+ Add selected')}
                                        </button>
                                    </span>
                                </Tooltip>
                            </div>
                        </div>
                    );
                })}
            </div>
            {!blocked && editingToolpath && (
                <ToolPathConfigurations
                    headType={headType}
                    toolpath={editingToolpath}
                    onClose={() => setEditingToolpath(null)}
                />
            )}
        </div>
    );
};

export default OperationsPanel;
