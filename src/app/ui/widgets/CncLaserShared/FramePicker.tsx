import React from 'react';
import i18n from '../../../lib/i18n';
import { Anchor, ANCHOR_XS, ANCHOR_YS, anchorName } from '../../../lib/anchor';

export interface FramePickerItem {
    href?: string;
    // position inside the selection frame, 0..1
    x: number;
    y: number;
    width: number;
    height: number;
}

interface FramePickerProps {
    anchor: Anchor;
    onChange: (anchor: Anchor) => void;
    // image of the single selected object
    imageHref?: string;
    // degrees, counter-clockwise as shown in the angle field
    rotation?: number;
    flip?: { horizontal?: boolean; vertical?: boolean };
    // width / height of the selection frame
    aspect: number;
    // images of several selected objects in their relative positions
    items?: FramePickerItem[];
    disabled?: boolean;
}

const MAX_W = 190;
const MAX_H = 130;
const ALIGN = { left: 'start', center: 'center', right: 'end', top: 'start', middle: 'center', bottom: 'end' };

const NAME_KEYS: { [key: string]: () => string } = {
    'top left': () => i18n._('key-FramePicker-TopLeft'),
    'top centre': () => i18n._('key-FramePicker-TopCentre'),
    'top right': () => i18n._('key-FramePicker-TopRight'),
    'middle left': () => i18n._('key-FramePicker-MiddleLeft'),
    'centre': () => i18n._('key-FramePicker-Centre'),
    'middle right': () => i18n._('key-FramePicker-MiddleRight'),
    'bottom left': () => i18n._('key-FramePicker-BottomLeft'),
    'bottom centre': () => i18n._('key-FramePicker-BottomCentre'),
    'bottom right': () => i18n._('key-FramePicker-BottomRight')
};

export const localizedAnchorName = (anchor: Anchor): string => {
    const get = NAME_KEYS[anchorName(anchor).toLowerCase()];
    return get ? get() : anchorName(anchor);
};

const Neutral: React.FC = () => (
    <svg
        width="100%"
        height="100%"
        viewBox="0 0 220 240"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0 }}
    >
        <rect x="10" y="10" width="200" height="220" rx="6" fill="#fff" stroke="#b8bfcc" strokeWidth="3" />
        <g fill="none" stroke="#9aa1b0" strokeWidth="5">
            <path d="M40 60h60v40h50M60 120h90v50M40 170h50v30" />
        </g>
    </svg>
);

const FramePicker: React.FC<FramePickerProps> = ({
    anchor, onChange, imageHref, rotation = 0, flip, aspect, items, disabled
}) => {
    const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
    let w = MAX_W;
    let h = w / safeAspect;
    if (h > MAX_H) {
        h = MAX_H;
        w = h * safeAspect;
    }
    w = Math.max(w, 24);
    h = Math.max(h, 24);

    const scaleX = flip?.horizontal ? -1 : 1;
    const scaleY = flip?.vertical ? -1 : 1;
    const imageTransform = `rotate(${-rotation}deg) scale(${scaleX}, ${scaleY})`;

    return (
        <div>
            <div
                style={{
                    position: 'relative',
                    height: 170,
                    borderRadius: 10,
                    background: '#f4f6f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: disabled ? 0.5 : 1
                }}
            >
                <div style={{ position: 'relative', width: w, height: h }}>
                    {items && items.length > 0 ? (
                        <div style={{ position: 'absolute', inset: 0 }}>
                            {items.map((item, i) => (
                                <div
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={i}
                                    style={{
                                        position: 'absolute',
                                        left: `${item.x * 100}%`,
                                        top: `${item.y * 100}%`,
                                        width: `${item.width * 100}%`,
                                        height: `${item.height * 100}%`
                                    }}
                                >
                                    {item.href ? (
                                        <img
                                            src={item.href}
                                            alt=""
                                            draggable={false}
                                            style={{ width: '100%', height: '100%', objectFit: 'fill' }}
                                        />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', background: '#fff', border: '1.5px solid #b8bfcc', borderRadius: 2, boxSizing: 'border-box' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ position: 'absolute', inset: 0, transform: imageTransform }}>
                            {imageHref ? (
                                <img
                                    src={imageHref}
                                    alt=""
                                    draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'fill', background: '#fff', border: '1.5px solid #b8bfcc', borderRadius: 2, boxSizing: 'border-box' }}
                                />
                            ) : (
                                <Neutral />
                            )}
                        </div>
                    )}
                    <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed #1d4ed8', borderRadius: 2, pointerEvents: 'none' }} />
                    <div
                        role="radiogroup"
                        aria-label={i18n._('key-FramePicker-Reference')}
                        style={{
                            position: 'absolute',
                            inset: -9,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gridTemplateRows: 'repeat(3, minmax(0, 1fr))'
                        }}
                    >
                        {ANCHOR_YS.map(ay => ANCHOR_XS.map((ax) => {
                            const on = anchor.x === ax && anchor.y === ay;
                            const name = localizedAnchorName({ x: ax, y: ay });
                            return (
                                <button
                                    type="button"
                                    key={`${ax}-${ay}`}
                                    role="radio"
                                    aria-checked={on}
                                    aria-label={name}
                                    title={name}
                                    disabled={disabled}
                                    onClick={() => onChange({ x: ax, y: ay })}
                                    style={{
                                        justifySelf: ALIGN[ax],
                                        alignSelf: ALIGN[ay],
                                        width: on ? 18 : 14,
                                        height: on ? 18 : 14,
                                        padding: 0,
                                        borderRadius: 4,
                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                        background: on ? '#1d4ed8' : '#fff',
                                        border: on ? '2px solid #fff' : '1.5px solid #1d4ed8',
                                        boxShadow: on ? '0 0 0 1.5px #1d4ed8' : 'none'
                                    }}
                                />
                            );
                        }))}
                    </div>
                </div>
            </div>
            <div style={{ fontSize: 12, color: '#5b6170', textAlign: 'center', marginTop: 8 }}>
                {i18n._('key-FramePicker-Hint')} · <strong style={{ color: '#1f2430' }}>{localizedAnchorName(anchor)}</strong>
            </div>
        </div>
    );
};

export default FramePicker;
