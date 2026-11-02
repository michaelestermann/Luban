import test from 'tape';
import {
    MARKER_MIN_DIAMETER,
    MARKER_MIN_SIZE,
    TINY_IMAGE_SIZE,
    svgImageFit,
    smallObjectMarkers
} from '../src/app/lib/small-objects';

test('svgImageFit: a tiny SVG image box is stretched (it is not drawn when fitted)', (t) => {
    // a 0.2 mm drill hole of a decomposed PCB file
    t.equal(svgImageFit(0.2, 0.2), 'none');
    t.equal(svgImageFit(0.20000076293945312, 0.20000076293945312), 'none');
    // one side tiny is enough
    t.equal(svgImageFit(25, 0.4), 'none');
    t.equal(svgImageFit(-0.2, 0.2), 'none', 'a flipped size counts by its amount');
    t.end();
});

test('svgImageFit: a normal SVG image keeps the default fit', (t) => {
    t.equal(svgImageFit(66.5, 73.6), null);
    t.equal(svgImageFit(TINY_IMAGE_SIZE, TINY_IMAGE_SIZE), null, 'the limit itself is not tiny');
    t.equal(svgImageFit(0, 10), null, 'no size: nothing to fit');
    t.equal(svgImageFit(NaN, 0.2), null);
    t.equal(svgImageFit(undefined, undefined), null);
    t.end();
});

test('smallObjectMarkers: objects smaller than the minimum on the screen get an outline of their size', (t) => {
    const markers = smallObjectMarkers([
        { x: 100, y: 200, width: 3, height: 2.5 }
    ]);
    t.deepEqual(markers, [{ index: 0, x: 101.5, y: 201.25, rx: 1.5, ry: 1.25 }], 'the true size at the centre');
    t.end();
});

test('smallObjectMarkers: the outline is never smaller than the minimum diameter', (t) => {
    t.equal(MARKER_MIN_DIAMETER, 2);
    const markers = smallObjectMarkers([
        // a 0.2 mm hole at the overview zoom
        { x: 100, y: 200, width: 0.27, height: 0.27 },
        { x: 10, y: 20, width: 3, height: 0.5 }
    ]);
    t.deepEqual(markers, [
        { index: 0, x: 100.135, y: 200.135, rx: 1, ry: 1 },
        { index: 1, x: 11.5, y: 20.25, rx: 1.5, ry: 1 }
    ]);
    t.end();
});

test('smallObjectMarkers: objects that show by themselves get none', (t) => {
    const markers = smallObjectMarkers([
        { x: 0, y: 0, width: MARKER_MIN_SIZE, height: 1 },
        { x: 0, y: 0, width: 200, height: 0 },
        { x: 0, y: 0, width: 50, height: 60 }
    ]);
    t.deepEqual(markers, [], 'one side at the minimum or more is visible (a line, a frame)');
    t.end();
});

test('smallObjectMarkers: skips missing boxes and keeps the input index', (t) => {
    const markers = smallObjectMarkers([null, { x: 1, y: 1, width: 0, height: 0 }, undefined, { x: 4, y: 4, width: 1, height: 1 }]);
    t.deepEqual(markers.map(({ index, x, y }) => ({ index, x, y })), [{ index: 1, x: 1, y: 1 }, { index: 3, x: 4.5, y: 4.5 }]);
    t.end();
});

test('smallObjectMarkers: a custom minimum size', (t) => {
    t.equal(smallObjectMarkers([{ x: 0, y: 0, width: 5, height: 5 }], 6).length, 1);
    t.equal(smallObjectMarkers([{ x: 0, y: 0, width: 5, height: 5 }], 5).length, 0);
    t.end();
});
