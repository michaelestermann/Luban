/**
 * History of point editing a draw tool shape: the shape is converted to a path when point editing
 * starts (own step, so the path exists while editing). The conversion belongs to the first real edit:
 * that edit and the conversion are one undo step, and when point editing ends without an edit the
 * conversion is undone and removed, so the shape is exactly as before and no step is left.
 */
import type CompoundOperation from '../../core/CompoundOperation';
import type OperationHistory from '../../core/OperationHistory';

interface Step {
    undo: () => void;
    redo: () => void;
}

type IsConversion = (operation: unknown, pathElem: unknown) => boolean;

/** Conversion and first edit as one step: redo converts then edits, undo reverts the edit first. */
export class ConvertAndEdit {
    public description = 'ConvertAndEdit';

    public readonly convert: Step;

    public readonly edit: Step;

    public constructor(convert: Step, edit: Step) {
        this.convert = convert;
        this.edit = edit;
    }

    public redo() {
        this.convert.redo();
        this.edit.redo();
    }

    public undo() {
        this.edit.undo();
        this.convert.undo();
    }
}

// the last applied step when it is only the conversion to this path
function pendingConversion(history: OperationHistory, pathElem: unknown, isConversion: IsConversion): CompoundOperation | null {
    const top = history.get();
    return top && top.length() === 1 && isConversion(top.getItem(0), pathElem) ? top : null;
}

/**
 * Point editing of pathElem ended: removes the drawing steps and, if the conversion to pathElem was not
 * followed by an edit, undoes and removes it. Returns whether the conversion was dropped.
 */
export function dropUnusedConversion(
    history: OperationHistory,
    pathElem: unknown,
    isConversion: IsConversion,
    isDrawing: (operation: unknown) => boolean
): boolean {
    history.filter(step => !step.operations.some(isDrawing));
    const conversion = pendingConversion(history, pathElem, isConversion);
    if (!conversion) {
        return false;
    }
    conversion.undo();
    history.pop();
    return true;
}

/**
 * First edit of a converted path: replaces the conversion step by one step with the conversion and the
 * edit. Returns false (nothing changed, the caller pushes the edit) if the last step is not the conversion.
 */
export function mergeConversion(history: OperationHistory, pathElem: unknown, edit: CompoundOperation, isConversion: IsConversion): boolean {
    const conversion = pendingConversion(history, pathElem, isConversion);
    if (!conversion) {
        return false;
    }
    history.pop();
    const merged = new (conversion.constructor as new () => CompoundOperation)();
    merged.push(new ConvertAndEdit(conversion.getItem(0) as Step, edit) as never);
    history.push(merged);
    return true;
}
