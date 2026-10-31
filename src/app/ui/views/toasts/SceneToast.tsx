import React from 'react';
import SvgIcon from '../../components/SvgIcon';

type SceneToastType = 'info' | 'warning' | 'error' | 'success';

interface SceneToastAction {
    label: string;
    onClick: () => void;
}

interface SceneToastProps {
    type?: SceneToastType;
    iconName?: string;
    text: string;
    // optional button after the text ("Back to …")
    action?: SceneToastAction;
}

const Type2Icon = {
    'info': 'WarningTipsWarning',
    'warning': 'WarningTipsWarning',
    'error': 'WarningTipsWarning',
    'success': 'WarningTipsSuccess',
};

const Type2Color = {
    'info': '#1890FF',
    'warning': '#FFA940',
    'error': '#FFA940',
    'success': '#4CB518',
};

export const SceneToast: React.FC<SceneToastProps> = (props) => {
    const type = props?.type || 'warning';
    const iconName = props?.iconName || Type2Icon[type] || Type2Icon.warning;
    const iconColor = Type2Color[type] || Type2Color.warning;
    const { text, action } = props;

    return (
        <div>
            <SvgIcon
                name={iconName}
                type={['static']}
                color={iconColor}
                className="margin-right-4"
            />
            <span className="line-height-24">{text}</span>
            {action && (
                <button
                    type="button"
                    className="margin-left-8 line-height-24"
                    style={{ border: 0, background: 'transparent', color: '#1890FF', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    onClick={action.onClick}
                    data-toast-action
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};

export function makeSceneToast(type: SceneToastType, text: string, action?: SceneToastAction): React.ReactNode {
    return (
        <SceneToast
            type={type}
            text={text}
            action={action}
        />
    );
}
