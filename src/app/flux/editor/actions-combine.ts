import CompoundOperation from '../../core/CompoundOperation';
import { DISPLAYED_TYPE_MODEL, HEAD_LASER } from '../../constants';
import i18n from '../../lib/i18n';
import { replaceInLayers } from '../../models/z-order';
import { combinableModels, modelOutline } from '../../ui/SVGEditor/combine/model-outline';
import { combineMembership, intersect, Outline, polygonsToD, Pt, subtract, weld } from '../../ui/SVGEditor/combine/shape-ops';
import { toast } from '../../ui/components/Toast';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
import ReplaceModelsOperation2D, { MembershipChange } from '../operation-history/ReplaceModelsOperation2D';
import { actions as operationHistoryActions } from '../operation-history';
import { baseActions } from './actions-base';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HeadType = 'laser' | 'cnc';
export type CombineKind = 'weld' | 'subtract' | 'intersect';

// a combine or offset is running (outlines are read and the result uploaded)
const busy = new Set<string>();

// presentation attributes of the result, taken from a drawn input
const STYLE_ATTRIBUTES = ['stroke', 'stroke-width', 'fill', 'fill-opacity', 'opacity'];

function markChanged(dispatch, headType: HeadType) {
    dispatch(baseActions.updateState(headType, {
        simulationNeedToPreview: true,
        displayedType: DISPLAYED_TYPE_MODEL,
        needToPreview: true
    }));
}

function warn(text: string) {
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
function replaceModels(dispatch, getState, headType: HeadType, { removed, added, anchor, membershipFor }: {
    removed: any[]; added: any[]; anchor: any; membershipFor: (ids: string[]) => string[];
}) {
    const { modelGroup, SVGActions, toolPathGroup, materials } = getState()[headType];
    const layerBefore = modelGroup.models.filter(m => !added.includes(m));
    const layerAfter = replaceInLayers(modelGroup.models, removed, added, anchor);
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
    dispatch(baseActions.updateState(headType, modelGroup.getState()));
    markChanged(dispatch, headType);
    dispatch(baseActions.render(headType));
}

async function readOutlines(getState, headType: HeadType, models: any[]): Promise<Outline[] | null> {
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
                result.elem.remove();
                modelGroup.removeModel(result);
                return;
            }
            const inputIds = inputs.map(m => m.modelID);
            replaceModels(dispatch, getState, headType, {
                removed: inputs,
                added: [result],
                anchor: inputs[0],
                membershipFor: (ids) => combineMembership(ids, inputIds, inputs[0].modelID, result.modelID),
            });
        } finally {
            busy.delete(headType);
        }
    },
};
