import { test } from 'tape';
import { originMarkerShown } from '../src/app/ui/SVGEditor/origin/origin-marker-shown';

test('originMarkerShown: the marker in step 1, the plain canvas dot everywhere else', (t) => {
    t.equal(originMarkerShown('editor', 0), true, 'workpiece origin in Design: marker');
    t.equal(originMarkerShown('editor', 1), true, 'object origin in Design: marker');
    t.equal(originMarkerShown('process', 1), false, 'Toolpaths step: no marker, so the canvas dot must show');
    t.equal(originMarkerShown('editor', 2), false, 'locking block: its own picture, no marker');
    t.equal(originMarkerShown('editor', undefined), false, 'no origin: nothing');
    t.end();
});
