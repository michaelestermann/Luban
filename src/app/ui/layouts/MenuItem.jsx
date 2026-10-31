import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'antd';
import { noop, includes } from 'lodash';
import i18n from '../../lib/i18n';
import styles from './styles/maintoolbar.styl';
import SvgIcon from '../components/SvgIcon';
import { longLangWithType } from '../../constants';
// import Anchor from '../components/Anchor';

function MenuItem({ menuItem, actions, lang, headType, compact = false, dense = false }) {
    const { type = 'button', name = 'Copy', iconClassName, title, inputInfo, disabled = false } = menuItem;
    const { customRender = noop } = menuItem;
    function handleClick(e) {
        actions.handleClick(menuItem.action, e);
    }

    const [itemType, setTtemType] = useState(type);
    useEffect(() => {
        setTtemType(type);
    }, [type]);

    switch (itemType) {
        case 'separator':
            return (
                <div className={compact ? styles['separator-compact'] : styles.separator} />
            );
        case 'button':
            if (compact) {
                // icon only, the title is the tooltip (and the accessible name)
                return (
                    <Tooltip title={i18n._(title)}>
                        <span aria-label={i18n._(title)} className="display-inline">
                            <SvgIcon
                                size={24}
                                name={name}
                                disabled={disabled}
                                className={classNames(styles['bar-icon-compact'], iconClassName)}
                                onClick={(e) => handleClick(e)}
                                inputInfo={inputInfo}
                                type={['static']}
                            />
                        </span>
                    </Tooltip>
                );
            }
            if (dense) {
                // the labelled row does not fit: icon only, the title stays as tooltip and accessible name
                return (
                    <Tooltip title={i18n._(title)}>
                        <span aria-label={i18n._(title)} className="display-inline">
                            <SvgIcon
                                size={24}
                                name={name}
                                disabled={disabled}
                                className={classNames(styles['bar-icon'], styles['bar-icon-dense'], iconClassName)}
                                onClick={(e) => handleClick(e)}
                                inputInfo={inputInfo}
                                type={['static']}
                            />
                        </span>
                    </Tooltip>
                );
            }
            return (
                <Tooltip title={i18n._(title)}>
                    <SvgIcon
                        size={24}
                        name={name}
                        disabled={disabled}
                        isHorizontal={false}
                        className={classNames(styles['bar-icon'], iconClassName, includes(longLangWithType[lang], headType) && styles['bar-icon-for-long'])}
                        onClick={(e) => handleClick(e)}
                        spanText={i18n._(title)}
                        spanClassName={classNames(includes(longLangWithType[lang], headType) && styles['action-title-for-long'])}
                        inputInfo={inputInfo}
                        // type={['hoverNormal', 'pressNormal']}
                        type={['static']}
                    />
                </Tooltip>
            );
        case 'render':
            return customRender();
        default:
            return null;
    }
}
MenuItem.propTypes = {
    menuItem: PropTypes.object.isRequired,
    actions: PropTypes.object.isRequired,
    lang: PropTypes.string,
    headType: PropTypes.string,
    compact: PropTypes.bool,
    dense: PropTypes.bool
};

export default MenuItem;
