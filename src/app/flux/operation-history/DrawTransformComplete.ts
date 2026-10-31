import SvgModel from '../../models/SvgModel';
import type DrawGroup from '../../ui/SVGEditor/svg-content/DrawGroup';
import Operation from '../../core/Operation';

type DrawTransformCompleteProp = {
    before: string,
    after: string,
    drawGroup: DrawGroup,
    svgModel: SvgModel,
    // element transform both paths belong to (taken when the operation is created)
    transform?: string
}

export default class DrawTransformComplete extends Operation<DrawTransformCompleteProp> {
    public constructor(props: DrawTransformCompleteProp) {
        super();
        this.state = {
            svgModel: props.svgModel,
            before: props.before,
            after: props.after,
            drawGroup: props.drawGroup,
            transform: props.transform ?? props.svgModel.elem.getAttribute('transform')
        };
    }

    private apply(d: string) {
        const { svgModel, transform, drawGroup } = this.state;
        if (transform) {
            svgModel.elem.setAttribute('transform', transform);
        }
        svgModel.elem.setAttribute('d', d);
        SvgModel.completeElementTransform(svgModel.elem);
        svgModel.onTransform();
        svgModel.updateSource();
        // point editing shows the changed path
        drawGroup && drawGroup.reloadPointEdit(svgModel.elem);
    }

    public redo() {
        this.apply(this.state.after);
    }

    public undo() {
        this.apply(this.state.before);
    }
}
