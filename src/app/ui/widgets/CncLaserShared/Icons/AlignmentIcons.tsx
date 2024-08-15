import React from 'react';


type SvgIconProps = {
    color?: string;
    size?: string | number;

// eslint-disable-next-line react/no-unused-prop-types
    disabled?: boolean;

// eslint-disable-next-line react/no-unused-prop-types
    transform?: string;
};

const AlignIconTemplate: React.FC<SvgIconProps & { children: React.ReactNode }> = ({ children, color, size, disabled }) => {
    const actualColor = color || '#000000';
    const mergedStyle = {
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
    };

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size || 24}
            height={size || 24}
            viewBox="0 0 202.624 202.624"
            fill={actualColor}
            style={mergedStyle}
        >
            {children}
        </svg>
    );
};

// Vertical Alignment Middle
const AlignVerticalMiddleTemplate = (props: SvgIconProps) => (
    <AlignIconTemplate {...props}>
        <g transform={props.transform || ''}>
            <path d="M202.621,97.416h-38.966V58.45c0-2.152-1.743-3.897-3.897-3.897h-38.966c-2.154,0-3.897,1.745-3.897,3.897v38.966H85.724
                V35.07c0-2.152-1.743-3.897-3.897-3.897H42.862c-2.154,0-3.897,1.745-3.897,3.897v62.345H0v7.793h38.966v62.345
                c0,2.152,1.743,3.897,3.897,3.897h38.966c2.154,0,3.897-1.745,3.897-3.897v-62.345h31.172v38.966c0,2.152,1.743,3.897,3.897,3.897
                h38.966c2.154,0,3.897-1.745,3.897-3.897v-38.966h38.966v-7.793H202.621z M77.931,97.416v7.793v58.448H46.759v-58.448v-7.793
                V38.968h31.172V97.416z M155.862,97.416v7.793v35.069H124.69v-35.069v-7.793V62.346h31.172V97.416z"
            />
        </g>
    </AlignIconTemplate>
);

// Horizontal Alignment Right
const AlignHorizontalRightTemplate = (props: SvgIconProps) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={props.size || 24}
        height={props.size || 24}
        viewBox="0 0 194.828 194.828"
        fill={props.color || '#000000'}
        style={{
            background: 'transparent',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
        }}
    >
        <g transform={props.transform || ''}>
            <path d="M151.967,38.966H19.483c-2.152,0-3.897,1.745-3.897,3.897v38.966c0,2.152,1.745,3.897,3.897,3.897h132.483
                c2.152,0,3.897-1.745,3.897-3.897V42.862C155.863,40.71,154.118,38.966,151.967,38.966z M148.07,77.931H23.38V46.759h124.69
                V77.931z"
            />
            <path d="M151.967,116.897H66.242c-2.152,0-3.897,1.745-3.897,3.897v38.966c0,2.152,1.745,3.897,3.897,3.897h85.724
                c2.152,0,3.897-1.745,3.897-3.897v-38.966C155.863,118.641,154.118,116.897,151.967,116.897z M148.07,155.862H70.139V124.69
                h77.931V155.862z"
            />
            <rect x="171.449" width="7.793" height="194.828" />
        </g>
    </svg>
);

// Usage Example for Specific Transformations
const AlignVerticalTop = (props: SvgIconProps) => (
    <AlignHorizontalRightTemplate {...props} transform="rotate(270, 101.312, 101.312)" />
);

const AlignVerticalMiddle = (props: SvgIconProps) => (
    <AlignVerticalMiddleTemplate {...props} />
);

const AlignVerticalBottom = (props: SvgIconProps) => (
    <AlignHorizontalRightTemplate {...props} transform="rotate(90, 101.312, 101.312)" />
);

const AlignHorizontalLeft = (props: SvgIconProps) => (
    <AlignHorizontalRightTemplate {...props} transform="rotate(180, 101.312, 101.312)" />
);

const AlignHorizontalCenter = (props: SvgIconProps) => (
    <AlignVerticalMiddleTemplate {...props} transform="rotate(90, 101.312, 101.312)" />
);

const AlignHorizontalRight = (props: SvgIconProps) => (
    <AlignHorizontalRightTemplate {...props} />
);

export {
    AlignVerticalTop,
    AlignVerticalMiddle,
    AlignVerticalBottom,
    AlignHorizontalLeft,
    AlignHorizontalCenter,
    AlignHorizontalRight,
};
