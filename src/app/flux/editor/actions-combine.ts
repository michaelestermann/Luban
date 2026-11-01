import CompoundOperation from '../../core/CompoundOperation';
import { DISPLAYED_TYPE_MODEL, HEAD_LASER } from '../../constants';
import i18n from '../../lib/i18n';
import { replaceInLayers } from '../../models/z-order';
import { combinableModels, modelOutline, offsetModels } from '../../ui/SVGEditor/combine/model-outline';
import {
    combineMembership, intersect, offsetOutline, OffsetCorners, OffsetSide, Outline, polygonsToD, Pt, replaceMembers, subtract, weld
} from '../../ui/SVGEditor/combine/shape-ops';
import { toast } from '../../ui/components/Toast';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
import ReplaceModelsOperation2D, { MembershipChange } from '../operation-history/ReplaceModelsOperation2D';
import { actions as operationHistoryActions } from '../operation-history';
import { baseActions } from './actions-base';
import { recordSelectionChange, snapshotSelection } from './selection-history';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HeadType = 'laser' | 'cnc';
export type CombineKind = 'weld' | 'subtract' | 'intersect';

export interface OffsetSettings {
    distance: number;
    side: OffsetSide;
    corners: OffsetCorners;
    keepOriginal: boolean;
}

// the values of the last offset are offered next time
let lastOffset: OffsetSettings = { distance: 2, side: 'outside', corners: 'round', keepOriginal: true };

/** Offset outlines of one model: outside and / or inside, each a list of polygons; empty ones left out. */
export function offsetGroups(outline: Outline, settings: OffsetSettings): Pt[][][] {
    if (!(settings.distance > 0)) {
        return [];
    }
    const { outside, inside } = offsetOutline(outline, settings.distance, settings.side, settings.corners);
    return [outside, inside].filter(polygons => polygons.length > 0);
}

// a combine or offset is running (outlines are read and the result uploaded)
const busy = new Set<string>();

// presentation attributes of the result, taken from a drawn input
const STYLE_ATTRIBUTES = ['stroke', 'stroke-width', 'fill', 'fill-opacity', 'opacity'];

export function markChanged(dispatch, headType: HeadType) {
    dispatch(baseActions.updateState(headType, {
        simulationNeedToPreview: true,
        displayedType: DISPLAYED_TYPE_MODEL,
        needToPreview: true
    }));
}

export function warn(text: string) {
    toast(makeSceneToast('warning', text));
}

/** Whether combine / offset can run (not on the 4-axis workpiece, not in the laser A-B position mode). */
export function canEditShapes(state: any, headType: HeadType): boolean {
    return !state[headType]?.materials?.isRotate && !(headType === HEAD_LASER && state[HEAD_LASER]?.isOnABPosition);
}

function resultStyle(state: any, headType: HeadType, models: any[]): Record<string, string> {
    const drawn = models.find(m => m.elem && m.elem.nodeName !== 'image');
    if (drawn) {
        const style: Record<string, string> = {};
        for (const name of STYLE_ATTRIBUTES) {
            const value = drawn.elem.getAttribute(name);
            if (value !== null) {
                style[name] = value;
            }
        }
        return style;
    }
    // like a path drawn with the pen tool
    return { fill: 'transparent', stroke: 'black', 'stroke-width': String(1 / (state[headType].scale || 1)) };
}

/** Creates a path model (like the pen tool does) from path data in content group coordinates; not in the history. */
async function createPathModel(SVGActions, d: string, style: Record<string, string>) {
    const elem = SVGActions.svgContentGroup.addSVGElement({
        element: 'path',
        attr: { ...style, d, 'data-point-editable': 'true' }
    });
    // createModelFromElement places paths by their x / y (paths not drawn with the pen tool)
    const box = elem.getBBox();
    elem.setAttribute('x', String(box.x));
    elem.setAttribute('y', String(box.y));
    const model = await SVGActions.createModelFromElement(elem);
    if (!model) {
        elem.remove();
        return null;
    }
    // point editable like converted shapes, `d` is kept in the config and saved with the project
    model.config = { ...model.config, 'data-point-editable': 'true' };
    model.refresh();
    return model;
}

/**
 * Puts the new models in and takes the removed ones out as one undo step: the new models go where the
 * anchor is in the layer order and take over toolpath membership by `membershipFor`.
 */
function replaceModels(dispatch, getState, headType: HeadType, { removed, placements, membershipFor }: {
    removed: any[]; placements: { anchor: any; added: any[] }[]; membershipFor: (ids: string[]) => string[];
}) {
    const { modelGroup, SVGActions, toolPathGroup, materials } = getState()[headType];
    const added = placements.reduce((all, p) => all.concat(p.added), []);
    const selectionBefore = snapshotSelection(modelGroup);
    const layerBefore = modelGroup.models.filter(m => !added.includes(m));
    // each group of new models goes where its anchor is (in its place if the anchor is removed)
    const layerAfter = placements.reduce(
        (list, p) => replaceInLayers(list, removed.includes(p.anchor) ? [p.anchor] : [], p.added, p.anchor),
        modelGroup.models
    ).filter(m => !removed.includes(m));
    const membership: MembershipChange[] = [];
    for (const toolPath of toolPathGroup.toolPaths) {
        const before = [...toolPath.modelMap.keys()] as string[];
        const after = membershipFor(before);
        if (after.join('|') !== before.join('|')) {
            membership.push({ toolPath, before, after });
        }
    }
    const operation = new ReplaceModelsOperation2D({
        removed,
        added,
        modelGroup,
        svgActions: SVGActions,
        toolPathGroup,
        layerBefore,
        layerAfter,
        membership,
    });
    operation.redo();
    const operations = new CompoundOperation();
    operations.push(operation);
    dispatch(operationHistoryActions.setOperations(headType, operations));

    SVGActions.clearSelection();
    modelGroup.selectedGroupID = null;
    SVGActions.addSelectedSvgModelsByModels(added, !!materials?.isRotate);
    dispatch(recordSelectionChange(headType, operations, selectionBefore));
    dispatch(baseActions.updateState(headType, modelGroup.getState()));
    markChanged(dispatch, headType);
    dispatch(baseActions.render(headType));
}

function discard(modelGroup, models: any[]) {
    for (const model of models) {
        model.elem.remove();
        modelGroup.removeModel(model);
    }
}

export async function readOutlines(getState, headType: HeadType, models: any[]): Promise<Outline[] | null> {
    const contentGroup = getState()[headType].SVGActions.svgContentGroup.group;
    const outlines = await Promise.all(models.map(async (m) => modelOutline(m, contentGroup)));
    return outlines.some(o => !o) ? null : outlines;
}

export const combineActions = {
    /**
     * Weld (union of all), Subtract (the bottom shape minus the shapes above it) or Intersect (the area
     * all shapes cover) of the selected closed shapes: one new path, the inputs are removed. One undo step.
     */
    combineSelected: (headType: HeadType, kind: CombineKind) => async (dispatch, getState) => {
        if (busy.has(headType) || !canEditShapes(getState(), headType)) {
            return;
        }
        const { modelGroup, SVGActions } = getState()[headType];
        const inputs = combinableModels(modelGroup);
        if (inputs.length < 2) {
            return;
        }
        busy.add(headType);
        try {
            const outlines = await readOutlines(getState, headType, inputs);
            if (!outlines) {
                warn(i18n._('key-CncLaser/Combine-The shapes could not be read'));
                return;
            }
            let polygons: Pt[][];
            if (kind === 'weld') {
                polygons = weld(outlines);
            } else if (kind === 'subtract') {
                polygons = subtract(outlines[0], outlines.slice(1));
            } else {
                polygons = intersect(outlines);
            }
            if (polygons.length === 0) {
                warn(kind === 'intersect'
                    ? i18n._('key-CncLaser/Combine-The shapes do not overlap')
                    : i18n._('key-CncLaser/Combine-Nothing is left of the shapes'));
                return;
            }
            const result = await createPathModel(SVGActions, polygonsToD(polygons), resultStyle(getState(), headType, inputs));
            if (!result) {
                return;
            }
            // the scene may have changed while the result was uploaded
            if (inputs.some(m => !modelGroup.getModels().includes(m))) {
                discard(modelGroup, [result]);
                return;
            }
            const inputIds = inputs.map(m => m.modelID);
            replaceModels(dispatch, getState, headType, {
                removed: inputs,
                placements: [{ anchor: inputs[0], added: [result] }],
                membershipFor: (ids) => combineMembership(ids, inputIds, inputs[0].modelID, result.modelID),
            });
        } finally {
            busy.delete(headType);
        }
    },

    /** Opens the Offset values in the properties panel (preview on the canvas). */
    startOffset: (headType: HeadType) => (dispatch, getState) => {
        if (!canEditShapes(getState(), headType) || offsetModels(getState()[headType].modelGroup).length === 0) {
            return;
        }
        dispatch(baseActions.updateState(headType, { offsetSession: { ...lastOffset }, arraySession: null }));
    },

    updateOffset: (headType: HeadType, values: Partial<OffsetSettings>) => (dispatch, getState) => {
        const session = getState()[headType].offsetSession;
        if (session) {
            dispatch(baseActions.updateState(headType, { offsetSession: { ...session, ...values } }));
        }
    },

    cancelOffset: (headType: HeadType) => (dispatch, getState) => {
        if (getState()[headType].offsetSession) {
            dispatch(baseActions.updateState(headType, { offsetSession: null }));
        }
    },

    /**
     * Creates the offset outlines of the selected shapes as new paths above them (outside and inside
     * are separate objects). Without "Keep original" the originals are removed and the results take
     * their place in the operations. One undo step.
     */
    applyOffset: (headType: HeadType) => async (dispatch, getState) => {
        const session: OffsetSettings = getState()[headType].offsetSession;
        if (!session || busy.has(headType)) {
            return;
        }
        const { modelGroup, SVGActions } = getState()[headType];
        const models = offsetModels(modelGroup);
        if (models.length === 0) {
            dispatch(combineActions.cancelOffset(headType));
            return;
        }
        if (!(session.distance > 0)) {
            warn(i18n._('key-CncLaser/Offset-Enter a distance greater than 0'));
            return;
        }
        busy.add(headType);
        try {
            const outlines = await readOutlines(getState, headType, models);
            if (!outlines) {
                warn(i18n._('key-CncLaser/Combine-The shapes could not be read'));
                return;
            }
            const created = [];
            const placements = [];
            const replacements: Record<string, string[]> = {};
            for (let i = 0; i < models.length; i++) {
                for (const polygons of offsetGroups(outlines[i], session)) {
                    const model = await createPathModel(SVGActions, polygonsToD(polygons), resultStyle(getState(), headType, [models[i]]));
                    if (!model) {
                        discard(modelGroup, created);
                        return;
                    }
                    created.push(model);
                    if (placements.length === 0 || placements[placements.length - 1].original !== models[i]) {
                        // results right above their original (above its group if it is in one)
                        placements.push({ original: models[i], anchor: modelGroup.getParentGroup?.(models[i].modelID) || models[i], added: [] });
                    }
                    placements[placements.length - 1].added.push(model);
                    replacements[models[i].modelID] = (replacements[models[i].modelID] || []).concat(model.modelID);
                }
            }
            if (created.length === 0) {
                warn(i18n._('key-CncLaser/Offset-Nothing is left at this distance'));
                return;
            }
            if (models.some(m => !modelGroup.getModels().includes(m))) {
                discard(modelGroup, created);
                return;
            }
            // originals in a group are always kept
            const removed = session.keepOriginal ? [] : models.filter(m => !modelGroup.getParentGroup?.(m.modelID));
            const removedIds = removed.map(m => m.modelID);
            const used = Object.fromEntries(Object.entries(replacements).filter(([id]) => removedIds.includes(id)));
            replaceModels(dispatch, getState, headType, {
                removed,
                placements,
                membershipFor: (ids) => replaceMembers(ids, used),
            });
            lastOffset = { ...session };
            dispatch(baseActions.updateState(headType, { offsetSession: null }));
        } finally {
            busy.delete(headType);
        }
    },
};
