import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import { HEAD_PRINTING } from '../../constants';
import Anchor from '../components/Anchor';
import { Badge } from '../components/Badge';
import SvgIcon from '../components/SvgIcon';
import MenuItem from './MenuItem';
import styles from './styles/maintoolbar.styl';
import log from '../../lib/log';


class MainToolBar extends React.PureComponent {
    static propTypes = {
        leftItems: PropTypes.array,
        mainBarClassName: PropTypes.string,
        lang: PropTypes.string,
        headType: PropTypes.string,
        profileInitialized: PropTypes.bool,
        hasMachineSettings: PropTypes.bool,
        // machineInfo: PropTypes.object,
        activeMachine: PropTypes.object, // currently active machine
        isConnected: PropTypes.bool,
        materialInfo: PropTypes.object,
        setShowMachineMaterialSettings: PropTypes.func,
        wrapID: PropTypes.string,
        // compact: icon-only buttons in one row with a centre (stepper) and a right slot
        compact: PropTypes.bool,
        renderCenter: PropTypes.func,
        renderRight: PropTypes.func
    };

    // dense: icon-only buttons (title as tooltip) while the labelled buttons do not fit in one row
    state = { dense: false };

    leftRef = React.createRef();

    // width the labelled buttons need, measured before switching to dense
    neededWidth = 0;

    resizeObserver = null;

    mutationObserver = null;

    componentDidMount() {
        const el = this.leftRef.current;
        if (el && typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.measure());
            this.resizeObserver.observe(el);
        }
        if (el && typeof MutationObserver !== 'undefined') {
            // MenuItems also re-render on their own (their item type is component state)
            this.mutationObserver = new MutationObserver(() => this.measure());
            this.mutationObserver.observe(el, { childList: true, subtree: true });
        }
        this.measure();
    }

    componentDidUpdate(prevProps) {
        if (this.itemsSignature(prevProps.leftItems) !== this.itemsSignature(this.props.leftItems) && this.state.dense) {
            // other buttons: measure the labelled row again
            this.showLabels();
            return;
        }
        this.measure();
    }

    componentWillUnmount() {
        this.resizeObserver && this.resizeObserver.disconnect();
        this.resizeObserver = null;
        this.mutationObserver && this.mutationObserver.disconnect();
        this.mutationObserver = null;
    }

    itemsSignature(items) {
        const names = [];
        (items || []).filter(item => item).forEach((item) => {
            if (item.children) {
                item.children.forEach(child => names.push(child.name));
            } else {
                names.push(item.name);
            }
        });
        return `${this.props.lang}|${names.join(',')}`;
    }

    showLabels() {
        this.neededWidth = 0;
        this.setState({ dense: false });
    }

    measure() {
        const el = this.leftRef.current;
        if (!el || this.props.compact) {
            return;
        }
        if (!this.state.dense) {
            if (el.scrollWidth > el.clientWidth + 1) {
                this.neededWidth = el.scrollWidth;
                this.setState({ dense: true });
            }
        } else if (this.neededWidth && el.clientWidth >= this.neededWidth) {
            this.setState({ dense: false });
        }
    }

    actions = {
        handleClick: (callback, event) => {
            try {
                callback && callback(event);
            } catch (e) {
                log.error(e);
            }
        }
    };

    render() {
        const actions = this.actions;
        const {
            setShowMachineMaterialSettings,
            leftItems,
            mainBarClassName,
            lang,
            headType,
            hasMachineSettings = false,
            isConnected,
            materialInfo
        } = this.props;

        const { activeMachine = null } = this.props;
        const { wrapID, compact = false, renderCenter, renderRight } = this.props;

        let key = 0;
        if (compact) {
            return (
                <div
                    id={wrapID || ''}
                    className={classNames(styles['toolbar-container'], styles['toolbar-compact'], mainBarClassName || '')}
                >
                    <div className={styles['compact-items']}>
                        {
                            leftItems && leftItems.filter(item => item).map((menuItem) => (
                                <MenuItem
                                    key={key++}
                                    menuItem={menuItem}
                                    actions={actions}
                                    lang={lang}
                                    headType={headType}
                                    compact
                                />
                            ))
                        }
                    </div>
                    <div className={styles['compact-center']}>
                        {renderCenter && renderCenter()}
                    </div>
                    <div className={styles['compact-right']}>
                        {renderRight && renderRight()}
                    </div>
                </div>
            );
        }
        return (
            <div
                id={wrapID || ''}
                className={classNames(
                    'clearfix',
                    styles['toolbar-container'],
                    this.state.dense && styles['toolbar-dense'],
                    mainBarClassName || ''
                )}
            >
                <div ref={this.leftRef} className={classNames(styles.left, styles['bar-items'])}>
                    {
                        leftItems && (leftItems.filter(item => item).map((menuItem) => {
                            if (menuItem.children) {
                                return (
                                    <span
                                        key={key++}
                                        className={classNames(
                                            menuItem.className ? menuItem.className : '',
                                            'display-inline',
                                            'white-space-nowrap'
                                        )}
                                    >
                                        {
                                            menuItem.children.map((childItem) => {
                                                return (
                                                    <MenuItem
                                                        key={childItem.name + (key++)}
                                                        menuItem={childItem}
                                                        actions={actions}
                                                        lang={lang}
                                                        headType={headType}
                                                        dense={this.state.dense}
                                                    />
                                                );
                                            })
                                        }
                                    </span>
                                );
                            } else if (menuItem) {
                                return (
                                    <MenuItem
                                        key={key++}
                                        menuItem={menuItem}
                                        actions={actions}
                                        lang={lang}
                                        headType={headType}
                                        dense={this.state.dense}
                                    />
                                );
                            }
                            return null;
                        }))
                    }
                </div>
                <div className={classNames(styles.right, styles['bar-items'])}>
                    {
                        hasMachineSettings && (
                            <Anchor
                                onClick={() => (headType === HEAD_PRINTING ? setShowMachineMaterialSettings(true) : null)}
                                key="machineMaterialSettings"
                                disabled={!this.props.profileInitialized}
                            >
                                <div className="print-machine-material-intro width-360 background-grey-3 height-50 float-r border-radius-8 sm-flex justify-space-between padding-vertical-4 padding-horizontal-8">
                                    <div className="width-144">
                                        <div className="width-144 sm-flex">
                                            <span className="width-8">
                                                <Badge status={isConnected ? 'success' : 'default'} />
                                            </span>
                                            <span className="width-130 margin-left-4 text-overflow-ellipsis">{activeMachine?.fullName}</span>
                                        </div>
                                        <div className="margin-left-12 opacity-precent-50">
                                            {activeMachine?.series}
                                        </div>
                                    </div>
                                    {
                                        headType === HEAD_PRINTING && (
                                            <div className="width-192 sm-flex sm-flex-direction-c">
                                                <div className="sm-flex">
                                                    <div className="position-re">
                                                        <SvgIcon
                                                            name="Extruder"
                                                            size={24}
                                                            color={materialInfo?.leftExtruder?.color}
                                                            type={['static']}
                                                        />
                                                        {materialInfo?.rightExtruder && (
                                                            <div className={classNames(materialInfo?.leftExtruder?.color === '#ffffff' ? 'color-black-3' : 'color-white', 'position-absolute left-10 top-2 font-size-small')}>L</div>
                                                        )}
                                                    </div>
                                                    <span className="max-width-160 display-inline text-overflow-ellipsis">{materialInfo?.leftExtruder?.name}</span>
                                                </div>
                                                {
                                                    materialInfo?.rightExtruder && (
                                                        <div className="sm-flex">
                                                            <div className="position-re">
                                                                <SvgIcon
                                                                    name="Extruder"
                                                                    size={24}
                                                                    color={materialInfo?.rightExtruder?.color}
                                                                    type={['static']}
                                                                />
                                                                <div className={classNames(materialInfo?.rightExtruder?.color === '#ffffff' ? 'color-black-3' : 'color-white', 'position-absolute left-10 top-2 font-size-small')}>R</div>
                                                            </div>
                                                            <span className="max-width-160 display-inline text-overflow-ellipsis">{materialInfo?.rightExtruder?.name}</span>
                                                        </div>
                                                    )
                                                }
                                            </div>
                                        )
                                    }
                                </div>
                            </Anchor>
                        )
                    }
                </div>
            </div>
        );
    }
}

export default MainToolBar;
