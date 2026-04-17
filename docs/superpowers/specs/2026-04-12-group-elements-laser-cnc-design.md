# Group Elements in Laser / CNC

Design spec for the "group elements" feature in Snapmaker Luban's laser and CNC workspaces.

## Motivation

Users working in the laser or CNC workspace need to manage sets of related SVG elements as atomic units. Today:

- Selection is per-element only; there is no persistent grouping
- Tool paths reference individual models; assigning a process to a logical group of elements is only possible by manually selecting every member and remembering that they belong together
- The 3D printing workspace already supports grouping (`ThreeGroup`), but the laser/CNC side does not have a comparable concept

This design adds first-class groups to `ModelGroup2D`, mirrors the 3DP pattern, and makes tool paths aware of groups so that a process can be assigned at the group level.

## Requirements

1. Users can select multiple elements and group them into one logical unit, and ungroup later
2. Groups support an enter/exit mode (Inkscape-style): double-click a group to edit individual children without dissolving it
3. Tool paths can target a group as a whole; the group then behaves like one target in the process panel
4. A tool path may live at **exactly one** level of the hierarchy: either on a group, or on one or more of its children — never both
5. Group, ungroup, enter, exit, and all related tool-path mutations are undoable
6. Projects that contain groups round-trip correctly via save/load

Out of scope for this iteration:

- Nested groups (groups containing groups) — flat only
- Groups in the 3D printing workspace — already handled by `ThreeGroup`
- Import/export of nested `<g>` structures in raw SVG files — we keep the existing flatten-on-import behaviour

## 1. Data Model

### `SvgGroup` class (new, `src/app/models/SvgGroup.ts`)

Mirrors `ThreeGroup` in shape but operates on SVG/DOM:

```
class SvgGroup {
    modelID: string              // uuid, same space as SvgModel.modelID
    type: '2d-group'             // discriminator for heterogeneous models[]
    name: string                 // "Group 1", "Group 2", …
    baseName: string
    visible: boolean
    headType: 'laser' | 'cnc'

    children: SvgModel[]         // flat; no nested groups
    modelGroup: ModelGroup2D     // back-reference

    elem: SVGGElement            // the DOM `<g>` that contains the children's DOM
    transformation: ModelTransformation   // aggregated box transform
}
```

### `ModelGroup2D` changes

- `models: (SvgModel | SvgGroup)[]` — heterogeneous list, same pattern as `ModelGroup.models` in 3DP
- New methods: `group()`, `ungroup()`, `canGroup()`, `canUngroup()`, `getGroupById()`, `getParentGroup(modelID)`
- `addModel()` / `removeModel()` are group-aware (removing a child also detaches it from its parent group; if the group ends up empty, it is deleted)
- `getModels<T>()` optionally flattens groups so existing callers that expect leaf models keep working

### Redux state additions (per head type)

- `state.laser.enteredGroupId: string | null`
- `state.cnc.enteredGroupId: string | null`

`null` means "not inside any group"; a string ID means the UI is currently inside that group.

### SVG DOM strategy

- `group()` creates a new `<g id="{groupID}">` inside the existing `#svg-data` container and moves each child's DOM subtree into it (DOM move, not clone, so event listeners and references survive)
- `ungroup()` moves each child's DOM subtree back out to `#svg-data`, then removes the group `<g>`
- The group's own `transform` attribute is used for group-level move/rotate/scale; child transforms stay untouched

### Serialization in project files

The save format (`actions-project.ts` / `actions-base.ts`) gains one new block:

```
groups: [
  {
    groupID: "uuid",
    name: "Group 1",
    baseName: "group",
    childModelIDs: ["modelID1", "modelID2"],
    transformation: { positionX, positionY, rotationZ, scaleX, scaleY },
    visible: true
  }
]
```

Load order: models first, then groups. For each group state, `ModelGroup2D.rehydrateGroup(state)` wires the parent-child links and moves child `<g>` nodes into the group `<g>`.

Tool paths are serialised unchanged — their `visibleModelIDs` may reference groups alongside models.

Projects that predate this feature (no `groups` key) load normally with everything flat.

## 2. Selection and Enter / Exit Mode

### Top-level selection (`enteredGroupId === null`)

- Click on an element that belongs to a group → the **whole group** is selected (the `SvgGroup` instance ends up in `selectedModelArray`)
- Click on a free element → just that element
- Shift+click extends the selection with another group or free element
- Rectangle-select picks up anything whose bounding box is fully inside the rectangle; groups behave atomically (a partial overlap does not include the group)

### Enter mode (`enteredGroupId === groupID`)

- Entered via: double-click on a group in the canvas, or "Enter Group" from the context menu, or double-click on the group in the object list
- While entered:
  - `selectedModelArray` can contain individual children of that group
  - A transparent SVG overlay rect spans the canvas and captures clicks outside the group, while a `<clipPath>` hole exposes the group's interior. Standard Inkscape-style.
  - CSS class `svg-outside-entered-group` dims everything else to 35% opacity
  - The entered group itself gains a dashed blue outline around its bounding box
- Exit triggers:
  - `Escape`
  - Click on the dimmed overlay (outside the group)
  - Switching to another editing tool (Move/Rotate/Vector/etc.)
  - Ungrouping the entered group (it dissolves and exit happens automatically)
- On exit the group returns to top-level selection

### Transform handling

- When an `SvgGroup` is the selection, move/rotate/scale operations are written to the group's `<g transform="…">` attribute, not propagated into each child's own transform
- This keeps the group consistent and cheap — child models preserve their own local transforms

### Tool interaction

- Inside enter mode, all editing tools (Move, Rotate, Scale, Vector, Mask, …) behave exactly as on the top level, but only over the group's children
- Global actions (Job Setup, Workspace, Save, etc.) remain available

## 3. Group / Ungroup Actions and Operation History

### Core methods on `ModelGroup2D`

```
canGroup(): boolean
  // true when ≥ 2 top-level entities are selected and enter mode is off

canUngroup(): boolean
  // true when at least one SvgGroup is in the selection

group(): { newGroup: SvgGroup, modelState }
  // 1. Snapshot selectedModelArray
  // 2. Create a new SvgGroup with a fresh DOM `<g>`
  // 3. For each selected entity:
  //      - SvgModel   → remove from models[] → push into newGroup.children
  //      - SvgGroup   → pull its children out (flatten; no nesting), discard the old group
  // 4. Move each child's DOM subtree into newGroup.elem
  // 5. Insert newGroup at min(indexesOfSelected) in models[]
  // 6. Apply the "Model leaves Tool Path" rule (see §4) for every newly grouped child
  // 7. Select newGroup, fire childrenChanged(), state update

ungroup(): void
  // For each selected SvgGroup:
  //   1. Detach children from group.children
  //   2. Move their DOM subtrees from group.elem back into #svg-data
  //   3. Remove group.elem
  //   4. Insert children at the group's previous index
  //   5. If the group owned a tool path → delete it (children receive no auto-replacement)
  // Select the released children
```

### Redux actions (`src/app/flux/editor/actions-group.ts`, new)

- `groupSelectedModels(headType)`
- `ungroupSelectedGroups(headType)`
- `enterGroup(headType, groupID)`
- `exitGroup(headType)`

### Operation history (`src/app/core/Operations/`)

Two new operation classes, both pushed through a `CompoundOperation` so the whole sequence is one undo step:

- `GroupModelsOperation` — records `{ groupID, childModelIDs, insertIndex, childToolPathMutations }` where `childToolPathMutations` captures which tool paths lost which children and which tool paths were fully deleted (enough to restore the previous state)
- `UngroupOperation` — mirror image; records `{ groupState, childInsertIndexes, groupToolPath? }` so the group can be rebuilt on undo

## 4. Tool Path Integration

### Invariants

- A tool path's `visibleModelIDs: string[]` may reference `SvgModel` IDs and / or `SvgGroup` IDs
- A model may belong to at most one tool path at a time (unchanged from today)
- A model that lives inside a group may have its own tool path **only** if the parent group does not have a tool path
- A group that has a tool path implies none of its children have an individual tool path

### Helpers on `ToolPath`

- `getFlatChildModelIDs()` — resolves `visibleModelIDs` to concrete `SvgModel` IDs, expanding any group IDs in the list. Used by the g-code generator.
- `targetsGroup: boolean` — cached convenience flag for "is the target an SvgGroup?"

### Central rule: "Model leaves Tool Path"

Whenever a model ID is removed from a tool path's `visibleModelIDs` — for any reason — the following applies:

- The tool path stays alive with its remaining members
- Only when `visibleModelIDs` becomes empty is the tool path itself deleted

This is the single rule that governs every mutation that reduces tool path membership: grouping, creating a group tool path, deleting a model, ungrouping (see §3 where group ownership maps to group-level deletion).

### What happens during `group()` (applies the rule automatically)

For each child moving into the new group:

1. Find every tool path whose `visibleModelIDs` still contains this child's ID
2. Remove the child's ID from each such tool path
3. If a tool path ends up with an empty `visibleModelIDs` → delete it

No user confirmation is shown: the operation is undoable and the user explicitly triggered the group.

**Examples**

- T1 has members `[M1, M2, M3]`. User groups M1 + M5 → G. Result: T1 becomes `[M2, M3]`, G contains `[M1, M5]`, G has no tool path.
- T1 has member `[M1]`. User groups M1 + M5 → G. Result: T1 is deleted (empty), G contains `[M1, M5]`, no tool paths exist.

### What happens when a user creates a tool path *for* a group

In steady state (after normal grouping), the children of a group do not have their own tool paths — they were removed when the group was formed. The only realistic way a child ends up owning a tool path again is through enter mode, where the user selects a single child and explicitly creates a tool path for it.

When the user later selects that group at top level and creates a group-level tool path:

1. `createToolPath` inspects every child of the group and collects the IDs of any tool paths referencing those children
2. A confirmation dialog appears:

   ```
   Title:  "Replace existing tool paths?"
   Body:   "Creating a tool path for this group will remove the following
            models from their current tool paths. Tool paths that end up
            empty will be deleted.

            Affected:
              • Group 1 / Rectangle 2 — currently in "Cut Outline"
              • Group 1 / Star 1       — currently in "Engrave Fill"

            Continue?"
   Buttons: [Cancel] [Continue]
   ```
3. On Cancel: no mutation, no new tool path
4. On Continue: apply the "Model leaves Tool Path" rule to each affected tool path, then create the new group tool path with `visibleModelIDs: [groupID]`

The whole confirm-and-apply flow is recorded as a single `CompoundOperation` so one undo reverses everything (old tool paths come back, the new group tool path disappears).

When there are no children with tool paths, no dialog is shown — the new group tool path is created directly.

### Rendering in `ToolPathListBox`

- A tool path targeting a group shows the group's name ("Group 1") and a small group badge
- Expanding the tool path shows the flat list of leaf models it ultimately covers

### Validation when editing / creating a child tool path inside enter mode

- `canCreateToolPath()` returns false for a child whose parent group already owns a tool path
- The "Create Tool Path" button in `ToolPathListBox` is then disabled with a tooltip `"This group already has a tool path"`

## 5. UI (Toolbar, Context Menu, Shortcuts, Object List)

### Main toolbar

One contextual button added to the laser/CNC top toolbar (alongside "Vector Tool", "Mask", …):

- When `canGroup()` → icon `Group`, label `Group`, click → `groupSelectedModels`
- When `canUngroup()` → icon `Ungroup`, label `Ungroup`, click → `ungroupSelectedGroups`
- Otherwise → button disabled with tooltip `"Select multiple objects to group"`

This follows the existing 3DP top-bar convention (`src/app/ui/views/PrintingTopBar/`).

### Canvas context menu (right-click)

Added under the existing Cut / Copy / Paste / Duplicate / Delete section:

- `Group` (enabled when `canGroup()`)
- `Ungroup` (enabled when `canUngroup()`)
- `Enter Group` (enabled when exactly one `SvgGroup` is selected and enter mode is off)
- `Exit Group` (enabled when `enteredGroupId !== null`)

### Keyboard shortcuts

Registered via the existing shortcut framework for both laser and CNC pages:

- `Cmd/Ctrl + G` → group
- `Cmd/Ctrl + Shift + G` → ungroup
- Double-click on an `SvgGroup` in the canvas → enter group
- `Escape` → exit group (only active when `enteredGroupId !== null`; existing Escape behaviour elsewhere is untouched)

Shortcuts are suppressed while inputs are focused or while a modal dialog is open, using the existing `isKeyDownInSVGRoot` guard.

### Object list panel (left sidebar, `src/app/ui/widgets/CncLaserList/`)

- Groups appear as foldable rows: `▼ Group 1` with the children indented underneath
- Clicking the caret folds/unfolds; clicking the group name selects the group; double-click enters it
- The folded/unfolded state is ephemeral component state, not persisted in Redux

### Canvas visual cues

- Selected group: the standard multi-select frame plus a small "Group" badge in the top-left corner of the frame
- Entered group: dashed blue outline around the group's bounding box, plus the 35% opacity dim overlay for everything outside

### Tool path panel (right sidebar)

- Tool paths that target a group show the group's name and a small group icon
- Expanding the tool path row lists all resolved child model names

## 6. Persistence, i18n, Testing

### Project file serialization

Covered in §1 "Serialization in project files". Key points:

- New `groups: SvgGroupState[]` block alongside the existing models and tool paths
- Load order: models → groups → tool paths
- Backwards compatible: old projects without `groups` load as all-flat
- Tool paths that reference group IDs are round-trip safe

### i18n keys (all new, added to `src/app/resources/i18n/{en,de,...}/resource.json`)

- `key-CncLaser/MainToolBar-Group` — "Group" / "Gruppieren"
- `key-CncLaser/MainToolBar-Ungroup` — "Ungroup" / "Gruppierung aufheben"
- `key-CncLaser/MainToolBar-GroupTooltip` — "Select multiple objects to group" / "Mehrere Objekte auswählen zum Gruppieren"
- `key-CncLaser/Canvas-EnterGroup` — "Enter Group" / "Gruppe öffnen"
- `key-CncLaser/Canvas-ExitGroup` — "Exit Group" / "Gruppe verlassen"
- `key-CncLaser/ObjectList-Group` — "Group"
- `key-CncLaser/ToolPath-GroupReplaceWarning-Title` — "Replace existing tool paths?" / "Bestehende Tool Paths ersetzen?"
- `key-CncLaser/ToolPath-GroupReplaceWarning-Body` — with `{{list}}` placeholder for affected tool paths
- `key-CncLaser/ToolPath-GroupReplaceWarning-Cancel` — "Cancel" / "Abbrechen"
- `key-CncLaser/ToolPath-GroupReplaceWarning-Continue` — "Continue" / "Fortfahren"

`en` and `de` are populated in this change; other languages receive the English string as the fallback until translators pick it up.

### Testing

**Manual verification checklist (run after each incremental step that affects the relevant area):**

1. Place two rectangles, select both, `Cmd+G` → a group is created, toolbar button toggles to `Ungroup`
2. Ungroup via `Cmd+Shift+G` → two rectangles again, both selected
3. Double-click a group → enter mode, overlay visible, only the group's children are clickable
4. `Escape` → exits, group is still selected at top level
5. Inside enter mode, move a child → child transform persists, group transform is untouched
6. Create a group, then create a tool path for it → tool path appears with the group's name
7. Group three elements, one of which is already in a multi-member tool path → the element is removed from that tool path, the tool path stays with its remaining members
8. Group two elements that are the only two members of a tool path → tool path is deleted
9. Enter a group, create a tool path for one child, exit, select the group, create a group tool path → confirmation dialog lists the affected child tool path, continuing deletes it and creates the group tool path
10. Undo / redo across all the above transitions
11. Save a project with groups and tool paths, restart the app, load it → groups and their tool paths are restored exactly
12. Repeat the checklist for CNC

**Automated unit tests** (tape, alongside existing `test/*.js`):

- `ModelGroup2D.group()` / `.ungroup()` / `.canGroup()` / `.canUngroup()` over representative inputs
- The "Model leaves Tool Path" rule: non-empty stays, empty gets deleted
- Invariant: a group with a tool path cannot coexist with a child that has its own tool path

### Incremental implementation order

1. `SvgGroup` class and `ModelGroup2D.group()` / `.ungroup()` (no UI, with unit tests)
2. SVG DOM integration (group `<g>` as the DOM container)
3. Top-level selection rules (clicking a child selects the parent group)
4. Transform propagation (move / rotate / scale on group → group `<g transform>`)
5. Enter / exit mode and the dimming overlay
6. Operation history (`GroupModelsOperation`, `UngroupOperation`)
7. Tool path integration (group-aware `visibleModelIDs`, "Model leaves Tool Path" rule, confirmation dialog)
8. UI: toolbar button, context menu, keyboard shortcuts
9. Object list foldable rows
10. Project save / load serialization
11. i18n keys

## Open Questions

None at spec time; all clarifications from the brainstorming session are folded into the sections above.
