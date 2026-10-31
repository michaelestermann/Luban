// a minimal `document` for modules that create SVG helpers when they are loaded (no DOM is used by the tests)
const stub = () => new Proxy(() => {}, {
    get: (target, key) => (key === Symbol.toPrimitive ? () => '' : stub()),
    apply: () => stub()
});
if (typeof global.document === 'undefined') {
    global.document = stub();
    global.window = global.window || stub();
}
if (typeof global.localStorage === 'undefined') {
    const items = new Map();
    global.localStorage = {
        getItem: (key) => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: (key) => items.delete(key)
    };
}
