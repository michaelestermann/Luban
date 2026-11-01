import each from 'lodash/each';
import {
    DoubleSide,
    Group,
    LinearFilter,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
    ShapeGeometry,
    Sprite,
    SpriteMaterial,
    Texture,
    Vector2,
    Vector3,
    Math as ThreeMath
} from 'three';

import { DEFAULT_LUBAN_HOST } from '../../../../constants';
import {
    Origin,
    OriginType,
    RectangleWorkpieceReference,
    RectangleWorkpieceSize,
    Workpiece,
    WorkpieceShape
} from '../../../../constants/coordinate';
import SVGLoader from '../../../../scene/three-extensions/SVGLoader';
import TargetPoint from '../../../../scene/three-extensions/TargetPoint';
import GridLine from './GridLine';
import { isPlateLabelShown, plateAxisLabels, plateLabelStep, worldPerPixel } from './plate-labels';

const METRIC_GRID_SPACING = 10; // 10 mm
const METRIC_GRID_BIG_SPACING = 50;

// On-screen sizes (CSS px) of the axis labels and the origin point, as on the 2D canvas
const LABEL_FONT_PX = 11;
const LABEL_GAP_PX = 6; // between an axis and its labels
const LABEL_TEXTURE_SCALE = 3; // texture px per CSS px: sharp text on HiDPI screens
const LABEL_COLOR = '#85888C';
const LABEL_FALLBACK_MM_PER_PX = 0.3; // size of a label px when the camera gives none
const TARGET_POINT_RADIUS = 2; // mm, geometry of the point
const TARGET_POINT_RADIUS_PX = 5.5;

const tmpPosition = new Vector3();
const tmpSize = new Vector2();

/**
 * Re-sizes an object before each render from the size of one screen pixel at its position
 * (world units per CSS px; 0 when unknown), so that it keeps a constant on-screen size.
 */
function keepScreenSize(object: Object3D, resize: (worldPerPx: number) => void) {
    object.onBeforeRender = (renderer, scene, camera) => {
        renderer.getSize(tmpSize);
        let wpp = 0;
        if ((camera as PerspectiveCamera).isPerspectiveCamera) {
            object.getWorldPosition(tmpPosition).applyMatrix4(camera.matrixWorldInverse);
            wpp = worldPerPixel((camera as PerspectiveCamera).fov, -tmpPosition.z, tmpSize.y);
        } else if ((camera as OrthographicCamera).isOrthographicCamera && tmpSize.y > 0) {
            const ortho = camera as OrthographicCamera;
            wpp = (ortho.top - ortho.bottom) / ortho.zoom / tmpSize.y;
        }
        resize(wpp);
        // the world matrix of this render is already computed: update it for the new size
        object.updateMatrixWorld();
    };
}


class PrintablePlate extends Object3D {
    private coordinateSystem: Group = null;

    private workpiece: Workpiece
    private origin: Origin;

    /**
     * Canvas size
     */
    private canvasSize: { x: number; y: number };

    /**
     * Canvas coordinate offset
     */
    private coorDelta: { dx: number; dy: number };

    private targetPoint = null;

    // object origin point (plate coordinates), null: the workpiece origin
    private originPoint: { x: number; y: number } | null = null;

    // the axis labels (rebuilt when the origin point moves)
    private axisLabels: Group = null;

    public constructor(workpiece: Workpiece, origin: Origin) {
        super();

        this.type = 'PrintPlane';

        this.targetPoint = null;
        // this.coordinateVisible = true;
        this.coordinateSystem = null;

        this.workpiece = workpiece;
        this.origin = origin || {
            type: OriginType.Workpiece,
            reference: RectangleWorkpieceReference.Center,
            referenceMetadata: {},
        };

        // Move this function into _setup(), maybe?
        if (workpiece.shape === WorkpieceShape.Cylinder) {
            return;
        }


        this.calculateCoordinateOffset();
        this._setup();
    }

    private calculateCoordinateOffset(): void {
        // canvas size
        if (this.workpiece.shape === WorkpieceShape.Rectangle) {
            const size = (this.workpiece.size as RectangleWorkpieceSize);

            this.canvasSize = size;
        }

        // coordinate offset
        this.coorDelta = {
            dx: 0,
            dy: 0
        };

        if (this.workpiece.shape === WorkpieceShape.Rectangle) {
            const size = (this.workpiece.size as RectangleWorkpieceSize);
            if (this.origin.type === OriginType.Workpiece || this.origin.type === OriginType.Object) {
                switch (this.origin.reference) {
                    case RectangleWorkpieceReference.BottomLeft: {
                        this.coorDelta = { dx: size.x / 2, dy: size.y / 2 };
                        break;
                    }
                    case RectangleWorkpieceReference.BottomRight: {
                        this.coorDelta = { dx: -size.x / 2, dy: size.y / 2 };
                        break;
                    }
                    case RectangleWorkpieceReference.TopLeft: {
                        this.coorDelta = { dx: size.x / 2, dy: -size.y / 2 };
                        break;
                    }
                    case RectangleWorkpieceReference.TopRight: {
                        this.coorDelta = { dx: -size.x / 2, dy: -size.y / 2 };
                        break;
                    }
                    default:
                        break;
                }
            }
        }
    }

    public _setup() {
        // Metric
        const gridSpacing = METRIC_GRID_SPACING;

        const group = new Group();

        // { // Border Plane
        //     const plane = new PlaneGeometry(this.size.x, this.size.y);
        //     const material = new MeshBasicMaterial({
        //         side: DoubleSide,
        //         color: 0xFFFFFF
        //     });
        //     const borderPlane = new Mesh(plane, material);
        //     group.add(borderPlane);
        // }
        { // Coordinate Grid
            // Todo: cause twice
            const gridLine = new GridLine(
                -this.canvasSize.x / 2 + this.coorDelta.dx,
                this.canvasSize.x / 2 + this.coorDelta.dx,
                gridSpacing,
                -this.canvasSize.y / 2 + this.coorDelta.dy,
                this.canvasSize.y / 2 + this.coorDelta.dy,
                gridSpacing,
                0XFFFFFF - 0xF500F7 // grid
            );
            each(gridLine.children, (o) => {
                o.material.opacity = 0.15;
                o.material.transparent = true;
                o.material.depthWrite = false;
            });
            gridLine.name = 'GridLine';
            group.add(gridLine);
        }

        // Axis Labels: constant on-screen size, see _addAxisLabel
        this.axisLabels = this._createAxisLabels();
        group.add(this.axisLabels);
        this.coordinateSystem = group;
        group.name = 'MetricCoordinateSystem';
        this.add(group);

        // Target Point
        this.targetPoint = new TargetPoint({
            color: 0xFF5759,
            radius: TARGET_POINT_RADIUS
        });
        this.targetPoint.name = 'TargetPoint';
        this.targetPoint.visible = true;
        // the point keeps its on-screen size at any zoom
        each(this.targetPoint.children, (mesh) => {
            keepScreenSize(mesh, (wpp) => {
                const s = wpp > 0 ? (TARGET_POINT_RADIUS_PX * wpp) / TARGET_POINT_RADIUS : 1;
                mesh.scale.set(s, s, s);
            });
        });
        this.add(this.targetPoint);

        // Draw locking block if we have one
        if (this.origin.type === OriginType.CNCLockingBlock) {
            new SVGLoader().load(`${DEFAULT_LUBAN_HOST}/resources/images/cnc/locking-block-red.svg`, (data) => {
                const paths = data.paths;

                const svgGroup = new Group();

                for (let i = 0; i < paths.length; i++) {
                    const path = paths[i];

                    const material = new MeshBasicMaterial({
                        color: path.color,
                        side: DoubleSide,
                        depthWrite: false,
                    });

                    const pathShape = SVGLoader.createShapes(path);

                    for (let j = 0; j < pathShape.length; j++) {
                        const shape = pathShape[j];

                        const geometry = new ShapeGeometry(shape);
                        const mesh = new Mesh(geometry, material);
                        mesh.scale.set(0.7, 0.7, 0.7);
                        svgGroup.add(mesh);
                    }
                }
                svgGroup.position.set(10, -8.5, 0.01);
                svgGroup.rotateZ(ThreeMath.degToRad(90));
                this.add(svgGroup);
            });
        }
    }

    /**
     * The labels of the axes through the origin (the workpiece origin or the object origin point),
     * counting from it like the G-code and the rulers of the 2D canvas.
     */
    private _createAxisLabels(): Group {
        const group = new Group();
        group.name = 'AxisLabels';
        const range = {
            minX: -this.canvasSize.x / 2 + this.coorDelta.dx,
            maxX: this.canvasSize.x / 2 + this.coorDelta.dx,
            minY: -this.canvasSize.y / 2 + this.coorDelta.dy,
            maxY: this.canvasSize.y / 2 + this.coorDelta.dy,
        };
        const labels = plateAxisLabels(range, this.originPoint, METRIC_GRID_BIG_SPACING);
        for (const label of labels.x) {
            this._addAxisLabel(group, label.value, label.at, labels.axis.y, labels.top ? 'above' : 'below');
        }
        for (const label of labels.y) {
            this._addAxisLabel(group, label.value, labels.axis.x, label.at, labels.right ? 'right' : 'left');
        }
        return group;
    }

    /**
     * An axis label: a sprite sized in screen px before each render (see keepScreenSize) and placed
     * on the given side of its anchor point. Labels that would crowd on screen are hidden (zero size).
     */
    private _addAxisLabel(group: Group, value: number, x: number, y: number, side: 'above' | 'below' | 'left' | 'right') {
        const text = String(value);
        const resolution = LABEL_TEXTURE_SCALE * LABEL_FONT_PX;
        const font = `normal ${resolution}px Arial`;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = font;
        const textWidth = Math.max(1, Math.ceil(context.measureText(text).width));
        const textHeight = Math.ceil(resolution * 1.25);
        canvas.width = textWidth;
        canvas.height = textHeight;
        context.font = font;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = LABEL_COLOR;
        context.fillText(text, textWidth / 2, textHeight / 2);

        const texture = new Texture(canvas);
        texture.needsUpdate = true;
        texture.minFilter = LinearFilter;
        const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new Sprite(material);
        sprite.position.set(x, y, 0);
        sprite.frustumCulled = false;

        // on-screen size of the label (CSS px); the centre moves it off its anchor by a fixed gap
        const heightPx = textHeight / LABEL_TEXTURE_SCALE;
        const widthPx = textWidth / LABEL_TEXTURE_SCALE;
        switch (side) {
            case 'above':
                sprite.center.set(0.5, -LABEL_GAP_PX / heightPx);
                break;
            case 'below':
                sprite.center.set(0.5, 1 + LABEL_GAP_PX / heightPx);
                break;
            case 'right':
                sprite.center.set(-LABEL_GAP_PX / widthPx, 0.5);
                break;
            default:
                sprite.center.set(1 + LABEL_GAP_PX / widthPx, 0.5);
                break;
        }

        keepScreenSize(sprite, (wpp) => {
            const shown = isPlateLabelShown(value, plateLabelStep(wpp > 0 ? 1 / wpp : 0));
            const k = shown ? (wpp || LABEL_FALLBACK_MM_PER_PX) : 0;
            sprite.scale.set(widthPx * k, heightPx * k, 1);
        });
        group.add(sprite);
    }

    /**
     * Object origin (model coordinates; null: the workpiece origin): the red point and the axes with
     * their labels go to that point of the workpiece, the labels count from it (as the G-code does).
     * The plate stays where the workpiece is (the tool paths are moved to the point, see
     * ToolPathGroup.setPreviewOrigin).
     */
    public setTargetPoint(point: { x: number; y: number } | null) {
        if (this.targetPoint) {
            this.targetPoint.position.setX(point ? point.x : 0);
            this.targetPoint.position.setY(point ? point.y : 0);
        }
        const old = this.originPoint;
        const same = (!old && !point) || (old && point && Math.abs(old.x - point.x) < 1e-6 && Math.abs(old.y - point.y) < 1e-6);
        if (same) {
            return;
        }
        this.originPoint = point ? { x: point.x, y: point.y } : null;
        if (this.coordinateSystem && this.axisLabels) {
            this.coordinateSystem.remove(this.axisLabels);
            this.axisLabels = this._createAxisLabels();
            this.coordinateSystem.add(this.axisLabels);
        }
    }

    public changeCoordinateVisibility(value: boolean) {
        this.coordinateSystem && (this.coordinateSystem.visible = value);
    }
}

export default PrintablePlate;
