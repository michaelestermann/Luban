import { test } from 'tape';
import { inLayerOrder, isClosedShape } from '../src/app/ui/SVGEditor/combine/model-outline';
import { selectionActionState } from '../src/app/ui/SVGEditor/combine/selection-actions';

const pathModel = (id, d) => {
    const attrs = { d };
    return { modelID: id, visible: true, elem: { nodeName: 'path', getAttribute: k => attrs[k], setAttribute: (k, v) => { attrs[k] = v; } } };
};
const SQUARE = 'M0 0 L10 0 L10 10 L0 10 Z';
const OPEN = 'M0 0 L10 0 L10 10';

const fakeGroup = (models, selected) => {
    const group = {
        models,
        selectedGroupID: null,
        calls: 0,
        selectedModelArray: selected,
        getSelectedModelArray: () => group.selectedModelArray,
        getModels: () => { group.calls++; return models; },
        getParentGroup: () => null,
    };
    return group;
};

test('inLayerOrder sorts by the layer order', (t) => {
    const a = { id: 'a' }; const b = { id: 'b' }; const c = { id: 'c' };
    t.deepEqual(inLayerOrder([c, a, b], [a, b, c]).map(m => m.id), ['a', 'b', 'c'], 'back to front');
    t.deepEqual(inLayerOrder([b], [a, b, c]).map(m => m.id), ['b'], 'one');
    t.end();
});

test('isClosedShape follows a changed d', (t) => {
    const m = pathModel('p', SQUARE);
    t.equal(isClosedShape(m), true, 'closed');
    t.equal(isClosedShape(m), true, 'cached');
    m.elem.setAttribute('d', OPEN);
    t.equal(isClosedShape(m), false, 'open after the change');
    t.end();
});

test('selectionActionState: combine, offset and array availability', (t) => {
    const a = pathModel('a', SQUARE);
    const b = pathModel('b', SQUARE);
    const o = pathModel('o', OPEN);
    t.deepEqual(selectionActionState(fakeGroup([a, b, o], [b, a]), 1), { combine: true, offset: true, array: true }, 'two closed');
    t.deepEqual(selectionActionState(fakeGroup([a, b, o], [a, o]), 1), { combine: false, offset: true, array: true }, 'one open');
    t.deepEqual(selectionActionState(fakeGroup([a, b, o], [a]), 1), { combine: false, offset: true, array: true }, 'one');
    t.deepEqual(selectionActionState(fakeGroup([a, b, o], []), 1), { combine: false, offset: false, array: false }, 'none');
    t.end();
});

test('selectionActionState is computed once per selection and render', (t) => {
    const models = Array.from({ length: 3000 }, (_, i) => pathModel(`m${i}`, SQUARE));
    const group = fakeGroup(models, models.slice().reverse());
    const start = Date.now();
    const first = selectionActionState(group, 7);
    const calls = group.calls;
    t.equal(selectionActionState(group, 7), first, 'same result object for the same selection and timestamp');
    t.equal(group.calls, calls, 'not computed again');
    t.ok(Date.now() - start < 1500, `3000 objects fast (${Date.now() - start} ms)`);
    selectionActionState(group, 8);
    t.ok(group.calls > calls, 'computed again on a new render');
    const before = group.calls;
    group.selectedModelArray = models.slice(0, 2);
    t.deepEqual(selectionActionState(group, 8), { combine: true, offset: true, array: true }, 'new selection');
    t.ok(group.calls > before, 'computed again for a new selection');
    t.end();
});
