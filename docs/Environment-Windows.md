## Windows 10 / Windows 11

- Install `Git` from https://git-scm.com/.
- Install Node.js 22 from https://nodejs.org/en/download (LTS, 64-bit).
- Install the compilation tools for native dependencies (node-gyp):
  - **Simplest:** In the Node.js installer, check **"Automatically install the necessary tools"**. This installs Python and the Visual Studio Build Tools.
  - **Manual:** Install [Python 3.11](https://www.python.org/downloads/) and [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload. See the [node-gyp instructions for Windows](https://github.com/nodejs/node-gyp#on-windows).

The CI builds Windows installers with Node.js 22, Python 3.11 and Visual Studio 2022 (`windows-2022` runner).

`npm install` patches node-gyp to build native modules with the Clang toolset used by Node.js 22 (`build/patch-node-gyp.js`), so no extra configuration such as `msvs_version` is needed.

The `npm run` tasks work in PowerShell, Command Prompt and Git Bash.
