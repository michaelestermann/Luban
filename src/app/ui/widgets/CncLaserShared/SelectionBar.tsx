import { Popover, Tooltip } from 'antd';
import classNames from 'classnames';
import React, { useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { canDecomposeSelection } from '../../../lib/svg-decompose';
import SvgIcon from '../../components/SvgIcon';
import PointEditBar from './PointEditBar';
import MeasureBar from './MeasureBar';
import { openPathState } from '../../SVGEditor/path-edit/shape-to-path';
import { canSetOriginOnSelection, COMBINE_ACTIONS, fittingActions, MORE_ACTIONS, ROUND_CORNERS_ACTION, setOriginLabel, ShapeAction } from './shape-actions';
import OriginPointPicker from './OriginPointPicker';
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
 * SVG clipping mode. While the points of a path are edited the mode bar takes its place.
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
    // the radius dialog is open (its tooltip would cover it)
    const roundCornersOpen = useSelector(state => !!state[headType]?.roundCornersSession);
    const [alignOpen, setAlignOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const store = useStore();

    const selectedModels = modelGroup?.getSelectedModelArray?.() || [];
    const drawing = SVGCanvasMode === 'draw' || !!SVGCanvasExt?.elem;
    const drawGroup = SVGActions?.svgContentGroup?.drawGroup;
    if (page === PAGE_EDITOR && !modeBlocked && !isOnABPosition && SVGCanvasMode === 'select' && SVGCanvasExt?.elem && drawGroup) {
        return <PointEditBar drawGroup={drawGroup} SVGActions={SVGActions} />;
    }
    if (page === PAGE_EDITOR && !modeBlocked && !isOnABPosition && SVGCanvasMode === 'measure') {
        return <MeasureBar onDone={() => dispatch(editorActions.setCanvasMode(headType, 'select', {}))} />;
    }
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
    // one path with open subpaths: Close path / Join ends
    const pathElem = selectedModels.length === 1 && selectedModels[0].elem?.nodeName === 'path' ? selectedModels[0].elem : null;
    const openPath = pathElem ? openPathState(pathElem.getAttribute('d')) : { open: false, canJoin: false };

    // Combine ▾ and ⋯ show only the actions that fit
    const combineActions = fittingActions(COMBINE_ACTIONS, store.getState(), headType);
    const moreActions = fittingActions(MORE_ACTIONS, store.getState(), headType);
    // rectangles (or editable paths with sharp corners) in the selection
    const canRoundCorners = ROUND_CORNERS_ACTION.fits(store.getState(), headType);
    // "⋯" also holds "Set origin here" with its point picker
    const canSetOrigin = canSetOriginOnSelection(store.getState(), headType);

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

    const renderActionMenu = (menu: string, items: ShapeAction[], button: React.ReactNode, extra?: React.ReactNode) => (
        <Popover
            content={(
                <div className={styles['action-menu']} role="menu">
                    {items.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            className={styles['menu-item']}
                            onClick={() => {
                                setMenuOpen(null);
                                item.run(dispatch, headType);
                            }}
                        >
                            <span>{item.label()}</span>
                            {item.keyHint && <span className={styles['menu-key']}>{item.keyHint}</span>}
                        </button>
                    ))}
                    {extra}
                </div>
            )}
            trigger="click"
            placement="bottom"
            visible={menuOpen === menu}
            onVisibleChange={(visible) => setMenuOpen(visible ? menu : null)}
        >
            {button}
        </Popover>
    );

    return (
        <div className={styles['selection-bar']} role="toolbar" aria-label={i18n._('key-CncLaser/SelectionBar-Selection actions')}>
            <span className={styles.label} title={label}>{label}</span>
            {openPath.open && (
                <>
                    <span className={styles['open-label']}>{i18n._('key-CncLaser/SelectionBar-Open path')}</span>
                    <Tooltip title={i18n._('key-CncLaser/SelectionBar-Close every open end with a straight line')}>
                        <button
                            type="button"
                            className={styles['mode-button']}
                            onClick={() => dispatch(editorActions.closeSelectedPath(headType, 'close'))}
                        >
                            <svg {...stroke}><path d="M5 18V7l7-3 7 3v11" /><path d="M5 18h14" strokeDasharray="2 2" /></svg>
                            {i18n._('key-CncLaser/SelectionBar-Close path')}
                        </button>
                    </Tooltip>
                    <Tooltip
                        title={openPath.canJoin
                            ? i18n._('key-CncLaser/SelectionBar-Join ends that are less than 1 mm apart')
                            : i18n._('key-CncLaser/SelectionBar-No open ends are less than 1 mm apart')}
                    >
                        <span className={styles['tip-wrapper']}>
                            <button
                                type="button"
                                className={styles['mode-button']}
                                disabled={!openPath.canJoin}
                                onClick={() => dispatch(editorActions.closeSelectedPath(headType, 'join'))}
                            >
                                <svg {...stroke}><path d="M4 16c2-8 6-10 8-4s6 4 8-4" /><circle cx="12" cy="12" r="1.5" /></svg>
                                {i18n._('key-CncLaser/SelectionBar-Join ends')}
                            </button>
                        </span>
                    </Tooltip>
                </>
            )}
            {/* only the buttons that fit the selection are shown */}
            {(canGroup || canUngroup) && renderIconButton(groupTitle, false, onGroup, (
                canUngroup ? (
                    <svg {...stroke}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></svg>
                ) : (
                    <svg {...stroke}><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /><path d="M11 7h4v6" /></svg>
                )
            ))}
            {canDecomposeSelected && (
                <button
                    type="button"
                    className={classNames(styles['text-button'])}
                    onClick={() => dispatch(editorActions.decomposeSelectedSVG(headType))}
                >
                    <svg {...stroke}>
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    {i18n._('key-CncLaser/MainToolBar-Decompose')}
                </button>
            )}
            {canRoundCorners && (
                <Tooltip title={roundCornersOpen ? '' : `${ROUND_CORNERS_ACTION.label()} (${ROUND_CORNERS_ACTION.keyHint})`}>
                    <button
                        type="button"
                        className={styles['text-button']}
                        data-round-corners="true"
                        onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            ROUND_CORNERS_ACTION.run(dispatch, headType, { x: rect.left + rect.width / 2, y: rect.bottom + 6 });
                        }}
                    >
                        <svg {...stroke}><path d="M4 20V10a6 6 0 016-6h10" /><path d="M4 4h2M4 4v2" strokeDasharray="1 2" /></svg>
                        {ROUND_CORNERS_ACTION.label()}
                    </button>
                </Tooltip>
            )}
            {combineActions.length > 0 && renderActionMenu('combine', combineActions, (
                <span className={styles['tip-wrapper']}>
                    <button
                        type="button"
                        className={styles['mode-button']}
                        title={i18n._('key-CncLaser/Combine-Weld, subtract or intersect the shapes')}
                    >
                        <svg {...stroke}><circle cx="9" cy="12" r="5.5" /><circle cx="15" cy="12" r="5.5" /></svg>
                        {i18n._('key-CncLaser/Combine-Combine')}
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
                    </button>
                </span>
            ))}
            {canAlign && (
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
            )}
            {(moreActions.length > 0 || canSetOrigin) && renderActionMenu('more', moreActions, (
                <span className={styles['tip-wrapper']}>
                    <button type="button" className={styles['icon-button']} aria-label={i18n._('key-CncLaser/SelectionBar-More actions')} title={i18n._('key-CncLaser/SelectionBar-More actions')}>
                        <svg {...stroke}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
                    </button>
                </span>
            ), canSetOrigin && (
                <div className={styles['origin-section']} data-set-origin="true">
                    <div className={styles['origin-title']}>{setOriginLabel()}</div>
                    <OriginPointPicker
                        onPick={(reference) => {
                            setMenuOpen(null);
                            dispatch(editorActions.setOriginOnSelection(headType, reference));
                        }}
                    />
                </div>
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
