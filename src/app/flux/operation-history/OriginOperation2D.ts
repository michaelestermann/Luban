import Operation from '../../core/Operation';
import { Origin } from '../../constants/coordinate';

type OriginProp = {
    before: Origin;
    after: Origin;
    // sets the origin (state, tool paths, canvas)
    apply: (origin: Origin) => void;
};

/** Setting the work origin (on an object) as one undo step. */
export default class OriginOperation2D extends Operation<OriginProp> {
    public constructor(props: OriginProp) {
        super();
        this.state = { ...props };
    }

    public redo() {
        this.state.apply(this.state.after);
    }

    public undo() {
        this.state.apply(this.state.before);
    }
}
