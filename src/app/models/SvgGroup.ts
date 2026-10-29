import { v4 as uuid } from 'uuid';
import type { ModelTransformation } from './ThreeBaseModel';
import type SvgModel from './SvgModel';
import type ModelGroup2D from './ModelGroup2D';

export interface SvgGroupOptions {
    modelID?: string;
    name: string;
    baseName: string;
    headType: 'laser' | 'cnc';
    visible?: boolean;
    transformation?: Partial<ModelTransformation>;
}

const DEFAULT_TRANSFORMATION: ModelTransformation = {
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    uniformScalingState: true,
    width: 0,
    height: 0,
} as unknown as ModelTransformation;

/**
 * SvgGroup — first-class container for grouping SvgModel instances in the
 * laser and CNC workspaces. Mirrors the 3DP `ThreeGroup` pattern but works
 * against raw SVG DOM (`<g>`) instead of three.js objects.
 *
 * Flat only: children are always `SvgModel` instances, never other groups.
 */
export default class SvgGroup {
    public readonly type = '2d-group' as const;

    public modelID: string;

    public name: string;

    public baseName: string;

    public headType: 'laser' | 'cnc';

    public visible: boolean;

    public children: SvgModel[];

    public transformation: ModelTransformation;

    public modelGroup: ModelGroup2D;

    public elem: SVGGElement | null = null;

    public constructor(options: SvgGroupOptions, modelGroup: ModelGroup2D) {
        this.modelID = options.modelID ?? uuid();
        this.name = options.name;
        this.baseName = options.baseName;
        this.headType = options.headType;
        this.visible = options.visible ?? true;
        this.children = [];
        this.transformation = {
            ...DEFAULT_TRANSFORMATION,
            ...(options.transformation ?? {}),
        } as ModelTransformation;
        this.modelGroup = modelGroup;
    }

    public addChild(child: SvgModel): void {
        if (!this.children.includes(child)) {
            this.children.push(child);
        }
        // SvgModel.parent is declared `any` to avoid a circular type import.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (child as any).parent = this;
    }

    public removeChild(child: SvgModel): void {
        const index = this.children.indexOf(child);
        if (index === -1) {
            return;
        }
        this.children.splice(index, 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (child as any).parent = null;
    }

    // ------------------------------------------------------------------
    // Transform sync (called after SVG DOM is manipulated by the canvas)
    // ------------------------------------------------------------------

    /**
     * Read the current transform state from the group's `<g>` element and
     * sync it back into the in-memory `transformation` object.  This is
     * the group-level equivalent of `SvgModel.onTransform()`.
     */
    public onTransform(): void {
        if (!this.elem) return;

        // SvgModel.getElementTransform reads [T][R][S][T] from the
        // transform list.  Import it lazily to avoid circular deps.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SvgModel = require('./SvgModel').default;
        const t = SvgModel.getElementTransform(this.elem);

        // Workspace size (centre offset) — all children share the same
        // value, grab it from the first child.
        const size = this.children.length > 0 ? this.children[0].size : { x: 0, y: 0 };

        this.transformation = {
            ...this.transformation,
            positionX: t.x - size.x,
            positionY: -t.y + size.y,
            scaleX: t.scaleX,
            scaleY: t.scaleY,
            scaleZ: 1,
            rotationX: 0,
            rotationY: 0,
            rotationZ: -t.angle / 180 * Math.PI,
            width: t.width * Math.abs(t.scaleX),
            height: t.height * Math.abs(t.scaleY),
        };
    }

    // ------------------------------------------------------------------
    // SVG DOM integration
    // ------------------------------------------------------------------

    /**
     * Attach the real SVG `<g>` DOM element that hosts this group's
     * children. The element id is synced to the group's modelID so the
     * DOM can be walked from an ancestor lookup (see SVGCanvas
     * double-click handler).
     */
    public attachDomElement(elem: SVGGElement): void {
        this.elem = elem;
        elem.setAttribute('id', this.modelID);
        elem.setAttribute('data-luban-group', '1');
    }

    /**
     * Move a child SvgModel's own `<g>` wrapper from wherever it lives
     * now into this group's `<g>`. SvgModels are usually rendered inside
     * a wrapping `<g>` that carries their transform; we move that wrapper
     * so the child's DOM hierarchy stays intact.
     */
    public attachChildDom(child: SvgModel): void {
        if (!this.elem || !child.elem) return;
        const nodeToMove = SvgGroup._domNodeForModel(child);
        if (!nodeToMove) return;
        if (nodeToMove !== this.elem) {
            this.elem.appendChild(nodeToMove);
        }
    }

    /**
     * Release a child's DOM subtree from this group's `<g>` back into the
     * caller-supplied container (typically `#svg-data`).
     */
    public detachChildDom(child: SvgModel, targetParent: SVGElement): void {
        if (!child.elem) return;
        const nodeToMove = SvgGroup._domNodeForModel(child);
        if (!nodeToMove) return;
        targetParent.appendChild(nodeToMove);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static _domNodeForModel(child: SvgModel): SVGElement | null {
        if (!child.elem) return null;
        const parent = child.elem.parentNode as SVGElement | null;
        // SvgModels may sit inside a wrapping `<g>` that holds the
        // model's transform. Move that wrapper when available, but NOT
        // if the parent is the top-level `#svg-data` container (id
        // "svg-data") or another group's `<g>` — in those cases, move
        // the bare element instead.
        if (
            parent
            && parent.tagName === 'g'
            && !parent.hasAttribute('data-luban-group')
            && parent.getAttribute('id') !== 'svg-data'
        ) {
            return parent;
        }
        return child.elem as unknown as SVGElement;
    }
}
