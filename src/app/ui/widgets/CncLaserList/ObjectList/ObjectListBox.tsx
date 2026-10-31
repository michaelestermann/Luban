import classNames from 'classnames';
import React, { useEffect, useCallback, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { actions as editorActions } from '../../../../flux/editor';
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

    const dispatch = useDispatch();

    // member: the object belongs to a group and is selected on its own (not the whole group)
    const onSelectItem = useCallback((model, event, member = false) => {
        let isMultiSelect = event.shiftKey;

        // TODO: Add comment here
        if (selectedModelArray.length === 1 && selectedModelArray[0].visible === false) {
            isMultiSelect = false;
        }
        // TODO: Add comment here
        if (selectedModelArray.length > 0 && model.visible === false) {
            isMultiSelect = false;
        }

        dispatch(editorActions.selectTargetModel(headType, model, isMultiSelect && !member, member));
    }, [dispatch, headType, selectedModelArray]);
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
                        const rowProps = {
                            key: entity.modelID,
                            ...reorder.cardProps(index),
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
