import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import { PREDEFINED_SHORTCUT_ACTIONS, ShortcutHandlerPriority, ShortcutManager } from '../../lib/shortcut';
import styles from './styles.styl';
import { SVG_EVENT_CONTEXTMENU } from './constants';
import SVGCanvas from './SVGCanvas';
import SVGLeftBar from './SVGLeftBar';
import { Materials, Origin, OriginType, Workpiece } from '../../constants/coordinate';
import type ModelGroup from '../../models/ModelGroup';
import { library } from './lib/ext-shapes';
import Modal from '../components/Modal/tileModal';
import SVGShapeLibrary from './SVGShapeLibrary';
import PointEditOverlay from './path-edit/PointEditOverlay';
import MeasureOverlay from './measure/MeasureOverlay';
import DimensionsOverlay from './measure/DimensionsOverlay';
import SnapOverlay from './snap/SnapOverlay';
import OriginMarker from './origin/OriginMarker';
import OriginPickOverlay from './origin/OriginPickOverlay';
import OriginKeys from './origin/OriginKeys';
import SmallObjectMarkers from './small-objects/SmallObjectMarkers';
import ShapeActionKeys from './combine/ShapeActionKeys';
import RoundCorners from './combine/RoundCorners';
import OffsetPreview from './combine/OffsetPreview';
import ArrayPreview from './combine/ArrayPreview';
import { useObjectOriginPoint } from './origin/use-object-origin-point';


export type SVGEditorHandle = {
    zoomIn: () => void;
    zoomOut: () => void;
    autoFocus: () => void;
}

type SVGEditorProps = {
    isActive: boolean;

    size: object;
    materials: Materials;

    SVGActions: object;
    // getEnteredGroupId is only available on the laser/CNC model group
    modelGroup?: ModelGroup & { getEnteredGroupId?: () => string | null };
    scale: number;
    minScale: number;
    maxScale: number;
    target: object;
    coordinateMode: object;
    coordinateSize: object;
    workpiece: Workpiece;
    origin: Origin;
    editable: boolean;

    headType: string;
    menuDisabledCount: number;
    SVGCanvasMode: string;
    SVGCanvasExt: object;
    showSVGShapeLibrary: boolean;

    updateScale: () => void;
    updateTarget: () => void;

    initContentGroup: () => void;
    onCreateElement: (element) => void;
    onSelectElements: (elements) => void;
    onClearSelection: () => void;
    onMoveSelectedElementsByKey: () => void;
    createText: (text) => void;
    updateTextTransformationAfterEdit: (element, transformation) => void;
    getSelectedElementsUniformScalingState: () => void;

    elementActions: {
        moveElementsStart: (elements, options?) => void;
        moveElements: (elements, options) => void;
        moveElementsFinish: (elements, options) => void;
        resizeElementsStart: (elements, options) => void;
        resizeElements: (elements, options) => void;
        resizeGroupElements: (elements, options) => void;
        resizeElementsFinish: (elements, options) => void;
        rotateElementsStart: (elements, options) => void;
        rotateElements: (elements, options) => void;
        rotateElementsFinish: (elements, options) => void;
        moveElementsOnKeyDown: (elements, options) => void;
        isPointInSelectArea: (elements, options) => void;
        getMouseTargetByCoordinate: (elements, options) => void;
        isSelectedAllVisible: (elements, options) => void;
    };
    onChangeFile: (event: MouseEvent) => void;

    showContextMenu: (event) => void;

    editorActions: {
        undo: () => void;
        redo: () => void;
        selectAll: () => void;
        updateShowSVGShapeLibrary: (isShow: boolean) => void
    };
};

const SVGEditor = forwardRef<SVGEditorHandle, SVGEditorProps>((props, ref) => {
    const [isFirstShow, setIsFirstShow] = useState(false);
    const [drawGroup, setDrawGroup] = useState(null);

    const canvas = useRef(null);
    // the red origin dot and the rulers follow an object origin
    const originPoint = useObjectOriginPoint(props.headType);
    const leftBarRef = useRef(null);
    const extRef = useRef(props.SVGCanvasExt);
    extRef.current = props.SVGCanvasExt;

    const [menuDisabledCount, setMenuDisabledCount] = useState(props.menuDisabledCount);
    useEffect(() => {
        setMenuDisabledCount(props.menuDisabledCount);
    }, [props.menuDisabledCount]);

    const menuDisabledCountRef = useRef(menuDisabledCount);
    menuDisabledCountRef.current = menuDisabledCount;

    const onStopDraw = (exitCompletely, nextMode) => {
        return canvas.current.stopDraw(exitCompletely, nextMode);
    };

    useEffect(() => {
        const moveElements = (config) => {
            const selectedElements = props.elementActions.isSelectedAllVisible();
            if (selectedElements) {
                props.elementActions.moveElementsStart(selectedElements);
                props.elementActions.moveElements(selectedElements, config);
            }
        };

        const moveElementsFinish = () => {
            const selectedElements = props.elementActions.isSelectedAllVisible();
            selectedElements && props.elementActions.moveElementsFinish(selectedElements);
        };

        const shortcutHandler = {
            title: 'SVGEditor',
            // TODO: unregister in case of component is destroyed
            isActive: () => props.isActive,
            priority: ShortcutHandlerPriority.View,
            shortcuts: {
                [PREDEFINED_SHORTCUT_ACTIONS.UNDO]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.undo();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.REDO]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.redo();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.SELECTALL]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.selectAll();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.UNSELECT]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        // With a group member selected, Escape selects the
                        // whole group instead of unselecting.
                        if (props.editorActions.exitGroup && props.modelGroup?.getEnteredGroupId?.()) {
                            props.editorActions.exitGroup({ selectGroup: true });
                        } else {
                            props.editorActions.unselectAll();
                        }
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.DELETE]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.deleteSelectedModel(extRef.current.elem ? 'draw' : props.SVGCanvasMode);
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.COPY]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.copy();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.PASTE]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.paste();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.DUPLICATE]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.duplicateSelectedModel();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.CUT]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.cut();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.GROUP]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.groupSelectedModels && props.editorActions.groupSelectedModels();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.UNGROUP]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        props.editorActions.ungroupSelectedGroup && props.editorActions.ungroupSelectedGroup();
                    }
                },
                [PREDEFINED_SHORTCUT_ACTIONS.ENTER]: () => {
                    if (!(menuDisabledCountRef.current > 0)) {
                        onStopDraw(true);
                    }
                },
                // optimize: accelerate when continuous click
                'MOVE-UP': {
                    keys: ['up'],
                    callback: () => {
                        moveElements({ dx: 0, dy: -1 });
                    },
                    keyupCallback: () => {
                        moveElementsFinish();
                    }
                },
                'MOVE-DOWM': {
                    keys: ['down'],
                    callback: () => {
                        moveElements({ dx: 0, dy: 1 });
                    },
                    keyupCallback: () => {
                        moveElementsFinish();
                    }
                },
                'MOVE-LEFT': {
                    keys: ['left'],
                    callback: () => {
                        moveElements({ dx: -1, dy: 0 });
                    },
                    keyupCallback: () => {
                        moveElementsFinish();
                    }
                },
                'MOVE-RIGHT': {
                    keys: ['right'],
                    callback: () => {
                        moveElements({ dx: 1, dy: 0 });
                    },
                    keyupCallback: () => {
                        moveElementsFinish();
                    }
                }

            }
        };
        ShortcutManager.register(shortcutHandler);

        return () => {
            ShortcutManager.unregister(shortcutHandler);
        };
    }, [
        props.elementActions,
        props.editorActions,
        props.SVGCanvasMode,
        props.isActive,
        props.modelGroup,
    ]);

    const changeCanvasMode = (_mode, ext) => {
        props.editorActions.setMode(_mode, ext);
    };

    useEffect(() => {
        // canvas.current.on(SVG_EVENT_MODE, (_mode) => {
        //     changeCanvasMode(_mode);
        // });

        canvas.current.on(SVG_EVENT_CONTEXTMENU, (event) => {
            props.showContextMenu(event);
        });

        // Init, Setup SVGContentGroup
        props.initContentGroup(canvas.current.svgContentGroup);
        setDrawGroup(canvas.current.svgContentGroup.drawGroup);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time canvas setup on mount; re-running would add another context menu listener
    }, []);

    const getCanvasScreenCTM = useCallback(() => {
        return canvas.current ? canvas.current.svgContentGroup.getScreenCTM() : null;
    }, []);

    const getContentGroup = useCallback(() => {
        return canvas.current ? canvas.current.svgContentGroup.group : null;
    }, []);

    const getSvgContainer = useCallback(() => {
        return canvas.current ? canvas.current.svgContainer : null;
    }, []);

    const insertDefaultTextVector = async () => {
        const element = await props.createText('Snapmaker');
        props.onCreateElement(element);

        // todo, select text after create
        // canvas.current.selectOnly([elem]);
        changeCanvasMode('select');
    };

    const hideLeftBarOverlay = () => {
        leftBarRef.current.actions.hideLeftBarOverlay();
    };

    const zoomIn = () => {
        canvas.current.zoomIn();
    };

    const zoomOut = () => {
        canvas.current.zoomOut();
    };

    const autoFocus = () => {
        canvas.current.autoFocus();
    };

    useImperativeHandle(ref, () => ({
        zoomIn,
        zoomOut,
        autoFocus,
        canEditPoints: (elem: Element) => !!canvas.current?.canEditPoints(elem),
        editPoints: (elem: Element) => canvas.current?.editPoints(elem),
    }));

    const onStartDraw = () => {
        canvas.current.startDraw();
    };


    const onDrawTransformComplete = (...args) => {
        props.editorActions.onDrawTransformComplete(...args);
    };


    const createSvgModelByDData = (d) => {
        const { SVGActions, coordinateMode, coordinateSize } = props;
        const centerX = (coordinateSize.x / 2) * coordinateMode.setting.sizeMultiplyFactor.x;
        const centerY = (-coordinateSize.y / 2) * coordinateMode.setting.sizeMultiplyFactor.y;
        const canvasCenterX = SVGActions.size.x + centerX; // calculate center,
        const canvasCenterY = SVGActions.size.y + centerY;
        const element = canvas.current.svgContentGroup.addSVGElement({
            element: 'path',
            curStyles: true,
            attr: {
                from: 'inner-svg',
                x: canvasCenterX,
                y: canvasCenterY,
                d: d,
                opacity: 0,
                'stroke-width': 0,
            }
        });
        const bbox = element.getBBox();
        const scale = 100 / Math.max(bbox.width, bbox.height);
        // TODO: calculate the <path> transform is better?
        const TranslateCanvasCenterX = canvasCenterX - (bbox.x + bbox.width / 2);
        const TranslateCanvasCenterY = canvasCenterY - (bbox.y + bbox.height / 2);
        const scaledTranslateCanvasCenterX = -10000000000;
        const scaledTranslateCanvasCenterY = -10000000000;
        element.setAttribute('x', canvasCenterX - bbox.width * scale / 2);
        element.setAttribute('y', canvasCenterY - bbox.height * scale / 2);
        element.setAttribute('transform', `translate(${TranslateCanvasCenterX}, ${TranslateCanvasCenterY}) scale(${scale})  translate(${scaledTranslateCanvasCenterX}, ${scaledTranslateCanvasCenterY})`);
        element.setAttribute('opacity', 1);
        element.setAttribute('stroke-width', 1);
        props.onCreateElement(element);
        changeCanvasMode('select', undefined);
    };
    const createExt = (ext) => {
        const d = library.data[ext];
        createSvgModelByDData(d);
    };
    const updateIsShowSVGShapeLibrary = (isShow: boolean) => {
        props.editorActions.updateShowSVGShapeLibrary(isShow);
    };
    const renderSVGShapeLibrary = () => {
        const onClose = () => { updateIsShowSVGShapeLibrary(false); };
        return (
            <Modal
                wrapClassName={props.showSVGShapeLibrary ? 'display-block' : 'display-none'}
                closable={false}
                disableOverlay
                tile
                onClose={onClose}
            >
                <SVGShapeLibrary
                    style={{ display: props.showSVGShapeLibrary }}
                    isPopup
                    key="svg-shape-library-popup"
                    onClose={onClose}
                    headType={props.headType}
                    createSvgModelByDData={createSvgModelByDData}
                    onChangeFile={props.onChangeFile}
                />
            </Modal>
        );
    };
    useEffect(() => {
        if (props.showSVGShapeLibrary) {
            setIsFirstShow(true);
        }
    }, [props.showSVGShapeLibrary]);

    return (
        <React.Fragment>
            <div className={styles['laser-table']} style={{ position: 'relative' }}>
                <div className={styles['laser-table-row']}>
                    <div className={styles['view-space']}>
                        <SVGCanvas
                            mode={props.SVGCanvasMode}
                            ext={props.SVGCanvasExt}
                            className={styles['svg-content']}
                            editable={props.editable}
                            SVGActions={props.SVGActions}
                            size={props.size}
                            materials={props.materials}
                            scale={props.scale}
                            minScale={props.minScale}
                            maxScale={props.maxScale}
                            target={props.target}
                            updateScale={props.updateScale}
                            updateTarget={props.updateTarget}
                            coordinateMode={props.coordinateMode}
                            coordinateSize={props.coordinateSize}
                            workpiece={props.workpiece}
                            origin={props.origin}
                            originPoint={originPoint}
                            originDotHidden={props.origin?.type !== OriginType.CNCLockingBlock}
                            ref={canvas}
                            onCreateElement={props.onCreateElement}
                            onSelectElements={props.onSelectElements}
                            onClearSelection={props.onClearSelection}
                            onMoveSelectedElementsByKey={props.onMoveSelectedElementsByKey}
                            updateTextTransformationAfterEdit={props.updateTextTransformationAfterEdit}
                            getSelectedElementsUniformScalingState={props.getSelectedElementsUniformScalingState}
                            elementActions={props.elementActions}
                            hideLeftBarOverlay={hideLeftBarOverlay}
                            onDrawLine={props.editorActions.onDrawLine}
                            onDrawDelete={props.editorActions.onDrawDelete}
                            onDrawTransform={props.editorActions.onDrawTransform}
                            onDrawTransformComplete={(...args) => onDrawTransformComplete(...args)}
                            onDrawStart={props.editorActions.onDrawStart}
                            onDrawComplete={props.editorActions.onDrawComplete}
                            onBoxSelect={props.editorActions.onBoxSelect}
                            setMode={changeCanvasMode}
                            editorActions={props.editorActions}
                            modelGroup={props.modelGroup}
                        />
                        <SmallObjectMarkers
                            headType={props.headType}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                        />
                        <PointEditOverlay
                            drawGroup={drawGroup}
                            getScreenCTM={getCanvasScreenCTM}
                            isActive={props.isActive}
                            onExit={() => onStopDraw(true)}
                        />
                        <SnapOverlay
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                        />
                        <OriginMarker
                            headType={props.headType as 'laser' | 'cnc'}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                            size={props.size as { x: number; y: number }}
                            coordinateMode={props.coordinateMode as { value: string }}
                            coordinateSize={props.coordinateSize as { x: number; y: number }}
                            locked={props.SVGCanvasMode !== 'select' || !!(props.SVGCanvasExt as { elem?: unknown })?.elem}
                        />
                        <OriginPickOverlay
                            headType={props.headType as 'laser' | 'cnc'}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                            size={props.size as { x: number; y: number }}
                            coordinateMode={props.coordinateMode as { value: string }}
                            coordinateSize={props.coordinateSize as { x: number; y: number }}
                        />
                        <DimensionsOverlay
                            headType={props.headType}
                            mode={props.SVGCanvasMode}
                            editing={!!props.SVGCanvasExt?.elem}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                        />
                        <MeasureOverlay
                            headType={props.headType}
                            mode={props.SVGCanvasMode}
                            editing={!!props.SVGCanvasExt?.elem}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                            getSvgContainer={getSvgContainer}
                            setMode={(mode) => leftBarRef.current?.actions.setMode(mode)}
                        />
                        <OffsetPreview
                            headType={props.headType as 'laser' | 'cnc'}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                            getContentGroup={getContentGroup}
                        />
                        <ArrayPreview
                            headType={props.headType as 'laser' | 'cnc'}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                            getContentGroup={getContentGroup}
                        />
                        <RoundCorners
                            headType={props.headType as 'laser' | 'cnc'}
                            isActive={props.isActive}
                            getScreenCTM={getCanvasScreenCTM}
                        />
                        <OriginKeys
                            headType={props.headType as 'laser' | 'cnc'}
                            mode={props.SVGCanvasMode}
                            editing={!!(props.SVGCanvasExt as { elem?: unknown })?.elem}
                            isActive={props.isActive}
                        />
                        <ShapeActionKeys
                            headType={props.headType as 'laser' | 'cnc'}
                            mode={props.SVGCanvasMode}
                            editing={!!props.SVGCanvasExt?.elem}
                            isActive={props.isActive}
                        />
                    </div>
                    <SVGLeftBar
                        ref={leftBarRef}
                        mode={props.SVGCanvasMode}
                        selectEditing={!!props.SVGCanvasExt.elem}
                        insertDefaultTextVector={insertDefaultTextVector}
                        setMode={changeCanvasMode}
                        onChangeFile={props.onChangeFile}
                        onClickToUpload={props.onClickToUpload}
                        fileInput={props.fileInput}
                        allowedFiles={props.allowedFiles}
                        editable={props.editable}
                        isActive={props.isActive}
                        headType={props.headType}
                        onStartDraw={() => onStartDraw()}
                        onStopDraw={(exitCompletely, nextMode) => onStopDraw(exitCompletely, nextMode)}
                        coordinateMode={props.coordinateMode}
                        coordinateSize={props.coordinateSize}
                        createExt={createExt}
                        updateIsShowSVGShapeLibrary={updateIsShowSVGShapeLibrary}
                    />
                </div>
                {isFirstShow && renderSVGShapeLibrary()}
            </div>
        </React.Fragment>
    );
});

SVGEditor.propTypes = {
    isActive: PropTypes.bool,
    size: PropTypes.object.isRequired,
    SVGActions: PropTypes.object.isRequired,
    scale: PropTypes.number.isRequired,
    minScale: PropTypes.number,
    maxScale: PropTypes.number,
    target: PropTypes.object,
    coordinateMode: PropTypes.object.isRequired,
    coordinateSize: PropTypes.object.isRequired,
    workpiece: PropTypes.object.isRequired,
    origin: PropTypes.object.isRequired,
    editable: PropTypes.bool,
    menuDisabledCount: PropTypes.number,
    SVGCanvasMode: PropTypes.string.isRequired,
    SVGCanvasExt: PropTypes.object,

    updateScale: PropTypes.func.isRequired,
    updateTarget: PropTypes.func.isRequired,

    initContentGroup: PropTypes.func.isRequired,
    showContextMenu: PropTypes.func,

    // insertDefaultTextVector: PropTypes.func.isRequired

    // editor actions
    onCreateElement: PropTypes.func.isRequired,
    onSelectElements: PropTypes.func.isRequired,
    onClearSelection: PropTypes.func.isRequired,
    onMoveSelectedElementsByKey: PropTypes.func.isRequired,
    updateTextTransformationAfterEdit: PropTypes.func.isRequired,
    getSelectedElementsUniformScalingState: PropTypes.func.isRequired,

    editorActions: PropTypes.object.isRequired,

    createText: PropTypes.func.isRequired,

    onChangeFile: PropTypes.func.isRequired,
    onClickToUpload: PropTypes.func.isRequired,
    fileInput: PropTypes.object.isRequired,
    allowedFiles: PropTypes.string.isRequired,
    headType: PropTypes.string,
    showSVGShapeLibrary: PropTypes.bool,
};

export default SVGEditor;
