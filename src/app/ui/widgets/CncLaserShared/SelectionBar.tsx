import { Popover, Tooltip } from 'antd';
import classNames from 'classnames';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { HEAD_LASER, PAGE_EDITOR } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { canDecomposeSelection } from '../../../lib/svg-decompose';
import SvgIcon from '../../components/SvgIcon';
import PointEditBar from './PointEditBar';
import MeasureBar from './MeasureBar';
import { openPathState } from '../../SVGEditor/path-edit/shape-to-path';
import {
    canSetOriginOnSelection, COMBINE_ACTIONS, fittingActions, MORE_ACTIONS, originDialogLabel, originDialogTitle, pickOriginLabel, ROUND_CORNERS_ACTION,
    setOriginLabel, ShapeAction,
} from './shape-actions';
import OriginPointPicker from './OriginPointPicker';
import { BarFit, nextBarFit } from './selection-bar-fit';
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

// gap and padding + border of .selection-bar
const BAR_GAP = 2;
const BAR_FRAME = 10;
// room the bar leaves: the tool column on the left of the canvas and 16 px on each side (see .selection-bar)
const BAR_MARGIN = 104;
// the object name is cut off before it gets wider
const LABEL_MAX_WIDTH = 180;

// icons of the shape actions (label and key in the tooltip)
const ACTION_ICONS = {
    decompose: (
        <svg {...stroke}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    'round-corners': <svg {...stroke}><path d="M4 20V10a6 6 0 016-6h10" /><path d="M4 4h2M4 4v2" strokeDasharray="1 2" /></svg>,
    offset: <svg {...stroke}><rect x="7" y="7" width="10" height="10" rx="1" /><rect x="3" y="3" width="18" height="18" rx="4" strokeDasharray="3 2" /></svg>,
    array: (
        <svg {...stroke}>
            <rect x="2" y="9" width="5.5" height="5.5" rx="1" />
            <rect x="9.25" y="9" width="5.5" height="5.5" rx="1" />
            <rect x="16.5" y="9" width="5.5" height="5.5" rx="1" />
            <path d="M4.75 18.5v1.5h14.5v-1.5" />
        </svg>
    ),
};

const withKeyHint = (action: ShapeAction) => (action.keyHint ? `${action.label()} (${action.keyHint})` : action.label());

/** Width of the bar as rendered: the children as they are, the name at its full width. */
function naturalWidth(bar: HTMLElement): number {
    const children = Array.from(bar.children) as HTMLElement[];
    const width = children.reduce((sum, child) => sum + (child.dataset.barLabel
        ? Math.min(child.scrollWidth, LABEL_MAX_WIDTH)
        : child.getBoundingClientRect().width), 0);
    return width + BAR_GAP * Math.max(0, children.length - 1) + BAR_FRAME;
}

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
    // work origin: pick mode runs / the details are asked for (Shift+O)
    const originPickActive = useSelector(state => !!state[headType]?.originPick);
    const originDialogAsked = useSelector(state => !!state[headType]?.originDialog);
    const originDetailsOpen = menuOpen === 'origin' || originDialogAsked;
    const store = useStore();
    // icon buttons, or the overflow "⋯" when they do not fit on the canvas
    const barRef = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState<BarFit | null>(null);
    const [, setRoom] = useState(0);
    const fitKey = useRef('');
    // after every render (the actions depend on the mutable model group); nextBarFit settles in one step
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const bar = barRef.current;
        if (!bar || !bar.parentElement) {
            return;
        }
        const next = nextBarFit(fit, fitKey.current, naturalWidth(bar), bar.parentElement.clientWidth - BAR_MARGIN);
        if (next !== fit) {
            setFit(next);
        }
    });
    const container = barRef.current?.parentElement;
    useLayoutEffect(() => {
        if (!container || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        // measure again when the canvas gets narrower or wider (next frame: no resize loop)
        let frame = 0;
        const observer = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setRoom(container.clientWidth));
        });
        observer.observe(container);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [container]);

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

    // Combine ▾ shows only the actions that fit
    const combineActions = fittingActions(COMBINE_ACTIONS, store.getState(), headType);
    // rectangles (or editable paths with sharp corners) in the selection
    const canRoundCorners = ROUND_CORNERS_ACTION.fits(store.getState(), headType);
    // one-shot shape actions: icon buttons in the bar, in the overflow "⋯" only when the bar does not fit
    const shapeActions: ShapeAction[] = [
        ...(canDecomposeSelected ? [{
            id: 'decompose',
            label: () => i18n._('key-CncLaser/MainToolBar-Decompose'),
            fits: () => true,
            run: () => dispatch(editorActions.decomposeSelectedSVG(headType)),
        }] : []),
        ...(canRoundCorners ? [ROUND_CORNERS_ACTION] : []),
        ...fittingActions(MORE_ACTIONS, store.getState(), headType),
    ];
    // "Set origin here": its own button with the point picker
    const canSetOrigin = canSetOriginOnSelection(store.getState(), headType);
    fitKey.current = [
        ...selectedModels.map(model => model.modelID), label, openPath.open, canGroup, canUngroup, canAlign, canSetOrigin,
        ...combineActions.map(action => action.id), ...shapeActions.map(action => action.id),
    ].join('|');
    // 0: icon buttons, 1: overflow "⋯" (the bar wraps if even that does not fit)
    const overflow = !!fit && fit.key === fitKey.current && fit.level === 1;

    const onGroup = () => {
        if (canUngroup) {
            dispatch(editorActions.ungroupSelectedGroup(headType));
        } else if (canGroup) {
            dispatch(editorActions.groupSelectedModels(headType));
        }
    };

    // a plain icon button (actions are not toggles: highlighted only while their dialog / menu is open)
    const renderIconButton = (
        title: string,
        disabled: boolean,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => void,
        icon: React.ReactNode,
        options: { tooltip?: string; open?: boolean; data?: Record<string, string> } = {},
    ) => (
        <Tooltip title={options.open ? '' : (options.tooltip ?? title)}>
            <span className={styles['tip-wrapper']}>
                <button
                    type="button"
                    className={classNames(styles['icon-button'], { [styles.open]: options.open })}
                    aria-label={title}
                    disabled={disabled}
                    onClick={onClick}
                    {...options.data}
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

    // a value dialog opened from a menu opens below the menu's button
    const menuAnchor = (menu: string) => {
        const button = barRef.current?.querySelector(menu === 'more' ? '[data-bar-more]' : '[data-bar-combine]');
        const rect = button?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.bottom + 6 } : undefined;
    };

    const renderActionMenu = (menu: string, items: ShapeAction[], button: React.ReactNode) => (
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
                                item.run(dispatch, headType, menuAnchor(menu));
                            }}
                        >
                            <span>{item.label()}</span>
                            {item.keyHint && <span className={styles['menu-key']}>{item.keyHint}</span>}
                        </button>
                    ))}
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
        <div ref={barRef} className={classNames(styles['selection-bar'], { [styles.wrap]: overflow })} role="toolbar" aria-label={i18n._('key-CncLaser/SelectionBar-Selection actions')}>
            <span className={styles.label} title={label} data-bar-label="true">{label}</span>
            {openPath.open && (
                <>
                    <span className={styles['open-label']}>{i18n._('key-CncLaser/SelectionBar-Open path')}</span>
                    {renderIconButton(i18n._('key-CncLaser/SelectionBar-Close path'), false, () => {
                        dispatch(editorActions.closeSelectedPath(headType, 'close'));
                    }, (
                        <svg {...stroke}><path d="M5 18V7l7-3 7 3v11" /><path d="M5 18h14" strokeDasharray="2 2" /></svg>
                    ), {
                        tooltip: `${i18n._('key-CncLaser/SelectionBar-Close path')}: ${i18n._('key-CncLaser/SelectionBar-Close every open end with a straight line')}`,
                    })}
                    {renderIconButton(i18n._('key-CncLaser/SelectionBar-Join ends'), !openPath.canJoin, () => {
                        dispatch(editorActions.closeSelectedPath(headType, 'join'));
                    }, (
                        <svg {...stroke}><path d="M4 16c2-8 6-10 8-4s6 4 8-4" /><circle cx="12" cy="12" r="1.5" /></svg>
                    ), {
                        tooltip: `${i18n._('key-CncLaser/SelectionBar-Join ends')}: ${openPath.canJoin
                            ? i18n._('key-CncLaser/SelectionBar-Join ends that are less than 1 mm apart')
                            : i18n._('key-CncLaser/SelectionBar-No open ends are less than 1 mm apart')}`,
                    })}
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
            {!overflow && shapeActions.map(action => (
                <React.Fragment key={action.id}>
                    {renderIconButton(action.label(), false, (event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        action.run(dispatch, headType, { x: rect.left + rect.width / 2, y: rect.bottom + 6 });
                    }, ACTION_ICONS[action.id], {
                        tooltip: withKeyHint(action),
                        open: action.id === ROUND_CORNERS_ACTION.id && roundCornersOpen,
                        data: {
                            'data-bar-action': action.id,
                            ...(action.id === ROUND_CORNERS_ACTION.id ? { 'data-round-corners': 'true' } : {}),
                        },
                    })}
                </React.Fragment>
            ))}
            {combineActions.length > 0 && renderActionMenu('combine', combineActions, (
                <span className={styles['tip-wrapper']}>
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], styles['with-caret'], { [styles.open]: menuOpen === 'combine' })}
                        title={`${i18n._('key-CncLaser/Combine-Combine')}: ${i18n._('key-CncLaser/Combine-Weld, subtract or intersect the shapes')}`}
                        aria-label={i18n._('key-CncLaser/Combine-Combine')}
                        data-bar-combine="true"
                    >
                        <svg {...stroke}><circle cx="9" cy="12" r="5.5" /><circle cx="15" cy="12" r="5.5" /></svg>
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
                        <button type="button" className={classNames(styles['icon-button'], { [styles.open]: alignOpen })} aria-label={alignTitle} title={alignTitle}>
                            <svg {...stroke}><path d="M4 4v16M8 7h12M8 12h8M8 17h10" /></svg>
                        </button>
                    </span>
                </Popover>
            )}
            {overflow && shapeActions.length > 0 && renderActionMenu('more', shapeActions, (
                <span className={styles['tip-wrapper']}>
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], { [styles.open]: menuOpen === 'more' })}
                        aria-label={i18n._('key-CncLaser/SelectionBar-More actions')}
                        title={i18n._('key-CncLaser/SelectionBar-More actions')}
                        data-bar-more="true"
                    >
                        <svg {...stroke}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
                    </button>
                </span>
            ))}
            {canSetOrigin && (
                // split button [⊕ | Origin…]: pick on the canvas, or the details (phase 1: the point picker)
                <span className={styles['origin-split']} data-bar-origin="true">
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], styles['split-left'], { [styles.open]: originPickActive })}
                        aria-label={pickOriginLabel()}
                        title={pickOriginLabel()}
                        data-bar-origin-pick="true"
                        onClick={() => {
                            setMenuOpen(null);
                            dispatch(editorActions.closeOriginDialog(headType));
                            if (originPickActive) {
                                dispatch(editorActions.endOriginPick(headType));
                            } else {
                                dispatch(editorActions.startOriginPick(headType, 'button'));
                            }
                        }}
                    >
                        <svg {...stroke}>
                            <circle cx="12" cy="12" r="6.5" />
                            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                        </svg>
                    </button>
                    <Popover
                        content={(
                            <div className={styles['origin-section']} data-set-origin="true">
                                <div className={styles['origin-title']}>{setOriginLabel()}</div>
                                <OriginPointPicker
                                    onPick={(reference) => {
                                        setMenuOpen(null);
                                        dispatch(editorActions.closeOriginDialog(headType));
                                        dispatch(editorActions.setOriginOnSelection(headType, reference, 'dialog'));
                                    }}
                                />
                            </div>
                        )}
                        trigger="click"
                        placement="bottom"
                        visible={originDetailsOpen}
                        onVisibleChange={(visible) => {
                            setMenuOpen(visible ? 'origin' : null);
                            if (!visible) {
                                dispatch(editorActions.closeOriginDialog(headType));
                            }
                        }}
                    >
                        <span className={styles['tip-wrapper']}>
                            <button
                                type="button"
                                className={classNames(styles['text-button'], styles['split-right'], { [styles.open]: originDetailsOpen })}
                                title={originDialogTitle()}
                                data-bar-origin-dialog="true"
                            >
                                {originDialogLabel()}
                            </button>
                        </span>
                    </Popover>
                </span>
            )}
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
