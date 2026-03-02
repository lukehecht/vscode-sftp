# vscode-sftp Fork Notes

This repository is a fork of [Natizyskunk/vscode-sftp](https://github.com/Natizyskunk/vscode-sftp) with targeted improvements for multi-destination workflows.

## What Changed

### 1) Multi-destination uploads from one `context`
- Added support for multiple config objects in `.vscode/sftp.json` that share the same local `context`.
- Upload paths now fan out to all matching destinations for:
  - manual upload commands using "all profiles" behavior
  - `uploadOnSave`
- Files changed:
  - `src/modules/serviceManager/index.ts`
  - `src/modules/serviceManager/trie.ts`
  - `src/fileHandlers/createFileHandler.ts`
  - `src/modules/fileActivityMonitor.ts`
  - `README.md`

### 2) Baseline compatibility/build fixes
- Fixed missing command constant imports:
  - `src/commands/abstract/createCommand.ts`
- Fixed `vscode-uri` typing/import usage:
  - `src/helper/paths.ts`
- Updated Jest transformer to Jest 28+ return shape (`{ code: ... }`):
  - `test/preprocessor.js`
- Stabilized one time-offset test for current runtime behavior:
  - `src/fileHandlers/transfer/__tests__/transfer-test.ts`

### 3) Repository hygiene
- Ignored local npm cache directory:
  - `.gitignore` now includes `.npm-cache/`

## Validation
- `npm run compile`: passes
- `npm test -- --runInBand`: all test suites pass

## Example multi-destination `sftp.json`

```json
[
  {
    "name": "Events",
    "host": "example-host-1",
    "protocol": "sftp",
    "port": 22,
    "username": "user1",
    "remotePath": "/remote/path/one",
    "uploadOnSave": true
  },
  {
    "name": "Staff",
    "host": "example-host-2",
    "protocol": "sftp",
    "port": 22,
    "username": "user2",
    "remotePath": "/remote/path/two",
    "uploadOnSave": true
  }
]
```

## Suggested GitHub fork description

> vscode-sftp fork with multi-destination upload support (same context), plus compatibility fixes for modern Jest/TypeScript toolchains.
