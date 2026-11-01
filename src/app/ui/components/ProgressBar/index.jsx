import React from 'react';
import PropTypes from 'prop-types';
import { Progress } from 'antd';
import classNames from 'classnames';
import { isEqual } from 'lodash';
import styles from './styles.styl';
import Modal from '../Modal';
import { EPSILON } from '../../../constants';
import i18n from '../../../lib/i18n';
import { isProgressStalled, trackProgress } from '../../../flux/project/busy-stop';

// how often a shown progress is checked for a stall (ms)
const STALL_CHECK_MS = 5000;

class ProgressBar extends React.PureComponent {
    static propTypes = {
        progress: PropTypes.number,
        tips: PropTypes.string,
        strokeColor: PropTypes.string,
        // stops the calculation (busy guard escape hatch); offered when the progress has not advanced for 120 s
        onStop: PropTypes.func
    };

    timeout = null;

    stallTimer = null;

    // progress value and since when it has not changed
    clock = null;

    // the user stopped the operation: its final progress does not show the bar again
    stopped = false;

    constructor(props) {
        super(props);
        this.state = { display: 'none', stalled: false };
    }

    componentDidMount() {
        this.stallTimer = setInterval(this.checkStall, STALL_CHECK_MS);
    }

    componentDidUpdate() {

    }

    componentWillUnmount() {
        this.stallTimer && clearInterval(this.stallTimer);
        this.timeout && clearTimeout(this.timeout);
    }

    checkStall = () => {
        const shown = this.state.display === 'block';
        this.clock = shown ? trackProgress(this.clock, this.props.progress / 100, Date.now()) : null;
        const stalled = shown && !!this.props.onStop && isProgressStalled(this.clock, Date.now(), window.__lubanProgressStallMs);
        if (stalled !== this.state.stalled) {
            this.setState({ stalled });
        }
    };

    stop = () => {
        this.clock = null;
        this.stopped = true;
        this.setState({ display: 'none', stalled: false });
        this.props.onStop && this.props.onStop();
    };

    getSnapshotBeforeUpdate(prevProps) {
        if (this.stopped && !isEqual(prevProps.progress, this.props.progress)) {
            // the stopped operation ends at 100 % without showing the bar again; a new one shows it
            this.stopped = false;
            if (this.props.progress > 100 - EPSILON || this.props.progress === 0) {
                return prevProps;
            }
        }
        if (!isEqual(prevProps.progress, this.props.progress) && this.props.progress !== 0) {
            this.setState({ display: 'block' });
            if (this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
            if (this.props.progress > 100 - EPSILON) {
                this.timeout = setTimeout(() => this.setState({ display: 'none' }), 800);
            }
        }
        if (this.props.tips.includes(i18n._('key-Progress/3DP-Failed to load model.'))) {
            this.setState({ display: 'none' });
        }
        return prevProps;
    }


    render() {
        const { progress, tips, strokeColor = '#1890ff' } = this.props;
        const { display } = this.state;
        return (
            <div>
                {display === 'block' && (
                    <Modal
                        size="lg"
                        closable={false}
                        centered={false}
                        zIndex={2000}
                        // 4.17 tabs: the mask starts below the tab strip, so tabs of other modes stay clickable
                        wrapClassName="modal-wrapper below-tab-strip"
                        maskStyle={{ top: 'var(--tab-strip-height, 0px)' }}
                        // the stall row ("Stop") needs more height
                        style={{ top: `calc(100vh - var(--tab-strip-height, 0px) - ${this.state.stalled ? 170 : 126}px)`, padding: '16px 0 0' }}
                    >
                        <Modal.Body style={{ marginBottom: '-24px', marginTop: '-40px' }}>
                            <div className="position-re height-16 margin-top-24 margin-bottom-16 align-c">
                                <span>{tips}</span>
                            </div>
                            <div className={classNames(styles.progressbar)}>

                                <Progress
                                    showInfo={false}
                                    percent={progress}
                                    strokeColor={strokeColor}
                                    trailColor="#D5D6D9"
                                />
                            </div>
                            {this.state.stalled && (
                                <div className={styles.stalled} data-progress-stalled>
                                    <span>{i18n._('key-Tabs/This is taking unusually long.')}</span>
                                    <button type="button" className={styles['stop-button']} data-progress-stop onClick={this.stop}>
                                        {i18n._('key-Tabs/Stop')}
                                    </button>
                                </div>
                            )}
                        </Modal.Body>
                    </Modal>
                )}
            </div>

        );
    }
}

// {
//     !touring && (
//         <Steps
//             id="progress"
//             enabled={display !== 'none'}
//             initialStep={0}
//             options={{
//                 showBullets: false,
//                 hidePrev: false,
//                 exitOnEsc: false,
//                 exitOnOverlayClick: false
//             }}
//             steps={[
//                 {
//                     intro: progressBarWidget(),
//                     element: '.progress-bar-wrapper',
//                     tooltipClass: 'progress-bar-intro',
//                     highlightClass: 'progress-bar-highlight-part',
//                     disableInteraction: true
//                 }
//             ]}
//             onExit={noop}
//         />
//     )
// }


export default ProgressBar;
