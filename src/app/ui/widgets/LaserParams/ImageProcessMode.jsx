import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import i18n from '../../../lib/i18n';
import Anchor from '../../components/Anchor';
// import Checkbox from '../../components/Checkbox';
import SvgIcon from '../../components/SvgIcon';
import ps from '../CncLaserShared/properties.styl';
import styles from '../CncLaserShared/styles.styl';
import ConfigRasterBW from './config/ConfigRasterBW';
import ConfigGreyscale from './config/ConfigGreyscale';
import ConfigRasterVector from './config/ConfigRasterVector';
import ConfigHalftone from './config/ConfigHalftone';
// import TipTrigger from '../../components/TipTrigger';
import { actions as editorActions } from '../../../flux/editor';
import { HEAD_LASER, PROCESS_MODE_GREYSCALE, PROCESS_MODE_BW, SOURCE_TYPE, PROCESS_MODE_VECTOR, PROCESS_MODE_HALFTONE } from '../../../constants';

const ImageProcessMode = ({ disabled }) => {
    const dispatch = useDispatch();

    const sourceType = useSelector(state => state?.laser?.modelGroup?.getSelectedModel()?.sourceType);
    const mode = useSelector(state => state?.laser?.modelGroup?.getSelectedModel()?.mode);
    const originalName = useSelector(state => state?.laser?.modelGroup?.getSelectedModel()?.originalName);
    const isBW = mode === PROCESS_MODE_BW;
    const isGreyscale = mode === PROCESS_MODE_GREYSCALE;
    const isRasterVector = sourceType === SOURCE_TYPE.RASTER && mode === PROCESS_MODE_VECTOR;
    const isHalftone = mode === PROCESS_MODE_HALFTONE;
    const isDXF = (originalName ? (originalName.substr(originalName.length - 4, 4).toLowerCase() === '.dxf') : false);

    const [expanded, setExpanded] = useState(true);

    const actions = {
        onToggleExpand: () => {
            setExpanded(!expanded);
        },
        changeSelectedModelMode: (newMode) => {
            dispatch(editorActions.changeSelectedModelMode(HEAD_LASER, sourceType, newMode));
        }
    };

    return (
        <React.Fragment>
            <div className={classNames(styles['laser-mode'], 'border-top-normal', 'margin-top-16', 'margin-bottom-8')}>
                <Anchor className="sm-flex height-32 margin-vertical-8" onClick={actions.onToggleExpand}>
                    <span className="sm-flex-width heading-3">{i18n._('key-Laser/ProcessingModeSection/ImageProcessMode-Processing Mode')}</span>
                    <SvgIcon
                        name="DropdownLine"
                        size={24}
                        type={['static']}
                        className={classNames(
                            expanded ? '' : 'rotate180'
                        )}
                    />
                </Anchor>
                {expanded && (
                    <React.Fragment>
                        <div className={classNames(ps.modes, ps.four)}>
                            {!isDXF && (
                                <button
                                    type="button"
                                    className={classNames(ps.mode, { [ps.on]: mode === 'bw' })}
                                    aria-pressed={mode === 'bw'}
                                    disabled={disabled}
                                    onClick={() => actions.changeSelectedModelMode('bw')}
                                >
                                    <i className={styles['laser-mode__icon-bw']} />
                                    <span>{i18n._('key-Laser/ProcessingModeSection/ImageProcessMode-B&W')}</span>
                                </button>
                            )}
                            {!isDXF && (
                                <button
                                    type="button"
                                    className={classNames(ps.mode, { [ps.on]: mode === 'greyscale' })}
                                    aria-pressed={mode === 'greyscale'}
                                    disabled={disabled}
                                    onClick={() => actions.changeSelectedModelMode('greyscale')}
                                >
                                    <i className={styles['laser-mode__icon-greyscale']} />
                                    <span>{i18n._('key-Laser/ProcessingModeSection/ImageProcessMode-GREYSCALE')}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                className={classNames(ps.mode, { [ps.on]: mode === 'vector' })}
                                aria-pressed={mode === 'vector'}
                                disabled={disabled}
                                onClick={() => actions.changeSelectedModelMode('vector')}
                            >
                                <i className={styles['laser-mode__icon-vector']} />
                                <span>{i18n._('key-Laser/ProcessingModeSection/ImageProcessMode-VECTOR')}</span>
                            </button>
                            {!isDXF && (
                                <button
                                    type="button"
                                    className={classNames(ps.mode, { [ps.on]: mode === 'halftone' })}
                                    aria-pressed={mode === 'halftone'}
                                    disabled={disabled}
                                    onClick={() => actions.changeSelectedModelMode('halftone')}
                                >
                                    <i className={styles['laser-mode__icon-halftone']} />
                                    <span>{i18n._('key-Laser/ProcessingModeSection/ImageProcessMode-HALFTONE')}</span>
                                </button>
                            )}
                        </div>
                        {isBW && <ConfigRasterBW disabled={disabled} />}
                        {isGreyscale && <ConfigGreyscale disabled={disabled} />}
                        {isRasterVector && <ConfigRasterVector disabled={disabled} />}
                        {isHalftone && <ConfigHalftone disabled={disabled} />}
                    </React.Fragment>
                )}
            </div>

        </React.Fragment>
    );
};

ImageProcessMode.propTypes = {
    disabled: PropTypes.bool
};

export default ImageProcessMode;
