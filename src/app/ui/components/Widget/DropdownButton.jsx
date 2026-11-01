import PropTypes from 'prop-types';
import React from 'react';
import Dropdown from '../Dropdown';
import styles from './index.styl';

const DropdownButton = (props) => {
    const { btnSize, toggle, style, children, ...rest } = props;

    // Split component props. The antd based Dropdown has no ControlledComponent
    // (and so no foreign propTypes to match against), so every prop goes to the toggle.
    const dropdownProps = {};
    const toggleProps = {};
    rest && Object.keys(rest).forEach(propName => {
        toggleProps[propName] = props[propName];
    });

    return (
        <Dropdown
            {...dropdownProps}
            style={{
                ...style,
                float: 'left'
            }}
            btnSize={btnSize}
        >
            <Dropdown.Toggle
                {...toggleProps}
                className={styles['widget-button']}
                componentClass="a"
            >
                {toggle}
            </Dropdown.Toggle>
            <Dropdown.Menu>
                {children}
            </Dropdown.Menu>
        </Dropdown>
    );
};

DropdownButton.propTypes = {
    ...Dropdown.propTypes,

    // Align the menu to the right side of the dropdown toggle.
    pullRight: PropTypes.bool,

    // One of: 'lg', 'md', 'sm', 'xs'
    // btnSize: Button.propTypes.btnSize,

    // One of: 'default', 'primary', 'emphasis', 'flat', 'link'
    // btnStyle: Button.propTypes.btnStyle,

    // toggle
    toggle: PropTypes.node.isRequired,

    // Whether to prevent a caret from being rendered next to the title.
    noCaret: PropTypes.bool
};

DropdownButton.defaultProps = {
    pullRight: true,
    noCaret: true
};

export default DropdownButton;
