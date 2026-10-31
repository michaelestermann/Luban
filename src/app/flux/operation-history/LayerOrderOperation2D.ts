import Operation from '../../core/Operation';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Model = any;

type LayerOrderProp = {
    modelGroup: any;
    layerBefore: Model[]; // modelGroup.models (back to front) before
    layerAfter: Model[]; // and after
    onChange?: () => void;
};

/** A layer order change (Bring to Front, Send to Back, object list drag and drop) as one undo step. */
export default class LayerOrderOperation2D extends Operation<LayerOrderProp> {
    public constructor(props: LayerOrderProp) {
        super();
        this.state = { ...props };
    }

    private apply(models: Model[]) {
        const { modelGroup, onChange } = this.state;
        modelGroup.applyLayerOrder(models.slice());
        onChange && onChange();
    }

    public redo() {
        this.apply(this.state.layerAfter);
    }

    public undo() {
        this.apply(this.state.layerBefore);
    }
}
