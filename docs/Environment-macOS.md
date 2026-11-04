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

The CI builds macOS installers (`x64` and `arm64`) on `macos-latest` with Node.js 22 and Python 3.11.
In CI, signing and notarization run only when the signing credentials are available.
