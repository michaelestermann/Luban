import classNames from 'classnames';
import { noop } from 'lodash';
import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { DISPLAYED_TYPE_TOOLPATH } from '../../../constants';
import { RootState } from '../../../flux/index.def';
import { actions as projectActions } from '../../../flux/project';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';
import { Button } from '../../components/Buttons';
import Dropdown from '../../components/Dropdown';
import Menu from '../../components/Menu';
import SvgIcon from '../../components/SvgIcon';
import { loadGcodeToWorkspace } from './load-gcode-to-workspace';
import { useGcodeOutputAvailability } from './use-gcode-output';

interface ExportDropdownProps {
    headType: 'laser' | 'cnc';
    renderImmediately?: boolean;
    // opens the workspace popup after the G-code is loaded
    onOpenWorkspace: () => void;
    className?: string;
}

/**
 * The former Output "Export" dropdown: Load G-code to Workspace (all files) / Export G-code
 * to File (the active file, as the app-bar Export G-code). Shown while the toolpath preview
 * is displayed, as before.
 */
const ExportDropdown: React.FC<ExportDropdownProps> = ({ headType, renderImmediately = false, onOpenWorkspace, className }) => {
    const dispatch = useDispatch();
    const displayedType = useSelector((state: RootState) => state[headType]?.displayedType);
    const gcodeFile = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const materials = useSelector((state: RootState) => state[headType]?.materials);
    const { canUseGcode, isOnABPosition } = useGcodeOutputAvailability(headType);

    const onLoadToWorkspace = useCallback(async () => {
        const loaded = await dispatch(loadGcodeToWorkspace(headType, renderImmediately));
        if (!loaded) {
            return;
        }
        // open workspace
        onOpenWorkspace();
        window.scrollTo(0, 0);
    }, [dispatch, headType, renderImmediately, onOpenWorkspace]);

    const onExport = useCallback(() => {
        if (!gcodeFile) {
            return;
        }
        logGcodeExport(headType, 'local', materials?.isRotate);
        dispatch(projectActions.exportFile(gcodeFile.uploadName, gcodeFile.renderGcodeFileName));
    }, [dispatch, headType, gcodeFile, materials?.isRotate]);

    const menu = (
        <Menu>
            <Menu.Item disabled={!canUseGcode} onClick={onLoadToWorkspace}>
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-CncLaser/G-codeAction-Load G-code to Workspace')}
                </div>
            </Menu.Item>
            <Menu.Item disabled={!canUseGcode} onClick={onExport}>
                <div className={classNames('align-c', 'padding-vertical-4')}>
                    {i18n._('key-CncLaser/G-codeAction-Export G-code to File')}
                </div>
            </Menu.Item>
        </Menu>
    );

    return (
        <div
            onKeyDown={noop}
            role="button"
            tabIndex={0}
            className={classNames('position-re', 'height-40', className)}
        >
            <Dropdown overlay={menu} trigger={['click']}>
                <Button
                    type="primary"
                    priority="level-one"
                    disabled={isOnABPosition || !canUseGcode}
                    className={classNames(
                        'position-absolute',
                        displayedType === DISPLAYED_TYPE_TOOLPATH ? 'display-block' : 'display-none'
                    )}
                    suffixIcon={<SvgIcon name="DropdownOpen" type={['static']} color="#d5d6d9" />}
                >
                    {i18n._('key-CncLaser/G-codeAction-Export')}
                </Button>
            </Dropdown>
        </div>
    );
};

export default ExportDropdown;
