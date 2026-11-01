import log from '../log';

type Subscribable<T> = {
    subscribe(observer: {
        next: (value: T) => void;
        error: (err: unknown) => void;
        complete: () => void;
    }): { unsubscribe(): void };
};

export type WorkerTaskHandlers<T> = {
    onMessage?: (payload: T) => void;
    onComplete?: () => void;
    onError?: (err: unknown) => void;
};

/**
 * Run one worker job to its end. Resolves when the job completes or fails, so a
 * failing job never keeps its pool slot (a pool with all slots taken by jobs that
 * never end queues every later job forever).
 */
export const runWorkerTask = async <T>(observable: Subscribable<T>, { onMessage, onComplete, onError }: WorkerTaskHandlers<T>): Promise<void> => {
    return new Promise<void>((resolve) => {
        let subscription: { unsubscribe(): void } | null = null;
        let finished = false;
        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            // completes synchronously inside subscribe(): unsubscribe after it returned
            Promise.resolve().then(() => subscription && subscription.unsubscribe());
            onComplete && onComplete();
            resolve();
        };
        subscription = observable.subscribe({
            next: (payload: T) => {
                onMessage && onMessage(payload);
            },
            error: (err: unknown) => {
                if (onError) {
                    onError(err);
                } else {
                    log.error('Worker task failed', err);
                }
                finish();
            },
            complete: finish
        });
    });
};

/**
 * How long a pool worker may take to load and start (ms). The library default is 10 s, but the
 * worker script is large and can take longer to load while the app is busy; a worker that
 * misses it never starts, and every job given to it fails.
 */
export const WORKER_START_TIMEOUT = 120000;

/** Whether a pool job failed because its worker never started (the pool must be replaced). */
export const isWorkerStartFailure = (err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err ?? '');
    return /init message|before initialization/i.test(message);
};
