import test from 'tape';
import { BAR_LEVELS, nextBarFit } from '../src/app/ui/widgets/CncLaserShared/selection-bar-fit';

test('nextBarFit: a new selection starts with the labelled buttons', (t) => {
    t.deepEqual(nextBarFit(null, 'a', 400, 1000), { key: 'a', level: 0, widths: [400] });
    const changed = nextBarFit({ key: 'a', level: 2, widths: [1200, 900, 500] }, 'b', 300, 1000);
    t.deepEqual(changed, { key: 'b', level: 0, widths: [] }, 'another selection is measured again with labels');
    t.end();
});

test('nextBarFit: labels, then icons only, then the overflow "⋯", one step per measurement', (t) => {
    const full = { key: 'a', level: 0, widths: [600] };
    t.equal(nextBarFit(full, 'a', 600, 1000), full, 'fits: unchanged (same object, no re-render)');
    t.equal(nextBarFit(full, 'a', 1000, 1000).level, 0, 'exactly fits');
    const icons = nextBarFit(full, 'a', 1001, 1000);
    t.deepEqual(icons, { key: 'a', level: 1, widths: [1001] }, 'too wide: icons only, remembers the labelled width');
    t.equal(nextBarFit(icons, 'a', 800, 1000).level, 1, 'icons fit: stays');
    const menu = nextBarFit(icons, 'a', 800, 700);
    t.deepEqual(menu, { key: 'a', level: 2, widths: [1001, 800] }, 'icons too wide: overflow menu');
    t.equal(nextBarFit(menu, 'a', 900, 600).level, BAR_LEVELS - 1, 'never past the last level (the bar wraps then)');
    t.end();
});

test('nextBarFit: back one step when the remembered wider layout fits again', (t) => {
    const menu = { key: 'a', level: 2, widths: [1001, 800, 500] };
    t.equal(nextBarFit(menu, 'a', 500, 799), menu, 'still too narrow: unchanged');
    const icons = nextBarFit(menu, 'a', 500, 800);
    t.equal(icons.level, 1, 'icons fit again');
    t.equal(nextBarFit(icons, 'a', 800, 1001).level, 0, 'labels fit again');
    t.end();
});
