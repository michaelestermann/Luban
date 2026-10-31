import test from 'tape';
import { axisLabelValues, chooseMinorStep, chooseStep, formatTick, multiplesInRange } from '../src/app/scene2d/ruler-ticks';

test('chooseStep picks the smallest nice step that is at least minPx apart on screen', (t) => {
    t.equal(chooseStep(2.72, 60), 25, '400 mm workpiece fitted: 25 mm (68 px)');
    t.equal(chooseStep(10.87, 60), 10, '100 mm workpiece fitted: 10 mm (109 px)');
    t.equal(chooseStep(36, 60), 2, '30 mm workpiece fitted: 2 mm (72 px)');
    t.equal(chooseStep(60, 60), 1, 'exactly minPx counts');
    t.equal(chooseStep(1, 60), 100, 'zoomed out: 100 mm');
    t.equal(chooseStep(0.1, 60), 1000, 'far out: 1000 mm');
    t.equal(chooseStep(400, 60), 0.2, 'far in: below 1 mm');
    t.end();
});

test('chooseStep only returns steps from the nice sequence', (t) => {
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
    for (let px = 0.05; px < 1000; px *= 1.37) {
        const s = chooseStep(px, 60);
        t.ok(nice.includes(s), `step ${s} for ${px.toFixed(2)} px/mm is nice`);
        t.ok(s * px >= 60 - 1e-9 || s === 10000, 'spacing reaches the minimum');
    }
    t.end();
});

test('chooseMinorStep: smallest nice divisor of the major step that stays >= minPx', (t) => {
    t.equal(chooseMinorStep(2.72, 25, 8), 5, '400 mm: 5 mm (13.6 px)');
    t.equal(chooseMinorStep(10.87, 10, 8), 1, '100 mm: 1 mm (10.9 px)');
    t.equal(chooseMinorStep(36, 2, 8), 0.5, '30 mm: 0.5 mm (18 px)');
    t.equal(chooseMinorStep(5, 20, 8), 2, '2 mm = 10 px divides 20');
    t.equal(chooseMinorStep(1, 100, 8), 10, 'zoomed out: 10 mm');
    t.equal(chooseMinorStep(1, 25, 30), 25, 'no divisor is wide enough: falls back to the major step');
    t.end();
});

test('multiplesInRange lists the step multiples inside a range, robust to float noise', (t) => {
    t.deepEqual(multiplesInRange(0, 100, 25), [0, 25, 50, 75, 100]);
    t.deepEqual(multiplesInRange(-50, 50, 20), [-40, -20, 0, 20, 40]);
    t.deepEqual(multiplesInRange(0, 0.3, 0.1), [0, 0.1, 0.2, 0.3]);
    t.deepEqual(multiplesInRange(-100, 0, 50), [-100, -50, 0]);
    t.deepEqual(multiplesInRange(3, 4, 5), []);
    t.end();
});

test('axisLabelValues: labels at every step plus both axis ends', (t) => {
    t.deepEqual(axisLabelValues(0, 100, 10, 10.87, 36), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 'end already a multiple');
    t.deepEqual(axisLabelValues(0, 105, 10, 10.87, 36), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 105], '105 is 54 px from 100: both kept');
    t.deepEqual(axisLabelValues(0, 102, 10, 10.87, 36), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 102], '102 is 22 px from 100: the end wins');
    t.end();
});

test('axisLabelValues: centred and negative ranges keep both ends', (t) => {
    t.deepEqual(axisLabelValues(-50, 50, 25, 2.72, 36), [-50, -25, 0, 25, 50]);
    t.deepEqual(axisLabelValues(-52.5, 52.5, 25, 2.72, 36), [-52.5, -25, 0, 25, 52.5], '-50 and 50 are only 6.8 px from the ends');
    t.deepEqual(axisLabelValues(-100, 0, 50, 2, 36), [-100, -50, 0], 'right/top origin: negative values');
    t.end();
});

test('axisLabelValues: tiny or empty ranges', (t) => {
    t.deepEqual(axisLabelValues(0, 0, 10, 10, 36), [0], 'zero length: one label');
    t.deepEqual(axisLabelValues(0, 3, 10, 10, 36), [0, 3], 'shorter than a step: just the ends');
    t.deepEqual(axisLabelValues(0, 1, 10, 10, 36), [0, 1], 'ends closer than the gap are both kept');
    t.end();
});

test('formatTick rounds to two decimals without trailing zeros or -0', (t) => {
    t.equal(formatTick(25), '25');
    t.equal(formatTick(52.5), '52.5');
    t.equal(formatTick(0.30000000000000004), '0.3');
    t.equal(formatTick(-0), '0');
    t.equal(formatTick(-0.0001), '0');
    t.equal(formatTick(-12.346), '-12.35');
    t.end();
});
