import test from 'tape';
import OperationHistory from '../src/app/core/OperationHistory';

const op = (name, log) => ({ name, undo: () => log.push(`undo ${name}`), redo: () => log.push(`redo ${name}`) });

test('removing the drawing steps keeps undone steps undone', (t) => {
    const log = [];
    const history = new OperationHistory();
    ['add', 'shapeToPath', 'drawStart', 'edit'].forEach((name) => history.push(op(name, log)));
    // undo the edit and the drawing start (both undone), then point editing removes the drawing steps
    history.undo();
    history.undo();
    history.filter((o) => o.name !== 'drawStart');
    t.equal(history.size(), 3);
    t.equal(history.canRedo, true, 'the undone edit can be redone');
    history.undo();
    history.undo();
    t.deepEqual(log, ['undo edit', 'undo drawStart', 'undo shapeToPath', 'undo add'], 'no step is undone twice');
    t.equal(history.canUndo, false);
    t.end();
});

test('removing steps while nothing is undone points to the last step', (t) => {
    const history = new OperationHistory();
    ['a', 'drawLine', 'drawLine'].forEach((name) => history.push(op(name, [])));
    history.filter((o) => o.name !== 'drawLine');
    t.equal(history.get().name, 'a');
    t.equal(history.canRedo, false);
    t.end();
});
