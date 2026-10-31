import classNames from 'classnames';
import React from 'react';

import i18n from '../../../../lib/i18n';
import { getGroupOperationColors } from '../../../../toolpaths/operations-panel';
import SvgIcon from '../../../components/SvgIcon';
import styles from '../styles.styl';
import ModelItem from './model-item';
import NameInput from './NameInput';

interface GroupRowProps {
    // SvgGroup (models/SvgGroup); children are SvgModels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    group: any;
    collapsed: boolean;
    onToggleCollapsed: (groupID: string) => void;
    // the whole group is selected
    selected: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectedModelArray: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolPaths: any[];
    inProgress: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSelectGroup: (model: any, event: React.MouseEvent) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSelectMember: (model: any, event: React.MouseEvent) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onToggleGroupVisible: (group: any, visible: boolean) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onToggleMemberVisible: (model: any) => void;
    // the group or a member whose name is edited in place (null: none)
    renamingID: string | null;
    onStartRename: (modelID: string) => void;
    onRename: (modelID: string, name: string) => void;
    onCancelRename: () => void;
}

const GroupIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
        <rect x="7" y="7" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
    </svg>
);

/**
 * A group in the object list: a foldable row (caret, group icon, name, member count, the
 * operations of the whole group, eye) with its members indented under a guide line.
 * Click on the row selects the group, click on a member row selects only that member.
 */
const GroupRow: React.FC<GroupRowProps> = ({
    group, collapsed, onToggleCollapsed, selected, selectedModelArray, toolPaths, inProgress,
    onSelectGroup, onSelectMember, onToggleGroupVisible, onToggleMemberVisible,
    renamingID, onStartRename, onRename, onCancelRename
}) => {
    const children = group.children || [];
    const visible = children.some(child => child.visible);
    const colors = getGroupOperationColors(toolPaths, children.map(child => child.modelID));
    const toggleLabel = collapsed ? i18n._('key-CncLaser/Group-Expand') : i18n._('key-CncLaser/Group-Collapse');

    return (
        <div className={styles['group-block']}>
            <div className={classNames(styles['object-list-item'], styles['group-row'], { [styles.selected]: selected })}>
                <button
                    type="button"
                    className={styles['group-caret']}
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                    title={toggleLabel}
                    onClick={() => onToggleCollapsed(group.modelID)}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                        <path d={collapsed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} />
                    </svg>
                </button>
                {renamingID === group.modelID ? (
                    <div className={styles['group-name']}>
                        <span className={styles['group-icon']}><GroupIcon /></span>
                        <NameInput
                            value={group.name}
                            onCommit={(value) => onRename(group.modelID, value)}
                            onCancel={onCancelRename}
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        className={styles['group-name']}
                        onClick={(event) => children.length && onSelectGroup(children[0], event)}
                        title={`${group.name}
${i18n._('key-CncLaser/ObjectList-Double-click or F2 to rename')}`}
                        onDoubleClick={(event) => {
                            // double-click on the name: rename the group (nothing else happens)
                            event.preventDefault();
                            event.stopPropagation();
                            onStartRename(group.modelID);
                        }}
                    >
                        <span className={styles['group-icon']}><GroupIcon /></span>
                        <span className={styles['group-label']}>{group.name}</span>
                        <span className={styles['group-count']}>{children.length}</span>
                    </button>
                )}
                {colors.group.length > 0 && (
                    <span className={styles['operation-dots']} aria-hidden="true">
                        {colors.group.map((color, index) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <span key={index} className={styles['operation-dot']} style={{ background: color }} />
                        ))}
                    </span>
                )}
                <SvgIcon
                    className="margin-right-8"
                    name={visible ? 'ShowNormal' : 'HideNormal'}
                    title={visible ? i18n._('key-PrintingCncLaser/ObjectList-Hide') : i18n._('key-PrintingCncLaser/ObjectList-Show')}
                    color={visible ? '#545659' : '#B9BCBF'}
                    onClick={() => onToggleGroupVisible(group, !visible)}
                    disabled={inProgress}
                    type={['static']}
                />
            </div>
            {!collapsed && (
                <div className={styles['group-members']}>
                    {children.map(child => (
                        <div key={child.modelID} className={classNames({ [styles['in-selected-group']]: selected })}>
                            <ModelItem
                                model={child}
                                visible={child.visible}
                                styles={styles}
                                isSelected={!selected && !!selectedModelArray?.includes(child)}
                                onSelect={onSelectMember}
                                onToggleVisible={onToggleMemberVisible}
                                inProgress={inProgress}
                                placement="right"
                                dotColors={colors.members.get(child.modelID)}
                                name={child.modelName}
                                renaming={renamingID === child.modelID}
                                onStartRename={onStartRename}
                                onRename={onRename}
                                onCancelRename={onCancelRename}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GroupRow;
