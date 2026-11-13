const { execFileSync } = require('child_process');

// Without a signature of its own the packed app keeps Electron's linker signature, which macOS
// cannot store a Local Network permission for. A real identity re-signs over this afterwards.
module.exports = async function adhocSign(context) {
    const { electronPlatformName, appOutDir } = context;

    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    execFileSync('codesign', ['--force', '--deep', '--sign', '-', `${appOutDir}/${appName}.app`], { stdio: 'inherit' });
};
