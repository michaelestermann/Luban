import { test } from 'tape';
import {
    describeOrigin,
    formatOriginNumber,
    offsetText,
    originLabel,
    originSetToast,
    originTargetName,
    pointName,
    targetLabel,
    workOriginSummary,
    extentText,
    rotatedFrameDegrees,
} from '../src/app/ui/SVGEditor/origin/origin-labels';
import { createObjectOrigin } from '../src/app/lib/object-origin';
import { createFreeOrigin, createGroupOrigin, createWorkpieceFrameOrigin, withOffset, workpieceOrigin } from '../src/app/lib/work-origin';

const interpolate = (s, o = {}) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in o ? String(o[k]) : m));
const t = (k, o) => interpolate(k.replace(/^key-[^-]+-/, ''), o);
const names = { logo: 'Logo', text: 'Text', g: 'Badge' };
const ctx = { getName: (id) => names[id] || null };

test('formatOriginNumber', (tt) => {
    tt.equal(formatOriginNumber(70), '70.0');
    tt.equal(formatOriginNumber(-5), '\u22125.0');
    tt.equal(formatOriginNumber(-0.04), '0.0');
    tt.equal(formatOriginNumber(140.06), '140.1');
    tt.end();
});

test('originLabel', (tt) => {
    tt.equal(originLabel('Logo', 'bottom left', { x: 70, y: 140 }), 'Logo · bottom left  X 70.0 Y 140.0');
    tt.equal(originLabel('Free', null, { x: 112.4, y: 96 }), 'Free  X 112.4 Y 96.0');
    tt.equal(originLabel('Logo', 'bottom left', null), 'Logo · bottom left');
    tt.end();
});

test('originTargetName', (tt) => {
    tt.equal(originTargetName('group', 'Badge', t), 'Group “Badge”');
    tt.equal(originTargetName('selection', null, t), 'Selection');
    tt.equal(originTargetName('workpiece', null, t), 'Workpiece');
    tt.equal(originTargetName('object', 'Logo', t), 'Logo');
    tt.equal(originTargetName('free', null, t), 'Free');
    tt.equal(pointName('top-center', t), 'top centre');
    tt.end();
});

test('offsetText', (tt) => {
    tt.equal(offsetText({ x: 5, y: 0 }), '5.0 / 0.0');
    tt.end();
});

test('originSetToast', (tt) => {
    tt.equal(originSetToast('Logo · bottom left', null, false, t), 'Origin set on Logo · bottom left');
    tt.equal(originSetToast('Logo · bottom left', { x: 5, y: 0 }, false, t), 'Origin set on Logo · bottom left · Offset 5.0 / 0.0 removed');
    tt.end();
});

test('describeOrigin', (tt) => {
    tt.deepEqual(describeOrigin(createObjectOrigin('bottom-left', ['logo']), ctx, t), { name: 'Logo', pointName: 'bottom left', label: 'Logo · bottom left' });
    tt.equal(describeOrigin(createObjectOrigin('center', ['logo', 'text']), ctx, t).name, 'Selection');
    tt.equal(describeOrigin(createGroupOrigin('top-right', 'g', ['logo', 'text']), ctx, t).name, 'Group “Badge”');
    const wf = describeOrigin(createWorkpieceFrameOrigin('top-right'), ctx, t);
    tt.deepEqual([wf.name, wf.pointName], ['Workpiece', 'top right']);
    const w = describeOrigin(workpieceOrigin('bottom-left'), ctx, t);
    tt.deepEqual([w.name, w.pointName], ['Workpiece', 'bottom left']);
    const f = describeOrigin(createFreeOrigin('bottom-left', { x: 5, y: 0 }), ctx, t);
    tt.deepEqual([f.name, f.pointName, f.label], ['Free', null, 'Free']);
    tt.equal(describeOrigin(createObjectOrigin('center', []), ctx, t).name, 'All objects');
    tt.equal(describeOrigin(createObjectOrigin('center', ['gone']), ctx, t).name, 'Selection', 'unknown single id: no name');
    tt.end();
});

test('targetLabel: names the kind of the target', (tt) => {
    const target = (source, name, reference, point) => ({ point, reference, source, rank: 0, name });
    tt.equal(targetLabel(target({ kind: 'object', modelID: 'p' }, 'Plate', 'bottom-center', { x: 205, y: 40 }), t), 'Plate · bottom centre  X 205.0 Y 40.0');
    tt.equal(targetLabel(target({ kind: 'selection', modelIDs: [] }, '', 'bottom-left', { x: 70, y: 140 }), t), 'Selection · bottom left  X 70.0 Y 140.0');
    tt.equal(targetLabel(target({ kind: 'group', groupID: 'g' }, 'Badge', 'top-right', { x: 300, y: 240 }), t, false), 'Group “Badge” · top right');
    tt.equal(targetLabel(target({ kind: 'workpiece' }, '', 'center', { x: 200, y: 150 }), t, false), 'Workpiece · centre');
    tt.end();
});

test('workOriginSummary', (tt) => {
    const o = withOffset(createObjectOrigin('bottom-left', ['logo']), { x: 5, y: 0 });
    tt.deepEqual(workOriginSummary(o, ctx, { x: 75, y: 140 }, t),
        ['Logo · bottom left', 'At X 75.0 · Y 140.0 mm on the workpiece', 'Offset 5.0 / 0.0 mm · follows the object']);
    const free = workOriginSummary(createFreeOrigin('bottom-left', { x: 12.5, y: -3 }), ctx, { x: 12.5, y: -3 }, t);
    tt.equal(free[0], 'Free');
    tt.ok(free[2].endsWith('· fixed'), free[2]);
    tt.deepEqual(workOriginSummary(workpieceOrigin('bottom-left'), ctx, null, t),
        ['Workpiece · bottom left', 'At X 0.0 · Y 0.0 mm on the workpiece', 'Offset 0.0 / 0.0 mm · fixed']);
    tt.end();
});

test('extentText', (tt) => {
    tt.equal(extentText({ minX: -5, maxX: 290, minY: -100, maxY: 100 }), 'X −5.0 … 290.0 · Y −100.0 … 100.0');
    tt.end();
});

test('originSetToast outside', (tt) => {
    tt.equal(originSetToast('Logo · bottom left', null, true, t), 'Origin set on Logo · bottom left · Origin outside the workpiece');
    tt.end();
});

test('rotatedFrameDegrees', (tt) => {
    const rad = d => (d * Math.PI) / 180;
    tt.equal(rotatedFrameDegrees(rad(20)), 20);
    tt.equal(rotatedFrameDegrees(rad(-20)), -20);
    tt.equal(rotatedFrameDegrees(rad(360)), null);
    tt.equal(rotatedFrameDegrees(1e-9), null);
    tt.equal(rotatedFrameDegrees(undefined), null);
    tt.equal(rotatedFrameDegrees(rad(190)), -170);
    tt.end();
});
