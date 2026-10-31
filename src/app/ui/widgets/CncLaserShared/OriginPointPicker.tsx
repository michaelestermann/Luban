import React from 'react';

import { ObjectReference } from '../../../constants/coordinate';
import { ANCHOR_XS, ANCHOR_YS } from '../../../lib/anchor';
import i18n from '../../../lib/i18n';
import { anchorReference } from '../../../lib/object-origin';
import { localizedAnchorName } from './FramePicker';

interface OriginPointPickerProps {
    // the chosen point (Job Setup), none in the menus
    value?: ObjectReference | string | null;
    onPick: (reference: ObjectReference) => void;
    disabled?: boolean;
}

const ALIGN = { left: 'start', center: 'center', right: 'end', top: 'start', middle: 'center', bottom: 'end' };
const ACCENT = '#1d4ed8';

/**
 * Compact 3x3 point picker for the work origin on an object: corners, edge middles and centre of
 * the object's frame. Used in the context menu, the selection bar "⋯" menu and the Job Setup.
 */
const OriginPointPicker: React.FC<OriginPointPickerProps> = ({ value, onPick, disabled }) => (
    <div
        role="presentation"
        data-origin-picker="true"
        style={{ padding: 10, display: 'inline-block' }}
        // keep the context menu open until a point is clicked
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
    >
        <div role="radiogroup" aria-label={i18n._('key-CncLaser/Origin-Origin point')} style={{ position: 'relative', width: 72, height: 52 }}>
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    border: `1.5px dashed ${disabled ? '#b8bfcc' : ACCENT}`,
                    borderRadius: 2,
                    background: '#fff',
                    pointerEvents: 'none',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: -8,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                }}
            >
                {ANCHOR_YS.map(ay => ANCHOR_XS.map((ax) => {
                    const reference = anchorReference({ x: ax, y: ay });
                    const on = value === reference;
                    const name = localizedAnchorName({ x: ax, y: ay });
                    return (
                        <button
                            type="button"
                            key={reference}
                            role="radio"
                            aria-checked={on}
                            aria-label={name}
                            title={name}
                            data-origin-reference={reference}
                            disabled={disabled}
                            onClick={() => onPick(reference)}
                            style={{
                                // own stacking box: hit areas of the menu styles stay on the handle
                                position: 'relative',
                                overflow: 'hidden',
                                justifySelf: ALIGN[ax],
                                alignSelf: ALIGN[ay],
                                width: on ? 16 : 14,
                                height: on ? 16 : 14,
                                padding: 0,
                                borderRadius: '50%',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                background: on ? '#FF5759' : '#fff',
                                border: on ? '2px solid #fff' : `1.5px solid ${disabled ? '#b8bfcc' : '#FF5759'}`,
                                boxShadow: on ? '0 0 0 1.5px #FF5759' : 'none',
                            }}
                        />
                    );
                }))}
            </div>
        </div>
    </div>
);

export default OriginPointPicker;
