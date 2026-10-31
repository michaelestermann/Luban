import Operation from '../../core/Operation';

/* eslint-disable @typescript-eslint/no-explicit-any */
type RoundCornersProp = {
    // one step per changed object (ShapeToPath for rectangles, DrawTransformComplete for paths)
    steps: Operation<any>[];
    // SVGActionsFactory: the selection
    svgActions: any;
    onChange?: () => void;
};

/**
 * "Round corners" on several objects as one undo step. The objects that were selected stay selected
 * (each element swap on its own would select only its element).
 */
export default class RoundCornersOperation2D extends Operation<RoundCornersProp> {
    public constructor(props: RoundCornersProp) {
        super();
        this.state = { ...props };
    }

    private run(change: () => void) {
        const { svgActions, onChange } = this.state;
        const models = (svgActions.getSelectedElements() || [])
            .map(elem => svgActions.getSVGModelByElement(elem))
            .filter(Boolean);
        change();
        if (models.length > 1) {
            svgActions.clearSelection();
            svgActions.selectElements(models.map(model => model.elem));
        }
        onChange && onChange();
    }

    public redo() {
        this.run(() => this.state.steps.forEach(step => step.redo()));
    }

    public undo() {
        this.run(() => this.state.steps.slice().reverse().forEach(step => step.undo()));
    }
}
