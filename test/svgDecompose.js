import test from 'tape';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
    splitOneLevel,
    reframePart,
    computePartTransformation,
    readFrame,
    canDecompose,
    canDecomposeSelection
} from '../src/app/lib/svg-decompose';

const deps = {
    parser: new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } }),
    serializer: new XMLSerializer()
};

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50">';

const parse = (text) => deps.parser.parseFromString(text, 'image/svg+xml').documentElement;

const elementChildren = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);

// Descend through the part's wrapper <g>s down to the single content element.
const contentChain = (part) => {
    const root = parse(part);
    const chain = [];
    let level = elementChildren(root).filter((n) => !['defs', 'style'].includes(n.nodeName));
    while (level.length === 1) {
        chain.push(level[0]);
        level = elementChildren(level[0]);
    }
    return chain;
};

test('svgDecompose: two top-level groups -> 2 parts', (t) => {
    const svg = `${SVG_OPEN}<g id="a"><rect x="0" y="0" width="5" height="5"/><circle cx="1" cy="1" r="1"/></g>`
        + '<g id="b"><path d="M0 0L10 10"/></g></svg>';
    const { parts, canSplit } = splitOneLevel(svg, deps);
    t.equal(canSplit, true, 'can split');
    t.equal(parts.length, 2, 'two parts');
    t.equal(contentChain(parts[0])[0].getAttribute('id'), 'a', 'first part is group a (document order)');
    t.equal(contentChain(parts[1])[0].getAttribute('id'), 'b', 'second part is group b');
    t.equal(parse(parts[0]).getAttribute('viewBox'), '0 0 100 50', 'part keeps the source viewBox');
    t.end();
});

test('svgDecompose: single wrapper g with 3 children -> 3 parts, wrapper transform kept', (t) => {
    const svg = `${SVG_OPEN}<g transform="translate(10,20)"><rect id="r" width="5" height="5"/>`
        + '<circle id="c" cx="1" cy="1" r="1"/><path id="p" d="M0 0L1 1"/></g></svg>';
    const { parts, canSplit } = splitOneLevel(svg, deps);
    t.equal(canSplit, true, 'can split');
    t.equal(parts.length, 3, 'three parts (wrapper skipped)');
    ['r', 'c', 'p'].forEach((id, i) => {
        const chain = contentChain(parts[i]);
        t.equal(chain[0].nodeName, 'g', `part ${i} is wrapped in a g`);
        t.equal(chain[0].getAttribute('transform'), 'translate(10,20)', `part ${i} keeps wrapper transform`);
        t.equal(chain[chain.length - 1].getAttribute('id'), id, `part ${i} content is ${id}`);
    });
    t.end();
});

test('svgDecompose: nested wrappers are all skipped and all transforms kept', (t) => {
    const svg = `${SVG_OPEN}<g transform="scale(2)"><g transform="translate(1,1)"><rect id="r1" width="1" height="1"/>`
        + '<rect id="r2" width="1" height="1"/></g></g></svg>';
    const { parts } = splitOneLevel(svg, deps);
    t.equal(parts.length, 2, 'two parts');
    const chain = contentChain(parts[1]);
    t.deepEqual(chain.map((n) => n.getAttribute('transform')).slice(0, 2), ['scale(2)', 'translate(1,1)'], 'outer to inner transforms');
    t.equal(chain[2].getAttribute('id'), 'r2', 'content is r2');
    t.end();
});

test('svgDecompose: single path -> canSplit false', (t) => {
    const svg = `${SVG_OPEN}<path d="M0 0L10 10 L 5 5Z M1 1 L2 2Z"/></svg>`;
    const { parts, canSplit } = splitOneLevel(svg, deps);
    t.equal(canSplit, false, 'cannot split');
    t.equal(parts.length, 1, 'only one part');
    t.end();
});

test('svgDecompose: wrapper g with a single child -> canSplit false', (t) => {
    const svg = `${SVG_OPEN}<g><g><path d="M0 0L1 1"/></g></g></svg>`;
    t.equal(splitOneLevel(svg, deps).canSplit, false, 'cannot split');
    t.end();
});

test('svgDecompose: defs and style copied into every part', (t) => {
    const svg = `${SVG_OPEN}<defs><linearGradient id="grad"/></defs><style>.cls{fill:red}</style>`
        + '<title>t</title><metadata>m</metadata>'
        + '<rect class="cls" width="1" height="1"/><use href="#grad" x="2"/></svg>';
    const { parts } = splitOneLevel(svg, deps);
    t.equal(parts.length, 2, 'two parts (defs/style/title/metadata are not parts)');
    parts.forEach((part, i) => {
        const root = parse(part);
        const names = elementChildren(root).map((n) => n.nodeName);
        t.ok(names.includes('defs'), `part ${i} has defs`);
        t.ok(names.includes('style'), `part ${i} has style`);
        t.notOk(names.includes('title'), `part ${i} has no title`);
        t.ok(part.includes('linearGradient'), `part ${i} carries the gradient`);
        t.ok(part.includes('.cls{fill:red}'), `part ${i} carries the css`);
    });
    t.end();
});

test('svgDecompose: fill inherited from parent g kept', (t) => {
    const svg = `${SVG_OPEN}<g fill="red" stroke="blue" style="stroke-width:2"><rect id="r" width="1" height="1"/>`
        + '<circle id="c" r="1"/></g></svg>';
    const { parts } = splitOneLevel(svg, deps);
    t.equal(parts.length, 2, 'two parts');
    parts.forEach((part, i) => {
        const wrapper = contentChain(part)[0];
        t.equal(wrapper.getAttribute('fill'), 'red', `part ${i} keeps inherited fill`);
        t.equal(wrapper.getAttribute('stroke'), 'blue', `part ${i} keeps inherited stroke`);
        t.equal(wrapper.getAttribute('style'), 'stroke-width:2', `part ${i} keeps inherited style`);
    });
    t.end();
});

test('svgDecompose: root presentation attributes are kept on each part root', (t) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="green">'
        + '<rect width="1" height="1"/><rect x="2" width="1" height="1"/></svg>';
    const { parts } = splitOneLevel(svg, deps);
    t.equal(parse(parts[0]).getAttribute('fill'), 'green', 'root fill kept');
    t.end();
});

test('svgDecompose: display="none" child and empty groups skipped', (t) => {
    const svg = `${SVG_OPEN}<rect id="a" width="1" height="1"/><rect id="hidden" display="none" width="1" height="1"/>`
        + '<rect id="hidden2" style="fill:red; display : none" width="1" height="1"/><g id="empty"></g>'
        + '<g id="emptyNested"><g/><title>x</title></g><path id="noD"/><circle id="b" r="1"/></svg>';
    const { parts, canSplit } = splitOneLevel(svg, deps);
    t.equal(canSplit, true, 'can split');
    t.deepEqual(parts.map((p) => contentChain(p)[0].getAttribute('id')), ['a', 'b'], 'only visible parts with geometry');
    t.end();
});

test('svgDecompose: part of a part is splittable again (g stays g)', (t) => {
    const svg = `${SVG_OPEN}<g id="outer1" fill="red"><rect id="r1" width="1" height="1"/><rect id="r2" x="3" width="1" height="1"/></g>`
        + '<g id="outer2"><circle id="c" r="1"/></g></svg>';
    const first = splitOneLevel(svg, deps);
    t.equal(first.parts.length, 2, 'first level: 2 parts');
    t.equal(contentChain(first.parts[0])[0].nodeName, 'g', 'the part is still a g');

    const second = splitOneLevel(first.parts[0], deps);
    t.equal(second.canSplit, true, 'part is splittable again');
    t.deepEqual(second.parts.map((p) => contentChain(p).pop().getAttribute('id')), ['r1', 'r2'], 'children of the group');
    t.equal(contentChain(second.parts[1])[0].getAttribute('fill'), 'red', 'group fill carried to its children');

    t.equal(splitOneLevel(first.parts[1], deps).canSplit, false, 'group with one leaf cannot be split');
    t.end();
});

test('svgDecompose: namespaced root (svg:svg) and unknown elements', (t) => {
    const svg = '<svg:svg xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
        + '<sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"/>'
        + '<svg:rect width="1" height="1"/><svg:rect x="2" width="1" height="1"/></svg:svg>';
    const { parts, canSplit } = splitOneLevel(svg, deps);
    t.equal(canSplit, true, 'can split');
    t.equal(parts.length, 2, 'unknown elements are not parts');
    t.end();
});

test('svgDecompose: invalid input -> canSplit false', (t) => {
    t.equal(splitOneLevel('not svg', deps).canSplit, false, 'garbage');
    t.equal(splitOneLevel('', deps).canSplit, false, 'empty');
    t.end();
});

test('svgDecompose: reframePart sets a tight viewBox and size', (t) => {
    const part = `${SVG_OPEN}<rect x="10" y="5" width="20" height="8"/></svg>`;
    const root = parse(reframePart(part, { x: 10, y: 5, width: 20, height: 8 }, deps));
    t.equal(root.getAttribute('viewBox'), '10 5 20 8', 'viewBox is the bbox');
    t.equal(root.getAttribute('width'), '20', 'width');
    t.equal(root.getAttribute('height'), '8', 'height');
    t.equal(root.getAttribute('preserveAspectRatio'), 'none', 'stretches exactly');
    t.end();
});

test('svgDecompose: readFrame reads viewBox and aspect ratio mode', (t) => {
    t.deepEqual(readFrame(`${SVG_OPEN}</svg>`, deps), { viewBox: [0, 0, 100, 50], preserveAspectRatio: null }, 'viewBox');
    t.deepEqual(
        readFrame('<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" preserveAspectRatio="none"/>', deps),
        { viewBox: [0, 0, 40, 20], preserveAspectRatio: 'none' },
        'width/height fallback'
    );
    t.end();
});

const near = (t, actual, expected, msg) => t.ok(Math.abs(actual - expected) < 1e-9, `${msg} (${actual} ~ ${expected})`);

test('svgDecompose: computePartTransformation keeps content in place (no rotation)', (t) => {
    // Original: 100x50 viewBox drawn 200x100 mm centred at (50, 60).
    const original = { positionX: 50, positionY: 60, rotationZ: 0, scaleX: 1, scaleY: 1, width: 200, height: 100 };
    const tr = computePartTransformation({
        original,
        viewBox: [0, 0, 100, 50],
        preserveAspectRatio: 'none',
        bbox: { x: 75, y: 0, width: 25, height: 10 }
    });
    // Part centre in viewBox = (87.5, 5) -> image local (175, 10) -> offset from centre (75, -40) in svg (y down).
    near(t, tr.positionX, 125, 'x moves right');
    near(t, tr.positionY, 100, 'y moves up in model coordinates');
    near(t, tr.width, 50, 'width scaled');
    near(t, tr.height, 20, 'height scaled');
    t.equal(tr.scaleX, 1, 'scaleX kept');
    t.equal(tr.rotationZ, 0, 'rotation kept');
    t.end();
});

test('svgDecompose: computePartTransformation with rotation, flip and scale', (t) => {
    const original = { positionX: 0, positionY: 0, rotationZ: Math.PI / 2, scaleX: -2, scaleY: 2, width: 200, height: 100 };
    const tr = computePartTransformation({
        original,
        viewBox: [0, 0, 100, 50],
        preserveAspectRatio: 'none',
        bbox: { x: 75, y: 25, width: 10, height: 10 }
    });
    // Unscaled image 100x50, offset of part centre (30, 5); scaled+flipped (-60, 10);
    // svg rotation by -90deg: (x, y) -> (y, -x) = (10, 60); model y flips: (10, -60).
    near(t, tr.positionX, 10, 'x');
    near(t, tr.positionY, -60, 'y');
    near(t, tr.width, 20, 'width = bbox * |scale|');
    near(t, tr.height, 20, 'height');
    t.equal(tr.scaleX, -2, 'flip kept');
    t.equal(tr.rotationZ, Math.PI / 2, 'rotation kept');
    t.end();
});

test('svgDecompose: computePartTransformation honours meet aspect ratio', (t) => {
    // viewBox 100x100 drawn into 200x100 with xMidYMid meet: scale 1, 50 px margins left/right.
    const original = { positionX: 0, positionY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, width: 200, height: 100 };
    const tr = computePartTransformation({
        original,
        viewBox: [0, 0, 100, 100],
        preserveAspectRatio: null,
        bbox: { x: 0, y: 0, width: 100, height: 100 }
    });
    near(t, tr.positionX, 0, 'centred x');
    near(t, tr.positionY, 0, 'centred y');
    near(t, tr.width, 100, 'width uses uniform scale');
    t.end();
});

test('svgDecompose: canDecompose uses the cached split result', (t) => {
    const elem = { nodeName: 'image', getAttribute: () => '/data/Tmp/a.svg' };
    const model = { sourceType: 'svg', elem };
    t.equal(canDecompose(model), false, 'unknown until loaded');
    model.decomposeInfo = { href: '/data/Tmp/a.svg', canSplit: true };
    t.equal(canDecompose(model), true, 'cached true');
    model.decomposeInfo = { href: '/data/Tmp/other.svg', canSplit: true };
    t.equal(canDecompose(model), false, 'stale cache (href changed) ignored');
    t.equal(canDecompose({ sourceType: 'raster', elem, decomposeInfo: { href: '/data/Tmp/a.svg', canSplit: true } }), false, 'not svg');
    t.equal(canDecompose(null), false, 'no model');
    t.end();
});

test('svgDecompose: canDecomposeSelection checks the selection and modes', (t) => {
    const elem = { nodeName: 'image', getAttribute: () => '/data/Tmp/a.svg' };
    const model = { sourceType: 'svg', visible: true, elem, decomposeInfo: { href: '/data/Tmp/a.svg', canSplit: true } };
    t.equal(canDecomposeSelection([model], {}), true, 'one splittable model');
    t.equal(canDecomposeSelection([model, model], {}), false, 'two selected');
    t.equal(canDecomposeSelection([], {}), false, 'none selected');
    t.equal(canDecomposeSelection([model], { isRotate: true }), false, 'rotary');
    t.equal(canDecomposeSelection([model], { isOnABPosition: true }), false, 'A-B position');
    t.equal(canDecomposeSelection([model], { isSVGClipping: true }), false, 'clipping mode');
    t.equal(canDecomposeSelection([{ ...model, visible: false }], {}), false, 'hidden model');
    t.end();
});
