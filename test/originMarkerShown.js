import { test } from 'tape';
import { originAxesShown, originMarkerShown } from '../src/app/ui/SVGEditor/origin/origin-marker-shown';

test('originMarkerShown: the marker in step 1, the plain canvas dot everywhere else', (t) => {
    t.equal(originMarkerShown('editor', 0), true, 'workpiece origin in Design: marker');
    t.equal(originMarkerShown('editor', 1), true, 'object origin in Design: marker');
    t.equal(originMarkerShown('process', 1), false, 'Toolpaths step: no marker, so the canvas dot must show');
    t.equal(originMarkerShown('editor', 2), false, 'locking block: its own picture, no marker');
    t.equal(originMarkerShown('editor', undefined), false, 'no origin: nothing');
    t.end();
});

test('originAxesShown: the X / Y arrows only while the origin is edited (or the marker is hovered)', (t) => {
    const idle = { dragging: false, previewing: false, picking: false, dialogOpen: false, hovered: false };
    t.equal(originAxesShown(idle), false, 'idle: the plain dot only');
    t.equal(originAxesShown({ ...idle, dragging: true }), true, 'dragging the marker');
    t.equal(originAxesShown({ ...idle, previewing: true }), true, 'a preview (pick hover, dialog ghost)');
    t.equal(originAxesShown({ ...idle, picking: true }), true, 'pick mode (⊕ / key 0)');
    t.equal(originAxesShown({ ...idle, dialogOpen: true }), true, 'the origin dialog is open');
    t.equal(originAxesShown({ ...idle, hovered: true }), true, 'hover: shows that the marker can be dragged');
    t.equal(originAxesShown({ ...idle, hovered: true, locked: true }), false, 'drawing / measuring / point editing: never');
    t.equal(originAxesShown({ ...idle, dialogOpen: true, locked: true }), false);
    t.end();
});
