import { test } from 'tape';
import { originHeaderLines } from '../src/server/lib/gcode-origin-header';

test('originHeaderLines: origin line and, with an offset, the offset line', (t) => {
    t.equal(originHeaderLines({ origin: 'object-bottom-left', originOffset: '5.0,0.0' }), ';origin: object-bottom-left\n;origin_offset(mm): 5.0,0.0\n');
    t.equal(originHeaderLines({ origin: 'object-bottom-left' }), ';origin: object-bottom-left\n');
    t.equal(originHeaderLines({ origin: 'bottom-left', originOffset: null }), ';origin: bottom-left\n');
    t.end();
});
