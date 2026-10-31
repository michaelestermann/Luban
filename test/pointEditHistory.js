import test from 'tape';
import OperationHistory from '../src/app/core/OperationHistory';
import CompoundOperation from '../src/app/core/CompoundOperation';
import { dropUnusedConversion, mergeConversion } from '../src/app/flux/editor/point-edit-history';

const PATH = { id: 'path' };
const step = (...ops) => { const c = new CompoundOperation(); c.push(...ops); return c; };
const op = (name, log, extra = {}) => ({ name, ...extra, undo: () => log.push(`undo ${name}`), redo: () => log.push(`redo ${name}`) });
const isConversion = (o, elem) => o.name === 'convert' && o.pathElem === elem;
const isDrawing = o => o.name === 'drawStart';

test('point editing ended without a change: the conversion is undone and both steps are gone', (t) => {
    const log = [];
    const history = new OperationHistory();
    history.push(step(op('add', log)));
    history.push(step(op('convert', log, { pathElem: PATH })));
    history.push(step(op('drawStart', log)));
    t.equal(dropUnusedConversion(history, PATH, isConversion, isDrawing), true, 'dropped');
    t.deepEqual(log, ['undo convert'], 'shape back');
    t.equal(history.size(), 1, 'only the earlier step is left');
    t.equal(history.get().getItem(0).name, 'add');
    t.equal(history.canRedo, false, 'nothing to redo');
    t.end();
});

test('point editing ended after an edit: the history is kept', (t) => {
    const log = [];
    const history = new OperationHistory();
    history.push(step(op('add', log)));
    history.push(step(op('convert', log, { pathElem: PATH }), op('edit', log)));
    t.equal(dropUnusedConversion(history, PATH, isConversion, isDrawing), false, 'kept');
    t.equal(history.size(), 2);
    t.deepEqual(log, []);
    t.end();
});

test('an editable path (no conversion) only loses the drawing start', (t) => {
    const history = new OperationHistory();
    history.push(step(op('add', [])));
    history.push(step(op('drawStart', [])));
    t.equal(dropUnusedConversion(history, PATH, isConversion, isDrawing), false);
    t.equal(history.size(), 1);
    t.end();
});

test('the first edit after the conversion is one undo step with it', (t) => {
    const log = [];
    const history = new OperationHistory();
    history.push(step(op('add', log)));
    history.push(step(op('convert', log, { pathElem: PATH })));
    const edit = step(op('edit', log));
    t.equal(mergeConversion(history, PATH, edit, isConversion), true, 'merged');
    t.equal(history.size(), 2, 'one step for conversion and edit');
    history.undo();
    t.deepEqual(log, ['undo edit', 'undo convert'], 'edit undone before the conversion');
    history.redo();
    t.deepEqual(log.slice(2), ['redo convert', 'redo edit'], 'redo in order');
    t.end();
});

test('later edits are their own steps', (t) => {
    const history = new OperationHistory();
    history.push(step(op('convert', [], { pathElem: PATH }), op('edit', [])));
    t.equal(mergeConversion(history, PATH, step(op('edit2', [])), isConversion), false);
    t.equal(history.size(), 1, 'the caller pushes the edit');
    t.end();
});
