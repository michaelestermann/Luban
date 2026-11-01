import i18next from 'i18next';
import isElectron from 'is-electron';
import { noop } from 'lodash';
import PropTypes from 'prop-types';
import React, { useEffect, useRef, useState } from 'react';
import { withRouter } from 'react-router-dom';

import classNames from 'classnames';
import { HEAD_CNC, HEAD_LASER, HEAD_PRINTING } from '../../../constants';
import { machineStore } from '../../../store/local-storage';
import MainToolBar from '../../layouts/MainToolBar';
import { getTabStripHeight } from '../../layouts/tab-shell/TabShell';
import { logPageView, useRenderRecoveryModal } from '../../utils';
import CaseLibrary from './CaseLibrary';
import MoreInfo from './MoreInfo';
import StartProject from './StartProject';
import StarterGuideModal from './modals/StarterGuideModal';
import styles from './styles.styl';
import Avatar from './Avatar';

interface HomePageProps {
    isPopup?: boolean;
    onClose?: () => void;

    // from router
    location: {
        state: object;
    };
}

const HomePage: React.FC<HomePageProps> = (props) => { // Todo, what's the props ?
    const { isPopup = false, onClose = noop } = props;
    const resourcesBlock = useRef();
    const [modalShow, setModalShow] = useState(false);

    const calcuHeightLayout = () => {
        const startProjectBlock = document.querySelector('#start-project');
        const style = window.getComputedStyle(startProjectBlock);
        const removeUnit = (v) => parseFloat(v.slice(0, -2));
        const height = removeUnit(style.height) + removeUnit(style.paddingBlock) + removeUnit(style.borderBlock) + removeUnit(style.marginBlock);
        // 4.17 tabs: the tab strip takes the top of the window
        const bottomBlockHeight = window.innerHeight - getTabStripHeight() - height - (isPopup ? 66 + 26 : 0);
        resourcesBlock.current && (resourcesBlock.current.style.height = `${bottomBlockHeight - 32}px`); // 32 is bottomBlock margin-top
    };

    useEffect(() => {
        // set single properties: the body also carries --tab-strip-height
        const body = document.querySelector('body');
        body.style.height = 'calc(100vh - var(--tab-strip-height, 0px) - 82px)';
        body.style.background = '#f5f5f7';
    }, []);

    useEffect(() => {
        const settingStore = machineStore.get('settings');

        // Show guide modal
        if (!settingStore || !settingStore?.finishGuide || settingStore?.guideVersion !== 4) {
            setModalShow(true);
        } else {
            setModalShow(false);
        }

        if (!props?.location?.state?.shouldNotLogPageView) {
            logPageView({
                pathname: '/'
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: show the guide and log the page view once per visit
    }, []);

    useEffect(() => {
        if (isElectron()) {
            const ipc = window.require('electron').ipcRenderer;
            ipc.send('get-recent-file');
        }
    }, []);

    useEffect(() => {
        calcuHeightLayout();
        window.addEventListener('resize', calcuHeightLayout);
        return () => {
            window.removeEventListener('resize', calcuHeightLayout);
        };
    });

    const printingModal = useRenderRecoveryModal(HEAD_PRINTING);
    const laserModal = useRenderRecoveryModal(HEAD_LASER);
    const cncModal = useRenderRecoveryModal(HEAD_CNC);

    return (
        <div className={styles['homepage-container']}>
            {
                isPopup && (
                    <MainToolBar
                        leftItems={[
                            {
                                title: 'key-Workspace/Page-Back',
                                name: 'MainToolbarBack',
                                action: () => onClose()
                            }
                        ]}
                        mainBarClassName="background-transparent"
                        lang={i18next.language}
                    />
                )
            }
            <Avatar />
            <StartProject />
            <div className={classNames(styles.secondLine, isPopup ? styles.popup : '')} ref={resourcesBlock} id="second-line">
                <CaseLibrary {...props} />
                <MoreInfo />
            </div>
            {!modalShow && (props?.isPopup || printingModal || laserModal || cncModal)}
            {
                modalShow && (
                    <StarterGuideModal
                        handleModalShow={setModalShow}
                        initLanguage={i18next.language}
                    />
                )
            }
        </div>
    );
};

HomePage.propTypes = {
    location: PropTypes.object,
    isPopup: PropTypes.bool,
    onClose: PropTypes.func
};

export default withRouter(HomePage);
