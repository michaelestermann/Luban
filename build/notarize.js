/* eslint-disable no-console -- build hook: its output belongs in the CI log */
const { notarize } = require('@electron/notarize');

module.exports = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    if (!process.env.CI) {
        return;
    }

    const teamId = process.env.TEAMID;
    const appleId = process.env.APPLEID;
    const appleIdPassword = process.env.APPLEIDPASS;

    // Builds without the Apple credentials (e.g. on a fork) stay unsigned and are not notarized
    if (!teamId || !appleId || !appleIdPassword) {
        console.log('Skipping notarization: TEAMID, APPLEID or APPLEIDPASS is not set.');
        return;
    }

    console.log('Notarizing application...');

    const appName = context.packager.appInfo.productFilename;

    await notarize({
        appPath: `${appOutDir}/${appName}.app`,
        appleId,
        appleIdPassword,
        teamId,
    });
};
