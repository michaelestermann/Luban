import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { cloneDeep } from 'lodash';
import { TOOLPATH_TYPE_IMAGE, TOOLPATH_TYPE_VECTOR, LASER_DEFAULT_GCODE_PARAMETERS_DEFINITION } from '../../../../constants';
import i18n from '../../../../lib/i18n';
import SvgIcon from '../../../components/SvgIcon';
import ToolParameters from '../cnc/ToolParameters';
import { toHump } from '../../../../../shared/lib/utils';
import PresentSelector from './PresentSelector';

class GcodeParameters extends PureComponent {
    static propTypes = {
        toolPath: PropTypes.object.isRequired,
        activeToolDefinition: PropTypes.object.isRequired,
        updateGcodeConfig: PropTypes.func.isRequired,
        updateToolConfig: PropTypes.func.isRequired,

        toolDefinitions: PropTypes.array.isRequired,
        setCurrentToolDefinition: PropTypes.func.isRequired,
        isModifiedDefinition: PropTypes.bool.isRequired,
        setCurrentValueAsProfile: PropTypes.func.isRequired,
        isModel: PropTypes.bool,
        zOffsetEnabled: PropTypes.bool,
        halfDiodeModeEnabled: PropTypes.bool,
        auxiliaryAirPumpEnabled: PropTypes.bool,
    };

    state = {
    };

    actions = {
    };

    render() {
        const { toolPath, activeToolDefinition } = this.props;
        const {
            zOffsetEnabled = true,
            halfDiodeModeEnabled = false,
            auxiliaryAirPumpEnabled = false,
        } = this.props;

        const { type, gcodeConfig } = toolPath || {};
        const safeGcodeConfig = gcodeConfig || {};

        const isSVG = type === TOOLPATH_TYPE_VECTOR;
        const isImage = type === TOOLPATH_TYPE_IMAGE;

        const allDefinition = LASER_DEFAULT_GCODE_PARAMETERS_DEFINITION;
        Object.keys(allDefinition).forEach((key) => {
            allDefinition[key].default_value = safeGcodeConfig[key];
            // isGcodeConfig is true means to use updateGcodeConfig, false means to use updateToolConfig
            allDefinition[key].isGcodeConfig = false;
        });

        Object.entries(cloneDeep(activeToolDefinition?.settings || {})).forEach(([key, value]) => {
            if (!allDefinition[toHump(key)]) {
                allDefinition[toHump(key)] = {};
            }
            allDefinition[toHump(key)].default_value = value?.default_value;
        });

        const pathType = allDefinition.pathType.default_value;
        const movementMode = allDefinition.movementMode.default_value;
        const multiPasses = allDefinition.multiPasses.default_value;
        const fixedPowerEnabled = allDefinition.fixedPowerEnabled.default_value;

        // section Method
        const laserDefinitionMethod = {
            'pathType': allDefinition.pathType
        };

        // section Fill
        const laserDefinitionFillKeys = [];
        const laserDefinitionFill = {};
        if (pathType === 'fill') {
            laserDefinitionFillKeys.push('movementMode');
            if (isSVG) {
                laserDefinitionFillKeys.push('fillInterval');
                if (movementMode === 'greyscale-line') {
                    laserDefinitionFillKeys.push('direction');
                }
            } else if (isImage) {
                if (movementMode !== 'greyscale-dot') {
                    laserDefinitionFillKeys.push('direction');
                }
                laserDefinitionFillKeys.push('fillInterval');
            }
        }
        laserDefinitionFillKeys.forEach((key) => {
            if (allDefinition[key]) {
                laserDefinitionFill[key] = allDefinition[key];
            }
            if (key === 'movementMode') {
                if (isSVG) {
                    laserDefinitionFill[key].options = {
                        'greyscale-line': 'Line',
                        'greyscale-dot': 'Dot'
                    };
                } else {
                    laserDefinitionFill[key].options = {
                        'greyscale-line': 'Line',
                        'greyscale-dot': 'Dot'
                    };
                }
            }
        });

        // section Speed
        const laserDefinitionSpeedKeys = ['jogSpeed'];
        if (pathType === 'fill' && movementMode !== 'greyscale-dot') {
            laserDefinitionSpeedKeys.push('workSpeed');
        } else if (pathType === 'path') {
            laserDefinitionSpeedKeys.push('workSpeed');
        }
        if (pathType === 'fill' && movementMode === 'greyscale-dot') {
            laserDefinitionSpeedKeys.push('dwellTime');
        }
        const laserDefinitionSpeed = {};
        laserDefinitionSpeedKeys.forEach((key) => {
            if (allDefinition[key]) {
                laserDefinitionSpeed[key] = allDefinition[key];
            }
        });

        // section Pass
        const laserDefinitionRepetitionKeys = [];
        const laserDefinitionRepetition = {};
        if (pathType === 'path') {
            if (zOffsetEnabled) {
                laserDefinitionRepetitionKeys.push('initialHeightOffset');
            }
            laserDefinitionRepetitionKeys.push('multiPasses');
            if (zOffsetEnabled && multiPasses > 1) {
                laserDefinitionRepetitionKeys.push('multiPassDepth');
            }
            laserDefinitionRepetitionKeys.forEach((key) => {
                if (allDefinition[key]) {
                    laserDefinitionRepetition[key] = allDefinition[key];
                }
            });
        }

        // section Power
        const laserDefinitionPowerKeys = ['fixedPower', 'constantPowerMode'];
        if (halfDiodeModeEnabled) {
            laserDefinitionPowerKeys.push('halfDiodeMode');
        }

        // Optimization
        const laserDefinitionOptimizationKeys = [];
        if (pathType === 'fill' && movementMode === 'greyscale-line') {
            laserDefinitionOptimizationKeys.push('dotWithCompensation');
            laserDefinitionOptimizationKeys.push('scanningPreAccelRatio');
            laserDefinitionOptimizationKeys.push('scanningOffset');
        }
        const laserDefinitionOptimization = {};
        laserDefinitionOptimizationKeys.forEach((key) => {
            if (allDefinition[key]) {
                laserDefinitionOptimization[key] = allDefinition[key];
            }
        });

        // if (pathType === 'fill' && movementMode === 'greyscale-variable-line') {
        //     laserDefinitionPowerKeys.push('fixedMinPower');
        // laserDefinitionPowerKeys.push('powerLevelDivisions');
        // }
        const laserDefinitionPower = {};
        laserDefinitionPowerKeys.forEach((key) => {
            if (allDefinition[key]) {
                laserDefinitionPower[key] = allDefinition[key];
            }
        });

        // section Assist Gas
        const laserDefinitionAuxiliaryGasKeys = ['auxiliaryAirPump'];
        const laserDefinitionAuxiliary = {};
        laserDefinitionAuxiliaryGasKeys.forEach((key) => {
            if (allDefinition[key]) {
                laserDefinitionAuxiliary[key] = allDefinition[key];
            }
        });

        console.log('true', pathType, movementMode, pathType === 'fill' && movementMode === 'greyscale-line');

        return (
            <React.Fragment>
                <div className="sm-parameter-container">
                    {!(isSculpt && isRotate) && (
                        <TipTrigger
                            title={i18n._('key-Cnc/ToolpathParameters-Target Depth')}
                            content={i18n._('key-Cnc/ToolpathParameters-Set the depth of the object to be carved. The depth should be smaller than the flute length.')}
                        >
                            <div className="sm-parameter-row">
                                <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Target Depth')}</span>
                                <Input
                                    disabled={false}
                                    className="sm-parameter-row__input"
                                    size="small"
                                    value={targetDepth}
                                    min={0.01}
                                    max={size.z}
                                    step={0.1}
                                    onChange={(value) => { this.props.updateGcodeConfig({ targetDepth: value }); }}
                                />
                                <span className="sm-parameter-row__input-unit">mm</span>
                            </div>
                        </TipTrigger>
                    )}
                    <TipTrigger
                        title={i18n._('key-Cnc/ToolpathParameters-Jog Height')}
                        content={i18n._('key-Cnc/ToolpathParameters-Set the distance between the tool and the material when the tool is not carving.')}
                    >
                        <div className="sm-parameter-row">
                            <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Jog Height')}</span>
                            <Input
                                disabled={false}
                                className="sm-parameter-row__input"
                                size="small"
                                value={safetyHeight}
                                min={0.1}
                                max={size.z}
                                step={1}
                                onChange={(value) => { this.props.updateGcodeConfig({ safetyHeight: value }); }}
                            />
                            <span className="sm-parameter-row__input-unit">mm</span>
                        </div>
                    </TipTrigger>
                    <TipTrigger
                        title={i18n._('key-Cnc/ToolpathParameters-Stop Height')}
                        content={i18n._('key-Cnc/ToolpathParameters-The distance between the bit and the material when the machine stops.')}
                    >
                        <div className="sm-parameter-row">
                            <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Stop Height')}</span>
                            <Input
                                disabled={false}
                                className="sm-parameter-row__input"
                                size="small"
                                value={stopHeight}
                                min={0.1}
                                max={size.z}
                                step={1}
                                onChange={(value) => { this.props.updateGcodeConfig({ stopHeight: value }); }}
                            />
                            <span className="sm-parameter-row__input-unit">mm</span>
                        </div>
                    </TipTrigger>
                    {isSVG && (
                        <div>
                            {(pathType === 'path' || pathType === 'outline') && (
                                <OptionalDropdown
                                    style={{ marginBottom: '10px' }}
                                    title={i18n._('key-Cnc/ToolpathParameters-Tabs')}
                                    onClick={() => { this.props.updateGcodeConfig({ enableTab: !enableTab }); }}
                                    hidden={!enableTab}
                                >
                                    <TipTrigger
                                        title={i18n._('key-Cnc/ToolpathParameters-Tab Height')}
                                        content={i18n._('key-Cnc/ToolpathParameters-Enter the height of the tabs.')}
                                    >
                                        <div className="sm-parameter-row">
                                            <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Tab Height')}</span>
                                            <Input
                                                className="sm-parameter-row__input"
                                                value={tabHeight}
                                                min={0}
                                                max={targetDepth}
                                                step={0.1}
                                                onChange={(value) => { this.props.updateGcodeConfig({ tabHeight: value }); }}
                                                disabled={!enableTab}
                                            />
                                            <span className="sm-parameter-row__input-unit">mm</span>
                                        </div>
                                    </TipTrigger>
                                    <TipTrigger
                                        title={i18n._('key-Cnc/ToolpathParameters-Tab Space')}
                                        content={i18n._('key-Cnc/ToolpathParameters-Enter the space between any two tabs.')}
                                    >
                                        <div className="sm-parameter-row">
                                            <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Tab Space')}</span>
                                            <Input
                                                className="sm-parameter-row__input"
                                                value={tabSpace}
                                                min={1}
                                                step={1}
                                                onChange={(value) => { this.props.updateGcodeConfig({ tabSpace: value }); }}
                                                disabled={!enableTab}
                                            />
                                            <span className="sm-parameter-row__input-unit">mm</span>
                                        </div>
                                    </TipTrigger>
                                    <TipTrigger
                                        title={i18n._('key-Cnc/ToolpathParameters-Tab Width')}
                                        content={i18n._('key-Cnc/ToolpathParameters-Enter the width of the tabs.')}
                                    >
                                        <div className="sm-parameter-row">
                                            <span className="sm-parameter-row__label">{i18n._('key-Cnc/ToolpathParameters-Tab Width')}</span>
                                            <Input
                                                className="sm-parameter-row__input"
                                                style={{ width: '160px' }}
                                                value={tabWidth}
                                                min={1}
                                                step={1}
                                                onChange={(value) => { this.props.updateGcodeConfig({ tabWidth: value }); }}
                                                disabled={!enableTab}
                                            />
                                            <span className="sm-parameter-row__input-unit">mm</span>
                                        </div>
                                    </TipTrigger>
                                </OptionalDropdown>
                            )}
                        </div>
                    )}
                </div>
            </React.Fragment>
        );
    }
}

const mapStateToProps = (state) => {
    const { size } = state.machine;
    const { materials } = state.cnc;
    return {
        size,
        materials
    };
};

export default connect(mapStateToProps, null)(GcodeParameters);
