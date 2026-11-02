import { test } from 'tape';
import { isBoxSelecting } from '../src/app/ui/SVGEditor/box-select';

test('isBoxSelecting: only a box started by a mousedown on the empty canvas follows the pointer', (t) => {
    t.equal(isBoxSelecting({ mode: 'select', leftButton: true, editing: false, selectorVisible: true }), true);
    // a drag that started elsewhere (origin marker, object list) crosses the canvas with the button held
    t.equal(isBoxSelecting({ mode: 'select', leftButton: true, editing: false, selectorVisible: false }), false);
    t.equal(isBoxSelecting({ mode: 'select', leftButton: false, editing: false, selectorVisible: true }), false);
    t.equal(isBoxSelecting({ mode: 'select', leftButton: true, editing: true, selectorVisible: true }), false);
    t.equal(isBoxSelecting({ mode: 'move', leftButton: true, editing: false, selectorVisible: true }), false);
    t.end();
});
