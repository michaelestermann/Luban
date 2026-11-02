import { test } from 'tape';
import { createToastClearance } from '../src/app/lib/toast-clearance';

test('toast clearance: the class stays while any canvas bar is shown', (t) => {
    const classes = new Set();
    const target = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } };
    const clearance = createToastClearance(() => target);
    const a = clearance.claim();
    t.ok(classes.has('toasts-below-canvas-bar'), 'first bar adds the class');
    const b = clearance.claim();
    a();
    t.ok(classes.has('toasts-below-canvas-bar'), 'kept while another bar is shown');
    a();
    t.ok(classes.has('toasts-below-canvas-bar'), 'a second release of the same claim does nothing');
    b();
    t.notOk(classes.has('toasts-below-canvas-bar'), 'removed with the last bar');
    t.end();
});
