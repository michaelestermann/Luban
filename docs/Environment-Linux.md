## Ubuntu & Debian

- Update software sources.

    ```Bash
    > sudo apt update
    ```

- Install `Git`.

    ```Bash
    > sudo apt install git
    ```

- Install Node.js 22. You can use [NVM (Node Version Manager)](https://github.com/nvm-sh/nvm) to install and manage multiple Node.js versions:

    ```Bash
    > nvm install 22
    > nvm use 22
    ```

- Install dependencies for Linux builds and compilation environment for third-party dependencies.

    ```Bash
    > sudo apt install rpm
    > sudo apt install python3 make g++ build-essential libfontconfig-dev
    > sudo apt install libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
    ```

    The CI builds Linux packages on `ubuntu-latest` with Node.js 22 and Python 3.11 using these packages.

## CentOS

- Update software sources.

    ```Bash
    > sudo yum update
    ```

- Install `Git`.

    ```Bash
    > sudo yum install git
    ```

- Install Node.js 22. You can use [NVM (Node Version Manager)](https://github.com/nvm-sh/nvm) to install and manage multiple Node.js versions:

    ```Bash
    > nvm install 22
    > nvm use 22
    ```

- Install dependencies for Linux builds and compilation environment for third-party dependencies.

    ```Bash
    > sudo yum install rpm-build
    > sudo yum install python3 make gcc-c++ freetype-devel fontconfig-devel
    > sudo yum install cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
    ```
