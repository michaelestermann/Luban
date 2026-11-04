## macOS (Intel and Apple silicon)

- Install the Xcode Command Line Tools. They include `Git`, `make` and the C++ compiler for native dependencies.

    ```Bash
    > xcode-select --install
    ```

- Install Node.js 22. You can use [NVM (Node Version Manager)](https://github.com/nvm-sh/nvm) to install and manage multiple Node.js versions:

    ```Bash
    > nvm install 22
    > nvm use 22
    ```

- Install Python 3.11 for node-gyp, for example with [Homebrew](https://brew.sh/):

    ```Bash
    > brew install python@3.11
    ```

- On Apple silicon, install Rosetta 2. The bundled slicing and toolpath engines (`LunarMP`, `LunarSlicer`, `LunarTPP`) are x86_64-only, so without Rosetta importing a 3D model stalls at 75%, generating G-code stalls at 10%, and the server log shows `spawn Unknown system error -86`:

    ```Bash
    > softwareupdate --install-rosetta --agree-to-license
    ```

The CI builds macOS installers (`x64` and `arm64`) on `macos-latest` with Node.js 22 and Python 3.11.
In CI, signing and notarization run only when the signing credentials are available.
