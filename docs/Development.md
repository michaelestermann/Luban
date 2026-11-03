# Development

If you want to contribute to Luban, install Node.js 22 or newer. The locked build
dependencies no longer support Node.js 16.

Or you can follow the instructions below to set up the development environment for specific platform:

- macOS: (No documentation for now)
- Linux (Ubuntu/Debian/CentOS): [Linux Environment](Environment-Linux.md)
- Windows: [Windows Environment](Environment-Windows.md)


### Install dependencies and start dev server

- Clone this repository and initialize submodules. **Note: As we use submodules to manage large resources, it's always recommended to use [SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) to manage your repository.**

    ```Bash
    > git clone git@github.com:Snapmaker/Luban.git
    > cd Luban
    > git submodule update --init
    ```

- Use `npm` to install package dependencies:

    ```Bash
    > npm install
    ```

- Start dev server locally:

    ```Bash
    > npm run dev
    ```

### Build installer locally

```Bash
> npm run build:mac-x64
> npm run build:mac-arm64
> npm run build:win-x64
```

### Available tasks

These commands work in the default shells on macOS, Windows, and Linux:

| Command | Behavior |
| --- | --- |
| `npm run dev` or `npm run start-dev` | Prepare development resources, compile the backend and Electron main process, then start Electron, the frontend server, and file watchers. |
| `npm run build-dev` | Prepare and compile development files without launching Electron. |
| `npm run build` or `npm run build-prod` | Build the complete production application, including resources and Electron main process files. |
| `npm start` or `npm run start-electron` | Launch the production desktop application after a production build. |
| `npm run start-prod` | Run the built production HTTP server without Electron. |
| `npm run prod` | Build production files and run the production HTTP server. |
| `npm run serve` | Run only the frontend dev server; use `build-dev` first and run the backend separately. |
| `npm run build:mac`, `build:mac-x64`, `build:mac-arm64`, `build:win-x64`, `build:linux-x64` | Build production files and package an installer for the selected platform/architecture. |

Initialize the resource submodules before building. Development uses ports 8080
and 8000; stop an existing Luban instance before starting another one. Startup
leaves processes already using these ports untouched.

Installer tasks require the host tools supported by electron-builder for the
target platform. Native dependencies are rebuilt for the selected Electron
architecture during packaging. After changing Node/Electron versions or CPU
architecture, run `npm run electron-rebuild` if native modules fail to load.

### Additional Notes

- For developers in China, you can use taobao mirror to install npm packages.

    ```Bash
    > npm config set registry https://registry.npm.taobao.org/
    > ELECTRON_MIRROR="https://npm.taobao.org/mirrors/electron/" npm install
    ```

### FAQ

- **Q:** Encounter a `RequestError` when installing electron?

  **A:** Check your system proxy and try `rm -rf node_modules/electron && npm install` again.

- **Q:** Develop in Firefox encounters an blank screen?

  **A:** There is a compatible problem of `getScreenCTM()` in using SVG in Firefox, switch to Chrome.

