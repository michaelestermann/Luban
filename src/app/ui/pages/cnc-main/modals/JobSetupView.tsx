import { Machine } from '@snapmaker/luban-platform';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import {
    COORDINATE_MODE_BOTTOM_CENTER,
    COORDINATE_MODE_BOTTOM_LEFT,
    COORDINATE_MODE_BOTTOM_RIGHT,
    COORDINATE_MODE_CENTER,
    COORDINATE_MODE_TOP_LEFT,
    COORDINATE_MODE_TOP_RIGHT,
    HEAD_CNC,
} from '../../../../constants';
import {
    CylinderWorkpieceSize,
    JobSetupSettings,
    Materials,
    Origin,
    OriginReference,
    OriginType,
    RectangleWorkpieceSize,
    Workpiece,
    WorkpieceShape,
} from '../../../../constants/coordinate';
import { actions as editorActions } from '../../../../flux/editor';
import { RootState } from '../../../../flux/index.def';
import useSetState from '../../../../lib/hooks/set-state';
import i18n from '../../../../lib/i18n';
import { toFixed } from '../../../../lib/numeric-utils';
import { NumberInput as Input } from '../../../components/Input';
import Select from '../../../components/Select';
import OriginPointPicker from '../../../widgets/CncLaserShared/OriginPointPicker';
import { localizedAnchorName } from '../../../widgets/CncLaserShared/FramePicker';
import { boundModelIds, createObjectOrigin, isObjectReference, referenceAnchor } from '../../../../lib/object-origin';
import { lockingBlockWorkpieceSize } from '../../../../flux/project/new-project';


type OriginTypeOption = {
    value: OriginType;
    label: string;
};

function getOriginTypeOptions(workpieceShape: WorkpieceShape): OriginTypeOption[] {
    if (workpieceShape === WorkpieceShape.Rectangle) {
        return [
            {
                value: OriginType.Workpiece,
                label: i18n._('key-Term/Workpiece'),
            },
            {
                value: OriginType.Object,
                label: i18n._('key-Term/Object'),
            },
            {
                value: OriginType.CNCLockingBlock,
                label: i18n._('key-CncLaser/JobSetup-Locking block'),
            },
        ];
    } else {
        return [
            {
                value: OriginType.Workpiece,
                label: i18n._('key-Term/Workpiece'),
            },
        ];
    }
}

function getLockingBlockPositionOptions() {
    return [{
        label: i18n._('key-CncLaser/JobSetup-Locking block position A'),
        value: 'A'
    }, {
        label: i18n._('key-CncLaser/JobSetup-Locking block position B'),
        value: 'B'
    }];
}

function getOriginReferenceOptions(workpieceShape: WorkpieceShape, originType: OriginType) {
    if (workpieceShape === WorkpieceShape.Rectangle) {
        if (originType === OriginType.Workpiece) {
            return [
                {
                    label: i18n._(COORDINATE_MODE_CENTER.label),
                    value: COORDINATE_MODE_CENTER.value,
                    mode: COORDINATE_MODE_CENTER
                },
                {
                    label: i18n._(COORDINATE_MODE_BOTTOM_LEFT.label),
                    value: COORDINATE_MODE_BOTTOM_LEFT.value,
                    mode: COORDINATE_MODE_BOTTOM_LEFT
                },
                {
                    label: i18n._(COORDINATE_MODE_BOTTOM_RIGHT.label),
                    value: COORDINATE_MODE_BOTTOM_RIGHT.value,
                    mode: COORDINATE_MODE_BOTTOM_RIGHT
                },
                {
                    label: i18n._(COORDINATE_MODE_TOP_LEFT.label),
                    value: COORDINATE_MODE_TOP_LEFT.value,
                    mode: COORDINATE_MODE_TOP_LEFT
                },
                {
                    label: i18n._(COORDINATE_MODE_TOP_RIGHT.label),
                    value: COORDINATE_MODE_TOP_RIGHT.value,
                    mode: COORDINATE_MODE_TOP_RIGHT
                }
            ];
        } else if (originType === OriginType.Object) {
            return [
                {
                    label: i18n._(COORDINATE_MODE_CENTER.label),
                    value: COORDINATE_MODE_CENTER.value,
                    mode: COORDINATE_MODE_CENTER
                },
                {
                    label: i18n._(COORDINATE_MODE_BOTTOM_LEFT.label),
                    value: COORDINATE_MODE_BOTTOM_LEFT.value,
                    mode: COORDINATE_MODE_BOTTOM_LEFT
                },
                {
                    label: i18n._(COORDINATE_MODE_BOTTOM_RIGHT.label),
                    value: COORDINATE_MODE_BOTTOM_RIGHT.value,
                    mode: COORDINATE_MODE_BOTTOM_RIGHT
                },
                {
                    label: i18n._(COORDINATE_MODE_TOP_LEFT.label),
                    value: COORDINATE_MODE_TOP_LEFT.value,
                    mode: COORDINATE_MODE_TOP_LEFT
                },
                {
                    label: i18n._(COORDINATE_MODE_TOP_RIGHT.label),
                    value: COORDINATE_MODE_TOP_RIGHT.value,
                    mode: COORDINATE_MODE_TOP_RIGHT
                }
            ];
        } else if (originType === OriginType.CNCLockingBlock) {
            return [
                {
                    label: i18n._(COORDINATE_MODE_BOTTOM_LEFT.label),
                    value: COORDINATE_MODE_BOTTOM_LEFT.value,
                    mode: COORDINATE_MODE_BOTTOM_LEFT,
                }
            ];
        }
    } else if (workpieceShape === WorkpieceShape.Cylinder) {
        return [
            {
                label: i18n._(COORDINATE_MODE_BOTTOM_CENTER.label),
                value: COORDINATE_MODE_BOTTOM_CENTER.value,
                mode: COORDINATE_MODE_BOTTOM_CENTER,
            }
        ];
    }

    return [];
}

function localizedReference(reference: string): string {
    const anchor = referenceAnchor(reference);
    return anchor ? localizedAnchorName(anchor) : reference;
}

export type JobSetupViewHandle = {
    // applies the settings to the open project (Job Setup)
    onChange: () => void;
    // the settings as entered (the new project dialog applies them to the new project)
    getSettings: () => JobSetupSettings;
}

export type JobSetupInitial = {
    materials: Materials;
    origin: Origin;
    lockingBlockPosition?: string;
};

export type JobSetupViewProps = {
    // new project dialog: start from these values instead of the open project's (no objects, nothing locked)
    initial?: JobSetupInitial;
    // z-index of the drop-down lists (the view in a dialog above the antd layers)
    popupZIndex?: number;
};

const JobSetupView = React.forwardRef<JobSetupViewHandle, JobSetupViewProps>(({ initial, popupZIndex }, ref) => {
    const activeMachine = useSelector((state: RootState) => state.machine.activeMachine) as Machine;
    const isDraft = !!initial;

    const projectMaterials = useSelector((state: RootState) => state[HEAD_CNC]?.materials, shallowEqual) as Materials;
    const projectOrigin = useSelector((state: RootState) => state[HEAD_CNC].origin, shallowEqual) as Origin;
    const materials = initial ? initial.materials : projectMaterials;
    const origin = initial ? initial.origin : projectOrigin;

    const projectState = useSelector((state: RootState) => state[HEAD_CNC]);
    const inProgress = isDraft ? false : projectState.inProgress;
    const useBackground = isDraft ? false : projectState.useBackground;
    const coordinateMode = isDraft ? null : projectState.coordinateMode;
    const dropdownStyle = popupZIndex ? { zIndex: popupZIndex } : undefined;
    // origin on an object: the selected objects, else the ones it is set to, else all objects of the operations
    const modelGroup = isDraft ? null : projectState.modelGroup;
    const selectedIds: string[] = (modelGroup?.getSelectedModelArray?.() || [])
        .filter(model => model.visible !== false)
        .map(model => model.modelID);
    const existingIds: string[] = boundModelIds(origin)
        .filter(id => (modelGroup?.getModels?.() || []).some(model => model.modelID === id));
    const objectIds = selectedIds.length ? selectedIds : existingIds;

    // workpiece
    const [workpiece, updateWorkpiece] = useSetState<Workpiece>({
        shape: !materials.isRotate ? WorkpieceShape.Rectangle : WorkpieceShape.Cylinder,
        size: materials.isRotate ? {
            diameter: materials.diameter,
            length: materials.length,
        } : {
            x: materials.x,
            y: materials.y,
            z: materials.z,
        }
    });

    const setWorkpieceShape = useCallback((shape: WorkpieceShape) => {
        updateWorkpiece({
            shape,
        });
    }, [updateWorkpiece]);

    const setWorkpieceSize = useCallback((size: RectangleWorkpieceSize | CylinderWorkpieceSize) => {
        if (workpiece.shape === WorkpieceShape.Rectangle) {
            updateWorkpiece({
                size: {
                    x: (size as RectangleWorkpieceSize).x,
                    y: (size as RectangleWorkpieceSize).y,
                    z: (size as RectangleWorkpieceSize).z,
                }
            });
        } else if (workpiece.shape === WorkpieceShape.Cylinder) {
            updateWorkpiece({
                size: {
                    diameter: (size as CylinderWorkpieceSize).diameter,
                    length: (size as CylinderWorkpieceSize).length,
                }
            });
        }
    }, [updateWorkpiece, workpiece.shape]);

    // job type state FIXME
    useEffect(() => {
        const shape: WorkpieceShape = !materials.isRotate ? WorkpieceShape.Rectangle : WorkpieceShape.Cylinder;

        // Update shape
        setWorkpieceShape(shape);

        // Update size
        if (shape === WorkpieceShape.Rectangle) {
            setWorkpieceSize({
                x: materials.x,
                y: materials.y,
                z: materials.z,
            });
        } else if (shape === WorkpieceShape.Cylinder) {
            setWorkpieceSize({
                diameter: materials.diameter,
                length: materials.length,
            });
        }
    }, [
        materials,

        // new
        setWorkpieceShape, setWorkpieceSize,
        // workpiece.shape,
    ]);

    // Origin
    const [selectedOrigin, updateSelectedOrigin] = useSetState<Origin>(origin);

    // origin type
    const originTypeOptions = useMemo(() => {
        return getOriginTypeOptions(workpiece.shape);
    }, [workpiece.shape]);

    // Maximum
    const maxX = activeMachine?.metadata.size.x || 0;
    const maxY = activeMachine?.metadata.size.y || 0;
    const maxZ = activeMachine?.metadata.size.z || 0;

    // Locking Block (Artisan Only, L Bracket)
    const projectLockingBlockPosition = useSelector((state: RootState) => state[HEAD_CNC].lockingBlockPosition);
    const [lockingBlockPosition, setLockingBlockPosition] = useState(
        initial ? (initial.lockingBlockPosition || 'A') : projectLockingBlockPosition
    );

    // the work area follows the locking block (Artisan): set when the origin type or the block position is
    // changed by hand (4.16 set it on every open too, which reset the workpiece size to 400 x 400)
    const setRectangleArea = useCallback((area: { x: number; y: number }) => {
        if (workpiece.shape !== WorkpieceShape.Rectangle) {
            return;
        }
        setWorkpieceSize({ ...(workpiece.size as RectangleWorkpieceSize), x: area.x, y: area.y });
    }, [setWorkpieceSize, workpiece.shape, workpiece.size]);

    const onChangeOriginType = useCallback((option: OriginTypeOption) => {
        if (option.value === OriginType.Workpiece && selectedOrigin.type === OriginType.Object && coordinateMode) {
            // back from an object origin: the workpiece reference the canvas has
            updateSelectedOrigin({ type: option.value, reference: coordinateMode.value });
        } else {
            updateSelectedOrigin({ type: option.value });
        }
        if (option.value === OriginType.CNCLockingBlock && selectedOrigin.type !== OriginType.CNCLockingBlock) {
            // Note: Artisan Only
            setRectangleArea(lockingBlockWorkpieceSize(lockingBlockPosition));
        } else if (option.value !== OriginType.CNCLockingBlock && selectedOrigin.type === OriginType.CNCLockingBlock) {
            // off the locking block: the whole work area again
            setRectangleArea({ x: maxX, y: maxY });
        }
    }, [updateSelectedOrigin, selectedOrigin.type, coordinateMode, setRectangleArea, lockingBlockPosition, maxX, maxY]);

    // origin reference
    const setOriginReference = useCallback((reference: OriginReference) => {
        updateSelectedOrigin({
            reference,
        });
    }, [updateSelectedOrigin]);

    useEffect(() => {
        updateSelectedOrigin(origin);
    }, [updateSelectedOrigin, origin]);

    // an origin type the shape does not offer (a remembered one): the first one it offers
    useEffect(() => {
        if (originTypeOptions.length && !originTypeOptions.some(option => option.value === selectedOrigin.type)) {
            updateSelectedOrigin({ type: originTypeOptions[0].value });
        }
    }, [originTypeOptions, selectedOrigin.type, updateSelectedOrigin]);

    const originReferenceOptions = useMemo(() => {
        return getOriginReferenceOptions(workpiece.shape, selectedOrigin.type);
    }, [workpiece.shape, selectedOrigin.type]);

    const onChangeOriginReference = useCallback((option) => {
        setOriginReference(option.mode.value);
    }, [setOriginReference]);

    // In case default reference is not an option, select an available one as reference
    // (an object origin offers all nine points of the object)
    useEffect(() => {
        if (selectedOrigin.type === OriginType.Object && isObjectReference(selectedOrigin.reference)) {
            return;
        }
        const targetOption = originReferenceOptions.find(option => option.value === selectedOrigin.reference);
        if (!targetOption && originReferenceOptions.length > 0) {
            // back from an object origin: the workpiece reference of the canvas
            const current = originReferenceOptions.find(option => option.value === coordinateMode?.value);
            setOriginReference((current || originReferenceOptions[0]).mode.value as OriginReference);
        }
    }, [
        setOriginReference, coordinateMode,
        originReferenceOptions, selectedOrigin.type, selectedOrigin.reference,
    ]);

    const lockingBlockPositionOptions = useMemo(() => {
        return getLockingBlockPositionOptions();
    }, []);

    const onChangeLockingBlockPosition = useCallback((option) => {
        setLockingBlockPosition(option.value);
        // Note: Artisan Only
        setRectangleArea(lockingBlockWorkpieceSize(option.value));
    }, [setRectangleArea]);

    const imgLockingBlockPosition = `/resources/images/cnc-laser/lock-block-${lockingBlockPosition?.toLowerCase()}.png`;

    // FIXME: Add image to origin options
    let imgOF3axisCoordinateMode = '';
    if (workpiece.shape === WorkpieceShape.Rectangle) { // TODO
        imgOF3axisCoordinateMode = `/resources/images/cnc-laser/working-origin-3-${selectedOrigin.reference}.png`;
    }

    let settingSizeDisabled = false;
    if (useBackground) {
        settingSizeDisabled = true;
    }

    const dispatch = useDispatch();
    useImperativeHandle(ref, () => {
        const getSettings = (): JobSetupSettings => {
            const isObjectOrigin = workpiece.shape === WorkpieceShape.Rectangle && selectedOrigin.type === OriginType.Object;
            // the elements move with the reference (an object origin keeps the workpiece where it is on the canvas)
            const targetOption = originReferenceOptions.find(option => option.value === selectedOrigin.reference);
            return {
                workpiece: { shape: workpiece.shape, size: { ...workpiece.size } },
                origin: isObjectOrigin ? createObjectOrigin(selectedOrigin.reference, objectIds) : { ...selectedOrigin, referenceMetadata: {} },
                coordinateMode: isObjectOrigin ? coordinateMode : (targetOption?.mode || null),
                lockingBlockPosition,
            };
        };
        return {
            getSettings,
            onChange: () => {
                dispatch(editorActions.applyJobSetup(HEAD_CNC, getSettings()));
            },
        };
    }, [
        dispatch,
        originReferenceOptions,

        workpiece.shape,
        workpiece.size,

        selectedOrigin,
        lockingBlockPosition,
        coordinateMode, objectIds,
    ]);

    return (
        <div>
            {/* Workpiece */}
            <div className="margin-bottom-16 font-weight-bold">
                {i18n._('key-Term/Workpiece Size')}
            </div>
            {
                workpiece.shape === WorkpieceShape.Rectangle && (
                    <div className="sm-flex">
                        <img
                            draggable="false"
                            style={{
                                width: '100px',
                                height: '100px'
                            }}
                            src="/resources/images/cnc-laser/working-size-3.png"
                            role="presentation"
                            alt="3 Axis"
                        />
                        <div className="margin-left-16 sm-flex-width">
                            <div className="sm-flex height-32 position-re">
                                <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Width (X)')}</span>
                                <Input
                                    suffix="mm"
                                    disabled={inProgress || settingSizeDisabled}
                                    value={toFixed((workpiece.size as RectangleWorkpieceSize).x, 1)}
                                    max={maxX}
                                    min={2}
                                    onChange={(value) => {
                                        setWorkpieceSize({
                                            x: value,
                                            y: (workpiece.size as RectangleWorkpieceSize).y,
                                            z: (workpiece.size as RectangleWorkpieceSize).z,
                                        });
                                    }}
                                />
                            </div>
                            <div className="sm-flex height-32 position-re margin-top-16">
                                <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Height (Y)')}</span>
                                <Input
                                    suffix="mm"
                                    disabled={inProgress || settingSizeDisabled}
                                    value={toFixed((workpiece.size as RectangleWorkpieceSize).y, 1)}
                                    max={maxY}
                                    min={10}
                                    onChange={(value) => {
                                        setWorkpieceSize({
                                            x: (workpiece.size as RectangleWorkpieceSize).x,
                                            y: value,
                                            z: (workpiece.size as RectangleWorkpieceSize).z,
                                        });
                                    }}
                                />
                            </div>
                            <div className="sm-flex height-32 position-re margin-top-16">
                                <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Thickness (Z)')}</span>
                                <Input
                                    suffix="mm"
                                    disabled={inProgress || settingSizeDisabled}
                                    value={toFixed((workpiece.size as RectangleWorkpieceSize).z ?? 0, 1)}
                                    max={maxZ}
                                    min={0.1}
                                    onChange={(value) => {
                                        setWorkpieceSize({
                                            x: (workpiece.size as RectangleWorkpieceSize).x,
                                            y: (workpiece.size as RectangleWorkpieceSize).y,
                                            z: value,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )
            }
            {
                workpiece.shape === WorkpieceShape.Cylinder && (
                    <>
                        <div className="sm-flex">
                            <img
                                draggable="false"
                                style={{
                                    width: '330px',
                                    margin: '0'
                                }}
                                src="/resources/images/cnc-laser/working-size-4.png"
                                role="presentation"
                                alt="3 Axis"
                            />
                        </div>
                        <div className="margin-top-16">
                            <div className="sm-flex height-32 position-re">
                                <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Length (L)')}</span>
                                <Input
                                    suffix="mm"
                                    disabled={inProgress || settingSizeDisabled}
                                    value={toFixed((workpiece.size as CylinderWorkpieceSize).length, 1)}
                                    max={maxY}
                                    min={10}
                                    onChange={(value) => {
                                        setWorkpieceSize({
                                            diameter: (workpiece.size as CylinderWorkpieceSize).diameter,
                                            length: value,
                                        });
                                    }}
                                />
                            </div>
                            <div className="sm-flex height-32 position-re margin-top-8">
                                <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Diameter (D)')}</span>
                                <Input
                                    suffix="mm"
                                    disabled={inProgress || settingSizeDisabled}
                                    value={toFixed((workpiece.size as CylinderWorkpieceSize).diameter, 1)}
                                    max={maxX}
                                    min={2}
                                    onChange={(value) => {
                                        setWorkpieceSize({
                                            diameter: value,
                                            length: (workpiece.size as CylinderWorkpieceSize).length,
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )
            }

            {/* Origin */}
            <div className="margin-top-24 margin-bottom-16 font-weight-bold">
                {i18n._('key-CncLaser/JobSetup-Work Origin')}
            </div>
            {
                workpiece.shape === WorkpieceShape.Rectangle && (
                    <div className="sm-flex">
                        {selectedOrigin.type === OriginType.Object ? (
                            <div style={{ width: '100px', textAlign: 'center' }}>
                                <OriginPointPicker
                                    value={selectedOrigin.reference}
                                    onPick={setOriginReference}
                                    disabled={inProgress || settingSizeDisabled}
                                />
                            </div>
                        ) : (
                            <img
                                draggable="false"
                                style={{
                                    width: '100px',
                                    height: '100px'
                                }}
                                src={selectedOrigin.type === OriginType.CNCLockingBlock ? imgLockingBlockPosition : imgOF3axisCoordinateMode}
                                role="presentation"
                                alt="3 Axis"
                            />
                        )}
                        <div className="margin-left-16">
                            {/* workpiece, object or CNC locking block */}
                            <div className="height-32 sm-flex">
                                <span className="width-144 margin-right-8 text-overflow-ellipsis">{i18n._('key-CncLaser/JobSetup-Origin on')}</span>
                                <Select
                                    backspaceRemoves={false}
                                    size="120px"
                                    dropdownStyle={dropdownStyle}
                                    clearable={false}
                                    options={originTypeOptions}
                                    isGroup={false}
                                    placeholder={i18n._('key-CncLaser/JobSetup-Choose font')}
                                    value={selectedOrigin.type}
                                    onChange={onChangeOriginType}
                                    disabled={inProgress || settingSizeDisabled}
                                />
                            </div>
                            {
                                selectedOrigin.type === OriginType.Workpiece && (
                                    <div className="height-32 margin-top-16 sm-flex">
                                        <span className="width-144 margin-right-8 text-overflow-ellipsis">{i18n._('key-CncLaser/JobSetup-Origin Position')}</span>
                                        <Select
                                            backspaceRemoves={false}
                                            size="120px"
                                            dropdownStyle={dropdownStyle}
                                            clearable={false}
                                            options={originReferenceOptions}
                                            isGroup={false}
                                            placeholder={i18n._('key-CncLaser/JobSetup-Choose font')}
                                            value={selectedOrigin.reference}
                                            onChange={onChangeOriginReference}
                                            disabled={inProgress || settingSizeDisabled}
                                        />
                                    </div>
                                )
                            }
                            {
                                selectedOrigin.type === OriginType.Object && (
                                    <div className="margin-top-16" style={{ width: 272, color: '#5b6170', fontSize: 12, lineHeight: '18px' }}>
                                        <div className="font-weight-bold" style={{ color: '#1f2430' }}>
                                            {i18n._('key-CncLaser/JobSetup-Origin point')}: {localizedReference(selectedOrigin.reference)}
                                        </div>
                                        {selectedIds.length > 0 && i18n._('key-CncLaser/JobSetup-On the selected objects ({{count}})', { count: selectedIds.length })}
                                        {selectedIds.length === 0 && existingIds.length > 0 && i18n._('key-CncLaser/JobSetup-On the objects the origin is set to')}
                                        {objectIds.length === 0 && i18n._('key-CncLaser/JobSetup-Nothing selected: on all objects of the operations')}
                                    </div>
                                )
                            }
                            {
                                selectedOrigin.type === OriginType.CNCLockingBlock && (
                                    <div className="height-32 margin-top-16 sm-flex">
                                        <span className="width-144 margin-right-8 text-overflow-ellipsis">{i18n._('key-CncLaser/JobSetup-Locking block position')}</span>
                                        <Select
                                            size="120px"
                                            dropdownStyle={dropdownStyle}
                                            clearable={false}
                                            options={lockingBlockPositionOptions}
                                            value={lockingBlockPosition}
                                            onChange={onChangeLockingBlockPosition}
                                        />
                                    </div>
                                )
                            }
                        </div>
                    </div>
                )
            }
            {
                workpiece.shape === WorkpieceShape.Cylinder && (
                    <div className="sm-flex">
                        <img
                            draggable="false"
                            style={{
                                width: '116px',
                                height: '128px',
                                margin: '0 auto'
                            }}
                            src="/resources/images/cnc-laser/working-origin-cnc-4.png"
                            role="presentation"
                            alt="3 Axis"
                        />
                        <div className="margin-left-16 sm-flex-width sm-flex height-32">
                            <span className="width-144 margin-right-8">{i18n._('key-CncLaser/JobSetup-Origin Position')}</span>
                            <Select
                                backspaceRemoves={false}
                                size="120px"
                                dropdownStyle={dropdownStyle}
                                clearable={false}
                                options={[
                                    {
                                        label: i18n._('key-CncLaser/JobSetup-Center'),
                                        value: 'center'
                                    }
                                ]}
                                isGroup={false}
                                value="center"
                                disabled
                            />
                        </div>
                    </div>
                )
            }
        </div>
    );
});

export default JobSetupView;
