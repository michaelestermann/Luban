import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, { useState } from 'react';
import i18n from '../../../../lib/i18n';
import { normalizeNameDisplay } from '../../../../lib/normalize-range';
import Anchor from '../../../components/Anchor';
import SvgIcon from '../../../components/SvgIcon';
import TipTrigger from '../../../components/TipTrigger';
import NameInput from './NameInput';

let svgName = '';
let modelName = '';
const objectListShape = 'ObjectListShape';
const objectListPicture = 'ObjectListPicture';

const ModelIcon = (props) => {
    const { model, disabled, name } = props;
    return (
        <SvgIcon
            type={['static']}
            color={model.needRepair ? '#FFA940' : ''}
            name={model.needRepair ? 'WarningTipsWarningBig' : name}
            className="margin-right-4"
            disabled={disabled}
        />
    );
};

ModelIcon.propTypes = {
    model: PropTypes.object.isRequired,
    disabled: PropTypes.bool.isRequired,
    name: PropTypes.string.isRequired,
};

function ModelItem(
    {
        model, visible, isSelected, styles, onSelect, onToggleVisible,
        inProgress, placement, disabled = false, dotColors = [],
        // the shown name (a prop, so a rename re-renders the memoized row)
        name, renaming = false, onStartRename, onRename, onCancelRename,
    }
) {
    const [tipTriggerVisible, setTipVisible] = useState('');

    if (!model) {
        return null;
    }

    const taskInfo = model.getTaskInfo();
    modelName = name ?? taskInfo.modelName;
    svgName = (() => {
        if (taskInfo.sourceType === 'text') {
            return objectListShape;
        }
        if (taskInfo.mode !== 'vector') {
            return objectListPicture;
        }
        return objectListShape;
    })();
    const suffixLength = 7;
    const { prefixName, suffixName } = normalizeNameDisplay(modelName, suffixLength);

    const hasChildren = model.children && !!model.children?.length;

    return (
        <div>
            <TipTrigger
                key={model.modelID}
                title={i18n._('key-PrintingCncLaser/ObjectList-Object')}
                content={(
                    <>
                        <div>{modelName}</div>
                        <div style={{ opacity: 0.7 }}>{i18n._('key-CncLaser/ObjectList-Double-click or F2 to rename')}</div>
                    </>
                )}
                placement={placement || undefined}
                visible={!renaming && !hasChildren && model.modelID === tipTriggerVisible && tipTriggerVisible}
            >
                <div
                    className={classNames(
                        // 'padding-vertical-4',
                        // 'padding-horizontal-8',
                        'sm-flex',
                        styles['object-list-item'],
                        {
                            [styles.selected]: isSelected,
                        },
                    )}
                >
                    {renaming ? (
                        <div className={classNames('height-24', 'sm-flex-width', 'margin-left-8', 'sm-flex')} style={{ alignItems: 'center' }}>
                            <ModelIcon name={svgName} model={model} disabled={disabled} />
                            <NameInput
                                value={modelName}
                                onCommit={(value) => onRename(model.modelID, value)}
                                onCancel={onCancelRename}
                            />
                        </div>
                    ) : (
                        <Anchor
                            className={classNames(
                                'height-24',
                                'sm-flex-width',
                                'margin-left-8',
                                'sm-flex',
                            )}
                            style={{ color: disabled ? '#D5D6D9' : '' }}
                            onClick={(event) => onSelect(model, event)}
                            onDoubleClick={(event) => {
                                // double-click on the name: rename (nothing else happens)
                                event.preventDefault();
                                event.stopPropagation();
                                onStartRename && onStartRename(model.modelID);
                            }}
                            onMouseEnter={() => {
                                setTipVisible(true);
                            }}
                            onMouseLeave={() => {
                                setTipVisible(false);
                            }}
                        >

                            <ModelIcon name={svgName} model={model} disabled={disabled} />

                            <span className={classNames(styles['prefix-name'])}>
                                {prefixName}
                            </span>
                            <span className={classNames(styles['suffix-name'])}>
                                {suffixName}
                            </span>
                        </Anchor>
                    )}
                    {dotColors.length > 0 && (
                        <span className={styles['operation-dots']} aria-hidden="true">
                            {dotColors.map((color, index) => (
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
                        onClick={() => onToggleVisible(model)}
                        disabled={inProgress || disabled}
                        // type={isSelected ? ['static'] : ['hoverNormal', 'pressNormal']}
                        type={['static']}
                    />
                </div>
            </TipTrigger>
        </div>
    );
}

ModelItem.propTypes = {
    model: PropTypes.object.isRequired,
    styles: PropTypes.object.isRequired,
    visible: PropTypes.bool.isRequired,
    isSelected: PropTypes.bool.isRequired,
    onSelect: PropTypes.func.isRequired,
    onToggleVisible: PropTypes.func.isRequired,
    inProgress: PropTypes.bool.isRequired,
    disabled: PropTypes.bool,
    placement: PropTypes.string,
    // colours of the toolpaths the object is in (milling order)
    dotColors: PropTypes.arrayOf(PropTypes.string),
    name: PropTypes.string,
    // the name is edited in place
    renaming: PropTypes.bool,
    onStartRename: PropTypes.func,
    onRename: PropTypes.func,
    onCancelRename: PropTypes.func,
};

export default React.memo(ModelItem);
