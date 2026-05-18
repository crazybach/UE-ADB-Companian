# UE Console ADB Tool

ADB debugger bridge for Unreal Engine on Android — TypeScript + React + Electron.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Android Debug Bridge (ADB)](https://developer.android.com/tools/adb) in your `PATH`

## Install

```bash
npm install
```

## Run

**Development mode** (Vite dev server + hot reload):

```bash
npm run dev
```

**Production mode** (build then launch):

```bash
npm run build
./node_modules/.bin/electron .
```

- `npm run build` outputs to `out/` (main, preload, renderer)
- `electron .` runs the built app directly without needing the dev server

## Project Structure

```
src/
  main/         Electron main process + IPC handlers + ADB services
  preload/      Context bridge (contextIsolation-aware)
  renderer/     React entry point
  components/   UI components (log display, command palette, screens)
  hooks/        React hooks (log stream, config, autocomplete)
  stores/       Zustand state stores
  services/     Log processing utilities
  types/        TypeScript type definitions
  data/         UE command palette / console command JSON data
```
