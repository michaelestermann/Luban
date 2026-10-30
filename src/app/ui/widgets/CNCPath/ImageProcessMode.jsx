import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import i18n from '../../../lib/i18n';
import Anchor from '../../components/Anchor';
import styles from '../CncLaserShared/styles.styl';
import ReliefParameters from './config/ReliefParameters';
import SvgIcon from '../../components/SvgIcon';
import ps from '../CncLaserShared/properties.styl';
// import Checkbox from '../../components/Checkbox';
// import TipTrigger from '../../components/TipTrigger';
import { PROCESS_MODE_GREYSCALE, SOURCE_TYPE } from '../../../constants';

const ImageProcessMode = ({ changeSelectedModelMode, disabled }) => {
    const mode = useSelector(state => state?.cnc?.modelGroup?.getSelectedModel()?.mode);
    const sourceType = useSelector(state => state?.cnc?.modelGroup?.getSelectedModel()?.sourceType);
    const originalName = useSelector(state => state?.cnc?.modelGroup?.getSelectedModel()?.originalName);
    const [expanded, setExpanded] = useState(true);
    const isGreyscale = mode === PROCESS_MODE_GREYSCALE;
    const isSvg = sourceType === SOURCE_TYPE.SVG;
    const isDXF = (originalName ? (originalName.substr(originalName.length - 4, 4).toLowerCase() === '.dxf') : false);

    const actions = {
        onToggleExpand: () => {
            setExpanded(!expanded);
        },
        changeSelectedModelMode: (newMode) => {
            changeSelectedModelMode(sourceType, newMode);
        }
    };

    return (
        <React.Fragment>
            <div className={classNames(styles['cnc-mode'], 'border-top-normal', 'margin-top-16')}>
                <Anchor className="sm-flex height-32 margin-vertical-8" onClick={actions.onToggleExpand}>
                    <span className="sm-flex-width heading-3">{i18n._('key-Cnc/Edit/ImageProcessMode-Processing Mode')}</span>
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
                        <div className={ps.modes}>
                            {!isDXF && (
                                <button
                                    type="button"
                                    className={classNames(ps.mode, { [ps.on]: mode === 'greyscale' })}
                                    aria-pressed={mode === 'greyscale'}
                                    disabled={disabled}
                                    onClick={() => actions.changeSelectedModelMode('greyscale')}
                                >
                                    <svg viewBox="0 0 112 64" aria-hidden="true">
                                        <defs>
                                            <radialGradient id="cnc-mode-relief" cx="50%" cy="45%" r="60%">
                                                <stop offset="0" stopColor="#ffffff" />
                                                <stop offset=".55" stopColor="#9aa3b2" />
                                                <stop offset="1" stopColor="#3b4252" />
                                            </radialGradient>
                                        </defs>
                                        <rect width="112" height="64" rx="6" fill="#3b4252" />
                                        <ellipse cx="56" cy="32" rx="40" ry="24" fill="url(#cnc-mode-relief)" />
                                        <path d="M30 40c8-14 18-18 26-10s18 4 26-8" fill="none" stroke="#ffffff" strokeOpacity=".5" strokeWidth="2" />
                                    </svg>
                                    <span>{i18n._('key-Cnc/Edit/ImageProcessMode-Relief')}</span>
                                </button>
                            )}
                            {isSvg && (
                                <button
                                    type="button"
                                    className={classNames(ps.mode, { [ps.on]: mode === 'vector' })}
                                    aria-pressed={mode === 'vector'}
                                    disabled={disabled}
                                    onClick={() => actions.changeSelectedModelMode('vector')}
                                >
                                    <svg viewBox="0 0 112 64" aria-hidden="true">
                                        <rect width="112" height="64" rx="6" fill="#ffffff" />
                                        <path d="M20 46c10-26 26-30 36-14s24 12 36-12" fill="none" stroke="#1f2430" strokeWidth="2.5" />
                                        <circle cx="20" cy="46" r="3" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
                                        <circle cx="56" cy="32" r="3" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
                                        <circle cx="92" cy="20" r="3" fill="#fff" stroke="#1d4ed8" strokeWidth="2" />
                                    </svg>
                                    <span>{i18n._('key-Cnc/Edit/ImageProcessMode-Vector')}</span>
                                </button>
                            )}
                        </div>
                        {isGreyscale && (
                            <ReliefParameters disabled={disabled} />
                        )}
                    </React.Fragment>
                )}
            </div>
        </React.Fragment>
    );
};

ImageProcessMode.propTypes = {
    disabled: PropTypes.bool,
    changeSelectedModelMode: PropTypes.func.isRequired
};

export default ImageProcessMode;
