/**
 * Last handlers of the express app.
 *
 * Express tells normal middleware and error handlers apart by their number of arguments:
 * only a function with exactly four arguments (err, req, res, next) receives errors.
 * A three-argument function is called as (req, res, next), so it must not take `err`.
 */

/**
 * Answers every request that no route handled with 404.
 */
export const notFound = (req, res) => {
    res.status(404).send({ msg: 'Not found' });
};

/**
 * Answers a request that failed with an error with 500 (or the error's own 4xx/5xx status).
 */
export const createErrorHandler = (log) => (err, req, res, next) => {
    log.error(err);
    if (res.headersSent) {
        // the response is already on its way, let express close the connection
        next(err);
        return;
    }
    const status = Number(err && (err.status || err.statusCode));
    res.status(status >= 400 && status < 600 ? status : 500).send({ error: err && err.message });
};
