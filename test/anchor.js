import { test } from 'tape';
import { anchorName, anchorOffset } from '../src/app/lib/anchor';

const size = { width: 66.5, height: 73.6 };

test('anchorOffset', (t) => {
    const bl = anchorOffset({ x: 'left', y: 'bottom' }, size);
    t.ok(Math.abs(bl.dx + 33.25) < 1e-9 && Math.abs(bl.dy + 36.8) < 1e-9, 'bottom left');
    const c = anchorOffset({ x: 'center', y: 'middle' }, size);
    t.equal(c.dx + 0, 0, 'centre dx');
    t.equal(c.dy + 0, 0, 'centre dy');
    const tr = anchorOffset({ x: 'right', y: 'top' }, size);
    t.ok(Math.abs(tr.dx - 33.25) < 1e-9 && Math.abs(tr.dy - 36.8) < 1e-9, 'top right');
    t.end();
});

test('anchorName', (t) => {
    t.equal(anchorName({ x: 'left', y: 'top' }), 'Top left');
    t.equal(anchorName({ x: 'center', y: 'top' }), 'Top centre');
    t.equal(anchorName({ x: 'center', y: 'middle' }), 'Centre');
    t.equal(anchorName({ x: 'left', y: 'middle' }), 'Middle left');
    t.equal(anchorName({ x: 'right', y: 'bottom' }), 'Bottom right');
    t.end();
});
