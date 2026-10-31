import { v4 as uuid } from 'uuid';
import { Vector2 } from 'three';

import { isEqual } from '../../shared/lib/utils';
import { EPSILON } from '../constants';
import {
    Materials,
    Origin,
    OriginType,
    RectangleWorkpieceReference,
} from '../constants/coordinate';
import { createSVGElement } from '../ui/SVGEditor/element-utils';
import { axisLabelValues, chooseMinorStep, chooseStep, formatTick, multiplesInRange } from './ruler-ticks';

// On-screen sizes (CSS px) of the rulers; they stay the same at any zoom
const LABEL_FONT_PX = 11;
const LABEL_MIN_SPACING_PX = 60; // labels (and major grid lines) at least this far apart
const LABEL_MIN_GAP_PX = 36; // a step label closer than this to an axis end label is dropped
const GRID_MIN_SPACING_PX = 8; // minor grid lines at least this far apart
const X_LABEL_BELOW_PX = 16; // baseline of X labels below the axis
const X_LABEL_ABOVE_PX = 8; // baseline of X labels above the axis (top origins)
const Y_LABEL_SIDE_PX = 8; // gap between the Y axis and its labels
const LABEL_BASELINE_SHIFT_PX = 4; // centres Y labels vertically on their value
const END_LABEL_INSET_PX = 4; // end labels inside the workpiece keep this distance to the border
const ORIGIN_RADIUS_PX = 5.5;
const LOCKING_BLOCK_PX = 14;
// CSS px per (mm x scale) when the canvas has not reported it yet
const DEFAULT_PX_PER_SCALE = 5;

const COLOR_MINOR_GRID = '#EEEFF0';
const COLOR_MAJOR_GRID = '#E3E5E8';
const COLOR_TEXT = '#85888C';

interface Workpiece2dOptions {
    size: Vector2;
    coordinateMode;
    coordinateSize?;
    materials: Materials;
    scale: number;
    // CSS px per (mm x scale), see SVGCanvas.updateCanvas
    pxPerScale?: number;
    getRoot: () => Element;
}

/**
 * Workpiece in 2D.
 *
 * Use rectangle to represent workpiece.
 */
class Workpiece2d {
    private id: string;
    private printableAreaGroup: Element;

    private size: {
        x: number;
        y: number;
    };

    private materials: Materials;
    private origin: Origin;
    private coordinateMode;
    private coordinateSize;
    private coorDelta: { x: number; y: number } = { x: 0, y: 0 };
    private scale: number = 1;
    private pxPerScale: number = DEFAULT_PX_PER_SCALE;

    public constructor(options: Workpiece2dOptions) {
        this.id = uuid();
        this.size = {
            ...options.size
        };
        this.materials = {
            ...options.materials
        };

        this.coorDelta = {
            x: 0,
            y: 0
        };
        this.coordinateMode = options.coordinateMode;
        this.coordinateSize = (options.coordinateSize && options.coordinateSize.x > 0) ? options.coordinateSize : this.size;
        this.origin = {
            type: OriginType.Workpiece,
            reference: RectangleWorkpieceReference.Center,
            referenceMetadata: {},
        };
        this._setCoordinateMode(this.coordinateMode);

        this.scale = options.scale;
        if (options.pxPerScale > 0) {
            this.pxPerScale = options.pxPerScale;
        }
        this.printableAreaGroup = createSVGElement({
            element: 'g',
            attr: {
                id: 'printable-area-group'
            }
        });

        options.getRoot().append(this.printableAreaGroup);
        this._setCoordinateAxes();
        this._setGridLine();
        this._setMaterialsRect();
        this._setOriginPoint();
    }

    public updateScale(state) {
        const { size, materials, scale, origin, pxPerScale } = state;

        // grid steps, labels and their sizes depend on the zoom: re-draw on a zoom change
        let zoomChange = false;
        if (Math.abs(this.scale - scale) > EPSILON) {
            this.scale = scale;
            zoomChange = true;
        }
        if (pxPerScale > 0 && Math.abs(this.pxPerScale - pxPerScale) > EPSILON) {
            this.pxPerScale = pxPerScale;
            zoomChange = true;
        }

        // Check size change or material change => re-draw workpiece
        const sizeChange = size && (!isEqual(this.size.x, size.x) || !isEqual(this.size.y, size.y));
        const materialsChange = materials && (
            !isEqual(this.materials.x, materials.x)
            || !isEqual(this.materials.y, materials.y)
            || !isEqual(this.origin.type, origin.type)
            || (this.origin.reference !== origin.reference)
        );

        if (sizeChange || materialsChange) {
            this.size = {
                ...size
            };
            this.materials = {
                ...materials
            };

            this.origin = Object.assign({}, origin);
        }

        if (sizeChange || materialsChange || zoomChange) {
            // Re-create coordinate sytem
            while (this.printableAreaGroup.firstChild) {
                this.printableAreaGroup.removeChild(this.printableAreaGroup.lastChild);
            }
            this._setCoordinateAxes();
            this._setGridLine();
            this._setMaterialsRect();
            this._setOriginPoint();
        }
    }

    public updateCoordinateMode(origin, coordinateMode, coordinateSize) {
        while (this.printableAreaGroup.firstChild) {
            this.printableAreaGroup.removeChild(this.printableAreaGroup.lastChild);
        }

        this.origin = origin;

        this.coordinateSize = coordinateSize;
        this._setCoordinateMode(coordinateMode);
        this._setCoordinateAxes();
        this._setGridLine();
        this._setMaterialsRect();
        this._setOriginPoint();
    }

    private _pxPerMm(): number {
        return Math.max(this.scale * this.pxPerScale, 1e-6);
    }

    public _removeAll() {
        // do nothing
    }

    public _setCoordinateMode(coordinateMode) {
        this.coordinateMode = coordinateMode;
        this.coorDelta = {
            x: 0,
            y: 0
        };
        this.coorDelta.x += this.coordinateSize.x / 2 * coordinateMode.setting.sizeMultiplyFactor.x;
        this.coorDelta.y -= this.coordinateSize.y / 2 * coordinateMode.setting.sizeMultiplyFactor.y;
    }

    /**
     * Draw grid lines, axes and axis labels. Label and grid steps follow the zoom, and labels,
     * strokes and offsets keep a constant on-screen size (sizes are given in screen px).
     */
    public _setGridLine() {
        const drawAxis = !(this.origin && this.origin.type === OriginType.Object);
        const drawScale = drawAxis;

        const { x, y } = this.size;
        const { x: cx, y: cy } = this.coordinateSize;
        const xMin = x - cx / 2 + this.coorDelta.x;
        const xMax = x + cx / 2 + this.coorDelta.x;
        const yMin = y - cy / 2 + this.coorDelta.y;
        const yMax = y + cy / 2 + this.coorDelta.y;
        const coordinateModeName = this.coordinateMode.value;

        const pxPerMm = this._pxPerMm();
        const mm = (px: number) => px / pxPerMm;
        const labelStep = chooseStep(pxPerMm, LABEL_MIN_SPACING_PX);
        const minorStep = chooseMinorStep(pxPerMm, labelStep, GRID_MIN_SPACING_PX);
        const isMajor = (v: number) => {
            const n = v / labelStep;
            return Math.abs(n - Math.round(n)) < 1e-6;
        };

        // coordinate values (relative to the origin) covered by the workpiece
        const xFrom = xMin - x;
        const xTo = xMax - x;
        const yFrom = y - yMax;
        const yTo = y - yMin;

        const addLine = (x1: number, y1: number, x2: number, y2: number, color: string, strokeWidth: number) => {
            this.printableAreaGroup.append(createSVGElement({
                element: 'line',
                attr: {
                    x1,
                    y1,
                    x2,
                    y2,
                    id: uuid(),
                    stroke: color,
                    fill: 'none',
                    'stroke-width': strokeWidth,
                    opacity: 1,
                    'fill-opacity': 1
                }
            }));
        };

        // grid: minor lines first, major lines (at the label step) on top
        const xs = multiplesInRange(xFrom, xTo, minorStep);
        const ys = multiplesInRange(yFrom, yTo, minorStep);
        for (const major of [false, true]) {
            const color = major ? COLOR_MAJOR_GRID : COLOR_MINOR_GRID;
            for (const v of xs) {
                if (isMajor(v) === major && !(drawAxis && v === 0)) {
                    addLine(x + v, yMin, x + v, yMax, color, 1 / this.scale);
                }
            }
            for (const v of ys) {
                if (isMajor(v) === major && !(drawAxis && v === 0)) {
                    addLine(xMin, y - v, xMax, y - v, color, 1 / this.scale);
                }
            }
        }
        // axes through the origin
        if (xFrom <= 0 && xTo >= 0) {
            addLine(x, yMin, x, yMax, COLOR_MINOR_GRID, (drawAxis ? 4 : 1) / this.scale);
        }
        if (yFrom <= 0 && yTo >= 0) {
            addLine(xMin, y, xMax, y, COLOR_MINOR_GRID, (drawAxis ? 4 : 1) / this.scale);
        }

        if (drawScale) {
            const addLabel = (lx: number, ly: number, value: number, anchor: string) => {
                const label = createSVGElement({
                    element: 'text',
                    attr: {
                        x: lx,
                        y: ly,
                        id: uuid(),
                        'font-size': mm(LABEL_FONT_PX),
                        fill: COLOR_TEXT,
                        'text-anchor': anchor,
                        'xml:space': 'preserve',
                        'stroke-width': 0,
                        'fill-opacity': 1,
                        'stroke-opacity': 0
                    }
                });
                label.textContent = formatTick(value);
                label.style.cursor = 'default';
                this.printableAreaGroup.append(label);
            };

            // An axis through the middle of the workpiece has its labels inside the workpiece:
            // there the end labels are pulled inwards so that they do not cross the border.
            const xLabelsInside = yFrom < 0 && yTo > 0;
            const yLabelsInside = xFrom < 0 && xTo > 0;

            // X labels below the axis (above it for a top origin); "0" is labelled on the Y axis
            const xLabelY = coordinateModeName.indexOf('top') !== -1 ? y - mm(X_LABEL_ABOVE_PX) : y + mm(X_LABEL_BELOW_PX);
            for (const v of axisLabelValues(xFrom, xTo, labelStep, pxPerMm, LABEL_MIN_GAP_PX)) {
                if (v === 0) {
                    continue;
                }
                if (xLabelsInside && Math.abs(v - xFrom) < 1e-6) {
                    addLabel(x + v + mm(END_LABEL_INSET_PX), xLabelY, v, 'start');
                } else if (xLabelsInside && Math.abs(v - xTo) < 1e-6) {
                    addLabel(x + v - mm(END_LABEL_INSET_PX), xLabelY, v, 'end');
                } else {
                    addLabel(x + v, xLabelY, v, 'middle');
                }
            }
            // Y labels left of the axis (right of it for a right origin)
            const right = coordinateModeName.indexOf('right') !== -1;
            const yLabelX = right ? x + mm(Y_LABEL_SIDE_PX) : x - mm(Y_LABEL_SIDE_PX);
            for (const v of axisLabelValues(yFrom, yTo, labelStep, pxPerMm, LABEL_MIN_GAP_PX)) {
                let baseline = y - v + mm(LABEL_BASELINE_SHIFT_PX);
                if (yLabelsInside && Math.abs(v - yTo) < 1e-6) {
                    baseline = y - v + mm(LABEL_FONT_PX + END_LABEL_INSET_PX);
                } else if (yLabelsInside && Math.abs(v - yFrom) < 1e-6) {
                    baseline = y - v - mm(END_LABEL_INSET_PX);
                }
                addLabel(yLabelX, baseline, v, right ? 'start' : 'end');
            }

            // 4 border lines
            const borderColor = '#B9BCBF';
            addLine(xMin, yMin, xMin, yMax, borderColor, 1 / this.scale);
            addLine(xMax, yMin, xMax, yMax, borderColor, 1 / this.scale);
            addLine(xMin, yMin, xMax, yMin, borderColor, 1 / this.scale);
            addLine(xMin, yMax, xMax, yMax, borderColor, 1 / this.scale);
        }
    }

    public _setBorder(x1, y1, x2, y2, color, dashed) {
        const line = createSVGElement({
            element: 'line',
            attr: {
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                id: uuid(),
                stroke: color,
                fill: 'none',
                'stroke-dasharray': dashed ? '1, 1' : '',
                'stroke-width': 1 / this.scale,
                opacity: 0.8
            }
        });
        this.printableAreaGroup.append(line);
    }

    public _axisLabel() {
        const label = createSVGElement({
            element: 'text',
            attr: {
                x: 30,
                y: 30,
                id: uuid(),
                'font-size': 24,
                fill: '#ff7f00',
                'text-anchor': 'middle',
                'xml:space': 'preserve',
                'stroke-width': 0,
                'fill-opacity': 1,
                'stroke-opacity': 0
            }
        });
        label.innerHTML = 123;
        this.printableAreaGroup.append(label);
    }

    public _setCoordinateAxes() {
        const { x, y } = this.size;
        const { x: cx, y: cy } = this.coordinateSize;
        const xMin = x - cx / 2 + this.coorDelta.x;
        const xMax = x + cx / 2 + this.coorDelta.x;
        const yMin = y - cy / 2 + this.coorDelta.y;
        const yMax = y + cy / 2 + this.coorDelta.y;
        const border = createSVGElement({
            element: 'rect',
            attr: {
                x: xMin,
                y: yMin,
                width: xMax - xMin,
                height: yMax - yMin,
                id: uuid(),
                stroke: '#B9BCBF',
                fill: '#FFFFFF',
                'stroke-width': 2 / this.scale,
                opacity: 1,
                'fill-opacity': 1
            }
        });
        this.printableAreaGroup.append(border);
        // this._setBorder(, yMin, xMax, yMin, '#B9BCBF', false);
        // this._setBorder(xMin, yMin, xMin, yMax, '#B9BCBF', false);
        // this._setBorder(xMin, yMax, xMax, yMax, '#B9BCBF', false);
        // this._setBorder(xMax, yMin, xMax, yMax, '#B9BCBF', false);
    }

    // _setLockingBlock() {
    //     if ()
    // }
    public _setOriginPoint() {
        if (this.materials.isRotate) {
            return;
        }
        if (this.origin && this.origin.type === OriginType.Object) {
            return;
        }

        const { x, y } = this.size;
        let originElement = null;
        // console.log('createOrigin, origin =', this.origin);

        const blockSize = LOCKING_BLOCK_PX / this._pxPerMm();
        if (this.origin.type === OriginType.CNCLockingBlock) {
            originElement = createSVGElement({
                element: 'image',
                attr: {
                    x: x - blockSize * 0.25,
                    y: y - blockSize * 0.6,
                    width: blockSize,
                    height: blockSize,
                    href: '/resources/images/cnc/locking-block-red.svg',
                    id: 'locking-block',
                    preserveAspectRatio: 'none'
                }
            });
        } else {
            originElement = createSVGElement({
                element: 'circle',
                attr: {
                    cx: x,
                    cy: y,
                    r: ORIGIN_RADIUS_PX / this._pxPerMm(),
                    fill: '#FF5759',
                    stroke: '#FF5759',
                    'stroke-width': 1 / this.scale,
                    opacity: 1,
                    'fill-opacity': 1
                }
            });
        }
        this.printableAreaGroup.append(originElement);
    }

    public _setMaterialsRect() {
        const { isRotate, diameter, length, fixtureLength = 20 } = this.materials;
        let { x = 0, y = 0 } = this.materials;

        if (isRotate && !x && !y) {
            x = diameter * Math.PI;
            y = length;
        }

        if (!isRotate) {
            return;
        }
        if (!x || !y) {
            return;
        }

        const height = Math.min(fixtureLength, y);
        const width = height * 415 / 90;
        const posX = this.size.x - x / 2;
        const scaleX = x / width;

        // eslint-disable-next-line no-unused-vars
        const nonEditableArea = createSVGElement({
            element: 'image',
            attr: {
                x: posX,
                y: this.size.y - y,
                width: width, // real width = width * scale
                height: height,
                href: '/resources/images/cnc-laser/pic_4-axis_stop_bg.png',
                stroke: '#000',
                'stroke-width': 1 / this.scale,
                opacity: 1,
                'fill-opacity': 1,
                transform: `scale(${scaleX} 1) translate(${(posX - posX * scaleX) / scaleX} 0)`
            }
        });
        this.printableAreaGroup.append(nonEditableArea);
    }
}

export default Workpiece2d;
