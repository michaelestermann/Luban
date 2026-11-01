import test from 'tape';
import { isPlateLabelShown, plateAxisLabels, plateLabelStep, worldPerPixel } from '../src/app/ui/widgets/CncLaserShared/PrintablePlate/plate-labels';

test('worldPerPixel gives the size of one screen pixel at a depth of a perspective camera', (t) => {
    // fov 90: the visible height at depth d is 2 d
    t.ok(Math.abs(worldPerPixel(90, 500, 1000) - 1) < 1e-9, '1000 mm visible on 1000 px');
    t.ok(Math.abs(worldPerPixel(90, 250, 1000) - 0.5) < 1e-9, 'half the depth: half the size');
    t.ok(Math.abs(worldPerPixel(45, 700, 800) - (2 * 700 * Math.tan(Math.PI / 8)) / 800) < 1e-9, 'fov 45');
    t.end();
});

test('worldPerPixel falls back to 0 without a usable camera or viewport', (t) => {
    t.equal(worldPerPixel(45, 500, 0), 0, 'no viewport height');
    t.equal(worldPerPixel(45, -10, 800), 0, 'behind the camera');
    t.equal(worldPerPixel(undefined, 500, 800), 0, 'no fov');
    t.end();
});

test('plateLabelStep keeps the 50 mm labels unless they get too close on screen', (t) => {
    t.equal(plateLabelStep(10), 50, 'zoomed in: every 50 mm');
    t.equal(plateLabelStep(1.6), 50, '400 mm workpiece fitted: 80 px apart');
    t.equal(plateLabelStep(1), 100, 'zoomed out: 100 mm');
    t.equal(plateLabelStep(0.2), 500, 'far out: 500 mm');
    t.equal(plateLabelStep(0), 50, 'unknown zoom: every label');
    t.end();
});

test('isPlateLabelShown keeps the multiples of the step', (t) => {
    t.ok(isPlateLabelShown(0, 100));
    t.ok(isPlateLabelShown(-200, 100));
    t.notOk(isPlateLabelShown(150, 100));
    t.ok(isPlateLabelShown(250, 250));
    t.end();
});

test('plateAxisLabels: the axes and labels of the workpiece origin', (t) => {
    // bottom-left workpiece origin, 400 x 300
    const labels = plateAxisLabels({ minX: 0, maxX: 400, minY: 0, maxY: 300 }, null, 50);
    t.deepEqual(labels.axis, { x: 0, y: 0 });
    t.deepEqual(labels.x.map(l => l.value), [50, 100, 150, 200, 250, 300, 350, 400], 'x: 0 is labelled on the Y axis');
    t.deepEqual(labels.y.map(l => l.value), [0, 50, 100, 150, 200, 250, 300]);
    t.ok(labels.x.every(l => l.at === l.value), 'at their value');
    t.equal(labels.top, false, 'X labels below the axis');
    t.equal(labels.right, false, 'Y labels left of the axis');
    const topRight = plateAxisLabels({ minX: -400, maxX: 0, minY: -300, maxY: 0 }, null, 50);
    t.equal(topRight.top, true, 'top origin: X labels above the axis');
    t.equal(topRight.right, true, 'right origin: Y labels right of the axis');
    t.end();
});

test('plateAxisLabels: an object origin moves the axes to its point and counts from it (like the G-code)', (t) => {
    const labels = plateAxisLabels({ minX: 0, maxX: 400, minY: 0, maxY: 400 }, { x: 125.36, y: 126.4 }, 50);
    t.deepEqual(labels.axis, { x: 125.36, y: 126.4 });
    t.deepEqual(labels.x.map(l => l.value), [-100, -50, 50, 100, 150, 200, 250], 'values in the workpiece, relative to the point');
    t.ok(Math.abs(labels.x[0].at - 25.36) < 1e-9, 'placed on the workpiece at point + value');
    t.deepEqual(labels.y.map(l => l.value), [-100, -50, 0, 50, 100, 150, 200, 250]);
    t.ok(Math.abs(labels.y[2].at - 126.4) < 1e-9, '0 at the point');
    t.equal(labels.top, false);
    t.equal(labels.right, false);
    const corner = plateAxisLabels({ minX: 0, maxX: 400, minY: 0, maxY: 400 }, { x: 400, y: 400 }, 50);
    t.equal(corner.top, true, 'a point on the top border: X labels above');
    t.equal(corner.right, true, 'a point on the right border: Y labels right');
    t.end();
});
