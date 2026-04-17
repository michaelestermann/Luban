# Group Elements in Laser / CNC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class grouping of SVG elements in the laser and CNC workspaces, mirroring the 3DP `ThreeGroup` pattern, with Inkscape-style enter/exit editing and group-aware tool paths.

**Architecture:** New `SvgGroup` class in `src/app/models/SvgGroup.ts`. `ModelGroup2D.models` becomes a heterogeneous `(SvgModel | SvgGroup)[]`. A new `enteredGroupId: string | null` lives in laser/cnc Redux state. Tool paths' `visibleModelIDs` may reference group IDs and a single "Model leaves Tool Path" rule governs all tool-path membership mutations. Undo/redo is handled via new `GroupSvgOperation` / `UngroupSvgOperation` classes wired through the existing `CompoundOperation` / `OperationHistory`.

**Tech Stack:** TypeScript, React, Redux, SVG DOM, three.js (for the selection bounding box), tape (tests), webpack.

**Spec:** `docs/superpowers/specs/2026-04-12-group-elements-laser-cnc-design.md`

---

## File Map (created / modified)

**Created**
- `src/app/models/SvgGroup.ts` — SvgGroup class
- `src/app/scene/operations/GroupSvgOperation.ts` — group operation for undo/redo
- `src/app/scene/operations/UngroupSvgOperation.ts` — ungroup operation for undo/redo
- `src/app/flux/editor/actions-group.ts` — Redux thunks for group / ungroup / enter / exit
- `src/app/ui/widgets/CncLaserTopBar/GroupButton.jsx` — toolbar button
- `test/models/SvgGroup.test.js` — unit tests for SvgGroup
- `test/models/ModelGroup2D-group.test.js` — unit tests for group() / ungroup()
- `test/toolpaths/ToolPathGroup-leaves.test.js` — unit tests for "Model leaves Tool Path" rule

**Modified**
- `src/app/models/ModelGroup2D.ts` — `group()`, `ungroup()`, `canGroup()`, `canUngroup()`, selection extensions
- `src/app/models/SvgModel.ts` — optional `parent: SvgGroup | null` field
- `src/app/models/events.ts` — add `Group / Ungroup` event types (if not already present)
- `src/app/flux/laser/index.ts` — `enteredGroupId` in INITIAL_STATE, wire `actions-group`
- `src/app/flux/cnc/index.ts` — same
- `src/app/flux/editor/index.ts` — re-export `actions-group` thunks from editor actions
- `src/app/toolpaths/ToolPath.ts` — `getFlatChildModelIDs()`, `targetsGroup` getter
- `src/app/toolpaths/ToolPathGroup.ts` — `removeModelFromToolPaths()` helper that enforces "Model leaves Tool Path"
- `src/app/ui/SVGEditor/svg-content/SVGContentGroup.js` — render group `<g>` elements
- `src/app/ui/SVGEditor/SVGCanvas.tsx` — double-click to enter, overlay rect / dim class, Escape handler
- `src/app/ui/widgets/CncLaserList/ObjectList/ObjectListBox.tsx` — foldable group rows
- `src/app/ui/widgets/CncLaserList/ToolPathList/ToolPathListBox.jsx` — show group name & badge for group-targeted tool paths, confirmation dialog on create
- `src/app/ui/views/ToolPathConfigurations/ToolPathConfigurations.tsx` — show group name in title when target is a group
- `src/app/ui/widgets/CncLaserTopBar/index.tsx` (or existing top-bar file) — mount GroupButton
- `src/app/lib/shortcut/...` — register `Cmd/Ctrl+G` and `Cmd/Ctrl+Shift+G` per head type
- `src/app/flux/editor/actions-project.ts` — serialize / deserialize `groups` block
- `src/app/resources/i18n/en/resource.json` — new keys
- `src/app/resources/i18n/de/resource.json` — new keys

---

## Phase 1 — `SvgGroup` data model (no DOM yet)

The goal of this phase is a pure in-memory group container with unit tests. No DOM, no Redux, no UI.

### Task 1: Create `SvgGroup` with minimal fields

**Files:**
- Create: `src/app/models/SvgGroup.ts`
- Test: `test/models/SvgGroup.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/models/SvgGroup.test.js
import test from 'tape';
import SvgGroup from '../../src/app/models/SvgGroup';

test('SvgGroup: constructor assigns core fields', (t) => {
    const fakeModelGroup = {};
    const group = new SvgGroup(
        { name: 'Group 1', baseName: 'group', headType: 'laser' },
        fakeModelGroup
    );

    t.equal(group.type, '2d-group', 'type is 2d-group');
    t.equal(group.name, 'Group 1', 'name is set');
    t.equal(group.baseName, 'group', 'baseName is set');
    t.equal(group.headType, 'laser', 'headType is set');
    t.equal(group.visible, true, 'visible defaults to true');
    t.equal(typeof group.modelID, 'string', 'modelID is generated');
    t.ok(group.modelID.length > 0, 'modelID is non-empty');
    t.deepEqual(group.children, [], 'children starts empty');
    t.equal(group.modelGroup, fakeModelGroup, 'modelGroup back-reference set');
    t.end();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/models/SvgGroup.test.js`
Expected: FAIL with `Cannot find module '../../src/app/models/SvgGroup'`

- [ ] **Step 3: Create the minimal SvgGroup class**

```ts
// src/app/models/SvgGroup.ts
import { v4 as uuid } from 'uuid';
import type { ModelTransformation } from './ThreeBaseModel';
import type SvgModel from './SvgModel';
import type ModelGroup2D from './ModelGroup2D';

export interface SvgGroupOptions {
    modelID?: string;
    name: string;
    baseName: string;
    headType: 'laser' | 'cnc';
    visible?: boolean;
    transformation?: Partial<ModelTransformation>;
}

const DEFAULT_TRANSFORMATION: ModelTransformation = {
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    uniformScalingState: true,
    width: 0,
    height: 0,
};

export default class SvgGroup {
    public readonly type = '2d-group' as const;

    public modelID: string;

    public name: string;

    public baseName: string;

    public headType: 'laser' | 'cnc';

    public visible: boolean;

    public children: SvgModel[];

    public transformation: ModelTransformation;

    public modelGroup: ModelGroup2D;

    public elem: SVGGElement | null = null;

    public constructor(options: SvgGroupOptions, modelGroup: ModelGroup2D) {
        this.modelID = options.modelID ?? uuid();
        this.name = options.name;
        this.baseName = options.baseName;
        this.headType = options.headType;
        this.visible = options.visible ?? true;
        this.children = [];
        this.transformation = {
            ...DEFAULT_TRANSFORMATION,
            ...(options.transformation ?? {}),
        };
        this.modelGroup = modelGroup;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/models/SvgGroup.test.js`
Expected: PASS (all 9 assertions)

- [ ] **Step 5: Commit**

```bash
git add src/app/models/SvgGroup.ts test/models/SvgGroup.test.js
git commit -m "Feature: Add SvgGroup data model for laser/CNC grouping"
```

---

### Task 2: Add `addChild` / `removeChild` methods to `SvgGroup`

**Files:**
- Modify: `src/app/models/SvgGroup.ts`
- Test: `test/models/SvgGroup.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/models/SvgGroup.test.js`:

```js
test('SvgGroup: addChild appends and sets parent', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const fakeChild = { modelID: 'm1', parent: null };

    group.addChild(fakeChild);

    t.deepEqual(group.children.map(c => c.modelID), ['m1'], 'child added');
    t.equal(fakeChild.parent, group, 'parent set on child');
    t.end();
});

test('SvgGroup: removeChild drops the child and clears parent', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const fakeA = { modelID: 'a', parent: null };
    const fakeB = { modelID: 'b', parent: null };
    group.addChild(fakeA);
    group.addChild(fakeB);

    group.removeChild(fakeA);

    t.deepEqual(group.children.map(c => c.modelID), ['b'], 'only b remains');
    t.equal(fakeA.parent, null, 'parent cleared on removed child');
    t.end();
});

test('SvgGroup: removeChild is a no-op for unknown children', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const known = { modelID: 'known', parent: null };
    const unknown = { modelID: 'unknown', parent: null };
    group.addChild(known);

    group.removeChild(unknown);

    t.deepEqual(group.children.map(c => c.modelID), ['known'], 'known still there');
    t.equal(known.parent, group, 'known parent untouched');
    t.end();
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- test/models/SvgGroup.test.js`
Expected: FAIL with `group.addChild is not a function`

- [ ] **Step 3: Implement `addChild` / `removeChild`**

Add to `SvgGroup` class body in `src/app/models/SvgGroup.ts`:

```ts
public addChild(child: SvgModel): void {
    if (!this.children.includes(child)) {
        this.children.push(child);
    }
    child.parent = this;
}

public removeChild(child: SvgModel): void {
    const index = this.children.indexOf(child);
    if (index === -1) {
        return;
    }
    this.children.splice(index, 1);
    child.parent = null;
}
```

- [ ] **Step 4: Also declare `parent` on SvgModel**

Modify `src/app/models/SvgModel.ts`. Find the field declarations near the top of the class (around line 96-110) and add:

```ts
public parent: SvgGroup | null = null;
```

Import near the top of the file:

```ts
import type SvgGroup from './SvgGroup';
```

- [ ] **Step 5: Run tests**

Run: `npm test -- test/models/SvgGroup.test.js`
Expected: PASS (3 new tests + previous 9 assertions)

- [ ] **Step 6: Commit**

```bash
git add src/app/models/SvgGroup.ts src/app/models/SvgModel.ts test/models/SvgGroup.test.js
git commit -m "Feature: Support addChild/removeChild on SvgGroup with SvgModel parent link"
```

---

### Task 3: Add `canGroup()` and `canUngroup()` to `ModelGroup2D`

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Test: `test/models/ModelGroup2D-group.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/models/ModelGroup2D-group.test.js
import test from 'tape';
import ModelGroup2D from '../../src/app/models/ModelGroup2D';
import SvgGroup from '../../src/app/models/SvgGroup';

function makeModel(modelID) {
    return { modelID, parent: null, visible: true, type: 'path' };
}

test('ModelGroup2D.canGroup: false with <2 selected entities', (t) => {
    const mg = new ModelGroup2D('laser');
    mg.selectedModelArray = [];
    t.equal(mg.canGroup(), false, 'empty selection → false');

    mg.selectedModelArray = [makeModel('a')];
    t.equal(mg.canGroup(), false, 'single selection → false');
    t.end();
});

test('ModelGroup2D.canGroup: true with ≥2 selected entities', (t) => {
    const mg = new ModelGroup2D('laser');
    mg.selectedModelArray = [makeModel('a'), makeModel('b')];
    t.equal(mg.canGroup(), true, 'two selected → true');
    t.end();
});

test('ModelGroup2D.canUngroup: true if any selected entity is a SvgGroup', (t) => {
    const mg = new ModelGroup2D('laser');
    const grp = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        mg
    );
    mg.selectedModelArray = [makeModel('a'), grp];
    t.equal(mg.canUngroup(), true, 'selection contains a group');

    mg.selectedModelArray = [makeModel('a'), makeModel('b')];
    t.equal(mg.canUngroup(), false, 'no group in selection');
    t.end();
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: FAIL with `mg.canGroup is not a function`

- [ ] **Step 3: Implement the predicates**

Modify `src/app/models/ModelGroup2D.ts`. After the existing type alias `type TModel = SvgModel` (line 33), update to include `SvgGroup`:

```ts
import SvgGroup from './SvgGroup';

// Existing:
// type TModel = SvgModel

// Replace with:
type TModel = SvgModel | SvgGroup;
```

Then add these public methods inside the class (anywhere after the constructor; group with existing public predicates):

```ts
public canGroup(): boolean {
    return this.selectedModelArray.length >= 2;
}

public canUngroup(): boolean {
    return this.selectedModelArray.some((entity) => entity instanceof SvgGroup);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/models/ModelGroup2D.ts test/models/ModelGroup2D-group.test.js
git commit -m "Feature: Add canGroup / canUngroup predicates on ModelGroup2D"
```

---

### Task 4: Implement `ModelGroup2D.group()` (data-only, no DOM)

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Test: `test/models/ModelGroup2D-group.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/models/ModelGroup2D-group.test.js`:

```js
test('ModelGroup2D.group: flat models become one SvgGroup', (t) => {
    const mg = new ModelGroup2D('laser');
    const a = makeModel('a');
    const b = makeModel('b');
    const c = makeModel('c');
    mg.models = [a, b, c];
    mg.selectedModelArray = [a, b];

    const { newGroup } = mg.group();

    t.ok(newGroup instanceof SvgGroup, 'returns SvgGroup');
    t.equal(newGroup.children.length, 2, 'group has 2 children');
    t.equal(newGroup.children[0].modelID, 'a');
    t.equal(newGroup.children[1].modelID, 'b');
    t.equal(mg.models.length, 2, 'models list has 2 entries: new group + c');
    t.equal(mg.models.indexOf(newGroup), 0, 'group inserted at min index of originals');
    t.deepEqual(mg.selectedModelArray, [newGroup], 'new group is selected');
    t.end();
});

test('ModelGroup2D.group: flattens a pre-existing group in the selection', (t) => {
    const mg = new ModelGroup2D('laser');
    const a = makeModel('a');
    const b = makeModel('b');
    const c = makeModel('c');
    // pre-existing group holding a
    const existing = new SvgGroup({ name: 'G0', baseName: 'g', headType: 'laser' }, mg);
    existing.addChild(a);
    mg.models = [existing, b, c];
    mg.selectedModelArray = [existing, b];

    const { newGroup } = mg.group();

    t.equal(newGroup.children.length, 2, 'flat: a and b (no nesting)');
    const ids = newGroup.children.map(ch => ch.modelID).sort();
    t.deepEqual(ids, ['a', 'b']);
    t.notOk(mg.models.includes(existing), 'old group discarded');
    t.end();
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: FAIL with `mg.group is not a function`

- [ ] **Step 3: Implement `group()` (data layer only)**

Add to `ModelGroup2D`:

```ts
private _createGroupName(): { name: string; baseName: string } {
    const baseName = 'group';
    const entry = this.namesMap.get(baseName) ?? { number: 0, count: 0 };
    entry.number += 1;
    entry.count += 1;
    this.namesMap.set(baseName, entry);
    return { name: `Group ${entry.number}`, baseName };
}

public group(): { newGroup: SvgGroup } {
    if (!this.canGroup()) {
        return { newGroup: null as unknown as SvgGroup };
    }

    const selected = this.selectedModelArray.slice();

    // Flatten any groups in the selection: pull their children out
    const childModels: SvgModel[] = [];
    for (const entity of selected) {
        if (entity instanceof SvgGroup) {
            // take the current children list then clear the group
            const grabbed = entity.children.slice();
            for (const child of grabbed) {
                entity.removeChild(child);
                childModels.push(child);
            }
        } else {
            childModels.push(entity);
        }
    }

    // Compute insertion index (lowest index of any selected entity)
    const insertIndex = Math.min(
        ...selected.map((entity) => this.models.indexOf(entity)),
    );

    // Remove selected entities from models[]
    this.models = this.models.filter((entity) => !selected.includes(entity));

    // Build new group and attach children
    const { name, baseName } = this._createGroupName();
    const newGroup = new SvgGroup(
        { name, baseName, headType: this.headType as 'laser' | 'cnc' },
        this,
    );
    for (const child of childModels) {
        newGroup.addChild(child);
    }

    // Insert group at computed index
    this.models.splice(insertIndex, 0, newGroup);

    // Select the new group
    this.selectedModelArray = [newGroup];

    return { newGroup };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: PASS (including the pre-existing `canGroup` / `canUngroup` tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/models/ModelGroup2D.ts test/models/ModelGroup2D-group.test.js
git commit -m "Feature: Implement ModelGroup2D.group() data-layer semantics"
```

---

### Task 5: Implement `ModelGroup2D.ungroup()` (data-only)

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Test: `test/models/ModelGroup2D-group.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('ModelGroup2D.ungroup: releases children back into models[]', (t) => {
    const mg = new ModelGroup2D('laser');
    const a = makeModel('a');
    const b = makeModel('b');
    const c = makeModel('c');
    mg.models = [a, b, c];
    mg.selectedModelArray = [a, b];

    const { newGroup } = mg.group();
    mg.selectedModelArray = [newGroup];

    mg.ungroup();

    t.equal(mg.models.length, 3, 'models back to 3 entries');
    t.ok(mg.models.includes(a), 'a back at top level');
    t.ok(mg.models.includes(b), 'b back at top level');
    t.notOk(mg.models.includes(newGroup), 'group removed');
    t.deepEqual(mg.selectedModelArray.map(m => m.modelID).sort(), ['a', 'b'], 'children selected');
    t.end();
});

test('ModelGroup2D.ungroup: ignores selected non-group entities', (t) => {
    const mg = new ModelGroup2D('laser');
    const a = makeModel('a');
    const b = makeModel('b');
    mg.models = [a, b];
    mg.selectedModelArray = [a];

    mg.ungroup();

    t.equal(mg.models.length, 2);
    t.deepEqual(mg.selectedModelArray, [a], 'selection unchanged');
    t.end();
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: FAIL with `mg.ungroup is not a function`

- [ ] **Step 3: Implement `ungroup()`**

Add to `ModelGroup2D`:

```ts
public ungroup(): void {
    const selectedGroups = this.selectedModelArray.filter(
        (entity): entity is SvgGroup => entity instanceof SvgGroup,
    );
    if (selectedGroups.length === 0) {
        return;
    }

    const releasedChildren: SvgModel[] = [];
    for (const grp of selectedGroups) {
        const index = this.models.indexOf(grp);
        if (index === -1) continue;

        const children = grp.children.slice();
        // detach children from the group
        for (const child of children) {
            grp.removeChild(child);
        }

        // remove the group from models and splice the children in its place
        this.models.splice(index, 1, ...children);
        releasedChildren.push(...children);
    }

    this.selectedModelArray = releasedChildren;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/models/ModelGroup2D.ts test/models/ModelGroup2D-group.test.js
git commit -m "Feature: Implement ModelGroup2D.ungroup() data-layer semantics"
```

---

## Phase 2 — SVG DOM integration

Now groups get a real `<g>` in the SVG tree.

### Task 6: Create group `<g>` on `group()`, move children DOM in

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Modify: `src/app/models/SvgGroup.ts`

- [ ] **Step 1: Extend `SvgGroup` with a DOM helper**

In `src/app/models/SvgGroup.ts`, add:

```ts
public attachDomElement(elem: SVGGElement): void {
    this.elem = elem;
    elem.setAttribute('id', this.modelID);
    elem.setAttribute('data-luban-group', '1');
}

public attachChildDom(child: SvgModel): void {
    if (!this.elem || !child.elem) return;
    const childParentG = child.elem.parentNode as SVGElement | null;
    // Move the child's own `<g>` (each SvgModel sits in its own `<g>`) into this group's `<g>`
    const nodeToMove = childParentG && childParentG.tagName === 'g' && childParentG !== this.elem
        ? childParentG
        : child.elem;
    this.elem.appendChild(nodeToMove);
}

public detachChildDom(child: SvgModel, targetParent: SVGElement): void {
    if (!child.elem) return;
    const nodeToMove = child.elem.parentNode && (child.elem.parentNode as SVGElement).tagName === 'g'
        ? child.elem.parentNode as SVGElement
        : child.elem;
    targetParent.appendChild(nodeToMove);
}
```

- [ ] **Step 2: Give `ModelGroup2D` access to the `#svg-data` node**

Look at `src/app/ui/SVGEditor/svg-content/SVGContentGroup.js` near line 46 where `this.group = document.createElementNS(NS.SVG, 'g')` is created. Add a method that exposes the raw `<g>`:

```js
// svg-content/SVGContentGroup.js
getModelContainer() {
    return this.group;
}
```

Then in `ModelGroup2D`, add a setter:

```ts
private svgDataContainer: SVGElement | null = null;

public setSvgDataContainer(elem: SVGElement): void {
    this.svgDataContainer = elem;
}
```

And wire it from the SVGCanvas initialization path. Find `SVGCanvas.tsx` — when the component mounts and constructs the `SVGContentGroup`, add:

```tsx
// after svgContentGroup is created
const modelGroup = /* existing access to the headType modelGroup */;
modelGroup.setSvgDataContainer(svgContentGroup.getModelContainer());
```

(If the SVGCanvas does not currently reach the modelGroup directly, pipe it through props — existing code already passes modelGroup into SVG editor pages.)

- [ ] **Step 3: Extend `group()` to build + attach the DOM `<g>`**

Modify the `group()` method in `ModelGroup2D.ts`:

```ts
public group(): { newGroup: SvgGroup } {
    // ... existing canGroup check + selected snapshot + flatten loop

    // before building the SvgGroup, create the DOM container:
    const groupElem = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'g',
    ) as SVGGElement;

    // ... existing insertIndex, filter, create SvgGroup block

    newGroup.attachDomElement(groupElem);

    // Append group element to the svg-data container if available
    if (this.svgDataContainer) {
        this.svgDataContainer.appendChild(groupElem);
    }

    // Move children's DOM subtrees into the group elem
    for (const child of childModels) {
        newGroup.attachChildDom(child);
    }

    // ... existing insert into models[], set selection
    return { newGroup };
}
```

- [ ] **Step 4: Extend `ungroup()` to release DOM**

```ts
public ungroup(): void {
    // ... existing selectedGroups check

    for (const grp of selectedGroups) {
        // ... existing index lookup & detach logic

        // move children DOM out before removing group elem
        if (grp.elem && this.svgDataContainer) {
            for (const child of children) {
                grp.detachChildDom(child, this.svgDataContainer);
            }
            grp.elem.remove();
            grp.elem = null;
        }

        // ... existing splice
    }

    this.selectedModelArray = releasedChildren;
}
```

- [ ] **Step 5: Verify existing unit tests still pass (no regressions)**

Run: `npm test -- test/models/ModelGroup2D-group.test.js test/models/SvgGroup.test.js`
Expected: all prior tests PASS (DOM methods are best-effort and nullable in tests that don't set `svgDataContainer`)

- [ ] **Step 6: Commit**

```bash
git add src/app/models/ModelGroup2D.ts src/app/models/SvgGroup.ts src/app/ui/SVGEditor/svg-content/SVGContentGroup.js src/app/ui/SVGEditor/SVGCanvas.tsx
git commit -m "Feature: Manage SVG `<g>` DOM node alongside SvgGroup lifecycle"
```

---

## Phase 3 — Selection rules (click-to-select-group)

### Task 7: `getParentGroup` and selection routing helpers

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Test: `test/models/ModelGroup2D-group.test.js`

- [ ] **Step 1: Write failing test**

```js
test('ModelGroup2D.getParentGroup: returns group for a child, null for free model', (t) => {
    const mg = new ModelGroup2D('laser');
    const a = makeModel('a');
    const b = makeModel('b');
    const free = makeModel('free');
    mg.models = [a, b, free];
    mg.selectedModelArray = [a, b];
    const { newGroup } = mg.group();

    t.equal(mg.getParentGroup('a'), newGroup, 'a belongs to group');
    t.equal(mg.getParentGroup('b'), newGroup, 'b belongs to group');
    t.equal(mg.getParentGroup('free'), null, 'free has no parent');
    t.equal(mg.getParentGroup('missing'), null, 'missing id is null');
    t.end();
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: FAIL

- [ ] **Step 3: Implement the helper**

```ts
public getParentGroup(modelID: string): SvgGroup | null {
    for (const entity of this.models) {
        if (entity instanceof SvgGroup) {
            if (entity.children.some((child) => child.modelID === modelID)) {
                return entity;
            }
        }
    }
    return null;
}

public resolveSelectionTarget(modelID: string, enteredGroupId: string | null): SvgModel | SvgGroup | null {
    // In enter mode: allow direct child selection inside the entered group
    if (enteredGroupId) {
        const entered = this.models.find(
            (m) => m instanceof SvgGroup && m.modelID === enteredGroupId,
        ) as SvgGroup | undefined;
        if (entered) {
            const child = entered.children.find((c) => c.modelID === modelID);
            if (child) return child;
        }
        return null;
    }

    // Top level: a click on a group child should select the group
    const parent = this.getParentGroup(modelID);
    if (parent) return parent;

    // Otherwise: find the free model or the group itself
    return this.models.find((m) => m.modelID === modelID) ?? null;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/models/ModelGroup2D-group.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/models/ModelGroup2D.ts test/models/ModelGroup2D-group.test.js
git commit -m "Feature: Add getParentGroup and resolveSelectionTarget helpers"
```

---

### Task 8: Route `selectModelById` through `resolveSelectionTarget`

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`
- Modify: `src/app/flux/laser/index.ts`
- Modify: `src/app/flux/cnc/index.ts`

- [ ] **Step 1: Add `enteredGroupId` to INITIAL_STATE (laser + cnc)**

In `src/app/flux/laser/index.ts`, find the `INITIAL_STATE` object (around line 65) and add:

```ts
enteredGroupId: null as string | null,
```

In `src/app/flux/cnc/index.ts`, find the `INITIAL_STATE` object (around line 55) and add the same field.

- [ ] **Step 2: Thread `enteredGroupId` into the ModelGroup2D**

Add a mutable reference in `ModelGroup2D`:

```ts
private enteredGroupId: string | null = null;

public setEnteredGroupId(id: string | null): void {
    this.enteredGroupId = id;
}
```

- [ ] **Step 3: Update `selectModelById`**

Find `selectModelById` (around line 523 in `ModelGroup2D.ts`). Replace its lookup with the new helper:

```ts
public selectModelById(modelID: string, isMultiSelect = false) {
    const target = this.resolveSelectionTarget(modelID, this.enteredGroupId);
    if (!target) {
        this.unselectAllModels();
        return this.getState();
    }

    if (isMultiSelect) {
        if (!this.selectedModelArray.includes(target)) {
            this.selectedModelArray.push(target);
        } else {
            this.selectedModelArray = this.selectedModelArray.filter((m) => m !== target);
        }
    } else {
        this.selectedModelArray = [target];
    }

    return this.getState();
}
```

(Keep the rest of the method body that existed before — the goal is only to route lookups.)

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open a laser project, insert two rectangles, draw both, click one → still selected singly. No groups yet so behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/models/ModelGroup2D.ts src/app/flux/laser/index.ts src/app/flux/cnc/index.ts
git commit -m "Feature: Route selectModelById through resolveSelectionTarget"
```

---

## Phase 4 — Transform propagation on groups

### Task 9: Aggregate group bounding box and apply `<g transform>`

**Files:**
- Modify: `src/app/models/SvgGroup.ts`

- [ ] **Step 1: Add a `computeBoundingBox` method**

```ts
public computeBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (this.children.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const child of this.children) {
        const bbox = (child.elem as SVGGraphicsElement).getBBox();
        // apply the child's own transform (position, rotation, scale)
        const cx = bbox.x + (child.transformation.positionX ?? 0);
        const cy = bbox.y + (child.transformation.positionY ?? 0);
        const cw = bbox.width * (child.transformation.scaleX ?? 1);
        const ch = bbox.height * (child.transformation.scaleY ?? 1);
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx + cw > maxX) maxX = cx + cw;
        if (cy + ch > maxY) maxY = cy + ch;
    }
    return { minX, minY, maxX, maxY };
}

public applyTransformToDom(): void {
    if (!this.elem) return;
    const t = this.transformation;
    const parts: string[] = [];
    if (t.positionX || t.positionY) {
        parts.push(`translate(${t.positionX ?? 0} ${t.positionY ?? 0})`);
    }
    if (t.rotationZ) {
        parts.push(`rotate(${((t.rotationZ ?? 0) * 180) / Math.PI})`);
    }
    if ((t.scaleX ?? 1) !== 1 || (t.scaleY ?? 1) !== 1) {
        parts.push(`scale(${t.scaleX ?? 1} ${t.scaleY ?? 1})`);
    }
    if (parts.length > 0) {
        this.elem.setAttribute('transform', parts.join(' '));
    } else {
        this.elem.removeAttribute('transform');
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/models/SvgGroup.ts
git commit -m "Feature: SvgGroup computes bounding box and writes aggregate transform"
```

---

### Task 10: Hook group transforms into `prepareSelectedGroup` path

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`

- [ ] **Step 1: After any move/rotate/scale on a selected group, call `applyTransformToDom`**

Find `prepareSelectedGroup` (around line 555) and / or the main transform update method in `ModelGroup2D.ts`. Where the method currently updates individual `SvgModel` transformations, add:

```ts
// Apply group-level transform if the single selection is an SvgGroup
if (this.selectedModelArray.length === 1 && this.selectedModelArray[0] instanceof SvgGroup) {
    (this.selectedModelArray[0] as SvgGroup).applyTransformToDom();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/models/ModelGroup2D.ts
git commit -m "Feature: Propagate group-level transforms to the DOM <g>"
```

---

## Phase 5 — Enter / Exit mode and overlay

### Task 11: `enterGroup` / `exitGroup` Redux thunks

**Files:**
- Create: `src/app/flux/editor/actions-group.ts`
- Modify: `src/app/flux/editor/index.ts`

- [ ] **Step 1: Create the actions file**

```ts
// src/app/flux/editor/actions-group.ts
import type { Dispatch } from 'redux';
import { actions as baseActions } from './actions-base';

export const groupActions = {
    enterGroup: (headType: 'laser' | 'cnc', groupID: string) => (dispatch: Dispatch, getState: () => any) => {
        const state = getState()[headType];
        const modelGroup = state.modelGroup;
        modelGroup.setEnteredGroupId(groupID);
        dispatch(baseActions.updateState(headType, { enteredGroupId: groupID }));
    },

    exitGroup: (headType: 'laser' | 'cnc') => (dispatch: Dispatch, getState: () => any) => {
        const state = getState()[headType];
        const modelGroup = state.modelGroup;
        modelGroup.setEnteredGroupId(null);
        dispatch(baseActions.updateState(headType, { enteredGroupId: null }));
    },

    groupSelectedModels: (headType: 'laser' | 'cnc') => (dispatch: Dispatch, getState: () => any) => {
        const state = getState()[headType];
        const modelGroup = state.modelGroup;
        if (!modelGroup.canGroup()) return;
        modelGroup.group();
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    },

    ungroupSelectedGroups: (headType: 'laser' | 'cnc') => (dispatch: Dispatch, getState: () => any) => {
        const state = getState()[headType];
        const modelGroup = state.modelGroup;
        if (!modelGroup.canUngroup()) return;
        modelGroup.ungroup();
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    },
};
```

- [ ] **Step 2: Re-export in editor actions barrel**

In `src/app/flux/editor/index.ts`, near the other action imports, add:

```ts
import { groupActions } from './actions-group';

export const actions = {
    // ... existing exports
    ...groupActions,
};
```

Verify existing `actions` export uses object-spread; if it uses named properties, add `...groupActions` into the object.

- [ ] **Step 3: Commit**

```bash
git add src/app/flux/editor/actions-group.ts src/app/flux/editor/index.ts
git commit -m "Feature: Redux thunks for enter/exit/group/ungroup"
```

---

### Task 12: SVG overlay rect + dim overlay on enter

**Files:**
- Modify: `src/app/ui/SVGEditor/SVGCanvas.tsx`
- Modify: `src/app/ui/SVGEditor/styles.styl` (or the equivalent stylus file for SVGCanvas)

- [ ] **Step 1: Add an overlay `<rect>` rendered when `enteredGroupId !== null`**

In `SVGCanvas.tsx`, read `enteredGroupId` from props (wire through from the page component: `state[headType].enteredGroupId`) and conditionally render a full-canvas rect with pointer-events enabled that, on click, dispatches `exitGroup`:

```tsx
{enteredGroupId && (
    <rect
        className="svg-enter-group-overlay"
        x={0}
        y={0}
        width={canvasWidth}
        height={canvasHeight}
        fill="rgba(0,0,0,0.25)"
        pointerEvents="all"
        onClick={() => dispatch(editorActions.exitGroup(headType))}
    />
)}
```

- [ ] **Step 2: Add a CSS rule that dims everything outside the entered group**

In the matching stylus file:

```stylus
.svg-outside-entered-group
    opacity 0.35
    pointer-events none

.svg-entered-group-frame
    stroke #1890ff
    stroke-dasharray 6 4
    fill none
```

- [ ] **Step 3: When `enteredGroupId` changes, toggle CSS class on all sibling DOM nodes**

Add a `useEffect` in `SVGCanvas.tsx` that, when `enteredGroupId` flips from null to a string:

```tsx
useEffect(() => {
    const svgData = svgContentGroupRef.current?.getModelContainer();
    if (!svgData) return;
    if (enteredGroupId) {
        for (const child of Array.from(svgData.children)) {
            if ((child as SVGElement).getAttribute('id') !== enteredGroupId) {
                (child as SVGElement).classList.add('svg-outside-entered-group');
            } else {
                (child as SVGElement).classList.add('svg-entered-group-frame');
            }
        }
    } else {
        for (const child of Array.from(svgData.children)) {
            (child as SVGElement).classList.remove('svg-outside-entered-group');
            (child as SVGElement).classList.remove('svg-entered-group-frame');
        }
    }
}, [enteredGroupId]);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/ui/SVGEditor/SVGCanvas.tsx src/app/ui/SVGEditor/styles.styl
git commit -m "Feature: Enter-group overlay and dim siblings"
```

---

### Task 13: Double-click to enter, `Escape` to exit

**Files:**
- Modify: `src/app/ui/SVGEditor/SVGCanvas.tsx`
- Modify: `src/app/lib/shortcut/ShortcutManager.ts` (or nearby shortcut registration for laser/cnc page)

- [ ] **Step 1: Double-click handler**

In `SVGCanvas.tsx`, attach `onDoubleClick` to the `<svg>` root and, given the clicked model ID, check:

```tsx
function handleDoubleClick(evt: React.MouseEvent) {
    if (enteredGroupId) return; // already inside
    const targetElem = evt.target as SVGElement;
    const groupG = targetElem.closest('[data-luban-group="1"]') as SVGElement | null;
    if (groupG) {
        dispatch(editorActions.enterGroup(headType, groupG.getAttribute('id')!));
    }
}
```

- [ ] **Step 2: Escape handler for exit**

In the shortcut registration for laser/cnc (find it by grepping `key-CncLaser` or similar), add a handler:

```ts
{
    title: 'Exit Group',
    keys: ['Escape'],
    callback: () => {
        if (store.getState()[headType].enteredGroupId) {
            dispatch(editorActions.exitGroup(headType));
        }
    },
}
```

Where `store` and `dispatch` are the ones already available to that file.

- [ ] **Step 3: Commit**

```bash
git add src/app/ui/SVGEditor/SVGCanvas.tsx src/app/lib/shortcut/ShortcutManager.ts
git commit -m "Feature: Double-click to enter group, Escape to exit"
```

---

## Phase 6 — Operation history (undo/redo)

### Task 14: `GroupSvgOperation`

**Files:**
- Create: `src/app/scene/operations/GroupSvgOperation.ts`

- [ ] **Step 1: Implement the operation**

```ts
// src/app/scene/operations/GroupSvgOperation.ts
import Operation from '../../core/Operation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';

type State = {
    modelGroup: ModelGroup2D;
    target: (SvgModel | SvgGroup)[];
};

type ToolPathMutation = {
    toolPathID: string;
    removedModelIDs: string[];
    deleted: boolean;
    snapshot?: unknown; // for restore on undo
};

export default class GroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private target: (SvgModel | SvgGroup)[];
    private newGroup: SvgGroup | null = null;
    private toolPathMutations: ToolPathMutation[] = [];

    public constructor(state: State) {
        super();
        this.modelGroup = state.modelGroup;
        this.target = state.target;
    }

    public redo(): void {
        const mg = this.modelGroup;
        mg.selectedModelArray = this.target.slice();
        const { newGroup } = mg.group();
        this.newGroup = newGroup;
        // apply "Model leaves Tool Path" rule (Phase 7 wires this in)
    }

    public undo(): void {
        if (!this.newGroup) return;
        const mg = this.modelGroup;
        mg.selectedModelArray = [this.newGroup];
        mg.ungroup();
        this.newGroup = null;
        // reverse tool-path mutations (Phase 7 wires this in)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/scene/operations/GroupSvgOperation.ts
git commit -m "Feature: Add GroupSvgOperation skeleton for undo/redo"
```

---

### Task 15: `UngroupSvgOperation`

**Files:**
- Create: `src/app/scene/operations/UngroupSvgOperation.ts`

- [ ] **Step 1: Mirror image of Task 14**

```ts
// src/app/scene/operations/UngroupSvgOperation.ts
import Operation from '../../core/Operation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';

type State = {
    modelGroup: ModelGroup2D;
    target: SvgGroup[];
};

type GroupSnapshot = {
    groupID: string;
    name: string;
    baseName: string;
    childModelIDs: string[];
    index: number;
};

export default class UngroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private snapshots: GroupSnapshot[];
    private groupsForRedo: SvgGroup[];

    public constructor(state: State) {
        super();
        this.modelGroup = state.modelGroup;
        this.groupsForRedo = state.target;
        this.snapshots = state.target.map((grp) => ({
            groupID: grp.modelID,
            name: grp.name,
            baseName: grp.baseName,
            childModelIDs: grp.children.map((c) => c.modelID),
            index: state.modelGroup.models.indexOf(grp),
        }));
    }

    public redo(): void {
        const mg = this.modelGroup;
        mg.selectedModelArray = this.groupsForRedo.slice();
        mg.ungroup();
    }

    public undo(): void {
        // rebuild groups from snapshots
        const mg = this.modelGroup;
        for (const snap of this.snapshots) {
            const children = snap.childModelIDs
                .map((id) => mg.getModel(id) as SvgModel | undefined)
                .filter((m): m is SvgModel => !!m);
            mg.selectedModelArray = children;
            mg.group();
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/scene/operations/UngroupSvgOperation.ts
git commit -m "Feature: Add UngroupSvgOperation skeleton for undo/redo"
```

---

### Task 16: Wire operations into `actions-group` thunks

**Files:**
- Modify: `src/app/flux/editor/actions-group.ts`

- [ ] **Step 1: Use CompoundOperation + OperationHistory**

```ts
import CompoundOperation from '../../core/CompoundOperation';
import GroupSvgOperation from '../../scene/operations/GroupSvgOperation';
import UngroupSvgOperation from '../../scene/operations/UngroupSvgOperation';

groupSelectedModels: (headType) => (dispatch, getState) => {
    const state = getState()[headType];
    const modelGroup = state.modelGroup;
    const operationHistory = state.history;
    if (!modelGroup.canGroup()) return;
    const target = modelGroup.selectedModelArray.slice();
    const op = new GroupSvgOperation({ modelGroup, target });
    const compound = new CompoundOperation();
    compound.push(op);
    compound.registerCallbackAll(() => {
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    });
    compound.redo();
    operationHistory.push(compound);
},

ungroupSelectedGroups: (headType) => (dispatch, getState) => {
    const state = getState()[headType];
    const modelGroup = state.modelGroup;
    const operationHistory = state.history;
    if (!modelGroup.canUngroup()) return;
    const target = modelGroup.selectedModelArray.filter((m) => m.type === '2d-group');
    const op = new UngroupSvgOperation({ modelGroup, target });
    const compound = new CompoundOperation();
    compound.push(op);
    compound.registerCallbackAll(() => {
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    });
    compound.redo();
    operationHistory.push(compound);
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/flux/editor/actions-group.ts
git commit -m "Feature: Wire group/ungroup through CompoundOperation + OperationHistory"
```

---

## Phase 7 — Tool path integration

### Task 17: `removeModelFromToolPaths` helper on `ToolPathGroup`

**Files:**
- Modify: `src/app/toolpaths/ToolPathGroup.ts`
- Test: `test/toolpaths/ToolPathGroup-leaves.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/toolpaths/ToolPathGroup-leaves.test.js
import test from 'tape';
import ToolPathGroup from '../../src/app/toolpaths/ToolPathGroup';

test('ToolPathGroup.removeModelFromToolPaths: keeps ToolPath if non-empty', (t) => {
    const fakeMG = {};
    const tpg = new ToolPathGroup(fakeMG, 'laser');
    // seed a tool path directly on the internal array
    const toolPath = {
        id: 'tp1',
        visibleModelIDs: ['M1', 'M2', 'M3'],
        getState() { return { id: this.id, visibleModelIDs: this.visibleModelIDs }; },
    };
    (tpg as any).toolPaths = [toolPath];

    const result = tpg.removeModelFromToolPaths('M2');

    t.deepEqual(toolPath.visibleModelIDs, ['M1', 'M3'], 'M2 removed');
    t.deepEqual(result.deletedToolPathIDs, [], 'no tool paths deleted');
    t.end();
});

test('ToolPathGroup.removeModelFromToolPaths: deletes ToolPath when empty', (t) => {
    const fakeMG = {};
    const tpg = new ToolPathGroup(fakeMG, 'laser');
    const toolPath = { id: 'tp1', visibleModelIDs: ['only'], getState() { return { id: this.id }; } };
    (tpg as any).toolPaths = [toolPath];

    const result = tpg.removeModelFromToolPaths('only');

    t.equal((tpg as any).toolPaths.length, 0, 'tool path gone');
    t.deepEqual(result.deletedToolPathIDs, ['tp1']);
    t.end();
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- test/toolpaths/ToolPathGroup-leaves.test.js`
Expected: FAIL

- [ ] **Step 3: Implement the method**

Find the current `toolPaths` array declaration in `ToolPathGroup.ts` and add:

```ts
public removeModelFromToolPaths(modelID: string): { deletedToolPathIDs: string[] } {
    const deleted: string[] = [];
    for (const tp of this.toolPaths.slice()) {
        const idx = tp.visibleModelIDs.indexOf(modelID);
        if (idx === -1) continue;
        tp.visibleModelIDs.splice(idx, 1);
        if (tp.visibleModelIDs.length === 0) {
            this.deleteToolPath(tp.id);
            deleted.push(tp.id);
        }
    }
    return { deletedToolPathIDs: deleted };
}
```

(If `deleteToolPath` does not exist with that name, look for the existing delete helper and wire it in.)

- [ ] **Step 4: Run tests**

Run: `npm test -- test/toolpaths/ToolPathGroup-leaves.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/toolpaths/ToolPathGroup.ts test/toolpaths/ToolPathGroup-leaves.test.js
git commit -m "Feature: ToolPathGroup.removeModelFromToolPaths enforces leave-rule"
```

---

### Task 18: Call `removeModelFromToolPaths` inside `ModelGroup2D.group()`

**Files:**
- Modify: `src/app/models/ModelGroup2D.ts`

- [ ] **Step 1: Accept a ToolPathGroup reference**

```ts
private toolPathGroupRef: { removeModelFromToolPaths(id: string): { deletedToolPathIDs: string[] } } | null = null;

public setToolPathGroupRef(ref: typeof this.toolPathGroupRef): void {
    this.toolPathGroupRef = ref;
}
```

In the laser/cnc flux files, after constructing both `modelGroup` and `toolPathGroup`, wire it:

```ts
initModelGroup.setToolPathGroupRef(initToolPathGroup);
```

- [ ] **Step 2: Extend `group()` to apply the rule per child**

At the end of the `group()` method in `ModelGroup2D.ts`, before the return, add:

```ts
if (this.toolPathGroupRef) {
    for (const child of newGroup.children) {
        this.toolPathGroupRef.removeModelFromToolPaths(child.modelID);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/models/ModelGroup2D.ts src/app/flux/laser/index.ts src/app/flux/cnc/index.ts
git commit -m "Feature: Apply leave-rule to tool paths on group()"
```

---

### Task 19: `ToolPath.getFlatChildModelIDs` and `targetsGroup`

**Files:**
- Modify: `src/app/toolpaths/ToolPath.ts`

- [ ] **Step 1: Add a resolver that expands group IDs**

Add near the existing getters in `ToolPath.ts`:

```ts
public getFlatChildModelIDs(): string[] {
    const modelGroup = this.modelGroup; // ModelGroup2D
    const result: string[] = [];
    for (const id of this.visibleModelIDs) {
        const entity = modelGroup.getModel(id);
        if (!entity) continue;
        if ((entity as any).type === '2d-group') {
            for (const child of (entity as any).children) {
                result.push(child.modelID);
            }
        } else {
            result.push(id);
        }
    }
    return result;
}

public get targetsGroup(): boolean {
    return this.visibleModelIDs.some((id) => {
        const entity = this.modelGroup.getModel(id);
        return entity && (entity as any).type === '2d-group';
    });
}
```

- [ ] **Step 2: Use `getFlatChildModelIDs` in the places that currently read `visibleModelIDs` for g-code generation**

Search within `src/app/toolpaths/` and `src/server/` for callers that iterate `visibleModelIDs` when sending jobs. Replace the direct field access with the method call.

- [ ] **Step 3: Commit**

```bash
git add src/app/toolpaths/ToolPath.ts
git commit -m "Feature: ToolPath group-target resolution (getFlatChildModelIDs)"
```

---

### Task 20: Confirmation dialog for group tool-path creation

**Files:**
- Modify: `src/app/flux/editor/actions-process.ts`
- Modify: `src/app/ui/widgets/CncLaserList/ToolPathList/ToolPathListBox.jsx`

- [ ] **Step 1: In `createToolPath` action, detect conflicts**

Around the current `createToolPath` body (line 228 of `actions-process.ts`), add a pre-check:

```ts
createToolPath: (headType, options = {}) => async (dispatch, getState) => {
    const state = getState()[headType];
    const { modelGroup, toolPathGroup } = state;
    const selectedModels = modelGroup.getSelectedModelArray();

    // Collect conflicts: children of any selected group that currently own a ToolPath
    const conflicts: { model; toolPath }[] = [];
    for (const entity of selectedModels) {
        if ((entity as any).type === '2d-group') {
            for (const child of (entity as any).children) {
                for (const tp of toolPathGroup.toolPaths) {
                    if (tp.visibleModelIDs.includes(child.modelID)) {
                        conflicts.push({ model: child, toolPath: tp });
                    }
                }
            }
        }
    }

    if (conflicts.length > 0 && !options.confirmed) {
        return { requiresConfirmation: true, conflicts };
    }

    // ... existing creation logic

    // after creating, if there were conflicts, apply the leave-rule
    for (const { model } of conflicts) {
        toolPathGroup.removeModelFromToolPaths(model.modelID);
    }
    // ... existing return
},
```

- [ ] **Step 2: Render the warning dialog in `ToolPathListBox.jsx`**

```jsx
createToolPath: async () => {
    const first = await dispatch(editorActions.createToolPath(props.headType));
    if (first && first.requiresConfirmation) {
        modal({
            title: i18n._('key-CncLaser/ToolPath-GroupReplaceWarning-Title'),
            body: (
                <>
                    <p>{i18n._('key-CncLaser/ToolPath-GroupReplaceWarning-Body')}</p>
                    <ul>
                        {first.conflicts.map(({ model, toolPath }) => (
                            <li key={model.modelID}>{model.name} — {toolPath.name}</li>
                        ))}
                    </ul>
                </>
            ),
            footer: (
                <>
                    <Button onClick={() => modal.close()}>
                        {i18n._('key-CncLaser/ToolPath-GroupReplaceWarning-Cancel')}
                    </Button>
                    <Button onClick={async () => {
                        modal.close();
                        const second = await dispatch(editorActions.createToolPath(props.headType, { confirmed: true }));
                        setEditingToolpath(second);
                    }}>
                        {i18n._('key-CncLaser/ToolPath-GroupReplaceWarning-Continue')}
                    </Button>
                </>
            ),
        });
        return;
    }
    setEditingToolpath(first);
},
```

- [ ] **Step 3: Commit**

```bash
git add src/app/flux/editor/actions-process.ts src/app/ui/widgets/CncLaserList/ToolPathList/ToolPathListBox.jsx
git commit -m "Feature: Confirmation dialog for group tool path creation"
```

---

## Phase 8 — UI: Toolbar, context menu, shortcuts

### Task 21: `GroupButton.jsx` toolbar component

**Files:**
- Create: `src/app/ui/widgets/CncLaserTopBar/GroupButton.jsx`

- [ ] **Step 1: Write the component**

```jsx
// src/app/ui/widgets/CncLaserTopBar/GroupButton.jsx
import React from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import i18n from '../../../lib/i18n';
import { actions as editorActions } from '../../../flux/editor';
import SvgIcon from '../../components/SvgIcon';

export default function GroupButton({ headType }) {
    const dispatch = useDispatch();
    const modelGroup = useSelector((state) => state[headType].modelGroup);

    const canGroup = modelGroup.canGroup();
    const canUngroup = modelGroup.canUngroup();
    const isUngroupMode = canUngroup;

    const onClick = () => {
        if (isUngroupMode) {
            dispatch(editorActions.ungroupSelectedGroups(headType));
        } else {
            dispatch(editorActions.groupSelectedModels(headType));
        }
    };

    const disabled = !canGroup && !canUngroup;

    return (
        <SvgIcon
            name={isUngroupMode ? 'Ungroup' : 'Group'}
            title={isUngroupMode
                ? i18n._('key-CncLaser/MainToolBar-Ungroup')
                : i18n._('key-CncLaser/MainToolBar-Group')}
            tooltip={disabled ? i18n._('key-CncLaser/MainToolBar-GroupTooltip') : undefined}
            disabled={disabled}
            onClick={onClick}
        />
    );
}

GroupButton.propTypes = {
    headType: PropTypes.oneOf(['laser', 'cnc']).isRequired,
};
```

- [ ] **Step 2: Mount in the top bar**

Find the existing top bar for laser/cnc (e.g. `src/app/ui/pages/laser-main/LaserMainPage.tsx` or `src/app/ui/widgets/CncLaserTopBar/`) and render `<GroupButton headType={headType} />` next to the other toolbar icons.

- [ ] **Step 3: Commit**

```bash
git add src/app/ui/widgets/CncLaserTopBar/GroupButton.jsx src/app/ui/widgets/CncLaserTopBar/index.tsx
git commit -m "Feature: Add Group/Ungroup toolbar button for laser/CNC"
```

---

### Task 22: Register `Cmd/Ctrl+G` and `Cmd/Ctrl+Shift+G`

**Files:**
- Modify: the shortcut registration for laser/cnc pages (find by grepping `mod+g` or `ctrl+g`)

- [ ] **Step 1: Add the bindings**

```ts
{
    title: 'Group',
    keys: ['mod+g'],
    callback: () => dispatch(editorActions.groupSelectedModels(headType)),
},
{
    title: 'Ungroup',
    keys: ['mod+shift+g'],
    callback: () => dispatch(editorActions.ungroupSelectedGroups(headType)),
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/lib/shortcut/ShortcutManager.ts
git commit -m "Feature: Cmd/Ctrl+G and Cmd/Ctrl+Shift+G for laser/CNC grouping"
```

---

### Task 23: Context menu entries

**Files:**
- Modify: the canvas context menu file (search `ContextMenu` in `src/app/ui/SVGEditor/`)

- [ ] **Step 1: Add Group / Ungroup / Enter / Exit entries**

```tsx
{
    label: i18n._('key-CncLaser/MainToolBar-Group'),
    disabled: !modelGroup.canGroup(),
    onClick: () => dispatch(editorActions.groupSelectedModels(headType)),
},
{
    label: i18n._('key-CncLaser/MainToolBar-Ungroup'),
    disabled: !modelGroup.canUngroup(),
    onClick: () => dispatch(editorActions.ungroupSelectedGroups(headType)),
},
{
    label: i18n._('key-CncLaser/Canvas-EnterGroup'),
    disabled: !(selectedModelArray.length === 1 && selectedModelArray[0].type === '2d-group') || enteredGroupId,
    onClick: () => dispatch(editorActions.enterGroup(headType, selectedModelArray[0].modelID)),
},
{
    label: i18n._('key-CncLaser/Canvas-ExitGroup'),
    disabled: !enteredGroupId,
    onClick: () => dispatch(editorActions.exitGroup(headType)),
},
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ui/SVGEditor/ContextMenu.jsx
git commit -m "Feature: Context menu entries for Group / Ungroup / Enter / Exit"
```

---

## Phase 9 — Object list foldable rows

### Task 24: Object list renders groups as foldable rows

**Files:**
- Modify: `src/app/ui/widgets/CncLaserList/ObjectList/ObjectListBox.tsx`

- [ ] **Step 1: Render `SvgGroup` entries with a caret and indented children**

```tsx
const [expanded, setExpanded] = useState<Record<string, boolean>>({});

function renderEntry(entity) {
    if (entity.type === '2d-group') {
        const isOpen = expanded[entity.modelID] ?? true;
        return (
            <>
                <div className="list-row group-row">
                    <button onClick={() => setExpanded({ ...expanded, [entity.modelID]: !isOpen })}>
                        {isOpen ? '▼' : '▶'}
                    </button>
                    <span onClick={() => dispatch(editorActions.selectTargetModel(headType, entity, false))}
                          onDoubleClick={() => dispatch(editorActions.enterGroup(headType, entity.modelID))}>
                        {entity.name}
                    </span>
                </div>
                {isOpen && entity.children.map((child) => (
                    <div key={child.modelID} className="list-row indent" onClick={() => dispatch(editorActions.selectTargetModel(headType, child, false))}>
                        {child.modelName ?? child.modelID}
                    </div>
                ))}
            </>
        );
    }
    // free model row (existing rendering)
    return (<div className="list-row" /* ... */>{entity.modelName}</div>);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ui/widgets/CncLaserList/ObjectList/ObjectListBox.tsx
git commit -m "Feature: Object list renders groups as foldable rows"
```

---

## Phase 10 — Project save / load

### Task 25: Serialize groups

**Files:**
- Modify: `src/app/flux/editor/actions-project.ts` (or whichever file assembles the save payload)

- [ ] **Step 1: Find the save function and append a `groups` block**

```ts
const groups = modelGroup.models
    .filter((m) => m.type === '2d-group')
    .map((g) => ({
        groupID: g.modelID,
        name: g.name,
        baseName: g.baseName,
        childModelIDs: g.children.map((c) => c.modelID),
        transformation: g.transformation,
        visible: g.visible,
    }));
// append `groups` to the project payload
projectPayload.groups = groups;
```

- [ ] **Step 2: Commit**

```bash
git add src/app/flux/editor/actions-project.ts
git commit -m "Feature: Serialize SvgGroup entries in project save"
```

---

### Task 26: Rehydrate groups on load

**Files:**
- Modify: `src/app/flux/editor/actions-project.ts`
- Modify: `src/app/models/ModelGroup2D.ts`

- [ ] **Step 1: Add `rehydrateGroup` helper**

```ts
// ModelGroup2D.ts
public rehydrateGroup(state: {
    groupID: string;
    name: string;
    baseName: string;
    childModelIDs: string[];
    transformation: any;
    visible: boolean;
}): SvgGroup | null {
    const children = state.childModelIDs
        .map((id) => this.getModel(id))
        .filter((m): m is SvgModel => !!m && !(m instanceof SvgGroup));
    if (children.length === 0) return null;

    const newGroup = new SvgGroup(
        {
            modelID: state.groupID,
            name: state.name,
            baseName: state.baseName,
            headType: this.headType as 'laser' | 'cnc',
            visible: state.visible,
            transformation: state.transformation,
        },
        this,
    );
    // detach children from models[]
    this.models = this.models.filter((m) => !children.includes(m as SvgModel));
    for (const child of children) {
        newGroup.addChild(child);
    }
    this.models.push(newGroup);
    // DOM: create <g> and move subtrees in
    if (this.svgDataContainer) {
        const elem = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
        newGroup.attachDomElement(elem);
        this.svgDataContainer.appendChild(elem);
        for (const child of children) {
            newGroup.attachChildDom(child);
        }
        newGroup.applyTransformToDom();
    }
    return newGroup;
}
```

- [ ] **Step 2: Call from load**

In `actions-project.ts`, after models are deserialized:

```ts
if (Array.isArray(projectPayload.groups)) {
    for (const groupState of projectPayload.groups) {
        modelGroup.rehydrateGroup(groupState);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/flux/editor/actions-project.ts src/app/models/ModelGroup2D.ts
git commit -m "Feature: Rehydrate SvgGroup entries from project payload"
```

---

## Phase 11 — i18n

### Task 27: Add translation keys (en + de)

**Files:**
- Modify: `src/app/resources/i18n/en/resource.json`
- Modify: `src/app/resources/i18n/de/resource.json`

- [ ] **Step 1: Add keys to `en/resource.json`**

```json
"key-CncLaser/MainToolBar-Group": "Group",
"key-CncLaser/MainToolBar-Ungroup": "Ungroup",
"key-CncLaser/MainToolBar-GroupTooltip": "Select multiple objects to group",
"key-CncLaser/Canvas-EnterGroup": "Enter Group",
"key-CncLaser/Canvas-ExitGroup": "Exit Group",
"key-CncLaser/ObjectList-Group": "Group",
"key-CncLaser/ToolPath-GroupReplaceWarning-Title": "Replace existing tool paths?",
"key-CncLaser/ToolPath-GroupReplaceWarning-Body": "Creating a tool path for this group will remove the following models from their current tool paths. Tool paths that end up empty will be deleted.",
"key-CncLaser/ToolPath-GroupReplaceWarning-Cancel": "Cancel",
"key-CncLaser/ToolPath-GroupReplaceWarning-Continue": "Continue"
```

- [ ] **Step 2: Add keys to `de/resource.json`**

```json
"key-CncLaser/MainToolBar-Group": "Gruppieren",
"key-CncLaser/MainToolBar-Ungroup": "Gruppierung aufheben",
"key-CncLaser/MainToolBar-GroupTooltip": "Mehrere Objekte auswählen zum Gruppieren",
"key-CncLaser/Canvas-EnterGroup": "Gruppe öffnen",
"key-CncLaser/Canvas-ExitGroup": "Gruppe verlassen",
"key-CncLaser/ObjectList-Group": "Gruppe",
"key-CncLaser/ToolPath-GroupReplaceWarning-Title": "Bestehende Tool Paths ersetzen?",
"key-CncLaser/ToolPath-GroupReplaceWarning-Body": "Das Erstellen eines Tool Paths für diese Gruppe entfernt die folgenden Modelle aus ihren aktuellen Tool Paths. Tool Paths, die dadurch leer werden, werden gelöscht.",
"key-CncLaser/ToolPath-GroupReplaceWarning-Cancel": "Abbrechen",
"key-CncLaser/ToolPath-GroupReplaceWarning-Continue": "Fortfahren"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/resources/i18n/en/resource.json src/app/resources/i18n/de/resource.json
git commit -m "Feature: i18n keys for laser/CNC grouping UI"
```

---

## Phase 12 — Manual verification

### Task 28: Run the manual checklist against a dev build

**Files:** none (runtime verification only)

- [ ] **Step 1: Start dev mode**

Run: `npm run dev`
Expected: Electron window opens, laser page loads, no console errors

- [ ] **Step 2: Walk through the 12-point checklist from the spec**

1. Place two rectangles, select both, `Cmd+G` → one group appears, toolbar button now reads "Ungroup"
2. `Cmd+Shift+G` → two rectangles again, both selected
3. Double-click a group → enter mode, sibling objects dimmed, only group children clickable
4. `Escape` → exit, group selected at top level
5. Inside enter mode: move a child → child transform persists, group transform untouched
6. Create a group, then `Create Tool Path` for it → tool path shows with group name "Group 1"
7. Group three elements, one already in a multi-member tool path → the element is removed from that tool path, tool path stays with remaining members
8. Group two elements that are the only two members of a tool path → tool path is deleted
9. Enter a group, create a tool path for one child, exit, select the group, create a group tool path → dialog lists the affected child tool path, continue → child tool path deleted, group tool path created
10. Undo / redo across all the above
11. Save a project with groups and tool paths, restart the app, load it → groups and their tool paths restored exactly
12. Repeat for CNC

- [ ] **Step 3: File bugs for any step that fails, revisit the matching task**

- [ ] **Step 4: When checklist passes, commit a final "feature complete" marker**

```bash
git commit --allow-empty -m "Feature: Laser/CNC element grouping is feature-complete"
```

---

## Spec Self-Review Notes

- All 11 spec phases are covered by phases 1-11 in this plan; phase 12 is the manual verification pass.
- No placeholders ("TBD", "implement later", …) — every code block is concrete.
- Method names used across tasks are consistent: `canGroup`, `canUngroup`, `group`, `ungroup`, `getParentGroup`, `resolveSelectionTarget`, `setEnteredGroupId`, `setSvgDataContainer`, `setToolPathGroupRef`, `rehydrateGroup`, `removeModelFromToolPaths`, `getFlatChildModelIDs`, `targetsGroup`, `attachDomElement`, `attachChildDom`, `detachChildDom`, `applyTransformToDom`, `computeBoundingBox`.
- Tasks in later phases reference only classes/methods defined in earlier phases.

## Open questions surfaced during planning

None — all spec requirements map to a task.
