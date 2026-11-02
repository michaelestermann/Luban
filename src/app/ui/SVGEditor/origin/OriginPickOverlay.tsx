import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { ObjectReference } from '../../../constants/coordinate';
import { originActions, OriginPickState, t } from '../../../flux/editor/actions-origin';
import { Point } from '../../../lib/object-origin';
import { originAfterDrop, sameOrigin } from '../../../lib/work-origin';
import { OriginTarget, buildOriginTargets, selectionTargets, targetOrigin } from '../snap/origin-targets';
import { buildOriginTargetInput, ModelGroupLike } from './origin-input';
import { ArrowKey, announceTarget, groupTargetsByOwner, nextTargetGroupIndex, stepReference } from './origin-keyboard';
import { targetLabel } from './origin-labels';
import { useOverlayLayout } from './use-overlay-layout';
import styles from './origin.styl';

type Matrix = DOMMatrix | SVGMatrix;

interface OriginPickOverlayProps {
    headType: 'laser' | 'cnc';
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
    size: { x: number; y: number };
    coordinateMode: { value: string; setting?: { sizeMultiplyFactor?: { x: number; y: number } } };
    coordinateSize: { x: number; y: number };
}

// hit area of a point at any zoom (CSS px)
const HIT_PX = 44;

/**
 * Pick mode (split button ⊕, key 0): the 9 points of the selection in red on the canvas. Hover shows the
 * ghost axes and the label, a click sets the origin (one undo step) and ends pick mode; Esc, a click beside
 * the points, a tool change or another selection end it without a change.
 */
const OriginPickOverlay: React.FC<OriginPickOverlayProps> = ({ headType, isActive, getScreenCTM, size, coordinateMode, coordinateSize }) => {
    const dispatch = useDispatch();
    const store = useStore();
    const rootRef = useRef<HTMLDivElement>(null);
    const pick: OriginPickState | null = useSelector(state => state[headType]?.originPick || null);
    const mode = useSelector(state => state[headType]?.SVGCanvasMode);
    const page = useSelector(state => state[headType]?.page);
    const selectedModelArray = useSelector(state => state[headType]?.selectedModelArray);
    useSelector(state => state[headType]?.scale);
    useSelector(state => state[headType]?.target);
    const [hover, setHover] = useState<OriginTarget | null>(null);
    const [, forceRender] = useState(0);

    const active = !!pick && isActive && page === 'editor';
    useOverlayLayout(rootRef, getScreenCTM, active);

    // the owners whose 9 points can be picked: the selection, or (keyboard, nothing selected) every owner
    const owners: OriginTarget[][] = useMemo(() => {
        if (!active) {
            return [];
        }
        const state = store.getState()[headType];
        const input = buildOriginTargetInput(state.modelGroup as ModelGroupLike, coordinateSize, coordinateMode?.setting?.sizeMultiplyFactor, false);
        const all = buildOriginTargets(input);
        if (pick.scope === 'all') {
            return groupTargetsByOwner(all);
        }
        const own = selectionTargets(all);
        return own.length ? [own] : [];
    }, [active, pick?.scope, store, headType, coordinateSize, coordinateMode, selectedModelArray]); // eslint-disable-line react-hooks/exhaustive-deps
    const [ownerIndex, setOwnerIndex] = useState(0);
    // keyboard: start on the owner of the current origin
    useEffect(() => {
        if (!active) {
            return;
        }
        const origin = store.getState()[headType].origin;
        const index = owners.findIndex(group => group.some(target => sameOrigin(targetOrigin(target, coordinateMode.value), origin)));
        setOwnerIndex(Math.max(0, index));
    }, [active, owners]); // eslint-disable-line react-hooks/exhaustive-deps
    const targets: OriginTarget[] = useMemo(() => owners[Math.min(ownerIndex, owners.length - 1)] || [], [owners, ownerIndex]);
    const activeReference: ObjectReference | null = pick?.reference ?? null;
    const activeTarget = activeReference ? targets.find(target => target.reference === activeReference) || null : null;

    // the key handler reads the current keyboard state
    const keyboardRef = useRef({ activeTarget, ownerIndex, ownerCount: owners.length, reference: activeReference });
    keyboardRef.current = { activeTarget, ownerIndex, ownerCount: owners.length, reference: activeReference };

    const end = useCallback((target: OriginTarget | null) => {
        setHover(null);
        if (!target) {
            dispatch(originActions.endOriginPick(headType));
            return;
        }
        const before = store.getState()[headType].origin;
        const { origin, removedOffset } = originAfterDrop(before, targetOrigin(target, coordinateMode.value));
        dispatch(originActions.endOriginPick(headType, { origin, removedOffset, label: targetLabel(target, t, false) }));
    }, [dispatch, headType, store, coordinateMode]);

    // a tool change, another selection or leaving the editor ends pick mode
    const startSelection = useRef(selectedModelArray);
    useEffect(() => {
        if (pick) {
            startSelection.current = startSelection.current || selectedModelArray;
        } else {
            startSelection.current = null;
        }
    }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!pick) {
            return;
        }
        if (mode !== 'select' || !isActive || page !== 'editor' || (startSelection.current && startSelection.current !== selectedModelArray)) {
            end(null);
        }
    }, [pick, mode, isActive, page, selectedModelArray, end]);

    // with nothing to pick on (selection gone) pick mode ends
    useEffect(() => {
        if (active && pick.scope === 'selection' && targets.length === 0) {
            end(null);
        }
    }, [active, pick, targets, end]);

    // Esc ends pick mode before the editor sees it (the selection stays)
    useEffect(() => {
        if (!active) {
            return undefined;
        }
        const onKey = (event: KeyboardEvent) => {
            const keys = ['Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (!keys.includes(event.key)) {
                return;
            }
            // the keys walk the points: the editor (arrows move objects, Esc unselects) does not see them
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type !== 'keydown') {
                return;
            }
            const kb = keyboardRef.current;
            if (event.key === 'Escape') {
                end(null);
            } else if (event.key === 'Enter') {
                if (kb.activeTarget) {
                    end(kb.activeTarget);
                }
            } else if (event.key === 'Tab') {
                const next = nextTargetGroupIndex(kb.ownerIndex, kb.ownerCount, event.shiftKey);
                if (next >= 0) {
                    setOwnerIndex(next);
                    dispatch(originActions.setOriginPickReference(headType, kb.reference || ObjectReference.Center));
                }
            } else {
                const next = kb.reference ? stepReference(kb.reference, event.key as ArrowKey) : ObjectReference.Center;
                dispatch(originActions.setOriginPickReference(headType, next));
            }
        };
        const onResize = () => forceRender(n => n + 1);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKey, true);
            window.removeEventListener('resize', onResize);
        };
    }, [active, end, dispatch, headType]);

    // the active point is shown as ghost axes, like a hover
    useEffect(() => {
        if (active && activeTarget) {
            dispatch(originActions.setOriginPreview(headType, targetOrigin(activeTarget, coordinateMode.value)));
        }
    }, [active, activeTarget, dispatch, headType, coordinateMode]);

    const onHover = useCallback((target: OriginTarget | null) => {
        setHover(target);
        dispatch(originActions.setOriginPreview(headType, target ? targetOrigin(target, coordinateMode.value) : null));
    }, [dispatch, headType, coordinateMode]);

    const ctm = active ? getScreenCTM() : null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!active || !ctm || !root) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const toOverlay = (p: Point): Point => {
        const cx = p.x + size.x;
        const cy = size.y - p.y;
        return { x: ctm.a * cx + ctm.c * cy + ctm.e - root.left, y: ctm.b * cx + ctm.d * cy + ctm.f - root.top };
    };
    const shownTarget = hover || activeTarget;
    const hoverAt = shownTarget ? toOverlay(shownTarget.point) : null;
    const announcement = activeTarget ? announceTarget(activeTarget, targetLabel(activeTarget, t, false)) : '';

    return (
        <div ref={rootRef} className={styles.overlay} data-origin-pick>
            {/* a click beside the points ends pick mode without a change */}
            <div
                className={styles['pick-background']}
                role="presentation"
                onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    end(null);
                }}
            />
            {targets.map((target) => {
                const p = toOverlay(target.point);
                return (
                    <button
                        type="button"
                        key={target.reference}
                        className={classNames(styles['pick-point'], { [styles.active]: target === activeTarget })}
                        data-origin-pick-point={target.reference}
                        aria-label={targetLabel(target, t)}
                        style={{ left: p.x - HIT_PX / 2, top: p.y - HIT_PX / 2, width: HIT_PX, height: HIT_PX }}
                        onMouseEnter={() => onHover(target)}
                        onMouseLeave={() => onHover(null)}
                        onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            end(target);
                        }}
                    >
                        <span className={styles['pick-dot']} />
                    </button>
                );
            })}
            {shownTarget && hoverAt && (
                <span className={styles.label} data-origin-label style={{ left: hoverAt.x + 14, top: hoverAt.y + 14 }}>
                    {targetLabel(shownTarget, t)}
                </span>
            )}
            <div className={styles['sr-only']} aria-live="polite" data-origin-announce>{announcement}</div>
            <div className={styles.hint} data-origin-hint>
                {t('key-CncLaser/Origin-Click a point · Esc cancels')}
            </div>
        </div>
    );
};

export default OriginPickOverlay;
