import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import path from 'path';
import { includes } from 'lodash';

import i18n from '../../../lib/i18n';
import { toFixed, toFixedNumber, convertSVGPointToLogicalPoint } from '../../../lib/numeric-utils';
import TipTrigger from '../../components/TipTrigger';
import SvgIcon from '../../components/SvgIcon';
import { NumberInput as Input } from '../../components/Input';

import { actions as editorActions } from '../../../flux/editor';

import styles from './styles.styl';
import { HEAD_CNC, SVG_NODE_NAME_TEXT } from '../../../constants';

const X_ANCHOR = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
};

const Y_ANCHOR = {
    TOP: 'top',
    MIDDLE: 'middle',
    BOTTOM: 'bottom'
};

const HORIZONTAL_ALIGN = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
};

const VERTICAL_ALIGN = {
    TOP: 'top',
    MIDDLE: 'middle',
    BOTTOM: 'bottom'
};

/**
 * Transformation section.
 *
 * This component is used for display properties of selected SVG elements.
 */
const extnameArray = ['.svg', '.dxf'];
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
    const [xAnchor, setXAnchor] = useState(X_ANCHOR.CENTER);
    const [yAnchor, setYAnchor] = useState(Y_ANCHOR.MIDDLE);

    // calculate logical transformation
    // TODO: convert positions in flux
    const { x: logicalX, y: logicalY } = convertSVGPointToLogicalPoint({ x, y }, size);
    const logicalWidth = width * Math.abs(scaleX);
    const logicalHeight = height * Math.abs(scaleY);
    const logicalAngle = -angle;
    const canResize = ((isTextVector ? config?.text?.length > 0 : true) && selectedModelArray.length === 1 && !selectedModelArray[0].isStraightLine());
    const canRotate = selectedModelArray.length === 1;
    const selectedNotHide = (selectedModelArray.length === 1) && selectedModelArray[0].visible || selectedModelArray.length > 1;
    const canFlip = (selectedModelArray.length === 1 && !selectedModelArray[0].isStraightLine());
    const selectedMultipleVisibleElements = selectedModelArray.filter((item) => item.visible).length <= 1;

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
    }, [selectedModelArray]);

    const transform = {
        x: () => {
            let value = toFixed(logicalX, 1);

            if (xAnchor === X_ANCHOR.LEFT) {
                value -= width / 2;
            } else if (xAnchor === X_ANCHOR.RIGHT) {
                value += width / 2;
            }

            return value.toFixed(1);
        },

        y: () => {
            let value = toFixed(logicalY, 1);

            if (yAnchor === Y_ANCHOR.BOTTOM) {
                value -= height / 2;
            } else if (yAnchor === Y_ANCHOR.TOP) {
                value += height / 2;
            }

            return value.toFixed(1);
        }
    };

    const actions = {
        onAnchorChanged: (anchorX, anchorY) => {
            setXAnchor(anchorX);
            setYAnchor(anchorY);
        },

        onChangeLogicalX: (newLogicalX) => {
            const elements = selectedElements;
            let newX = newLogicalX + size.x;
            if (xAnchor === X_ANCHOR.LEFT) {
                newX += width / 2;
            } else if (xAnchor === X_ANCHOR.RIGHT) {
                newX -= width / 2;
            }

            dispatch(editorActions.moveElementsImmediately(headType, elements, { newX }));
        },

        onChangeLogicalY: (newLogicalY) => {
            const elements = selectedElements;
            let newY = -newLogicalY + size.y;
            if (yAnchor === Y_ANCHOR.TOP) {
                newY += height / 2;
            } else if (yAnchor === Y_ANCHOR.BOTTOM) {
                newY -= height / 2;
            }

            dispatch(editorActions.moveElementsImmediately(headType, elements, { newY }));
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

        onAlignVertical: (align) => {
            const elements = selectedElements;
            const referenceElement = elements[0];
            const referenceY = referenceElement.y.baseVal.value;
            const referenceHeight = referenceElement.height.baseVal.value;

            elements.forEach(element => {
                let newY;
                const centerElement = element.height.baseVal.value / 2;
                if (align === 'top') {
                    newY = referenceY + centerElement;
                } else if (align === 'middle') {
                    newY = referenceY + referenceHeight / 2;
                } else {
                    newY = referenceY + referenceHeight - centerElement;
                }

                dispatch(editorActions.moveElementsImmediately(headType, [element], { newY }));
            });

            dispatch(editorActions.selectElements(headType, elements));
        },

        onAlignHorizontal: (align) => {
            const elements = selectedElements;
            const referenceElement = elements[0];
            const referenceX = referenceElement.x.baseVal.value;
            const referenceWidth = referenceElement.width.baseVal.value;

            elements.forEach(element => {
                let newX;
                const centerElement = element.width.baseVal.value / 2;
                if (align === 'left') {
                    newX = referenceX + centerElement;
                } else if (align === 'center') {
                    newX = referenceX + referenceWidth / 2;
                } else {
                    newX = referenceX + referenceWidth - centerElement;
                }
                dispatch(editorActions.moveElementsImmediately(headType, [element], { newX }));
            });

            dispatch(editorActions.selectElements(headType, elements));
        },

        onFlipVertically: () => {
            const elements = selectedElements;
            dispatch(editorActions.flipElementsVertically(headType, elements));
        },

        onChangeUniformScalingState: (newUniformScalingState) => {
            updateSelectedModelUniformScalingState(newUniformScalingState);
        }
    };

    return (
        <div className="margin-vertical-8">
            <React.Fragment>
                <TipTrigger
                    title={i18n._('key-CncLaser/TransformationSection-Move')}
                    content={i18n._('key-CncLaser/TransformationSection-Set the coordinate of the selected object. You can also drag the object directly. The object should not be moved beyond work area.')}
                >
                    <div className="sm-flex height-32 margin-vertical-8 ">
                        <span className="sm-flex-auto sm-flex-order-negative width-64 text-overflow-ellipsis">{i18n._('key-CncLaser/TransformationSection-Move')}</span>
                        <span className="sm-flex-width sm-flex justify-space-between">
                            <div className="position-re sm-flex align-flex-start">
                                <span className="width-16 height-32 display-inline unit-text align-c">
                                    X
                                </span>
                                <span>
                                    <Input
                                        suffix="mm"
                                        className="margin-horizontal-2"
                                        disabled={disabled || !selectedNotHide || drawing}
                                        value={transform.x(logicalX)}
                                        size="small"
                                        min={-size.x}
                                        max={size.x}
                                        onChange={(value) => {
                                            actions.onChangeLogicalX(value);
                                        }}
                                    />
                                </span>
                            </div>
                            <div className="position-re sm-flex align-flex-start">
                                <span className="width-16 height-32 display-inline unit-text align-c">
                                    Y
                                </span>
                                <span>
                                    <Input
                                        suffix="mm"
                                        disabled={disabled || !selectedNotHide || drawing}
                                        className="margin-horizontal-2"
                                        value={transform.y(logicalY)}
                                        size="small"
                                        min={-size.y}
                                        max={size.y}
                                        onChange={(value) => {
                                            actions.onChangeLogicalY(value);
                                        }}
                                    />
                                </span>
                            </div>
                        </span>
                    </div>
                </TipTrigger>
                <TipTrigger
                    title={i18n._('key-CncLaser/TransformationSection-AnchorPoint')}
                    content={i18n._('key-CncLaser/TransformationSection-Sets the reference point for aligning the object. Adjusts the objects position based on the selected anchor point.')}
                >
                    <div className="sm-flex margin-vertical-8 ">
                        <span className="sm-flex-auto sm-flex-order-negative width-64 text-overflow-ellipsis">{i18n._('key-CncLaser/TransformationSection-AnchorPoint')}</span>
                        <span className="sm-flex-width sm-flex sm-flex-direction-c justify-space-between">
                            <div className="margin-vertical-4">
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.LEFT, Y_ANCHOR.TOP)}
                                    name="AnchorTopLeft"
                                    className="border-radius-8 border-default-grey-1 margin-left-16"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.LEFT && yAnchor === Y_ANCHOR.TOP)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.CENTER, Y_ANCHOR.TOP)}
                                    name="AnchorTopCenter"
                                    className="border-radius-8 border-default-grey-1 margin-horizontal-4"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.CENTER && yAnchor === Y_ANCHOR.TOP)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.RIGHT, Y_ANCHOR.TOP)}
                                    name="AnchorTopRight"
                                    className="border-radius-8 border-default-grey-1"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.RIGHT && yAnchor === Y_ANCHOR.TOP)}
                                    borderRadius={8}
                                />
                            </div>
                            <div className="margin-vertical-4">
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.LEFT, Y_ANCHOR.MIDDLE)}
                                    name="AnchorMiddleLeft"
                                    className="border-radius-8 border-default-grey-1 margin-left-16"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.LEFT && yAnchor === Y_ANCHOR.MIDDLE)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.CENTER, Y_ANCHOR.MIDDLE)}
                                    name="AnchorMiddleCenter"
                                    className="border-radius-8 border-default-grey-1 margin-horizontal-4"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.CENTER && yAnchor === Y_ANCHOR.MIDDLE)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.RIGHT, Y_ANCHOR.MIDDLE)}
                                    name="AnchorMiddleRight"
                                    className="border-radius-8 border-default-grey-1"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.RIGHT && yAnchor === Y_ANCHOR.MIDDLE)}
                                    borderRadius={8}
                                />
                            </div>
                            <div className="margin-vertical-4">
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.LEFT, Y_ANCHOR.BOTTOM)}
                                    name="AnchorBottomLeft"
                                    className="border-radius-8 border-default-grey-1 margin-left-16"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.LEFT && yAnchor === Y_ANCHOR.BOTTOM)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.CENTER, Y_ANCHOR.BOTTOM)}
                                    name="AnchorBottomCenter"
                                    className="border-radius-8 border-default-grey-1 margin-horizontal-4"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.CENTER && yAnchor === Y_ANCHOR.BOTTOM)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    onClick={() => actions.onAnchorChanged(X_ANCHOR.RIGHT, Y_ANCHOR.BOTTOM)}
                                    name="AnchorBottomRight"
                                    className="border-radius-8 border-default-grey-1"
                                    disabled={disabled || !selectedNotHide || drawing || (xAnchor === X_ANCHOR.RIGHT && yAnchor === Y_ANCHOR.BOTTOM)}
                                    borderRadius={8}
                                />
                            </div>
                        </span>
                    </div>
                </TipTrigger>
                <TipTrigger
                    title={i18n._('key-CncLaser/TransformationSection-Alignment')}
                    content={i18n._('key-CncLaser/TransformationSection-Set the alignment of the selected objects.')}
                >
                    <div className="sm-flex margin-vertical-8">
                        <span className="sm-flex-auto sm-flex-order-negative width-64 text-overflow-ellipsis">{i18n._('key-CncLaser/TransformationSection-Alignment')}</span>
                        <span className="sm-flex-width sm-flex justify-space-between">
                            <div className="sm-flex align-flex-start">
                                <SvgIcon
                                    name="AlignHorizontalLeft"
                                    className="border-radius-8 border-default-grey-1 margin-left-16"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignHorizontal(HORIZONTAL_ALIGN.LEFT)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    name="AlignHorizontalCenter"
                                    className="border-radius-8 border-default-grey-1 margin-horizontal-4"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignHorizontal(HORIZONTAL_ALIGN.CENTER)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    name="AlignHorizontalRight"
                                    className="border-radius-8 border-default-grey-1"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignHorizontal(HORIZONTAL_ALIGN.RIGHT)}
                                    borderRadius={8}
                                />
                            </div>
                            <div className="sm-flex align-flex-start">
                                <SvgIcon
                                    name="AlignVerticalTop"
                                    className="border-radius-8 border-default-grey-1 margin-left-16"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignVertical(VERTICAL_ALIGN.TOP)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    name="AlignVerticalMiddle"
                                    className="border-radius-8 border-default-grey-1 margin-horizontal-4"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignVertical(VERTICAL_ALIGN.MIDDLE)}
                                    borderRadius={8}
                                />
                                <SvgIcon
                                    name="AlignVerticalBottom"
                                    className="border-radius-8 border-default-grey-1"
                                    disabled={disabled || !selectedNotHide || drawing || selectedMultipleVisibleElements}
                                    onClick={() => actions.onAlignVertical(VERTICAL_ALIGN.BOTTOM)}
                                    borderRadius={8}
                                />
                            </div>
                        </span>
                    </div>
                </TipTrigger>
                <TipTrigger
                    title={i18n._('key-CncLaser/TransformationSection-Size')}
                    content={i18n._('key-CncLaser/TransformationSection-Set the size of the selected object. You can also resize the object directly. The object should not exceed the work size.')}
                >
                    <div className="sm-flex height-32 margin-vertical-8">
                        <span className="sm-flex-auto sm-flex-order-negative width-64 text-overflow-ellipsis">{i18n._('key-CncLaser/TransformationSection-Size')}</span>
                        <div className="sm-flex-width sm-flex justify-space-between">
                            <div className="position-re sm-flex align-flex-start">
                                <span className="width-16 height-32 display-inline unit-text align-c">
                                    W
                                </span>
                                <span>
                                    <Input
                                        suffix="mm"
                                        className="margin-horizontal-2"
                                        disabled={disabled || !selectedNotHide || canResize === false || drawing}
                                        value={toFixed(logicalWidth, 1)}
                                        min={minSize}
                                        size="small"
                                        max={size.x}
                                        onChange={(value) => {
                                            actions.onChangeWidth(value);
                                        }}
                                    />
                                </span>
                            </div>
                            <button
                                type="button"
                                disabled={disabled || !selectedNotHide || isCNC4AxisImage3d || drawing}
                                className={classNames(
                                    uniformScalingState ? styles.icon_size_lock : styles.icon_size_unlock,
                                    'display-inline',
                                    // 'width-30',
                                    // 'height-30'
                                    'square-30'
                                )}
                                onClick={() => {
                                    actions.onChangeUniformScalingState(!uniformScalingState);
                                }}
                            />
                            <div className="position-re sm-flex align-flex-start">
                                <span className="width-16 height-32 display-inline unit-text align-c">
                                    H
                                </span>
                                <span>
                                    <Input
                                        suffix="mm"
                                        className="margin-horizontal-2"
                                        disabled={disabled || !selectedNotHide || canResize === false || drawing}
                                        value={toFixed(logicalHeight, 1)}
                                        min={minSize}
                                        max={size.y}
                                        size="small"
                                        onChange={(value) => {
                                            actions.onChangeHeight(value);
                                        }}
                                    />
                                </span>
                            </div>
                        </div>
                    </div>
                </TipTrigger>
                <TipTrigger
                    title={i18n._('key-CncLaser/TransformationSection-Rotate')}
                    content={i18n._('key-CncLaser/TransformationSection-Rotate the selected object to the angle you need.')}
                >
                    <div className="sm-flex height-32 margin-vertical-8">
                        <span className="sm-flex-auto sm-flex-order-negative width-56 text-overflow-ellipsis">{i18n._('key-CncLaser/TransformationSection-Rotate')}</span>
                        <div className="sm-flex-width sm-flex justify-space-between">
                            <div className="display-inline">
                                <SvgIcon
                                    name="RotationAngle"
                                    type={['static']}
                                />
                                <Input
                                    suffix="°"
                                    disabled={disabled || !selectedNotHide || !canRotate || drawing || isCNC4AxisImage3d}
                                    value={toFixedNumber(logicalAngle, 1)}
                                    className="margin-horizontal-2"
                                    size="small"
                                    onChange={actions.onChangeLogicalAngle}
                                />
                            </div>
                            <div className="sm-flex width-96 justify-space-between">
                                {canFlip && (
                                    <SvgIcon
                                        name="FlipLevel"
                                        className="padding-horizontal-8 border-radius-8 border-default-grey-1"
                                        disabled={disabled || !selectedNotHide || drawing}
                                        onClick={actions.onFlipHorizontally}
                                        // type={['static']}
                                        size={26}
                                        borderRadius={8}
                                    />
                                )}
                                {canFlip && (
                                    <SvgIcon
                                        name="FlipVertical"
                                        className="padding-horizontal-8 border-radius-8 border-default-grey-1"
                                        disabled={disabled || !selectedNotHide || drawing}
                                        onClick={actions.onFlipVertically}
                                        size={26}
                                        borderRadius={8}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </TipTrigger>
            </React.Fragment>
        </div>
    );
};

TransformationSection.propTypes = {
    headType: PropTypes.string.isRequired,
    disabled: PropTypes.bool.isRequired,
    updateSelectedModelUniformScalingState: PropTypes.func.isRequired
};

export default TransformationSection;
