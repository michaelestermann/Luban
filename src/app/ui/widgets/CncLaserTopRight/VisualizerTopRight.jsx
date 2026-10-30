import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';
import i18n from '../../../lib/i18n';

import { HEAD_CNC, DISPLAYED_TYPE_TOOLPATH } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import styles from './styles.styl';

const VisualizerTopRight = ({ headType }) => {
    const displayedType = useSelector(state => state[headType]?.displayedType);
    const showToolPath = useSelector(state => state[headType]?.showToolPath);
    const showSimulation = useSelector(state => state[headType]?.showSimulation);
    const canGenerateGcode = useSelector(state => state[headType]?.toolPathGroup?.canGenerateGcode());
    const simulationNeedToPreview = useSelector(state => state[headType]?.simulationNeedToPreview);

    const dispatch = useDispatch();

    const actions = {
        switchToEditPage: () => {
            if (displayedType === DISPLAYED_TYPE_TOOLPATH) {
                dispatch(editorActions.showModelGroupObject(headType));
            } else {
                dispatch(editorActions.showToolPathGroupObject(headType));
            }
        },
        switchShowToolPath: () => {
            dispatch(editorActions.showToolpathInPreview(headType, !showToolPath));
        },
        switchShowSimulation: () => {
            if (showSimulation) {
                dispatch(editorActions.showSimulationInPreview(headType, !showSimulation));
                return;
            }
            if (canGenerateGcode) {
                if (simulationNeedToPreview) {
                    dispatch(editorActions.commitGenerateViewPath(headType));
                } else {
                    dispatch(editorActions.showSimulationInPreview(headType, !showSimulation));
                }
            }
        }
    };

    useEffect(() => {
        if (canGenerateGcode === false) {
            dispatch(editorActions.showSimulationInPreview(headType, false));
        }
    }, [canGenerateGcode]);

    // CNC only (Laser has no simulation): Toolpath / Simulation as a segmented control at the
    // top centre of the canvas. Each segment is an independent toggle, as the former checkboxes.
    if (headType !== HEAD_CNC) {
        return null;
    }
    const segments = [
        { key: 'toolpath', label: i18n._('key-CncLaser/Preview-Toolpath'), pressed: !!showToolPath, onClick: actions.switchShowToolPath },
        { key: 'simulation', label: i18n._('key-CncLaser/Preview-Simulation'), pressed: !!showSimulation, onClick: actions.switchShowSimulation }
    ];
    return (
        <div
            className={styles['preview-segmented']}
            role="group"
            aria-label={i18n._('key-CncLaser/Preview-Preview Type')}
        >
            {segments.map(segment => (
                <button
                    key={segment.key}
                    type="button"
                    aria-pressed={segment.pressed}
                    className={classNames(styles.segment, { [styles.active]: segment.pressed })}
                    onClick={segment.onClick}
                >
                    {segment.label}
                </button>
            ))}
        </div>
    );
};

VisualizerTopRight.propTypes = {
    headType: PropTypes.string.isRequired
};

export default VisualizerTopRight;
