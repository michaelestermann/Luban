import React, { PureComponent } from 'react';
// import Sortable from 'react-sortablejs';
import PropTypes from 'prop-types';
import classNames from 'classnames';
// import i18next from 'i18next';
// import { includes } from 'lodash';
// import { longLang } from '../../constants';
import { Spin } from 'antd';
import styles from './styles/project.styl';

class ProjectLayout extends PureComponent {
    static propTypes = {
        // Laser/CNC editor: collapsible side panels (the views render their own chrome and
        // set their width; collapsing changes the width, see componentDidUpdate)
        renderLeftView: PropTypes.func,
        leftCollapsed: PropTypes.bool,
        rightCollapsed: PropTypes.bool,
        renderRightView: PropTypes.func,
        children: PropTypes.array,
        renderModalView: PropTypes.func,
        renderMainToolBar: PropTypes.func,
        isContentLoading: PropTypes.bool
    };

    state = {};

    centerView = React.createRef();

    rightView = React.createRef();

    leftView = React.createRef();

    componentDidMount() {
        window.addEventListener('resize', this.resizeWindow, false);
    }

    componentDidUpdate(prevProps) {
        if (prevProps.leftCollapsed !== this.props.leftCollapsed || prevProps.rightCollapsed !== this.props.rightCollapsed) {
            // the canvas width changed: run the existing window resize path (this layout,
            // the 3D canvas and the SVG canvas all listen to it)
            window.dispatchEvent(new Event('resize'));
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resizeWindow, false);
    }

    resizeWindow = () => {
        const rightView = this.rightView.current;
        const centerView = this.centerView.current;
        if (!centerView) {
            return;
        }
        if (this.props.renderLeftView) {
            const leftView = this.leftView.current;
            const sideWidth = (leftView ? leftView.offsetWidth : 0) + (rightView ? rightView.offsetWidth : 0);
            centerView.style.width = `calc(100vw - ${sideWidth}px)`;
        } else {
            centerView.style.width = `calc(100vw - ${rightView.clientWidth}px)`;
        }
    };

    render() {
        const { renderLeftView, renderRightView, children, renderMainToolBar, renderModalView } = this.props;
        const hasPanels = !!renderLeftView;
        return (
            <div className={classNames(styles['project-layout'], { [styles['with-panels']]: hasPanels })}>
                <div className={classNames(styles['main-toolbar'], 'clearfix')}>
                    {
                        renderMainToolBar && (
                            renderMainToolBar()
                        )
                    }
                </div>
                <Spin spinning={this.props.isContentLoading || false}>
                    <div
                        className={classNames(
                            styles['content-flex'],
                            // {
                            //     [styles['long-lang-content-height']]: includes(longLang, i18next.language),
                            // }
                        )}
                    >
                        {
                            hasPanels && (
                                <div
                                    ref={this.leftView}
                                    className={styles['left-panel']}
                                >
                                    {renderLeftView()}
                                </div>
                            )
                        }
                        <div
                            ref={this.rightView}
                            className={classNames(hasPanels ? styles['right-panel'] : styles['configuration-panel'])}
                        >
                            {
                                renderRightView && (
                                    renderRightView()
                                )
                            }
                        </div>

                        <div
                            ref={this.centerView}
                            className={classNames(styles.visualizer)}
                        >
                            {children}
                        </div>

                        {
                            renderModalView && (
                                renderModalView()
                            )
                        }
                    </div>
                </Spin>
            </div>
        );
    }
}

export default ProjectLayout;
