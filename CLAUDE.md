# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Snapmaker Luban is an Electron desktop application for Snapmaker 3-in-1 machines (3D printing, laser engraving/cutting, CNC milling). It has a React frontend, a Node.js/Express backend, and communicates with machines via serial port and Socket.io.

## Common Commands

### Development
```bash
npm run dev                # Full dev build + start (builds then runs start-dev)
npm run start-dev          # Start dev servers (webpack dev server + TypeScript watcher + Express)
npm run serve              # Frontend only (webpack dev server on port 8080)
npm run watch:server       # Backend TypeScript watcher
```

### Building
```bash
npm run build              # Production build (gulp production)
npm run build-dev          # Development build (gulp development)
npm run build:mac-x64      # macOS x64 installer
npm run build:mac-arm64    # macOS arm64 installer
npm run build:win-x64      # Windows installer
npm run build:linux-x64    # Linux installer
```

### Linting & Testing
```bash
npm run lint               # Run both eslint and stylint
npm run eslint             # ESLint on src/, packages/, gulp/, root JS files
npm run stylint            # Stylus linting on src/app/
npm test                   # Run tests with tape (test/*.js)
```

### i18n
```bash
npm run update-i18n        # Extract translation strings (gulp i18nextServer i18nextApp)
```

## Architecture

### Client-Server-Electron Structure

- **`src/app/`** - React 17 frontend (bundled by Webpack 5, served on port 8080 in dev)
- **`src/server/`** - Express backend (port 8000), handles machine communication, file processing, G-code generation
- **`src/main.js`** - Electron main process (window management, IPC, auto-update)
- **`src/electron-app/`** - Electron menus, window config, IPC handlers
- **`src/shared/`** - Code shared between frontend and backend
- **`packages/luban-platform/`** - TypeScript library for machine definitions, state, and parameter resolution

### Frontend State Management

Redux with Redux-Thunk. The `src/app/flux/` directory contains ~19 modules organized by domain: `printing/`, `laser/`, `cnc/`, `editor/`, `machine/`, `workspace/`, `project/`, `operation-history/`, etc.

### Key Frontend Directories

- `src/app/ui/` - React components, pages, views, widgets, modals
- `src/app/ui/SVGEditor/` - SVG editing interface for laser/CNC
- `src/app/scene/` - Three.js 3D scene management
- `src/app/workers/` - Web workers for heavy computation
- `src/app/machines/` - Machine type definitions
- `src/app/api/` - HTTP API client wrappers
- `src/app/lib/` - Utilities (Three.js helpers, hooks, worker pool manager, shortcuts)
- `src/app/resources/i18n/{lng}/resource.json` - Translation files

### Key Backend Directories

- `src/server/services/api/` - REST API endpoints
- `src/server/services/machine/` - Machine state and control
- `src/server/services/socket/` - WebSocket handlers
- `src/server/lib/ToolPathGenerator/` - Toolpath generation for laser/CNC
- `src/server/lib/GcodeGenerator/` - G-code generation
- `src/server/lib/MeshProcess/` - 3D mesh processing
- `src/server/slicer/` - 3D print slicing integration

### Module Resolution

Webpack resolves imports from these directories (allowing bare imports without relative paths):
- `packages/*`
- `src/shared/`
- `src/app/`
- `node_modules/`

### Communication

- **Socket.io** for real-time frontend-backend communication
- **Express HTTP** for REST API (file uploads, config)
- **Electron IPC** for frontend-to-main-process communication
- **serialport** for direct machine communication

## Code Style

- ESLint extends `eslint-config-snapmaker` (Airbnb-based)
- 4-space indentation, semicolons required
- TypeScript files: explicit member accessibility required, max line length 160
- Stylus stylesheets linted via stylint
- Husky pre-push hook runs eslint automatically

## Commit Message Format

Enforced by commitlint. Format: `<Type>: <Subject>`

Types: `Feature`, `Improvement`, `Fix`, `Refactor`, `Perf`, `Test`, `Build`, `Chore`, `Docs`

Subject: imperative tense, capitalize first letter, no trailing period, max 80 chars. Use `npm run commit` for interactive commitizen helper.

## Submodules

This repo uses git submodules for large resources. Always run `git submodule update --init` after cloning.
