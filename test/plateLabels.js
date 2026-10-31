import test from 'tape';
import { isPlateLabelShown, plateLabelStep, worldPerPixel } from '../src/app/ui/widgets/CncLaserShared/PrintablePlate/plate-labels';

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
