import classNames from 'classnames';
import React, { useEffect, useCallback, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../../constants';
import { actions as editorActions } from '../../../../flux/editor';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../../lib/shortcut';
import { renameTargetID } from '../../../../models/object-name';
import { listClickMode, selectionRange } from './list-selection';
import i18n from '../../../../lib/i18n';
import { getModelOperationColors } from '../../../../toolpaths/operations-panel';
import modal from '../../../../lib/modal';
import styles from '../styles.styl';
import GroupRow from './GroupRow';
import ModelItem from './model-item';
import { useCardReorder } from '../use-card-reorder';


interface ObjectListBoxProps {
    headType: 'laser' | 'cnc';
    // fill the parent (side panel) instead of the fixed-size card list
    fill?: boolean;
}

const ObjectListBox: React.FC<ObjectListBoxProps> = ({ headType, fill = false }) => {
    const selectedModelArray = useSelector(state => state[headType].modelGroup?.selectedModelArray);
    // the selected group (null when single objects or a group member are selected)
    const selectedGroupID = useSelector(state => state[headType].modelGroup?.selectedGroupID);
    const models = useSelector(state => state[headType]?.modelGroup?.models);

    // toolpath membership colour dots; toolPathGroup is mutable, renderingTimestamp re-renders on changes
    useSelector(state => state[headType]?.renderingTimestamp);
    const toolPaths = useSelector(state => state[headType]?.toolPathGroup)?.getToolPaths();

    const inProgress = useSelector(state => state[headType]?.inProgress, shallowEqual);
    const previewFailed = useSelector(state => state[headType]?.previewFailed, shallowEqual);

    const page = useSelector(state => state[headType]?.page);
    const SVGCanvasMode = useSelector(state => state[headType]?.SVGCanvasMode);
    const pointEditing = useSelector(state => !!state[headType]?.SVGCanvasExt?.elem);

    const dispatch = useDispatch();

    // the row (object or group) a Shift click selects from: the last plainly or Ctrl-clicked row
    const anchorID = useRef<string | null>(null);

    // member: the object belongs to a group and is selected on its own (not the whole group)
    const onSelectItem = useCallback((model, event, member = false) => {
        const mode = listClickMode(event);
        // the top-level row of the click: the object, or the group it belongs to
        const rows = (models || []).filter(entity => !entity.supportTag).slice().reverse();
        const row = rows.find(entity => entity === model || entity.children?.includes(model));

        if (mode === 'range' && !member && row) {
            const anchor = rows.find(entity => entity.modelID === anchorID.current) || null;
            // hidden rows are skipped: hidden and visible objects are never selected together
            const range = selectionRange(rows, anchor, row).filter(entity => entity.visible !== false || entity === row);
            // a group is selected through one of its objects (the click expands to the group)
            const target = (entity) => (entity.type === '2d-group' ? entity.children[0] : entity);
            range.forEach((entity, i) => {
                dispatch(editorActions.selectTargetModel(headType, target(entity), i > 0));
            });
            return;
        }

        // hidden objects are selected on their own, never together with others
        let isMultiSelect = mode === 'toggle';
        if (selectedModelArray.length === 1 && selectedModelArray[0].visible === false) {
            isMultiSelect = false;
        }
        if (selectedModelArray.length > 0 && model.visible === false) {
            isMultiSelect = false;
        }
        anchorID.current = row ? row.modelID : null;

        dispatch(editorActions.selectTargetModel(headType, model, isMultiSelect && !member, member));
    }, [dispatch, headType, selectedModelArray, models]);
    const onSelectMember = useCallback((model, event) => onSelectItem(model, event, true), [onSelectItem]);

    const actions = {
        onClickModelHideBox(model, member = false) {
            const visible = model.visible;
            dispatch(editorActions.selectTargetModel(headType, model, false, member));
            if (visible) {
                dispatch(editorActions.hideSelectedModel(headType, model));
            } else {
                dispatch(editorActions.showSelectedModel(headType, model));
            }
        },
        onToggleMemberVisible(model) {
            actions.onClickModelHideBox(model, true);
        },
        onToggleGroupVisible(group, visible) {
            dispatch(editorActions.setGroupVisible(headType, group, visible));
        }
    };

    useEffect(() => {
        if (previewFailed) {
            modal({
                title: i18n._('key-unused-Failed to preview'),
                body: i18n._('key-unused-Failed to preview, please modify parameters and try again.')
            });
        }
    }, [previewFailed]);
    const allModels = (models) && models.filter(model => !model.supportTag);

    // Expansion state of group rows in the sidebar (ephemeral, not
    // persisted in Redux). Default: expanded.
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    // drag and drop changes the layer order (no grip: the whole row is dragged)
    const reorder = useCardReorder((from, to) => {
        dispatch(editorActions.moveLayer(headType, from, to));
    }, !!inProgress);

    const toggleGroup = useCallback((groupID: string) => {
        setCollapsedGroups((prev) => ({ ...prev, [groupID]: !prev[groupID] }));
    }, []);

    // the object or group whose name is edited in place (double-click on the name, F2)
    const [renamingID, setRenamingID] = useState<string | null>(null);
    const startRename = useCallback((modelID: string) => {
        if (inProgress) {
            return;
        }
        // a member of a folded group: unfold it, so its row is there
        const parent = (models || []).find(entity => entity.type === '2d-group' && entity.children?.some(child => child.modelID === modelID));
        if (parent) {
            setCollapsedGroups((prev) => ({ ...prev, [parent.modelID]: false }));
        }
        setRenamingID(modelID);
    }, [models, inProgress]);
    const cancelRename = useCallback(() => setRenamingID(null), []);
    const commitRename = useCallback((modelID: string, name: string) => {
        setRenamingID(null);
        dispatch(editorActions.renameEntity(headType, modelID, name));
    }, [dispatch, headType]);

    // F2 renames the selected group or object (step 1, select mode; never while typing: the shortcut
    // manager skips text fields, text editing is another mode)
    const f2 = useRef({ active: false, start: startRename, target: null as string | null });
    f2.current = {
        active: page === PAGE_EDITOR && SVGCanvasMode === 'select' && !pointEditing && !inProgress
            && window.location.hash.startsWith(`#/${headType}`),
        start: startRename,
        target: renameTargetID(selectedModelArray, selectedGroupID),
    };
    useEffect(() => {
        const handler = {
            title: `ObjectListRename-${headType}`,
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => f2.current.active && !!f2.current.target,
            shortcuts: {
                RENAME: {
                    keys: ['f2'],
                    callback: () => f2.current.target && f2.current.start(f2.current.target),
                },
            },
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, [headType]);
    // the renamed object is gone (deleted, undone): nothing to edit
    useEffect(() => {
        if (renamingID && !(models || []).some(entity => entity.modelID === renamingID
            || entity.children?.some(child => child.modelID === renamingID))) {
            setRenamingID(null);
        }
    }, [models, renamingID]);
    const renameProps = { renamingID, onStartRename: startRename, onRename: commitRename, onCancelRename: cancelRename };

    return (
        <div
            className={classNames(
                fill ? styles['object-list-fill'] : [styles['object-list-box'], 'width-264'],
            )}
        >
            <div className={classNames('padding-vertical-4')} {...reorder.containerProps}>
                {
                    // layer order: the front object on top; drag a row up or down to change it
                    allModels && allModels.slice().reverse().map((entity, index) => {
                        // no drag while a name in the row is edited (text selection in the field)
                        const renamingHere = !!renamingID && (renamingID === entity.modelID
                            || !!entity.children?.some(child => child.modelID === renamingID));
                        const rowProps = {
                            key: entity.modelID,
                            ...(renamingHere ? {} : reorder.cardProps(index)),
                            className: classNames(styles['layer-row'], {
                                [styles['layer-dragging']]: reorder.draggingIndex === index,
                                [styles['layer-drop-before']]: reorder.dropSide(index) === 'before',
                                [styles['layer-drop-after']]: reorder.dropSide(index) === 'after'
                            })
                        };
                        if (entity && entity.type === '2d-group') {
                            return (
                                <div {...rowProps}>
                                    <GroupRow
                                        group={entity}
                                        collapsed={!!collapsedGroups[entity.modelID]}
                                        onToggleCollapsed={toggleGroup}
                                        selected={selectedGroupID === entity.modelID}
                                        selectedModelArray={selectedModelArray}
                                        toolPaths={toolPaths}
                                        inProgress={inProgress}
                                        onSelectGroup={onSelectItem}
                                        onSelectMember={onSelectMember}
                                        onToggleGroupVisible={actions.onToggleGroupVisible}
                                        onToggleMemberVisible={actions.onToggleMemberVisible}
                                        {...renameProps}
                                    />
                                </div>
                            );
                        }
                        const model = entity;
                        return (
                            <div {...rowProps}>
                                <ModelItem
                                    model={model}
                                    visible={model.visible}
                                    styles={styles}
                                    isSelected={selectedModelArray && selectedModelArray.includes(model)}
                                    onSelect={onSelectItem}
                                    onToggleVisible={actions.onClickModelHideBox}
                                    inProgress={inProgress}
                                    placement="right"
                                    dotColors={getModelOperationColors(toolPaths, model.modelID)}
                                    name={model.modelName}
                                    renaming={renamingID === model.modelID}
                                    onStartRename={startRename}
                                    onRename={commitRename}
                                    onCancelRename={cancelRename}
                                />
                            </div>
                        );
                    })
                }
                {
                    allModels && allModels.length === 0 && (
                        <div className="padding-vertical-4 padding-horizontal-8">
                            <div className="height-24">
                                <span>{i18n._('key-Printing/No model(s).')}</span>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
};

export default ObjectListBox;
