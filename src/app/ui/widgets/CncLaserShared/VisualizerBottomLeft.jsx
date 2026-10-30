import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import Slider from '../../components/Slider';
import SvgIcon from '../../components/SvgIcon';
// import styles from './styles.styl';
import { DISPLAYED_TYPE_TOOLPATH, MAX_LASER_CNC_CANVAS_SCALE, MIN_LASER_CNC_CANVAS_SCALE } from '../../../constants';

const VisualizerBottomLeft = ({ toFront, zoomOut, zoomIn, scale, minScale, maxScale, updateScale, displayedType }) => {
    return (
        <div
            style={{
                textDecoration: 'none',
                cursor: 'auto',
            }}
        >
            {/* The object list moved to the left panel (CncLaserShared/ProjectLeftView) */}
            {displayedType !== DISPLAYED_TYPE_TOOLPATH && (
                <div className={classNames('margin-horizontal-8', 'height-24')}>
                    <SvgIcon
                        name="ViewFix"
                        onClick={toFront}
                    />
                    <SvgIcon
                        className="margin-horizontal-8"
                        name="ViewReduce"
                        onClick={zoomOut}
                    />
                    <Slider
                        value={scale}
                        min={minScale ?? MIN_LASER_CNC_CANVAS_SCALE}
                        max={maxScale ?? MAX_LASER_CNC_CANVAS_SCALE}
                        step={0.1}
                        isBlack
                        onChange={(value) => {
                            updateScale(value);
                        }}
                        onAfterChange={() => {
                        }}
                    />
                    <SvgIcon
                        name="ViewEnlarge"
                        className="margin-left-8"
                        onClick={zoomIn}
                    />
                </div>
            )}
        </div>
    );
};

VisualizerBottomLeft.propTypes = {
    zoomIn: PropTypes.func.isRequired,
    zoomOut: PropTypes.func.isRequired,
    toFront: PropTypes.func.isRequired,
    scale: PropTypes.number.isRequired,
    minScale: PropTypes.number,
    maxScale: PropTypes.number,
    updateScale: PropTypes.func.isRequired,
    displayedType: PropTypes.string
};

export default VisualizerBottomLeft;
