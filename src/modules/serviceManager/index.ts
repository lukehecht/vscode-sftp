import { Uri } from 'vscode';
import * as path from 'path';
import app from '../../app';
import logger from '../../logger';
import { simplifyPath, reportError } from '../../helper';
import { UResource, FileService, TransferTask } from '../../core';
import { validateConfig } from '../config';
import watcherService from '../fileWatcher';
import Trie from './trie';

const WIN_DRIVE_REGEX = /^([a-zA-Z]):/;
const isWindows = process.platform === 'win32';

const serviceManager = new Trie<FileService[]>(
  {},
  {
    delimiter: path.sep,
  }
);

function isPathInBase(pathname: string, basePath: string) {
  const relative = path.relative(basePath, pathname);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function maskConfig(config) {
  const copy = {};
  const MASK = '******';
  Object.keys(config).forEach(key => {
    const configValue = config[key];
    switch (key) {
      case 'username':
      case 'password':
      case 'passphrase':
        copy[key] = MASK;
        break;
      case 'interactiveAuth':
        if (Array.isArray(configValue)) {
          copy[key] = configValue.map(phrase => MASK);
        } else {
          copy[key] = configValue;
        }
        break;
      default:
        copy[key] = configValue;
    }
  });
  return copy;
}

function normalizePathForTrie(pathname) {
  if (isWindows) {
    const device = pathname.substr(0, 2);
    if (device.charAt(1) === ':') {
      // lowercase drive letter
      pathname = pathname[0].toLowerCase() + pathname.substr(1);
    }
  }

  return path.normalize(pathname);
}

export function getBasePath(context: string, workspace: string) {
  let dirpath;
  if (context) {
    if (path.isAbsolute(context)) {
      dirpath = context;
      if (isWindows) {
        const contextBeginWithDrive = context.match(WIN_DRIVE_REGEX);
        // if a windows user omit drive, we complete it with a drive letter same with the workspace one
        if (!contextBeginWithDrive) {
          const workspaceDrive = workspace.match(WIN_DRIVE_REGEX);
          if (workspaceDrive) {
            const drive = workspaceDrive[1];
            dirpath = path.join(`${drive}:`, context);
          }
        }
      }
    } else {
      // Don't use path.resolve bacause it may change the root dir of workspace!
      // Example: On window path.resove('\\a\\b\\c') will result to '<drive>:\\a\\b\\c'
      // We know workspace must be a absolute path and context is a relative path to workspace,
      // so path.join will suit our requirements.
      dirpath = path.join(workspace, context);
    }
  } else {
    dirpath = workspace;
  }

  return normalizePathForTrie(dirpath);
}

export function createFileService(config: any, workspace: string) {
  if (config.defaultProfile) {
    app.state.profile = config.defaultProfile;
  }

  const normalizedBasePath = getBasePath(config.context, workspace);
  const service = new FileService(normalizedBasePath, workspace, config);

  logger.info(`config at ${normalizedBasePath}`, maskConfig(config));

  const current = serviceManager.find(normalizedBasePath);
  if (current) {
    current.push(service);
  } else {
    serviceManager.add(normalizedBasePath, [service]);
  }
  service.name = config.name;
  service.setConfigValidator(validateConfig);
  service.setWatcherService(watcherService);
  service.beforeTransfer(task => {
    const { localFsPath, transferType } = task;
    app.sftpBarItem.showMsg(
      `${transferType} ${path.basename(localFsPath)}`,
      simplifyPath(localFsPath)
    );
  });
  service.afterTransfer((error, task) => {
    const { localFsPath, transferType } = task;
    const filename = path.basename(localFsPath);
    const filepath = simplifyPath(localFsPath);
    if (task.isCancelled()) {
      logger.info(`cancel transfer ${localFsPath}`);
      app.sftpBarItem.showMsg(`cancelled ${filename}`, filepath, 2000 * 2);
    } else if (error) {
      // if ((error as any).reported !== true) {
      reportError(error, `when ${transferType} ${localFsPath}`);
      // }
      app.sftpBarItem.showMsg(`failed ${filename}`, filepath, 2000 * 2);
    } else {
      logger.info(`${transferType} ${localFsPath}`);
      app.sftpBarItem.showMsg(`done ${filename}`, filepath, 2000 * 2);
    }
  });

  return service;
}

export function getFileService(uri: Uri): FileService {
  const fileServices = getFileServices(uri);
  return fileServices.length > 0 ? fileServices[0] : (null as any);
}

export function getFileServices(uri: Uri): FileService[] {
  if (UResource.isRemote(uri)) {
    const remoteRoot = app.remoteExplorer.findRoot(uri);
    if (remoteRoot) {
      return [remoteRoot.explorerContext.fileService];
    }
    return [];
  }

  const normalizedPath = normalizePathForTrie(uri.fsPath);
  const matchedServices = getAllFileService().filter(service =>
    isPathInBase(normalizedPath, service.baseDir)
  );
  if (matchedServices.length <= 0) {
    return [];
  }

  const longestPathLength = matchedServices.reduce((result, service) =>
    Math.max(result, service.baseDir.length), 0
  );
  return matchedServices.filter(service => service.baseDir.length === longestPathLength);
}

export function disposeFileService(fileService: FileService) {
  const sameBaseServices = serviceManager.find(fileService.baseDir);
  if (sameBaseServices) {
    const targetIndex = sameBaseServices.findIndex(current => current === fileService);
    if (targetIndex >= 0) {
      sameBaseServices.splice(targetIndex, 1);
    }
    if (sameBaseServices.length <= 0) {
      serviceManager.remove(fileService.baseDir);
    }
  }
  fileService.dispose();
}

export function findAllFileService(predictor: (x: FileService) => boolean): FileService[] {
  if (serviceManager === undefined) {
    return [];
  }

  return getAllFileService().filter(predictor);
}

export function getAllFileService(): FileService[] {
  if (serviceManager === undefined) {
    return [];
  }

  return serviceManager.getAllValues().reduce<FileService[]>((acc, value) => {
    acc.push(...value);
    return acc;
  }, []);
}

export function getRunningTransformTasks(): TransferTask[] {
  return getAllFileService().reduce<TransferTask[]>((acc, fileService) => {
    return acc.concat(fileService.getPendingTransferTasks());
  }, []);
}
