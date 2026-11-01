import Operation from './Operation';

type CallbackFunction = () => void;

/**
 * Compound Operation.
 *
 * A group of operations that need to execute together.
 */
class CompoundOperation {
    public operations: Operation<object>[] = [];

    private redoCallback: CallbackFunction | null = null;

    private undoCallback: CallbackFunction | null = null;

    private callback: CallbackFunction | null = null;

    // the selection before / after the operation, restored after undo / redo (see recordSelection)
    private selection: { before: unknown; after: unknown; restore: (selection: unknown) => void } | null = null;

    public push(...operations: Operation<T>[]) {
        this.operations.push(...operations);
    }

    public getItem<O>(i: number): O | null {
        if (this.operations[i]) {
            return this.operations[i] as O;
        } else {
            return null;
        }
    }

    public removeItem(i: number) {
        this.operations.splice(i, 1);
    }

    public length() {
        return this.operations.length;
    }

    public isEmpty() {
        return this.operations.length === 0;
    }

    public redo(): void {
        for (const operation of this.operations) {
            operation.redo();
        }

        this.runRedoCallback();
        this.selection && this.selection.restore(this.selection.after);
    }

    public undo(): void {
        for (const operation of this.operations) {
            operation.undo();
        }
        this.runUndoCallback();
        this.selection && this.selection.restore(this.selection.before);
    }

    /**
     * Undo selects `before` again, redo `after` (by `restore`, after the operations and callbacks ran):
     * operations that replace objects (combine, offset, array, decompose, group ...) keep the selection.
     */
    public recordSelection<S>(before: S, after: S, restore: (selection: S) => void) {
        this.selection = { before, after, restore: restore as (selection: unknown) => void };
    }

    /**
     * regist callback that runs after redo or undo, this method can be used to restore flux state
     * @param {function} callback this function will run after redo and undo callback finished
     * @param {function} redoCallback
     * @param {function} undoCallback
     */
    public registerCallbackAll(callback: CallbackFunction,
        redoCallback: CallbackFunction = null,
        undoCallback: CallbackFunction = null) {
        if (typeof redoCallback === 'function') {
            this.redoCallback = redoCallback;
        }
        if (typeof undoCallback === 'function') {
            this.undoCallback = undoCallback;
        }
        if (typeof callback === 'function') {
            this.callback = callback;
        }
    }

    public runRedoCallback() {
        this.redoCallback && this.redoCallback();
        this.callback && this.callback();
    }

    public runUndoCallback() {
        this.undoCallback && this.undoCallback();
        this.callback && this.callback();
    }
}

export default CompoundOperation;
