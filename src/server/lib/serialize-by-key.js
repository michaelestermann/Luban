/**
 * Run async jobs one at a time per key; jobs with different keys run in parallel.
 * A failed job rejects only its own caller and does not block later jobs.
 */
const serializeByKey = () => {
    const tails = new Map();

    return (key, job) => {
        const previous = tails.get(key) || Promise.resolve();
        const result = previous.then(job, job);
        const tail = result.catch(() => {});
        tails.set(key, tail);
        tail.then(() => {
            if (tails.get(key) === tail) {
                tails.delete(key);
            }
        });
        return result;
    };
};

export default serializeByKey;
