import React, { useRef } from 'react';
import { useDispatch } from 'react-redux';

import { HEAD_LASER } from '../../../../constants';
import { originActions } from '../../../../flux/editor/actions-origin';

import i18n from '../../../../lib/i18n';
import { renderModal } from '../../../utils';
import JobSetupView, { JobSetupViewHandle } from './JobSetupView';

interface JobSetupModalProps {
    onClose?: () => void;
}

const JobSetupModal: React.FC<JobSetupModalProps> = (props) => {
    const { onClose } = props;

    const jobSetupViewRef = useRef<JobSetupViewHandle>();
    const dispatch = useDispatch();
    // "Edit…" of the work origin: Job Setup is applied as on OK and closes, the work origin dialog opens
    const onEditOrigin = () => {
        jobSetupViewRef.current?.onChange();
        onClose && onClose();
        dispatch(originActions.openOriginDialogInDesign(HEAD_LASER, 'reference', 'job-setup'));
    };

    return renderModal({
        title: i18n._('key-CncLaser/JobSetup-Job Setup'),
        renderBody: () => {
            return <JobSetupView ref={jobSetupViewRef} onEditOrigin={onEditOrigin} />;
        },
        actions: [
            {
                name: i18n._('key-CncLaser/JobSetup-Cancel'),
                onClick: () => {
                    onClose && onClose();
                }
            },
            {
                name: i18n._('key-CncLaser/JobSetup-Confirm'),
                isPrimary: true,
                onClick: () => {
                    if (jobSetupViewRef.current) {
                        jobSetupViewRef.current.onChange();
                    }
                    onClose && onClose();
                }
            }
        ],
        onClose: () => {
            onClose && onClose();
        },
    });
};

export default JobSetupModal;
