/**
 * Coalesce work that many events in a row ask for (for example one re-render per finished server task):
 * the function given for a key runs once on a later task, the latest one given for that key wins.
 * With a minimum interval, a key runs at most once per interval (the first time right away).
 */
type Run = () => void;
export type Coalesce = (key: string, fn: Run) => void;
export type Schedule = (run: Run, delay: number) => void;

const timeout: Schedule = (run, delay) => {
    setTimeout(run, delay);
};

export function createCoalescer(
    { schedule = timeout, minInterval = 0, now = Date.now }: { schedule?: Schedule; minInterval?: number; now?: () => number } = {}
): Coalesce {
    const pending = new Map<string, Run>();
    const lastRun = new Map<string, number>();
    return (key, fn) => {
        const scheduled = pending.has(key);
        pending.set(key, fn);
        if (scheduled) {
            return;
        }
        const last = lastRun.get(key);
        const delay = last === undefined ? 0 : Math.max(0, last + minInterval - now());
        schedule(() => {
            const latest = pending.get(key);
            pending.delete(key);
            lastRun.set(key, now());
            latest();
        }, delay);
    };
}
