import { test } from 'tape';
import { LruCache, toleranceBucket } from '../src/app/ui/SVGEditor/combine/outline-cache';

test('toleranceBucket: a power of two, never coarser than asked', (t) => {
    for (const tol of [0.001, 0.0123, 0.05, 0.1, 0.11, 0.3, 1]) {
        const b = toleranceBucket(tol);
        t.ok(b <= tol && b > tol / 2, `${tol} -> ${b}`);
        t.equal(Math.log2(b) % 1, 0, 'power of two');
    }
    t.equal(toleranceBucket(0.1), toleranceBucket(0.12), 'close sizes share a bucket');
    t.end();
});

test('LruCache keeps the most recently used entries', (t) => {
    const cache = new LruCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    t.equal(cache.get('a'), 1, 'a used again');
    cache.set('d', 4);
    t.equal(cache.has('b'), false, 'least recently used dropped');
    t.deepEqual(['a', 'c', 'd'].map(k => cache.get(k)), [1, 3, 4], 'others kept');
    t.equal(cache.size, 3, 'bounded');
    cache.set('c', 30);
    t.equal(cache.get('c'), 30, 'replaced');
    t.equal(cache.size, 3);
    t.end();
});
