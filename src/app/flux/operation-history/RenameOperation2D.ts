import Operation from '../../core/Operation';
import { setEntityName } from '../../models/object-name';

/* eslint-disable @typescript-eslint/no-explicit-any */
type RenameProp = {
    // an SvgModel (modelName) or an SvgGroup (name)
    target: any;
    before: string;
    after: string;
    onChange?: () => void;
};

/** A rename of an object or a group in the object list as one undo step. */
export default class RenameOperation2D extends Operation<RenameProp> {
    public constructor(props: RenameProp) {
        super();
        this.state = { ...props };
    }

    private apply(name: string) {
        const { target, onChange } = this.state;
        setEntityName(target, name);
        onChange && onChange();
    }

    public redo() {
        this.apply(this.state.after);
    }

    public undo() {
        this.apply(this.state.before);
    }
}
