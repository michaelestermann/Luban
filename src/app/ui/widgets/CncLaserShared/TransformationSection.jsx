import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import path from 'path';
import { includes } from 'lodash';

import i18n from '../../../lib/i18n';
import { toFixed, toFixedNumber } from '../../../lib/numeric-utils';
import TipTrigger from '../../components/TipTrigger';
import { NumberInput as Input } from '../../components/Input';
import { DEFAULT_ANCHOR } from '../../../lib/anchor';
import { unionBox } from '../../../lib/object-origin';
import { formatReadout, moveDeltaForValue, originCarriedBySelection, originRelativePosition } from '../../../lib/origin-readout';
import { liveElementBox } from '../../SVGEditor/origin/live-box';
import { useWorkOriginPoint } from '../../SVGEditor/origin/use-object-origin-point';
import FramePicker from './FramePicker';
import GeometryRow from './GeometryRow';
import CornersSection from './CornersSection';

import { actions as editorActions } from '../../../flux/editor';

import ps from './properties.styl';
import { HEAD_CNC, SVG_NODE_NAME_TEXT } from '../../../constants';

/**
 * Transformation section.
 *
 * This component is used for display properties of selected SVG elements.
 */
const extnameArray = ['.svg', '.dxf'];

const getElemHref = (model) => {
    const elem = model?.elem;
    if (!elem || elem.tagName?.toLowerCase() !== 'image') {
        return undefined;
    }
    return elem.getAttribute('href') || elem.getAttribute('xlink:href') || undefined;
};

/** The leaf objects of a selection (the members of a selected group). */
const leafModels = (models) => models.flatMap(model => (
    Array.isArray(model?.children) && model.children.length ? leafModels(model.children) : [model]
));

/** Model box of an object as the canvas draws it now, else its model box (hidden objects). */
const modelBox = (model, contentGroup, canvasSize) => {
    const live = model.visible !== false ? liveElementBox(model.elem, contentGroup, canvasSize) : null;
    if (live) {
        return live;
    }
    if (typeof model.computeBoundingBox === 'function') {
        model.computeBoundingBox();
    }
    return model.boundingBox || null;
};

// why X / Y cannot be set while the selection carries the work origin
const CARRY_REASONS = {
    self: () => i18n._('key-CncLaser/Origin-The work origin is set on this object, so its position is always measured from itself. Move the origin or the object on the canvas.'),
    group: () => i18n._('key-CncLaser/Origin-The work origin is set on the group containing this object, so its position is always measured from the group. Move the origin or the group on the canvas.'),
    frame: () => i18n._('key-CncLaser/Origin-The work origin is set on a frame of several objects that includes this one, so its position is always measured from that frame. Move the origin or the objects on the canvas.'),
    part: () => i18n._('key-CncLaser/Origin-The work origin is set on objects of this selection, so its position is always measured from them. Move the origin or the objects on the canvas.')
};

const getPickerImage = (models) => {
    if (models.length === 1) {
        return { imageHref: getElemHref(models[0]) };
    }
    const rects = models
        .map(model => ({ href: getElemHref(model), rect: model.elem?.getBoundingClientRect?.() }))
        .filter(item => item.rect && item.rect.width > 0 && item.rect.height > 0);
    if (rects.length === 0) {
        return {};
    }
    const left = Math.min(...rects.map(item => item.rect.left));
    const top = Math.min(...rects.map(item => item.rect.top));
    const right = Math.max(...rects.map(item => item.rect.right));
    const bottom = Math.max(...rects.map(item => item.rect.bottom));
    const frameW = right - left;
    const frameH = bottom - top;
    return {
        items: rects.map(({ href, rect }) => ({
            href,
            x: (rect.left - left) / frameW,
            y: (rect.top - top) / frameH,
            width: rect.width / frameW,
            height: rect.height / frameH
        }))
    };
};
const TransformationSection = ({ headType, updateSelectedModelUniformScalingState, disabled }) => {
    const size = useSelector(state => state?.machine?.size);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const SVGActions = useSelector(state => state[headType]?.SVGActions);
    const transformation = modelGroup.getSelectedModelTransformation();
    let uniformScalingState = useSelector(state => state[headType]?.modelGroup?.getSelectedModelTransformation()?.uniformScalingState);
    if (uniformScalingState === undefined) {
        uniformScalingState = true;
    }
    const isRotate = useSelector(state => state[headType]?.materials?.isRotate);
    const selectedElements = SVGActions.getSelectedElements();
    const selectedElementsTransformation = useSelector(state => state[headType]?.SVGActions?.getSelectedElementsTransformation());
    const selectedModelArray = modelGroup.getSelectedModelArray();
    const sourceType = (selectedModelArray.length === 1) ? selectedModelArray[0].sourceType : null;
    const { x, y, width, height, scaleX, scaleY, angle } = selectedElementsTransformation;
    const isCNC4AxisImage3d = (sourceType === 'image3d' && headType === HEAD_CNC && isRotate);
    const config = useSelector(state => state[headType]?.modelGroup?.getSelectedModel()?.config);
    const isTextVector = (config.svgNodeName === SVG_NODE_NAME_TEXT);
    const [minSize, setMinSize] = useState(0.1);
    const [anchor, setAnchor] = useState(DEFAULT_ANCHOR);

    // X / Y: the anchor of the selection's axis-aligned frame, measured from the work origin (= its G-code X / Y)
    const workOrigin = useWorkOriginPoint(headType);
    const zero = isRotate ? null : workOrigin;
    const origin = useSelector(state => state[headType]?.origin);
    const toolPathGroup = useSelector(state => state[headType]?.toolPathGroup);
    const leafs = leafModels(selectedModelArray);
    const frame = unionBox(leafs.map(model => modelBox(model, SVGActions?.svgContentGroup?.group, SVGActions?.size || size)));
    const logicalWidth = width * Math.abs(scaleX);
    const logicalHeight = height * Math.abs(scaleY);
    // the anchor handles sit on the axis-aligned frame (rotated objects: the frame around them)
    const frameSize = frame ? { width: frame.max.x - frame.min.x, height: frame.max.y - frame.min.y } : { width: logicalWidth, height: logicalHeight };
    const carry = isRotate ? null : originCarriedBySelection(origin, leafs.map(model => model.modelID), {
        getGroupMemberIds: (groupID) => {
            const group = modelGroup.getModel?.(groupID);
            return group && Array.isArray(group.children) ? group.children.map(child => child.modelID) : null;
        },
        jobModelIds: () => (toolPathGroup?.toolPaths || [])
            .filter(toolPath => toolPath.visible)
            .flatMap(toolPath => toolPath.visibleModelIDs || [])
    });
    const logicalAngle = -angle;
    const canResize = ((isTextVector ? config?.text?.length > 0 : true) && selectedModelArray.length === 1 && !selectedModelArray[0].isStraightLine());
    const canRotate = selectedModelArray.length === 1;
    const selectedNotHide = (selectedModelArray.length === 1) && selectedModelArray[0].visible || selectedModelArray.length > 1;
    const canFlip = (selectedModelArray.length === 1 && !selectedModelArray[0].isStraightLine());

    const SVGCanvasMode = useSelector(state => state[headType]?.SVGCanvasMode);
    const SVGCanvasExt = useSelector(state => state[headType]?.SVGCanvasExt);
    const drawing = SVGCanvasMode === 'draw' || SVGCanvasExt.elem;

    const dispatch = useDispatch();
    useEffect(() => {
        selectedModelArray.length && selectedModelArray.forEach((item) => {
            const extname = path.extname(item.uploadName);
            if (!includes(extnameArray, extname)) {
                minSize < 1 && setMinSize(1);
            } else {
                minSize > 0.1 && setMinSize(0.1);
            }
        });
        // With a mixed selection, depending on minSize would flip-flop forever.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- minSize only skips redundant updates
    }, [selectedModelArray]);

    const shown = originRelativePosition(frame, anchor, zero) || { x: 0, y: 0 };

    // picture(s) of the selected object(s) for the anchor picker
    const pickerImage = getPickerImage(selectedModelArray);

    const actions = {
        onAnchorChanged: (newAnchor) => {
            setAnchor(newAnchor);
        },

        // move the selection so that its anchor lands on the typed coordinate (canvas y is down)
        onChangeLogicalX: (value) => {
            const newX = x + moveDeltaForValue(shown.x, value);
            dispatch(editorActions.moveElementsImmediately(headType, selectedElements, { newX }));
        },

        onChangeLogicalY: (value) => {
            const newY = y - moveDeltaForValue(shown.y, value);
            dispatch(editorActions.moveElementsImmediately(headType, selectedElements, { newY }));
        },

        onChangeWidth: (newWidth) => {
            const elements = selectedElements;

            if (elements.length === 1) {
                // TODO: save uniformScalingState in SVGModel
                if (transformation.uniformScalingState) {
                    const newHeight = height * Math.abs(scaleY) * (newWidth / width / Math.abs(scaleX));
                    dispatch(editorActions.resizeElementsImmediately(headType, elements, { newWidth, newHeight }));
                } else {
                    dispatch(editorActions.resizeElementsImmediately(headType, elements, { newWidth }));
                }
            }
        },

        onChangeHeight: (newHeight) => {
            const elements = selectedElements;

            if (elements.length === 1) {
                // TODO: save uniformScalingState in SVGModel
                if (transformation.uniformScalingState) {
                    const newWidth = width * Math.abs(scaleX) * (newHeight / height / Math.abs(scaleY));
                    dispatch(editorActions.resizeElementsImmediately(headType, elements, { newWidth, newHeight }));
                } else {
                    dispatch(editorActions.resizeElementsImmediately(headType, elements, { newHeight }));
                }
            }
        },

        onChangeLogicalAngle: (newLogicalAngle) => {
            const newAngle = -newLogicalAngle;
            const elements = selectedElements;
            dispatch(editorActions.rotateElementsImmediately(headType, elements, { newAngle }));
        },

        onFlipHorizontally: () => {
            const elements = selectedElements;
            dispatch(editorActions.flipElementsHorizontally(headType, elements));
        },

        onFlipVertically: () => {
            const elements = selectedElements;
            dispatch(editorActions.flipElementsVertically(headType, elements));
        },

        onChangeUniformScalingState: (newUniformScalingState) => {
            updateSelectedModelUniformScalingState(newUniformScalingState);
        }
    };

    const moveDisabled = disabled || !selectedNotHide || drawing;
    // the work origin moves with the selection: its X / Y from the origin never change
    const positionLocked = !moveDisabled && !!carry;
    const positionDisabled = moveDisabled || positionLocked;
    const sizeDisabled = disabled || !selectedNotHide || canResize === false || drawing;
    const rotateDisabled = disabled || !selectedNotHide || !canRotate || drawing || isCNC4AxisImage3d;

    const renderField = (prefix, fieldDisabled, input) => (
        <div className={classNames(ps.field, { [ps.disabled]: fieldDisabled })}>
            <span className={ps.prefix}>{prefix}</span>
            {input}
        </div>
    );

    return (
        <div className={ps.props}>
            <TipTrigger
                title={i18n._('key-CncLaser/TransformationSection-AnchorPoint')}
                content={i18n._('key-CncLaser/TransformationSection-Set the reference point for aligning the object. Adjust the objects position based on the selected anchor point.')}
            >
                <FramePicker
                    anchor={anchor}
                    onChange={actions.onAnchorChanged}
                    imageHref={pickerImage.imageHref}
                    items={pickerImage.items}
                    rotation={canRotate ? logicalAngle : 0}
                    flip={{ horizontal: scaleX < 0, vertical: scaleY < 0 }}
                    aspect={frameSize.width / frameSize.height}
                    content={canRotate && frameSize.width > 0 && frameSize.height > 0
                        ? { width: logicalWidth / frameSize.width, height: logicalHeight / frameSize.height } : undefined}
                    disabled={moveDisabled}
                />
            </TipTrigger>
            <TipTrigger
                title={i18n._('key-CncLaser/TransformationSection-Move')}
                content={positionLocked
                    ? CARRY_REASONS[carry]()
                    : i18n._('key-CncLaser/TransformationSection-Set the coordinate of the selected object. You can also drag the object directly. The object should not be moved beyond work area.')}
            >
                {/* a disabled input gets no mouse events (pointer-events none in the styles): the grid takes the hover */}
                <div className={classNames(ps.grid2, { [ps['position-locked']]: positionLocked })} data-position-locked={positionLocked ? carry : undefined}>
                    {renderField('X', positionDisabled, (
                        <Input
                            suffix="mm"
                            disabled={positionDisabled}
                            value={formatReadout(shown.x)}
                            size="small"
                            min={-2 * size.x}
                            max={2 * size.x}
                            onChange={(value) => actions.onChangeLogicalX(value)}
                        />
                    ))}
                    {renderField('Y', positionDisabled, (
                        <Input
                            suffix="mm"
                            disabled={positionDisabled}
                            value={formatReadout(shown.y)}
                            size="small"
                            min={-2 * size.y}
                            max={2 * size.y}
                            onChange={(value) => actions.onChangeLogicalY(value)}
                        />
                    ))}
                </div>
            </TipTrigger>
            <TipTrigger
                title={i18n._('key-CncLaser/TransformationSection-Size')}
                content={i18n._('key-CncLaser/TransformationSection-Set the size of the selected object. You can also resize the object directly. The object should not exceed the work size.')}
            >
                <div className={ps.grid2}>
                    {renderField('W', sizeDisabled, (
                        <Input
                            suffix="mm"
                            disabled={sizeDisabled}
                            value={toFixed(logicalWidth, 1)}
                            min={minSize}
                            size="small"
                            max={size.x}
                            onChange={(value) => actions.onChangeWidth(value)}
                        />
                    ))}
                    {renderField('H', sizeDisabled, (
                        <Input
                            suffix="mm"
                            disabled={sizeDisabled}
                            value={toFixed(logicalHeight, 1)}
                            min={minSize}
                            max={size.y}
                            size="small"
                            onChange={(value) => actions.onChangeHeight(value)}
                        />
                    ))}
                </div>
            </TipTrigger>
            <TipTrigger
                title={i18n._('key-CncLaser/TransformationSection-Rotate')}
                content={i18n._('key-CncLaser/TransformationSection-Rotate the selected object to the angle you need.')}
            >
                <div className={ps.grid2}>
                    {renderField('∠', rotateDisabled, (
                        <Input
                            suffix="°"
                            disabled={rotateDisabled}
                            value={toFixedNumber(logicalAngle, 1)}
                            size="small"
                            onChange={actions.onChangeLogicalAngle}
                        />
                    ))}
                    <div className={ps.buttons}>
                        {canFlip && (
                            <button
                                type="button"
                                className={ps['icon-button']}
                                aria-label={i18n._('key-CncLaser/Properties-Flip horizontal')}
                                title={i18n._('key-CncLaser/Properties-Flip horizontal')}
                                disabled={moveDisabled}
                                onClick={actions.onFlipHorizontally}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v18M4 7l5 5-5 5zM20 7l-5 5 5 5z" /></svg>
                            </button>
                        )}
                        {canFlip && (
                            <button
                                type="button"
                                className={ps['icon-button']}
                                aria-label={i18n._('key-CncLaser/Properties-Flip vertical')}
                                title={i18n._('key-CncLaser/Properties-Flip vertical')}
                                disabled={moveDisabled}
                                onClick={actions.onFlipVertically}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 12h18M7 4l5 5 5-5zM7 20l5-5 5 5z" /></svg>
                            </button>
                        )}
                        <button
                            type="button"
                            className={classNames(ps['icon-button'], { [ps.on]: uniformScalingState })}
                            aria-label={i18n._('key-CncLaser/Properties-Keep ratio')}
                            aria-pressed={!!uniformScalingState}
                            title={i18n._('key-CncLaser/Properties-Keep ratio')}
                            disabled={disabled || !selectedNotHide || isCNC4AxisImage3d || drawing}
                            onClick={() => actions.onChangeUniformScalingState(!uniformScalingState)}
                        >
                            {uniformScalingState ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 017.5-2" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            </TipTrigger>
            {!drawing && selectedModelArray.length === 1 && <CornersSection headType={headType} disabled={disabled || !selectedNotHide} />}
            {!drawing && selectedModelArray.length > 0 && <GeometryRow models={selectedModelArray} />}
        </div>
    );
};

TransformationSection.propTypes = {
    headType: PropTypes.string.isRequired,
    disabled: PropTypes.bool.isRequired,
    updateSelectedModelUniformScalingState: PropTypes.func.isRequired
};

export default TransformationSection;
