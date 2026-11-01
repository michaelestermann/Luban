import React, { useEffect, useState } from 'react';

import { DialogRequest, subscribeDialogRequests } from '../../../lib/tab-dialogs';
import BusyStopDialog from './BusyStopDialog';
import QuitDialog from './QuitDialog';
import SaveChangesDialog from './SaveChangesDialog';

/** Renders the dialog the tab thunks are waiting for (lib/tab-dialogs), one at a time. */
const DialogHost: React.FC = () => {
    const [request, setRequest] = useState<DialogRequest | null>(null);

    useEffect(() => subscribeDialogRequests(setRequest), []);

    if (!request) {
        return null;
    }
    if (request.kind === 'busy-stop') {
        return <BusyStopDialog key={request.id} names={request.names} context={request.context} onAnswer={request.respond} />;
    }
    if (request.kind === 'save-changes') {
        return <SaveChangesDialog key={request.id} name={request.name} context={request.context} onAnswer={request.respond} />;
    }
    return <QuitDialog key={request.id} docs={request.docs} onAnswer={request.respond} />;
};

export default DialogHost;
