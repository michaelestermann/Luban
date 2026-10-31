import { v4 as uuid } from 'uuid';
import { cloneDeep, noop } from 'lodash';
import svgPath from 'svgpath';
import SvgModel from '../../../../models/SvgModel';
import { createSVGElement, setAttributes } from '../../element-utils';
import { MODE, THEME_COLOR, ATTACH_SPACE, POINT_RADIUS } from './constants';
import { TCoordinate } from './types';
import { EndPoint, ControlPoint } from './Point';
import Line, { createEndPointElement } from './Line';
import OperationGroup from './OperationGroup';
import CursorGroup from './CursorGroup';
import { ModelTransformation } from '../../../../models/BaseModel';
import {
    PathData, PointType, parsePath, serializePath, nearestSegment, insertPoint, deletePoint, splitAt, splitSegment,
    setPointPosition, getPointType, setPointType
} from '../../path-edit/path-geometry';
import {
    NodeRef, PointEditState, SegmentPoints, TPoint, normalizePenPath, segmentPoints, readPathFromSegments, parseNumbers,
    nodeOrdinal, stepNode, countNodes, joinDraggedEnd, listNodes
} from '../../path-edit/point-edit';

export type TransformRecord = {
    fragmentID: number,
    points: TCoordinate[]
}

const manualEndOffset = 0.0000001;

class DrawGroup {
    public svgModel: SvgModel;

    public mode: MODE = MODE.NONE;

    private scale: number;

    private cursorGroup: CursorGroup;

    private cursorPosition: TCoordinate;

    private operationGroup: OperationGroup;

    private container: SVGGElement;

    private endPointsGroup: SVGGElement;

    private drawedLine: Line[] = [];

    private graph: SVGPathElement;

    private originGraph: SVGPathElement;

    private originGraphPath: string;

    private originTransformation: ModelTransformation;

    private guideX: SVGLineElement;

    private guideY: SVGLineElement;

    public onDrawLine: (line: SVGPathElement, closedLoop: boolean) => void = noop;

    public onDrawDelete: (line: {
        points: TCoordinate[],
        closedLoop: boolean,
        fragmentID: number
    }[]) => void = noop;

    public onDrawTransform: (records: { before: TransformRecord[], after: TransformRecord[] }) => void = noop;

    public onDrawStart: (elem?: SVGPathElement) => void = noop;

    public onDrawComplete: (elem?: SVGPathElement) => void = noop;

    public onDrawTransformComplete: (records: { elem: SVGPathElement, before: string, after: string }) => void = noop;

    private selected: {
        line?: Line,
        point?: SVGRectElement,
        pointIndex?: number
    } = {};

    private preSelectLine: Line;

    private preSelectPoint: SVGRectElement;

    private hasTransform: boolean;

    private beforeTransform: TransformRecord[] = [];

    private afterTransform: TransformRecord[] = [];

    private attachSpace: number;

    private redrawLatestLine: boolean;

    private latestDrawingCompleted = false;

    private isAttached: boolean;

    // point editing (MODE.SELECT): the edited path in canvas coordinates, one line per segment,
    // one end point element per node
    private editPath: PathData = null;

    private editSegments: { line: Line, segment: SegmentPoints }[] = [];

    private nodeRects: SVGRectElement[][] = [];

    private cardOpen = false;

    private insertMode = false;

    private pointEditListeners = new Set<(state: PointEditState) => void>();

    public constructor(contentGroup: SVGGElement, scale: number) {
        this.scale = scale;
        this.init();

        this.container = createSVGElement({
            element: 'g',
            attr: {
                id: 'draw-group-container'
            }
        });

        this.operationGroup = new OperationGroup(this.container, this.scale);
        this.operationGroup.onDrawgraph = (points: Array<[number, number]>) => {
            const latestLine = this.drawedLine[this.drawedLine.length - 1];
            latestLine && latestLine.updatePosition([]);
            this.latestDrawingCompleted = true;
            this.drawgraph(points);
        };

        this.container.append(this.endPointsGroup);

        this.cursorGroup = new CursorGroup(this.scale);
        this.container.append(this.cursorGroup.group);

        this.container.append(this.guideX);
        this.container.append(this.guideY);

        contentGroup.parentElement.append(this.container);
    }


    public stopDraw(forcedStop = false) {
        if (this.mode === MODE.NONE) {
            return null;
        }
        this.cursorGroup.toogleVisible(false);
        this.setGuideLineVisibility(false);
        this.operationGroup.clearOperation();
        this.operationGroup.lastControlsArray = [];

        this.clearAllEndPoint();

        if (forcedStop) {
            this.originGraph.setAttribute('visibility', 'visible');
            this.mode = MODE.NONE;
            this.clearAllEndPoint();
            this.originGraph = null;
            if (this.graph) {
                this.graph.remove();
                this.graph = null;
            }
            this.resetPointEdit();
            return null;
        } else {
            if (this.mode === MODE.DRAW) {
                return this.drawComplete();
            } else if (this.mode === MODE.SELECT) {
                return this.transformComplete();
            }
            return null;
        }
    }

    public updateScale(scale: number) { // just change the engineer scale
        this.scale = scale;
        this.attachSpace = ATTACH_SPACE / this.scale;

        this.cursorGroup.updateScale(this.scale);
        this.operationGroup.updateScale(this.scale);
        this.drawedLine.forEach((line) => line.updateScale(this.scale));
        this.guideX.setAttribute('stroke-width', `${1 / this.scale}`);
        this.guideY.setAttribute('stroke-width', `${1 / this.scale}`);
    }

    private init() {
        this.guideX = createSVGElement({
            element: 'line',
            attr: {
                visibility: 'hidden',
                id: 'guideX',
                stroke: 'red'
            }
        });

        this.guideY = createSVGElement({
            element: 'line',
            attr: {
                visibility: 'hidden',
                id: 'guideY',
                stroke: 'red'
            }
        });
        this.endPointsGroup = createSVGElement({
            element: 'g',
            attr: {
                id: 'endPointsGroup'
            }
        });
    }

    private drawgraph(points: Array<[number, number]>) {
        const closedLoop = this.cursorGroup.isAttached();
        const line = this.appendLine(points, closedLoop);
        this.unSelectAllPoint();
        this.endPointsGroup.lastElementChild.setAttribute('fill', THEME_COLOR);
        this.onDrawLine && this.onDrawLine(line.elem, closedLoop);
    }

    public deleteLine(line: SVGPathElement) {
        if (line) {
            return this.delLine(this.getLine(line));
        }
        return null;
    }

    private getPointCoordinate(point: SVGRectElement) {
        const x = point.getAttribute('x');
        const y = point.getAttribute('y');
        return { x: Number(x) + POINT_RADIUS / this.scale, y: Number(y) + POINT_RADIUS / this.scale };
    }

    private setMode(mode: MODE) {
        this.mode = mode;
        if (mode !== MODE.NONE) {
            this.onDrawStart && this.onDrawStart(this.originGraph);
        }

        this.cursorGroup.setAttachPoint();
        this.unSelectAllPoint();

        this.operationGroup.mode = mode;
        this.cursorGroup.mode = mode;
        this.operationGroup.clearOperation();
    }

    public startDraw(mode: MODE, svg?: SVGPathElement, transformation?: ModelTransformation) {
        this.originGraph = svg;
        this.setMode(mode);
        this.drawedLine = [];

        this.graph && this.graph.remove();
        this.graph = createSVGElement({
            element: 'g',
            attr: {
                id: `graph-${uuid()}`
            }
        });
        this.container.insertBefore(this.graph, this.container.firstElementChild);

        if (this.mode === MODE.DRAW) {
            if (svg) {
                this.originGraphPath = this.originGraph.getAttribute('d');

                this.originGraph.setAttribute('visibility', 'hidden');

                this.originTransformation = { ...transformation };
                this.generatelines();
            } else {
                this.originGraph = null;
            }
            this.cursorGroup.toogleVisible(true);
        } else {
            this.originGraphPath = this.originGraph.getAttribute('d');
            this.originGraph.setAttribute('visibility', 'hidden');
            this.originTransformation = { ...transformation };
            this.cardOpen = false;
            this.insertMode = false;
            this.updateCursor();
            this.loadEditPath(this.readElementPath());
            this.emitPointEdit();
        }
    }

    public resetOperationByselect() {
        this.resetOperation(this.selected.line);
    }

    public resetOperation(line?: Line) {
        this.operationGroup.clearOperation();
        if (!line) {
            line = this.drawedLine[this.drawedLine.length - 1];
        }
        if (line) {
            this.operationGroup.lastControlsArray = [];
            if (line.closedLoop) {
                this.operationGroup.controlsArray = [];
            } else {
                const lastPoint = line.points[line.points.length - 1];
                this.operationGroup.controlsArray = [
                    new EndPoint(lastPoint[0], lastPoint[1])
                ];
            }
            this.operationGroup.updatePrviewByCursor(new EndPoint(...this.cursorPosition));
        }
    }

    private applyTransform(d: string, restore?: boolean) {
        const config = this.originTransformation;
        const { scaleX, scaleY, rotationZ } = config;

        const angle = rotationZ * 180 / Math.PI;

        if (restore) {
            const { x, y, width, height } = this.originGraph.getBBox();
            const cx = x + width / 2;
            const cy = y + height / 2;

            return svgPath(d)
                .translate(-cx, -cy)
                .rotate(angle)
                .scale(1 / scaleX, 1 / scaleY)
                .translate(cx, cy);
        } else {
            const transform = this.originGraph.getAttribute('transform');
            return svgPath(d).transform(transform);
        }
    }

    private generatelines() {
        // one line per segment; closing segments of closed subpaths included
        segmentPoints(this.readElementPath()).forEach((segment) => {
            this.appendLine(segment.points);
        });
    }

    // the edited element's path in canvas coordinates, pen tool segments chained
    private readElementPath(): PathData {
        return normalizePenPath(parsePath(this.applyTransform(this.originGraphPath).toString()));
    }

    public appendLine(data: TCoordinate[] | SVGPathElement, closedLoop = false, fragmentID?: number) {
        const line = new Line(data, this.scale, closedLoop, fragmentID || this.drawedLine.length);
        this.drawedLine.splice(line.fragmentID, 0, line);

        this.endPointsGroup.append(...line.EndPointsEle);
        if (!Array.from(this.graph.childNodes).find((elem) => elem === line.elem)) {
            this.graph.appendChild(line.elem);
        }
        return line;
    }

    public finishDraw() {
        this.svgModel = null;
    }


    public delLine(line: Line) {
        line.del();
        this.drawedLine = this.drawedLine.filter((item) => item !== line);
        line.EndPointsEle.filter((elem) => {
            const flag = this.drawedLine.some((item) => item.EndPointsEle.includes(elem));
            return !flag;
        }).forEach((elem) => elem.remove());
    }

    public getLineByPoint(point: SVGRectElement) {
        const { x, y } = this.getPointCoordinate(point);
        return this.drawedLine.find((item) => {
            return item.points.some((p) => p[0] === x && p[1] === y);
        });
    }

    public getLine(mark: SVGPathElement | SVGRectElement | number) {
        if (typeof mark === 'number') {
            return this.drawedLine.find((line) => line.fragmentID === mark);
        }
        return this.drawedLine.find((item) => {
            if (mark instanceof SVGPathElement) {
                return item.elem === mark;
            } else if (mark instanceof SVGRectElement) {
                if (item.EndPointsEle.includes(mark)) {
                    return true;
                }
                const { x, y } = this.getPointCoordinate(mark);
                return item.points.some((p) => p[0] === x && p[1] === y);
            } else {
                return false;
            }
        });
    }



    public onDelete() {
        if (this.mode === MODE.SELECT && this.editPath) {
            // point editing deletes end points, never lines
            this.deleteSelectedPoint();
            return [];
        }
        if (this.selected.line) {
            let deleteLines;
            if (this.selected.pointIndex) {
                this.delLine(this.selected.line);
                deleteLines = [{
                    fragmentID: this.selected.line.fragmentID,
                    points: this.selected.line.points,
                    closedLoop: this.selected.line.closedLoop
                }];
            } else if (this.selected.point) {
                deleteLines = this.drawedLine.filter((line) => {
                    return line.EndPointsEle.findIndex((elem) => elem === this.selected.point) !== -1;
                }).map((line) => {
                    this.delLine(line);
                    return {
                        fragmentID: line.fragmentID,
                        points: line.points,
                        closedLoop: line.closedLoop
                    };
                });
            } else if (this.selected.line) {
                this.delLine(this.selected.line);
                deleteLines = [{
                    fragmentID: this.selected.line.fragmentID,
                    points: this.selected.line.points,
                    closedLoop: this.selected.line.closedLoop
                }];
            }
            this.operationGroup.clearOperation();
            return deleteLines;
        }
        return [];
    }

    public onMouseDown(_target?: unknown, x?: number, y?: number, event?: MouseEvent) {
        if (this.mode !== MODE.SELECT || !this.editPath) {
            this.handleMouseDown();
            return;
        }
        const before = this.getSelectedNode();
        if (!(event && typeof x === 'number' && this.pointEditMouseDown(event, x, y))) {
            this.handleMouseDown();
        }
        const after = this.getSelectedNode();
        if (!after || !before || after.subpathIndex !== before.subpathIndex || after.nodeIndex !== before.nodeIndex) {
            // another point: the card closes, a double-click opens it again
            this.cardOpen = false;
        }
        this.emitPointEdit();
    }

    private handleMouseDown() {
        const [x, y] = this.cursorPosition;
        this.unSelectAllPoint();
        this.clearAllConnectLine();

        if (this.mode === MODE.DRAW) {
            this.latestDrawingCompleted = false;
            if (this.cursorGroup.isAttached() && this.operationGroup.controlsArray.length > 0) {
                const success = this.operationGroup.setEndPoint(x, y);
                if (success) {
                    this.isAttached = true;
                }
            } else {
                this.isAttached = false;
                this.operationGroup.setEndPoint(x, y);
            }
            this.cursorGroup.keyDown();
            return;
        }
        if (this.mode === MODE.SELECT) {
            this.selected.line && this.selected.line.elem.setAttribute('stroke', 'black');
            this.selected.point && this.selected.point.setAttribute('fill', '');
            if (this.preSelectPoint) {
                const parent = this.preSelectPoint.parentElement as unknown as SVGGElement;
                this.preSelectPoint.setAttribute('fill', THEME_COLOR);
                this.selected.line = this.getLine(this.preSelectPoint);
                if (this.selected.line) {
                    this.selected.point = this.preSelectPoint;
                    if (parent === this.operationGroup.controlPoints) {
                        const cx = this.preSelectPoint.getAttribute('x');
                        const cy = this.preSelectPoint.getAttribute('y');
                        this.operationGroup.updateOperation(this.selected.line.elem);

                        this.selected.pointIndex = Array.from(this.operationGroup.controlPoints.children).findIndex((elem) => {
                            if (elem.getAttribute('x') === cx && elem.getAttribute('y') === cy) {
                                elem.setAttribute('fill', THEME_COLOR);
                                return true;
                            } else {
                                return false;
                            }
                        }) + 1;
                        this.operationGroup.updateOperation(this.selected.line.elem);
                    } else {
                        this.selected.pointIndex = null;
                        const elems = this.drawedLine.filter((line) => {
                            return line.EndPointsEle.includes(this.preSelectPoint as SVGRectElement);
                        }).reduce((p, c) => {
                            p.push(c.elem);
                            return p;
                        }, []);
                        this.operationGroup.updateOperation(elems);
                    }

                    this.beforeTransform = this.recordTransform();
                }
                return;
            }
            if (this.preSelectLine) {
                this.preSelectLine.elem.setAttribute('stroke', THEME_COLOR);
                this.preSelectLine.elem.setAttribute('stroke-opacity', '1');

                this.operationGroup.updateOperation(this.preSelectLine.elem);
                this.selected.line = this.preSelectLine;
                this.selected.pointIndex = null;
                this.selected.point = null;
                this.beforeTransform = this.recordTransform();
                return;
            }
            this.selected.line = null;
            this.selected.point = null;
            this.selected.pointIndex = null;
        }
        this.operationGroup.clearOperation();
    }

    public updateAllLinePosition() {
        this.drawedLine.forEach((item) => item.updatePosition([], true));
        this.drawedLine.forEach((item) => this.endPointsGroup.append(...item.EndPointsEle));
    }

    public onMouseUp(event: MouseEvent, cx: number, cy: number) {
        if (event.button === 2) {
            // Do not handle right-click events
            return;
        }
        if (this.mode === MODE.DRAW) {
            this.operationGroup.lastControlsArray = [];
            if (this.isAttached) {
                // this.operationGroup.controlsArray = [];
                this.operationGroup.clearOperation();
            }
            const { x, y, attached } = this.attachCursor(cx, cy);
            if (attached) {
                this.cursorGroup.setAttachPoint(x, y);
            } else {
                this.cursorGroup.setAttachPoint();
            }
            this.cursorGroup.update(false, x, y);
            const lng = this.operationGroup.controlsArray.length;
            if (lng > 0) {
                if (this.operationGroup.controlsArray[lng - 1] instanceof EndPoint) {
                    this.operationGroup.setControlPoint(...this.cursorPosition);
                }
            }
            if (this.redrawLatestLine) {
                const latestLine = this.drawedLine[this.drawedLine.length - 1];
                latestLine && latestLine.updatePosition([]);
            }
            this.redrawLatestLine = false;
            return;
        }
        if (this.mode === MODE.SELECT && this.editPath) {
            if (this.hasTransform) {
                this.hasTransform = false;
                this.commitDrag();
            }
            this.setGuideLineVisibility(false);
            return;
        }
        if (this.mode === MODE.SELECT) {
            if (this.hasTransform) {
                this.hasTransform = false;
                let anotherEndpoint: SVGRectElement = null;
                this.drawedLine.filter((line) => {
                    return line.EndPointsEle.includes(this.selected.point);
                }).some((line) => {
                    const isEndpointCoincidence = line.isEndpointCoincidence();
                    if (isEndpointCoincidence) {
                        anotherEndpoint = line.EndPointsEle.find((elem) => elem !== this.selected.point);
                        return true;
                    }
                    return false;
                });
                if (anotherEndpoint) {
                    this.selected.pointIndex = null;
                    this.selected.point = anotherEndpoint;
                    const x = Number(anotherEndpoint.getAttribute('cx'));
                    const y = Number(anotherEndpoint.getAttribute('cy'));
                    this.transformOperatingPoint([x + manualEndOffset, y + manualEndOffset]);
                }
                this.updateAllLinePosition();
                this.afterTransform = this.recordTransform();
                this.onDrawTransform({ before: this.beforeTransform, after: this.afterTransform });
            }
            this.setGuideLineVisibility(false);
        }
    }

    private setGuideLineVisibility(visible: boolean) {
        if (!visible) {
            setAttributes(this.guideX, {
                x1: 0, y1: 0, x2: 0, y2: 0
            });
            setAttributes(this.guideY, {
                x1: 0, y1: 0, x2: 0, y2: 0
            });
        }
        this.guideX.setAttribute('visibility', visible ? 'visible' : 'hidden');
        this.guideY.setAttribute('visibility', visible ? 'visible' : 'hidden');
    }

    private attachCursor(x: number, y: number): { x: number, y: number, attached: boolean } {
        this.setGuideLineVisibility(false);
        let min: number = this.attachSpace;
        let attachPosition: TCoordinate;
        let guideX: TCoordinate;
        let guideY: TCoordinate;
        this.drawedLine.forEach((line) => {
            const selfIndex = line.EndPointsEle.findIndex((elem) => elem === this.selected.point);
            line.EndPoins.forEach((p, index) => {
                if (selfIndex !== -1 && selfIndex === index) {
                    return;
                }
                if (Math.abs(x - p[0]) <= this.attachSpace || Math.abs(y - p[1]) <= this.attachSpace) {
                    if (Math.abs(x - p[0]) <= this.attachSpace) {
                        guideX = p;
                    }
                    if (Math.abs(y - p[1]) <= this.attachSpace) {
                        guideY = p;
                    }
                    if (Math.abs(x - p[0]) <= this.attachSpace && Math.abs(y - p[1]) <= this.attachSpace) {
                        if ((Math.abs(x - p[0]) < min || Math.abs(y - p[1]) < min)) {
                            attachPosition = p;
                            min = Math.min(Math.abs(x - p[0]), Math.abs(y - p[1]));
                        }
                    }
                }
            });
        });

        if (this.mode === MODE.DRAW) {
            const controlPoints = this.operationGroup.controlPoints.querySelectorAll('[visibility="visible"]');
            const length = controlPoints.length;
            if (length > 1) {
                Array.from(controlPoints).forEach((elem, index) => {
                    if (length === 2 && (index === 1 || elem.getAttribute('rx') === '0')) {
                        return;
                    } else if (length === 3 && index !== 1) {
                        return;
                    }
                    const cx = Number(elem.getAttribute('x')) + POINT_RADIUS / this.scale;
                    const cy = Number(elem.getAttribute('y')) + POINT_RADIUS / this.scale;
                    if (Math.abs(x - cx) <= this.attachSpace) {
                        guideX = [cx, cy];
                    }
                    if (Math.abs(y - cy) <= this.attachSpace) {
                        guideY = [cx, cy];
                    }
                    if (Math.abs(x - cx) <= this.attachSpace && Math.abs(y - cy) <= this.attachSpace) {
                        if ((Math.abs(x - cx) < min || Math.abs(y - cy) < min)) {
                            attachPosition = [cx, cy];
                            min = Math.min(Math.abs(x - cx), Math.abs(y - cy));
                        }
                    }
                });
            }
        }

        if (attachPosition) {
            return { x: attachPosition[0], y: attachPosition[1], attached: true };
        }

        if (guideX || guideY) {
            if (guideX && guideY) {
                this.guideX.setAttribute('x1', `${guideX[0]}`);
                this.guideX.setAttribute('y1', `${guideY[1]}`);
                this.guideX.setAttribute('x2', `${guideX[0]}`);
                this.guideX.setAttribute('y2', `${guideX[1]}`);

                this.guideY.setAttribute('x1', `${guideX[0]}`);
                this.guideY.setAttribute('y1', `${guideY[1]}`);
                this.guideY.setAttribute('x2', `${guideY[0]}`);
                this.guideY.setAttribute('y2', `${guideY[1]}`);

                return { x: guideX[0], y: guideY[1], attached: false };
            }
            if (guideX) {
                this.guideX.setAttribute('visibility', 'visible');
                this.guideX.setAttribute('x1', `${guideX[0]}`);
                this.guideX.setAttribute('y1', `${y}`);
                this.guideX.setAttribute('x2', `${guideX[0]}`);
                this.guideX.setAttribute('y2', `${guideX[1]}`);
                return { x: guideX[0], y, attached: false };
            }
            if (guideY) {
                this.guideY.setAttribute('visibility', 'visible');
                this.guideY.setAttribute('x1', `${x}`);
                this.guideY.setAttribute('y1', `${guideY[1]}`);
                this.guideY.setAttribute('x2', `${guideY[0]}`);
                this.guideY.setAttribute('y2', `${guideY[1]}`);
                return { x, y: guideY[1], attached: false };
            }
        }
        return { x, y, attached: false };
    }

    private transformOperatingPoint([x, y]: TCoordinate) {
        this.hasTransform = true;
        if (typeof this.selected.pointIndex === 'number') {
            this.selected.line.points[this.selected.pointIndex][0] = x;
            this.selected.line.points[this.selected.pointIndex][1] = y;
            this.selected.line.updatePosition(this.selected.line.points);
        } else {
            this.drawedLine.forEach((p) => {
                const index = p.EndPointsEle.findIndex((elem) => elem === this.selected.point);
                if (index !== -1) {
                    const dx = x - p.EndPoins[index][0];
                    const dy = y - p.EndPoins[index][1];
                    p.EndPoins[index][0] = x;
                    p.EndPoins[index][1] = y;
                    if (this.editPath && p.points.length === 4) {
                        // point editing: the attached control point moves along
                        const control = index === 0 ? p.points[1] : p.points[2];
                        control[0] += dx;
                        control[1] += dy;
                    }
                    p.updatePosition(p.points);
                }
            });
        }
    }

    private queryLink(line: SVGPathElement) {
        const selectedLine = this.getLine(line);
        const links = new Map<Line, { line: Line, indexs: number[], fragmentID: number }>();
        this.drawedLine.forEach((item) => {
            if (item.elem === line) {
                links.set(item, {
                    indexs: Array(item.points.length).fill(0).map((_, index) => index),
                    line: item,
                    fragmentID: item.fragmentID
                });
            } else {
                const circleEles = item.EndPointsEle;
                selectedLine.EndPointsEle.forEach((circle) => {
                    const circleIndex = circleEles.findIndex((i) => circle === i);
                    const index = item.points.findIndex((p) => p === item.EndPoins[circleIndex]);
                    if (index !== -1) {
                        const has = links.get(item);
                        if (has) {
                            has.indexs.push(index);
                        } else {
                            links.set(item, {
                                indexs: [index],
                                line: item,
                                fragmentID: item.fragmentID
                            });
                        }
                    }
                });
            }
        });
        return Array.from(links.values());
    }

    private transformLine(dx: number, dy: number) {
        this.hasTransform = true;

        this.queryLink(this.selected.line.elem).forEach((item) => {
            const _points = cloneDeep(item.line.points);

            item.indexs.forEach((index) => {
                _points[index][0] += dx;
                _points[index][1] += dy;
            });
            item.line.updatePosition(_points);
        });
    }

    private renderPreviewElem(x: number, y: number) {
        let nearest = ATTACH_SPACE / 4;
        let nearestLine: Line;
        let nearestPoint: SVGRectElement;
        this.drawedLine.forEach((line) => {
            const d = line.distanceDetection(x, y);
            if (!(line === this.selected.line && !this.selected.point)) {
                line.elem.setAttribute('stroke', 'black');
                line.elem.setAttribute('stroke-opacity', '1');
            }
            if (d < nearest) {
                nearest = d;
                nearestLine = line;
            }
        });
        // point editing: points are picked within a few screen pixels, so segments near them stay reachable
        nearest = this.editPath ? ATTACH_SPACE / this.scale : ATTACH_SPACE;
        // point editing measures from the point centre
        const centre = this.editPath ? POINT_RADIUS / this.scale : 0;
        (Array.from(this.endPointsGroup.children) as unknown[] as SVGRectElement[]).forEach((elem) => {
            const pointX = Number(elem.getAttribute('x')) + centre;
            const pointY = Number(elem.getAttribute('y')) + centre;
            const space = Math.sqrt((pointX - x) ** 2 + (pointY - y) ** 2);
            elem.setAttribute('stroke', THEME_COLOR);
            elem.setAttribute('stroke-opacity', '1');
            if (space < nearest) {
                if (Math.abs(space - nearest) <= manualEndOffset * 2) {
                    if (Number(nearestPoint.getAttribute('cx')) - Number(elem.getAttribute('cx')) > 0) {
                        nearestPoint = elem;
                    }
                    nearest = space;
                } else {
                    nearest = space;
                    nearestPoint = elem;
                }
            }
        });
        Array.from(this.operationGroup.controlPoints.querySelectorAll<SVGRectElement>('[visibility="visible"]')).forEach((elem) => {
            const pointX = Number(elem.getAttribute('x')) + centre;
            const pointY = Number(elem.getAttribute('y')) + centre;
            const space = Math.sqrt((pointX - x) ** 2 + (pointY - y) ** 2);
            elem.setAttribute('stroke', THEME_COLOR);
            elem.setAttribute('stroke-opacity', '1');
            if (space < nearest) {
                nearest = space;
                nearestPoint = elem;
            }
        });
        if (nearestPoint) {
            nearestPoint.setAttribute('stroke-opacity', '0.5');
            nearestPoint.setAttribute('stroke', THEME_COLOR);
            this.preSelectPoint = nearestPoint;
        } else {
            this.preSelectPoint = null;
            if (nearestLine) {
                this.preSelectLine = nearestLine;
                if (this.selected.point || nearestLine !== this.selected.line) {
                    nearestLine.elem.setAttribute('stroke-opacity', '0.5');
                    nearestLine.elem.setAttribute('stroke', THEME_COLOR);
                }
            } else {
                this.preSelectLine = null;
            }
        }
    }

    public onMouseMove(event: MouseEvent, [cx, cy]: [number, number], [dx, dy]: [number, number]) {
        if (this.mode === MODE.NONE) {
            return;
        }
        let leftKeyPressed = event.which === 1;

        const { x, y, attached } = this.attachCursor(cx, cy);
        if (attached) {
            if (this.mode === MODE.SELECT) {
                if (leftKeyPressed && this.selected.point) {
                    this.cursorGroup.setAttachPoint(x, y);
                }
            } else {
                this.cursorGroup.setAttachPoint(x, y);
            }
        } else {
            this.cursorGroup.setAttachPoint();
        }
        // const x = cx;
        // const y = cy;
        this.cursorPosition = [x, y];

        if (this.mode === MODE.DRAW) {
            this.setGuideLineVisibility(true);
            if (leftKeyPressed && !this.latestDrawingCompleted && (
                this.operationGroup.lastControlsArray.length === 0 && this.operationGroup.controlsArray.length === 0
            )) {
                this.operationGroup.setEndPoint(x, y);
            }

            if (leftKeyPressed && this.operationGroup.controlsArray[this.operationGroup.controlsArray.length - 1] instanceof ControlPoint) {
                leftKeyPressed = false;
            }
            this.cursorGroup.update(leftKeyPressed, x, y);
            this.operationGroup.updatePrviewByCursor(leftKeyPressed ? new ControlPoint(x, y) : new EndPoint(x, y));
            if (leftKeyPressed && this.drawedLine.length > 0) {
                if (this.operationGroup.controlsArray.length === 0 && this.latestDrawingCompleted) {
                    const latestLine = this.drawedLine[this.drawedLine.length - 1];
                    this.redrawLatestLine = true;
                    latestLine && latestLine.redrawCurve(x, y);
                } else if (
                    this.operationGroup.lastControlsArray.length > 0
                    && this.operationGroup.controlsArray[this.operationGroup.controlsArray.length - 1] instanceof EndPoint
                ) {
                    const latestLine = this.drawedLine[this.drawedLine.length - 1];
                    const latestPoint = latestLine.points[latestLine.points.length - 1];
                    if (latestPoint[0] === this.operationGroup.controlsArray[0].x && latestPoint[1] === this.operationGroup.controlsArray[0].y) {
                        this.redrawLatestLine = true;
                        latestLine && latestLine.redrawCurve(x, y);
                    }
                }
            }
        } else {
            if (leftKeyPressed) {
                if (this.selected.line && this.selected.point) {
                    // move controls points
                    this.setGuideLineVisibility(true);
                    this.transformOperatingPoint([x, y]);
                    if (this.selected.pointIndex) {
                        this.operationGroup.updateOperation(this.selected.line.elem);
                    } else {
                        const elems = this.drawedLine.filter((line) => {
                            return line.EndPointsEle.includes(this.selected.point as SVGRectElement);
                        }).reduce((p, c) => {
                            p.push(c.elem);
                            return p;
                        }, []);
                        this.operationGroup.updateOperation(elems);
                    }
                } else if (this.selected.line) {
                    // move line
                    this.setGuideLineVisibility(true);
                    this.transformLine(dx, dy);
                    this.operationGroup.updateOperation(this.selected.line.elem);
                }
            } else {
                this.setGuideLineVisibility(false);
                this.renderPreviewElem(x, y);
            }
        }
    }

    public onMouseleave() {
        this.mode === MODE.DRAW && this.cursorGroup.toogleVisible(false);
    }

    public onMouseenter() {
        this.mode === MODE.DRAW && this.cursorGroup.toogleVisible(true);
    }

    private generatePath() {
        const d = this.drawedLine.reduce((p, c) => {
            p += c.generatePath(c.points);
            p += ' ';
            return p;
        }, '');

        return d;
    }

    private drawComplete() {
        if (this.mode !== MODE.DRAW) {
            return null;
        }
        this.setMode(MODE.NONE);
        let path = this.generatePath();
        this.drawedLine = [];
        if (this.originGraph) {
            const res = this.applyTransform(path, true);
            path = res.toString();
        }
        if (path) {
            this.graph.remove();

            let graph: SVGPathElement;
            if (this.originGraph) {
                graph = this.originGraph;
                graph.setAttribute('d', path);
                graph.setAttribute('visibility', 'visible');
            } else {
                graph = createSVGElement({
                    element: 'path',
                    attr: {
                        id: `graph-${uuid()}`,
                        'stroke-width': 1 / this.scale,
                        d: path,
                        fill: 'transparent',
                        stroke: 'black'
                    }
                }) as SVGPathElement;
                this.container.append(graph);
            }
            if (this.originGraph && this.onDrawTransformComplete) {
                this.onDrawTransformComplete({
                    elem: this.originGraph,
                    before: this.originGraphPath,
                    after: path
                });
            } else if (!this.originGraph && this.onDrawComplete) {
                this.onDrawComplete(graph);
            }
            return graph;
        } else {
            if (this.onDrawComplete) {
                this.onDrawComplete();
            }
        }
        return null;
    }

    private transformComplete() {
        if (this.mode !== MODE.SELECT) {
            return;
        }
        this.setMode(MODE.NONE);

        this.originGraph.setAttribute('visibility', 'visible');
        if (this.editPath) {
            // point editing writes every change to the element at once
            this.drawedLine = [];
            this.graph.remove();
            this.resetPointEdit();
            return;
        }
        const path = this.generatePath();
        this.drawedLine = [];
        if (path) {
            const res = this.applyTransform(path, true);
            const d = res.toString();
            this.graph.remove();

            const transformed = this.originGraphPath !== d;
            if (transformed) {
                this.originGraph.setAttribute('d', d);
            }
            if (this.onDrawTransformComplete) {
                this.onDrawTransformComplete({
                    elem: this.originGraph,
                    before: this.originGraphPath,
                    after: d
                });
            }
        } else {
            if (this.onDrawTransformComplete) {
                this.onDrawTransformComplete({
                    elem: this.originGraph,
                    before: this.originGraphPath,
                    after: ''
                });
            }
        }
    }


    private recordTransform() {
        const pointRecords: TransformRecord[] = [];
        if (this.selected.pointIndex) {
            pointRecords.push({
                fragmentID: this.selected.line.fragmentID,
                points: cloneDeep(this.selected.line.points)
            });
        } else if (this.selected.point) {
            this.drawedLine.forEach((p) => {
                const index = p.EndPointsEle.findIndex((elem) => elem === this.selected.point);
                if (index !== -1) {
                    pointRecords.push({
                        fragmentID: p.fragmentID,
                        points: cloneDeep(p.points)
                    });
                }
            });
        } else if (this.selected.line) {
            this.queryLink(this.selected.line.elem).forEach((item) => {
                pointRecords.push({
                    fragmentID: item.fragmentID,
                    points: cloneDeep(item.line.points)
                });
            });
        }
        return pointRecords;
    }

    // ---- point editing ----

    public subscribePointEdit(listener: (state: PointEditState) => void): () => void {
        this.pointEditListeners.add(listener);
        return () => {
            this.pointEditListeners.delete(listener);
        };
    }

    public getPointEditState(): PointEditState {
        if (this.mode !== MODE.SELECT || !this.editPath) {
            return { active: false, elem: null, pointCount: 0, selected: null, cardOpen: false, insertMode: false };
        }
        const node = this.getSelectedNode();
        let selected: PointEditState['selected'] = null;
        if (node) {
            const { subpathIndex, nodeIndex } = node;
            const pathNode = this.editPath[subpathIndex].nodes[nodeIndex];
            selected = {
                ordinal: nodeOrdinal(this.editPath, subpathIndex, nodeIndex),
                subpathIndex,
                nodeIndex,
                x: pathNode.x,
                y: pathNode.y,
                type: getPointType(this.editPath, subpathIndex, nodeIndex),
                canDelete: !!deletePoint(this.editPath, subpathIndex, nodeIndex),
                canSplit: !!splitAt(this.editPath, subpathIndex, nodeIndex)
            };
        }
        return {
            active: true,
            elem: this.originGraph,
            pointCount: countNodes(this.editPath),
            selected,
            cardOpen: this.cardOpen && !!selected,
            insertMode: this.insertMode
        };
    }

    /** Is the element (or any element) edited point by point right now? */
    public isEditingPoints(elem?: Element): boolean {
        return this.mode === MODE.SELECT && !!this.editPath && (!elem || elem === this.originGraph);
    }

    public setInsertMode(on: boolean) {
        this.insertMode = on;
        this.updateCursor();
        this.emitPointEdit();
    }

    public openPointCard(): boolean {
        if (!this.getSelectedNode()) {
            return false;
        }
        this.cardOpen = true;
        this.emitPointEdit();
        return true;
    }

    public closePointCard(): boolean {
        if (!this.cardOpen) {
            return false;
        }
        this.cardOpen = false;
        this.emitPointEdit();
        return true;
    }

    /** Selects the next (1) or previous (-1) end point; an open card moves along. */
    public selectStep(step: number) {
        if (!this.editPath) {
            return;
        }
        const current = this.getSelectedNode();
        const next = stepNode(this.editPath, current ? current.subpathIndex : null, current ? current.nodeIndex : null, step);
        this.selectNode(next);
        this.emitPointEdit();
    }

    public deleteSelectedPoint(): boolean {
        const node = this.getSelectedNode();
        const result = node && deletePoint(this.editPath, node.subpathIndex, node.nodeIndex);
        if (!result) {
            return false;
        }
        this.commitEdit(result, null);
        return true;
    }

    public splitSelectedPoint(): boolean {
        const node = this.getSelectedNode();
        return !!node && this.splitNode(node);
    }

    /** Moves the selected end point to canvas coordinates; its control points move along. */
    public setSelectedPointPosition(x: number, y: number) {
        const node = this.getSelectedNode();
        if (!node || !Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }
        this.commitEdit(setPointPosition(this.editPath, node.subpathIndex, node.nodeIndex, x, y), node, true);
    }

    public setSelectedPointType(type: PointType) {
        const node = this.getSelectedNode();
        if (!node) {
            return;
        }
        this.commitEdit(setPointType(this.editPath, node.subpathIndex, node.nodeIndex, type), node, true);
    }

    /** Canvas position of the selected end point, follows a running drag. */
    public getSelectedPointPosition(): { x: number, y: number } | null {
        const rect = this.getSelectedNode() && this.selected.point;
        if (!rect) {
            return null;
        }
        return { x: Number(rect.getAttribute('cx')), y: Number(rect.getAttribute('cy')) };
    }

    /** Double-click on an end point opens its card. Returns false if the target is not an end point. */
    public onPointDblClick(target: Element): boolean {
        if (!this.isEditingPoints()) {
            return false;
        }
        const node = this.findNodeByRect(target);
        if (!node) {
            return false;
        }
        this.selectNode(node);
        this.cardOpen = true;
        this.emitPointEdit();
        return true;
    }

    /** Undo / redo changed the element: show its path again, the selected point stays if it exists. */
    public reloadPointEdit(elem: Element) {
        if (!this.isEditingPoints(elem)) {
            return;
        }
        const current = this.getSelectedNode();
        const ordinal = current ? nodeOrdinal(this.editPath, current.subpathIndex, current.nodeIndex) : -1;
        this.originGraphPath = this.originGraph.getAttribute('d');
        const path = this.readElementPath();
        const nodes = listNodes(path);
        this.loadEditPath(path, ordinal >= 0 && ordinal < nodes.length ? nodes[ordinal] : null);
        this.emitPointEdit();
    }

    private emitPointEdit() {
        const state = this.getPointEditState();
        this.pointEditListeners.forEach((listener) => listener(state));
    }

    private resetPointEdit() {
        this.editPath = null;
        this.editSegments = [];
        this.nodeRects = [];
        this.cardOpen = false;
        this.insertMode = false;
        this.selected = {};
        this.updateCursor();
        this.emitPointEdit();
    }

    private updateCursor() {
        const svg = this.container.ownerSVGElement;
        if (svg) {
            svg.style.cursor = this.insertMode && this.editPath ? 'crosshair' : '';
        }
    }

    private findNodeByRect(rect: Element): NodeRef | null {
        if (!rect) {
            return null;
        }
        for (let subpathIndex = 0; subpathIndex < this.nodeRects.length; subpathIndex++) {
            const nodeIndex = this.nodeRects[subpathIndex].indexOf(rect as SVGRectElement);
            if (nodeIndex !== -1) {
                return { subpathIndex, nodeIndex };
            }
        }
        return null;
    }

    private getSelectedNode(): NodeRef | null {
        if (!this.editPath) {
            return null;
        }
        return this.findNodeByRect(this.selected.point);
    }

    // the end point under the cursor (a few screen pixels)
    private findNodeAt(x: number, y: number): NodeRef | null {
        let best: NodeRef = null;
        let bestDistance = ATTACH_SPACE / this.scale;
        this.editPath.forEach((sub, subpathIndex) => {
            sub.nodes.forEach((n, nodeIndex) => {
                const d = Math.hypot(n.x - x, n.y - y);
                if (d <= bestDistance) {
                    bestDistance = d;
                    best = { subpathIndex, nodeIndex };
                }
            });
        });
        return best;
    }

    private findSegmentAt(x: number, y: number) {
        const hit = nearestSegment(this.editPath, { x, y });
        return hit && hit.distance <= ATTACH_SPACE / this.scale ? hit : null;
    }

    // Alt + click splits, a click with "Add point" on inserts; returns true if the click was used
    private pointEditMouseDown(event: MouseEvent, x: number, y: number): boolean {
        const node = this.findNodeAt(x, y);
        if (event.altKey) {
            if (node) {
                this.splitNode(node);
                return true;
            }
            const hit = this.findSegmentAt(x, y);
            if (hit) {
                const result = splitSegment(this.editPath, hit.subpathIndex, hit.segmentIndex, hit.t);
                result && this.commitEdit(result, null);
                return true;
            }
            return false;
        }
        const onControlPoint = !!this.preSelectPoint
            && this.preSelectPoint.parentElement as unknown === this.operationGroup.controlPoints;
        if (this.insertMode && !node && !onControlPoint) {
            const hit = this.findSegmentAt(x, y);
            if (hit) {
                const result = insertPoint(this.editPath, hit.subpathIndex, hit.segmentIndex, hit.t);
                // the new point is selected, so it can be dragged right away
                this.commitEdit(result, { subpathIndex: hit.subpathIndex, nodeIndex: hit.segmentIndex + 1 });
                return true;
            }
        }
        return false;
    }

    private splitNode(node: NodeRef): boolean {
        const result = splitAt(this.editPath, node.subpathIndex, node.nodeIndex);
        if (!result) {
            return false;
        }
        this.commitEdit(result, null);
        return true;
    }

    // shows a path: one line per segment, one end point element per node
    private loadEditPath(path: PathData, select: NodeRef | null = null) {
        this.drawedLine.forEach((line) => line.del());
        this.drawedLine = [];
        this.editSegments = [];
        this.clearAllEndPoint();
        this.operationGroup.clearOperation();
        this.clearAllConnectLine();
        this.preSelectLine = null;
        this.preSelectPoint = null;

        this.editPath = path;
        this.nodeRects = path.map((sub) => sub.nodes.map((n) => createEndPointElement([n.x, n.y], this.scale)));
        segmentPoints(path).forEach((segment) => {
            const rects = this.nodeRects[segment.subpathIndex];
            const line = new Line(segment.points, this.scale, false, this.drawedLine.length, [rects[segment.fromIndex], rects[segment.toIndex]]);
            this.drawedLine.push(line);
            this.graph.appendChild(line.elem);
            this.editSegments.push({ line, segment });
        });
        this.nodeRects.forEach((rects) => this.endPointsGroup.append(...rects));
        this.selectNode(select);
    }

    private selectNode(node: NodeRef | null) {
        this.unSelectAllPoint();
        this.drawedLine.forEach((line) => {
            line.elem.setAttribute('stroke', 'black');
            line.elem.setAttribute('stroke-opacity', '1');
        });
        const rect = node && this.nodeRects[node.subpathIndex] && this.nodeRects[node.subpathIndex][node.nodeIndex];
        if (!rect) {
            this.selected = {};
            this.operationGroup.clearOperation();
            return;
        }
        rect.setAttribute('fill', THEME_COLOR);
        const lines = this.drawedLine.filter((line) => line.EndPointsEle.includes(rect));
        this.selected = { line: lines[0], point: rect, pointIndex: null };
        if (lines.length > 0) {
            this.operationGroup.updateOperation(lines.map((line) => line.elem));
        } else {
            this.operationGroup.clearOperation();
        }
    }

    // the path as the lines show it now (after a drag)
    private readEditPath(): PathData {
        const segments = this.editSegments.map(({ line, segment }) => {
            const numbers = parseNumbers(line.elem.getAttribute('d'));
            const points: TPoint[] = [];
            for (let i = 0; i + 1 < numbers.length; i += 2) {
                points.push([numbers[i], numbers[i + 1]]);
            }
            return { ...segment, points };
        });
        return readPathFromSegments(this.editPath, segments);
    }

    private commitDrag() {
        const node = this.getSelectedNode();
        const path = this.readEditPath();
        if (node) {
            const joined = joinDraggedEnd(path, node.subpathIndex, node.nodeIndex);
            if (joined !== path) {
                this.commitEdit(joined, { subpathIndex: node.subpathIndex, nodeIndex: 0 }, true);
                return;
            }
        }
        // same points and lines: keep them (and the selected line or control point)
        this.writeElement(path);
        this.editPath = path;
        this.emitPointEdit();
    }

    // writes the path to the element (one undo step) and shows it again
    private commitEdit(path: PathData, select: NodeRef | null, keepCard = false) {
        this.writeElement(path);
        this.cardOpen = keepCard && this.cardOpen;
        this.loadEditPath(path, select);
        this.emitPointEdit();
    }

    private writeElement(path: PathData) {
        const before = this.originGraph.getAttribute('d');
        const after = this.toElementPath(serializePath(path));
        if (after === before) {
            return;
        }
        this.originGraph.setAttribute('d', after);
        this.onDrawTransformComplete({ elem: this.originGraph, before, after });
        // the element is normalized afterwards (SvgModel.completeElementTransform)
        this.originGraphPath = this.originGraph.getAttribute('d');
    }

    // canvas coordinates to the element's own coordinates (inverse of its transform)
    private toElementPath(d: string): string {
        const list = this.originGraph.transform.baseVal;
        let matrix = new DOMMatrix();
        for (let i = 0; i < list.numberOfItems; i++) {
            const m = list.getItem(i).matrix;
            matrix = matrix.multiply(new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
        }
        const inverse = matrix.inverse();
        return svgPath(d).matrix([inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f]).round(4).toString();
    }

    private clearAllEndPoint() {
        Array.from(this.endPointsGroup.children).forEach((p) => {
            p.remove();
        });
    }

    private unSelectAllPoint() {
        Array.from(this.endPointsGroup.children).forEach((p) => {
            p.setAttribute('fill', '');
        });
        Array.from(this.operationGroup.controlPoints.children).forEach((p) => {
            p.setAttribute('fill', '');
        });
    }

    private clearAllConnectLine() {
        Array.from(this.operationGroup.connectLines.children).forEach((p) => {
            p.setAttribute('visibility', 'hidden');
        });
    }
}

export default DrawGroup;
