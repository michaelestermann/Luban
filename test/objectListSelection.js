import { test } from 'tape';
import { listClickMode, selectionRange, visibleRange } from '../src/app/ui/widgets/CncLaserList/ObjectList/list-selection';

test('click modes follow Windows: Shift = range, Ctrl/Cmd = toggle one, plain = only this one', (t) => {
    t.equal(listClickMode({ shiftKey: true }), 'range');
    t.equal(listClickMode({ ctrlKey: true }), 'toggle');
    t.equal(listClickMode({ metaKey: true }), 'toggle');
    t.equal(listClickMode({ shiftKey: true, ctrlKey: true }), 'range', 'Shift wins');
    t.equal(listClickMode({}), 'single');
    t.end();
});

test('a Shift range covers every row from the anchor to the clicked row, both directions', (t) => {
    const rows = ['a', 'b', 'c', 'd', 'e'];
    t.deepEqual(selectionRange(rows, 'a', 'e'), ['a', 'b', 'c', 'd', 'e']);
    t.deepEqual(selectionRange(rows, 'd', 'b'), ['b', 'c', 'd'], 'upwards: list order');
    t.deepEqual(selectionRange(rows, 'c', 'c'), ['c']);
    t.end();
});

test('without an anchor in the list the range is just the clicked row', (t) => {
    t.deepEqual(selectionRange(['a', 'b'], null, 'b'), ['b']);
    t.deepEqual(selectionRange(['a', 'b'], 'gone', 'b'), ['b'], 'anchor deleted meanwhile');
    t.deepEqual(selectionRange(['a', 'b'], 'a', 'x'), [], 'clicked row not in the list');
    t.end();
});

test('visibleRange: hidden rows are skipped; a Shift click on a hidden row selects only that row', (t) => {
    const a = { id: 'a', visible: true };
    const h = { id: 'h', visible: false };
    const b = { id: 'b', visible: true };
    const rows = [a, h, b];
    t.deepEqual(visibleRange(rows, a, b), [a, b], 'hidden row in between skipped');
    t.deepEqual(visibleRange(rows, a, h), [h], 'hidden target alone (never mixed with visible rows)');
    t.deepEqual(visibleRange(rows, h, b), [b], 'hidden anchor skipped');
    t.deepEqual(visibleRange(rows, null, b), [b]);
    t.end();
});
