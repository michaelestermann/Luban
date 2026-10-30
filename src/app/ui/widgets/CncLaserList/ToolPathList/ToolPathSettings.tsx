import React, { useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { HEAD_LASER } from '../../../../constants';
import i18n from '../../../../lib/i18n';
import ToolPathConfigurations from '../../../views/ToolPathConfigurations/ToolPathConfigurations';
import ToolPathFastConfigurations from '../../../views/ToolPathConfigurations/ToolPathFastConfigurations';
import styles from './toolpath-cards.styl';

interface ToolPathSettingsProps {
    headType: 'laser' | 'cnc';
}

/**
 * Step-2 right panel: the settings of the selected toolpath, i.e. the existing
 * ToolPathFastConfigurations (method, tool, parameters) with "More >" opening the full
 * toolpath dialog. Moved here from below the toolpath list.
 */
const ToolPathSettings: React.FC<ToolPathSettingsProps> = ({ headType }) => {
    // as in ToolPathListBox: hidden while the laser is in A-B position mode
    const isOnABPosition = useSelector(state => !!state[HEAD_LASER]?.isOnABPosition);
    // toolPathGroup is mutable: renderingTimestamp re-renders on every change
    useSelector(state => state[headType]?.renderingTimestamp);
    const toolPaths = useSelector(state => state[headType]?.toolPathGroup?.getToolPaths(), shallowEqual) || [];
    const selectedIds: string[] = useSelector(state => state[headType]?.toolPathGroup?.selectedToolPathArray, shallowEqual) || [];
    const [editingToolpath, setEditingToolpath] = useState(null);

    const selectedToolPath = selectedIds.length === 1 ? toolPaths.find(toolPath => toolPath.id === selectedIds[0]) : null;

    return (
        <div className={styles.settings}>
            {!isOnABPosition && selectedToolPath && (
                <ToolPathFastConfigurations
                    headType={headType}
                    setEditingToolpath={setEditingToolpath}
                    toolpath={selectedToolPath}
                />
            )}
            {!selectedToolPath && toolPaths.length > 0 && (
                <div className={styles.hint}>
                    {i18n._('key-CncLaser/ToolPathSettings-Select a toolpath to change its settings.')}
                </div>
            )}
            {!isOnABPosition && editingToolpath && (
                <ToolPathConfigurations
                    headType={headType}
                    toolpath={editingToolpath}
                    onClose={() => setEditingToolpath(null)}
                />
            )}
        </div>
    );
};

export default ToolPathSettings;
