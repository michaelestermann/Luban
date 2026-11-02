import { test } from 'tape';
import { originImage } from '../src/app/lib/origin-image';

test('originImage: the Job Setup picture exists for every origin point', (t) => {
    t.equal(originImage('bottom-left'), '/resources/images/cnc-laser/working-origin-3-bottom-left.png');
    t.equal(originImage('center'), '/resources/images/cnc-laser/working-origin-3-center.png');
    t.equal(originImage('top-right'), '/resources/images/cnc-laser/working-origin-3-top-right.png');
    // the mid-edge points of an object origin have no picture of their own (a missing file crashed the app)
    t.equal(originImage('center-left'), '/resources/images/cnc-laser/working-origin-3.png');
    t.equal(originImage('top-center'), '/resources/images/cnc-laser/working-origin-3.png');
    t.equal(originImage(undefined), '/resources/images/cnc-laser/working-origin-3.png');
    t.end();
});
