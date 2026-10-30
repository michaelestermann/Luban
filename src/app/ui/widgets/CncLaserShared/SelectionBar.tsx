import { Popover, Tooltip } from 'antd';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { canDecomposeSelection } from '../../../lib/svg-decompose';
import SvgIcon from '../../components/SvgIcon';
import { alignElementsHorizontal, alignElementsVertical, HORIZONTAL_ALIGN, VERTICAL_ALIGN } from './align-elements';
import styles from './selection-bar.styl';

interface SelectionBarProps {
    headType: 'laser' | 'cnc';
    // laser SVG clipping or A-B position mode (page state): the bar is hidden
    modeBlocked?: boolean;
}

const stroke = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
} as const;

const ALIGN_ITEMS = [
    { icon: 'AlignHorizontalLeft', run: alignElementsHorizontal, align: HORIZONTAL_ALIGN.LEFT },
    { icon: 'AlignHorizontalCenter', run: alignElementsHorizontal, align: HORIZONTAL_ALIGN.CENTER },
    { icon: 'AlignHorizontalRight', run: alignElementsHorizontal, align: HORIZONTAL_ALIGN.RIGHT },
    { icon: 'AlignVerticalTop', run: alignElementsVertical, align: VERTICAL_ALIGN.TOP },
    { icon: 'AlignVerticalMiddle', run: alignElementsVertical, align: VERTICAL_ALIGN.MIDDLE },
    { icon: 'AlignVerticalBottom', run: alignElementsVertical, align: VERTICAL_ALIGN.BOTTOM },
];

/**
 * Floating selection bar at the top centre of the step-1 canvas: Group/Ungroup, Decompose,
 * Align, Duplicate, Delete for the current selection. All buttons dispatch the existing
 * actions (same enable rules as the main toolbar, the alignment row and the context menu).
 * Hidden when nothing is selected, outside step 1, while drawing and in A-B position /
 * SVG clipping mode.
 */
const SelectionBar: React.FC<SelectionBarProps> = ({ headType, modeBlocked = false }) => {
    const dispatch = useDispatch();
    // modelGroup is mutable: renderingTimestamp re-renders on every selection / model change
    useSelector(state => state[headType]?.renderingTimestamp);
    const page = useSelector(state => state[headType]?.page);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const SVGActions = useSelector(state => state[headType]?.SVGActions);
    const isRotate = useSelector(state => !!state[headType]?.materials?.isRotate);
    const isOnABPosition = useSelector(state => headType === HEAD_LASER && !!state[HEAD_LASER]?.isOnABPosition);
    const SVGCanvasMode = useSelector(state => state[headType]?.SVGCanvasMode);
    const SVGCanvasExt = useSelector(state => state[headType]?.SVGCanvasExt);
    const [alignOpen, setAlignOpen] = useState(false);

    const selectedModels = modelGroup?.getSelectedModelArray?.() || [];
    const drawing = SVGCanvasMode === 'draw' || !!SVGCanvasExt?.elem;
    if (page !== PAGE_EDITOR || modeBlocked || isOnABPosition || drawing || selectedModels.length === 0) {
        return null;
    }

    const selectedGroup = modelGroup?.selectedGroupID
        ? (modelGroup.models || []).find(model => model.modelID === modelGroup.selectedGroupID)
        : null;
    let label = selectedModels.length === 1
        ? (selectedModels[0].modelName || selectedModels[0].name || '')
        : i18n._('key-CncLaser/SelectionBar-{{count}} objects', { count: selectedModels.length });
    if (selectedGroup) {
        label = i18n._('key-CncLaser/SelectionBar-{{name}} · {{count}} objects', { name: selectedGroup.name, count: selectedModels.length });
    }

    const canUngroup = !!modelGroup?.canUngroup?.();
    const canGroup = !!modelGroup?.canGroup?.();
    const groupTitle = canUngroup ? i18n._('key-CncLaser/MainToolBar-Ungroup') : i18n._('key-CncLaser/MainToolBar-Group');
    const canDecomposeSelected = canDecomposeSelection(selectedModels, { isRotate, isOnABPosition, isSVGClipping: modeBlocked });
    const canAlign = selectedModels.filter(model => model.visible).length > 1;
    const canDuplicate = selectedModels[0].visible !== false;

    const onGroup = () => {
        if (canUngroup) {
            dispatch(editorActions.ungroupSelectedGroup(headType));
        } else if (canGroup) {
            dispatch(editorActions.groupSelectedModels(headType));
        }
    };

    const renderIconButton = (title: string, disabled: boolean, onClick: () => void, icon: React.ReactNode) => (
        <Tooltip title={title}>
            <span className={styles['tip-wrapper']}>
                <button
                    type="button"
                    className={styles['icon-button']}
                    aria-label={title}
                    disabled={disabled}
                    onClick={onClick}
                >
                    {icon}
                </button>
            </span>
        </Tooltip>
    );

    const alignTitle = i18n._('key-CncLaser/TransformationSection-Alignment');
    const alignMenu = (
        <div className={styles['align-menu']}>
            {ALIGN_ITEMS.map(item => (
                <SvgIcon
                    key={item.icon}
                    name={item.icon}
                    className="border-radius-8 border-default-grey-1"
                    borderRadius={8}
                    onClick={() => {
                        setAlignOpen(false);
                        const elements = SVGActions?.getSelectedElements?.() || [];
                        if (elements.length > 1) {
                            item.run(dispatch, headType, elements, item.align);
                        }
                    }}
                />
            ))}
        </div>
    );

    return (
        <div className={styles['selection-bar']} role="toolbar" aria-label={i18n._('key-CncLaser/SelectionBar-Selection actions')}>
            <span className={styles.label} title={label}>{label}</span>
            {renderIconButton(groupTitle, !canGroup && !canUngroup, onGroup, (
                canUngroup ? (
                    <svg {...stroke}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
                ) : (
                    <svg {...stroke}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M11 7h4v6" /></svg>
                )
            ))}
            <button
                type="button"
                className={classNames(styles['text-button'])}
                disabled={!canDecomposeSelected}
                onClick={() => {
                    if (canDecomposeSelected) {
                        dispatch(editorActions.decomposeSelectedSVG(headType));
                    }
                }}
            >
                <svg {...stroke}>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                {i18n._('key-CncLaser/MainToolBar-Decompose')}
            </button>
            {canAlign ? (
                <Popover
                    content={alignMenu}
                    trigger="click"
                    placement="bottom"
                    visible={alignOpen}
                    onVisibleChange={setAlignOpen}
                >
                    <span className={styles['tip-wrapper']}>
                        <button type="button" className={styles['icon-button']} aria-label={alignTitle} title={alignTitle}>
                            <svg {...stroke}><path d="M4 4v16M8 7h12M8 12h8M8 17h10" /></svg>
                        </button>
                    </span>
                </Popover>
            ) : renderIconButton(alignTitle, true, () => undefined, (
                <svg {...stroke}><path d="M4 4v16M8 7h12M8 12h8M8 17h10" /></svg>
            ))}
            {renderIconButton(i18n._('key-App/Menu-Duplicate'), !canDuplicate, () => {
                dispatch(editorActions.duplicateSelectedModel(headType));
            }, (
                <svg {...stroke}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></svg>
            ))}
            {renderIconButton(i18n._('key-App/Menu-Delete'), false, () => {
                dispatch(editorActions.removeSelectedModelsByCallback(headType, 'select'));
            }, (
                <svg {...stroke}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
            ))}
        </div>
    );
};

export default SelectionBar;
