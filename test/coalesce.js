import test from 'tape';
import { createCoalescer } from '../src/app/lib/coalesce';

// a scheduler under test control: run() runs what is due
const manualScheduler = () => {
    const queue = [];
    const delays = [];
    return {
        schedule: (fn, delay) => {
            queue.push(fn);
            delays.push(delay);
        },
        run: () => queue.splice(0).forEach((fn) => fn()),
        size: () => queue.length,
        delays
    };
};

test('coalesce: calls with the same key run once, the latest function wins', (t) => {
    const scheduler = manualScheduler();
    const coalesce = createCoalescer({ schedule: scheduler.schedule });
    const calls = [];
    coalesce('a', () => calls.push('a1'));
    coalesce('a', () => calls.push('a2'));
    coalesce('a', () => calls.push('a3'));
    t.equal(scheduler.size(), 1, 'scheduled once');
    t.deepEqual(calls, [], 'nothing runs before the scheduler');
    scheduler.run();
    t.deepEqual(calls, ['a3'], 'the latest ran once');
    t.end();
});

test('coalesce: keys are independent and run in the order they were first asked for', (t) => {
    const scheduler = manualScheduler();
    const coalesce = createCoalescer({ schedule: scheduler.schedule });
    const calls = [];
    coalesce('progress', () => calls.push('p1'));
    coalesce('done', () => calls.push('d1'));
    coalesce('progress', () => calls.push('p2'));
    scheduler.run();
    t.deepEqual(calls, ['p2', 'd1']);
    t.end();
});

test('coalesce: a key asked for again after it ran is scheduled again', (t) => {
    const scheduler = manualScheduler();
    const coalesce = createCoalescer({ schedule: scheduler.schedule });
    const calls = [];
    coalesce('a', () => calls.push(1));
    scheduler.run();
    coalesce('a', () => calls.push(2));
    scheduler.run();
    t.deepEqual(calls, [1, 2]);
    t.end();
});

test('coalesce: a failing function does not keep its key blocked', (t) => {
    const scheduler = manualScheduler();
    const coalesce = createCoalescer({ schedule: scheduler.schedule });
    coalesce('a', () => {
        throw new Error('boom');
    });
    t.throws(() => scheduler.run(), /boom/);
    const calls = [];
    coalesce('a', () => calls.push('again'));
    scheduler.run();
    t.deepEqual(calls, ['again']);
    t.end();
});

test('coalesce: the default scheduler runs on a later task', (t) => {
    const coalesce = createCoalescer();
    let runs = 0;
    coalesce('a', () => runs++);
    coalesce('a', () => runs++);
    t.equal(runs, 0, 'not synchronous');
    setTimeout(() => {
        t.equal(runs, 1, 'ran once');
        t.end();
    }, 20);
});

test('coalesce: with a minimum interval the first run is right away, the next ones wait for the interval', (t) => {
    const scheduler = manualScheduler();
    let time = 1000;
    const coalesce = createCoalescer({ schedule: scheduler.schedule, minInterval: 250, now: () => time });
    const calls = [];
    coalesce('a', () => calls.push(1));
    scheduler.run();
    time += 40;
    coalesce('a', () => calls.push(2));
    coalesce('a', () => calls.push(3));
    scheduler.run();
    time += 1000;
    coalesce('a', () => calls.push(4));
    scheduler.run();
    t.deepEqual(scheduler.delays, [0, 210, 0], 'right away, then the rest of the interval, then right away again');
    t.deepEqual(calls, [1, 3, 4]);
    t.end();
});
