/**
 * Answer CORS preflight (OPTIONS) requests with 200, and pass every other
 * request on to the next middleware. Without calling next(), any request
 * reaching this middleware would hang forever with no response.
 */
const optionsFallthrough = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
};

export default optionsFallthrough;
