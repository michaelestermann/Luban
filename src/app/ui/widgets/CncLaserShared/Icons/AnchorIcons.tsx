import React from 'react';

type SvgIconProps = {
    color?: string;
    disabled?: boolean;
    size?: string | number;
};

const SvgIconTemplate: React.FC<SvgIconProps & { rotation: number }> = ({ rotation, color, size, disabled }) => {
    const actualColor = color || (disabled ? '#E7E8E9' : '#676869');
    const mergedStyle = {
        background: 'transparent',
        borderBottom: '0px',
        cursor: disabled ? 'not-allowed' : 'pointer',
    };

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={actualColor}
            style={mergedStyle}
        >
            <g transform={`rotate(${rotation}, 12, 12)`}>
                <path d="M7.819 16.929c0-.345.28-.625.625-.625h7.86v-7.86a.625.625 0 011.25 0v8.485c0 .345-.28.625-.625.625H8.444a.625.625 0 01-.625-.625z" />
                <path d="M7.493 7.238a.625.625 0 01.884.013l8.379 8.621a.625.625 0 01-.897.871L7.481 8.122a.625.625 0 01.012-.884z" />
            </g>
        </svg>
    );
};

const AnchorTopLeft = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={180} />
);

const AnchorTopCenter = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={-135} />
);

const AnchorTopRight = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={-90} />
);

const AnchorMiddleLeft = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={135} />
);

const AnchorMiddleCenter = (props: SvgIconProps) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={props.size}
        height={props.size}
        viewBox="0 0 24 24"
        fill={props.color || (props.disabled ? '#E7E8E9' : '#000000')}
        style={{
            background: 'transparent',
            borderBottom: '0px',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
        }}
    >
        <circle cx="12" cy="12" r="4" />
    </svg>
);

const AnchorMiddleRight = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={-45} />
);

const AnchorBottomLeft = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={90} />
);

const AnchorBottomCenter = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={45} />
);

const AnchorBottomRight = (props: SvgIconProps) => (
    <SvgIconTemplate {...props} rotation={0} />
);

export {
    AnchorTopLeft,
    AnchorTopCenter,
    AnchorTopRight,
    AnchorMiddleLeft,
    AnchorMiddleCenter,
    AnchorMiddleRight,
    AnchorBottomLeft,
    AnchorBottomCenter,
    AnchorBottomRight
};
