import { test } from 'tape';
import { DEFAULT_HELPERS, mergeStoredHelpers } from '../src/app/ui/SVGEditor/rail/helper-defaults';

test('snap is on by default, dimensions off', (t) => {
    const helpers = mergeStoredHelpers({});
    t.equal(helpers.snap.on, true);
    t.equal(helpers.dimensions.on, false);
    t.equal(helpers.snap.gridSize, DEFAULT_HELPERS.snap.gridSize);
    t.end();
});

test('settings stored before snap became default-on get snap switched on once, other values kept', (t) => {
    const helpers = mergeStoredHelpers({ dimensions: { on: true }, snap: { on: false, gridSize: 5, grid: true } });
    t.equal(helpers.snap.on, true, 'the old stored off is the old default, not a choice');
    t.equal(helpers.snap.gridSize, 5);
    t.equal(helpers.snap.grid, true);
    t.equal(helpers.dimensions.on, true);
    t.end();
});

test('a user who switched snap off since keeps it off', (t) => {
    const helpers = mergeStoredHelpers({ version: 2, snap: { on: false } });
    t.equal(helpers.snap.on, false);
    t.end();
});
