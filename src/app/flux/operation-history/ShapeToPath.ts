import type SvgModel from '../../models/SvgModel';
import Operation from '../../core/Operation';

type ModelConfig = Record<string, string | number | boolean>;

type ShapeToPathProp = {
    svgModel: SvgModel;
    // SVGActionsFactory (selection, pre-selection group)
    svgActions: {
        svgContentGroup: {
            preSelectionGroup: SVGGElement;
            drawGroup: { isEditingPoints: (elem?: Element) => boolean, stopDraw: (forcedStop?: boolean) => void };
            onChangeMode: (mode: string, ext: object) => void;
        };
        getSelectedElements: () => Element[];
        clearSelection: () => void;
        selectElements: (elements: Element[]) => void;
    };
    shapeElem: SVGElement;
    shapeConfig: ModelConfig;
    pathElem: SVGPathElement;
    pathConfig: ModelConfig;
};

/**
 * A draw tool shape (rect, ellipse, circle, line) converted to a path for point editing. Undo puts the
 * original element and config back; the model, its transformation and toolpaths stay.
 */
export default class ShapeToPath extends Operation<ShapeToPathProp> {
    public constructor(props: ShapeToPathProp) {
        super();
        this.state = { ...props };
    }

    private swap(elem: SVGElement, config: ModelConfig) {
        const { svgModel, svgActions } = this.state;
        const contentGroup = svgActions.svgContentGroup;
        if (contentGroup.drawGroup && contentGroup.drawGroup.isEditingPoints(svgModel.elem)) {
            // the element being edited goes away: leave point editing first
            contentGroup.drawGroup.stopDraw(true);
            contentGroup.onChangeMode('select', {});
        }
        const selected = svgActions.getSelectedElements().includes(svgModel.elem);
        svgModel.replaceElement(elem as SVGPathElement, { ...config }, svgActions.svgContentGroup.preSelectionGroup);
        if (selected) {
            svgActions.clearSelection();
            svgActions.selectElements([elem]);
        }
    }

    public redo() {
        this.swap(this.state.pathElem, this.state.pathConfig);
    }

    public undo() {
        this.swap(this.state.shapeElem, this.state.shapeConfig);
    }
}
