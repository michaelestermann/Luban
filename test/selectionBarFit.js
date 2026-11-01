import test from 'tape';
import { BAR_LEVELS, nextBarFit } from '../src/app/ui/widgets/CncLaserShared/selection-bar-fit';

test('nextBarFit: a new selection starts with all buttons in the bar', (t) => {
    t.deepEqual(nextBarFit(null, 'a', 400, 1000), { key: 'a', level: 0, widths: [400] });
    const changed = nextBarFit({ key: 'a', level: 1, widths: [1200, 500] }, 'b', 300, 1000);
    t.deepEqual(changed, { key: 'b', level: 0, widths: [] }, 'another selection is measured again with all buttons');
    t.end();
});

test('nextBarFit: the overflow "⋯" only when the buttons do not fit', (t) => {
    const full = { key: 'a', level: 0, widths: [600] };
    t.equal(nextBarFit(full, 'a', 600, 1000), full, 'fits: unchanged (same object, no re-render)');
    t.equal(nextBarFit(full, 'a', 1000, 1000).level, 0, 'exactly fits');
    const menu = nextBarFit(full, 'a', 1001, 1000);
    t.deepEqual(menu, { key: 'a', level: 1, widths: [1001] }, 'too wide: overflow menu, remembers the full width');
    t.equal(nextBarFit(menu, 'a', 900, 600).level, BAR_LEVELS - 1, 'never past the last level (the bar wraps then)');
    t.end();
});

test('nextBarFit: back to all buttons when the remembered full width fits again', (t) => {
    const menu = { key: 'a', level: 1, widths: [1001, 500] };
    t.equal(nextBarFit(menu, 'a', 500, 1000), menu, 'still too narrow: unchanged');
    t.equal(nextBarFit(menu, 'a', 500, 1001).level, 0, 'wide enough again');
    t.end();
});
