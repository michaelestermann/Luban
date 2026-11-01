import * as fs from 'fs-extra';
import path from 'path';
import { v4 as uuid } from 'uuid';

import { LEFT_EXTRUDER, RIGHT_EXTRUDER } from '../../../app/constants';
import {
    findMachineByName,
    getMachineToolHeadConfigPath,
    isDualExtruder,
} from '../../../app/constants/machines';
import { SnapmakerA150Machine, SnapmakerA250Machine, SnapmakerA350Machine, SnapmakerOriginalExtendedMachine, SnapmakerOriginalMachine } from '../../../app/machines';
import { printToolHead, standardCNCToolHead, standardLaserToolHead } from '../../../app/machines/snapmaker-2-toolheads';
import { cncToolHeadOriginal, laserToolHeadOriginal, printToolHeadOriginal } from '../../../app/machines/snapmaker-original-toolheads';
import { generateRandomPathName } from '../../../shared/lib/random-utils';
import { removeSpecialChars } from '../../../shared/lib/utils';
import DataStorage, { rmDir } from '../../DataStorage';
import { ERR_BAD_REQUEST, ERR_INTERNAL_SERVER_ERROR, HEAD_CNC, HEAD_LASER, HEAD_PRINTING } from '../../constants';
import { unzipFile, zipFolder } from '../../lib/archive';
import { packFirmware } from '../../lib/firmware-build';
import logger from '../../lib/logger';
import { convertFileToSTL } from '../../lib/model-to-stl';
import { parseLubanGcodeHeader } from '../../lib/parseGcodeHeader';
import { pathWithRandomSuffix } from '../../lib/random-utils';
import { textSerialChannel } from '../machine/channels/TextSerialChannel';
import serializeByKey from '../../lib/serialize-by-key';
import { ENV_DOCS_DIR, isValidDocId, orphanDocDirs, resolveEnvDir } from '../../lib/env-dir';
import { interruptedDirNames, migrateEnvDir, recoverEnvDir, replaceDir } from '../../lib/env-swap';

const log = logger('api:file');

function copyFileSync(src, dst) {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
    }
}

function traverse(models, callback) {
    models.forEach(model => {
        // callback && callback(model);
        if (model.children) {
            traverse(model.children, callback);
        } else {
            callback && callback(model);
        }
    });
}

function getFormalMachineIdentifier(machineIdentifier) {
    switch (machineIdentifier) {
        case 'A150':
            return SnapmakerA150Machine.identifier;
        case 'A250':
            return SnapmakerA250Machine.identifier;
        case 'A350':
            return SnapmakerA350Machine.identifier;
        default:
            return machineIdentifier;
    }
}


// Default tool heads for Snapmaker original
export const INITIAL_SNAPMAKER_ORIGINAL_TOOL_HEAD_IDENTIFIER_MAP = {
    printingToolhead:
        printToolHeadOriginal.identifier,
    laserToolhead: laserToolHeadOriginal.identifier,
    cncToolhead: cncToolHeadOriginal.identifier,
};

export const INITIAL_SNAPMAKER_2_TOOL_HEAD_IDENTIFIER_MAP = {
    printingToolhead: printToolHead.identifier,
    laserToolhead: standardLaserToolHead.identifier,
    cncToolhead: standardCNCToolHead.identifier,
};

function getDefaultToolHeadMap(machineIdentifier) {
    switch (machineIdentifier) {
        case SnapmakerOriginalMachine.identifier:
        case SnapmakerOriginalExtendedMachine.identifier:
            return INITIAL_SNAPMAKER_ORIGINAL_TOOL_HEAD_IDENTIFIER_MAP;
        case SnapmakerA150Machine.identifier:
        case SnapmakerA250Machine.identifier:
        case SnapmakerA350Machine.identifier:
            return INITIAL_SNAPMAKER_2_TOOL_HEAD_IDENTIFIER_MAP;
        default:
            return INITIAL_SNAPMAKER_ORIGINAL_TOOL_HEAD_IDENTIFIER_MAP;
    }
}

function getConfigDir(machineInfo) {
    let configPath = '';

    if (machineInfo) {
        const series = machineInfo?.series;
        const machineIdentifier = getFormalMachineIdentifier(series);

        const headType = machineInfo?.headType;
        const toolHeadIdentifierMap = machineInfo?.toolHead || getDefaultToolHeadMap(machineIdentifier);

        const machine = findMachineByName(machineIdentifier);
        if (machine) {
            configPath = getMachineToolHeadConfigPath(machine, toolHeadIdentifierMap[`${headType}Toolhead`]);
        } else {
            log.warn(`Unable to find machine with identifier ${machineIdentifier}.`);
        }
    }

    return path.join(DataStorage.configDir, configPath);
}

const cpFileToTmp = async (file, uploadName) => {
    const originalName = path.basename(file.name);
    uploadName = uploadName || originalName;
    const uploadPath = `${DataStorage.tmpDir}/${uploadName}`;
    return new Promise(resolve => {
        fs.copyFile(file.path, uploadPath, (err) => {
            if (err) {
                log.error(`Failed to upload file ${originalName}, ${err}`);
            } else {
                resolve({
                    originalName,
                    uploadName
                });
            }
        });
    });
};

export const set = async (req, res) => {
    let { uploadName } = req.body;
    const file = req.files.file || JSON.parse(req.body.file);
    const headType = req.query.headType;
    try {
        if (file) { // post blob file/path string in web
            let filename = file.name, filePath = file.path, children = [];
            ({ filename, filePath, children = [] } = await convertFileToSTL(file, headType === 'printing'));
            const originalName = removeSpecialChars(path.basename(filename));
            if (!uploadName) {
                uploadName = generateRandomPathName(originalName);
            }
            uploadName = uploadName.toLowerCase(); // Use all lower case filename
            children.forEach((item) => {
                item.parentUploadName = uploadName;
            });

            if (!file.fieldName) { // get path string
                const cpRes = await cpFileToTmp(file, uploadName);
                uploadName = cpRes.uploadName;
                res.send({
                    originalName,
                    uploadName,
                    children
                });
            } else { // get blob file
                const uploadPath = `${DataStorage.tmpDir}/${uploadName}`;
                try {
                    await fs.copyFile(filePath, uploadPath);

                    res.send({
                        originalName,
                        uploadName,
                        children
                    });
                    res.end();
                } catch (err) {
                    if (err) {
                        log.error(`Failed to upload file ${originalName}`);
                        res.status(ERR_INTERNAL_SERVER_ERROR).send({
                            msg: `Failed to upload file ${originalName}: ${err}`
                        });
                    }
                }
            }
        } else { // post file pathname in electron
            const ret = await cpFileToTmp(JSON.parse(req.body.file));
            res.send(ret);
            res.end();
        }
    } catch (err) {
        log.error(`Failed to upload file: ${err.message} - ${err.stack}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to upload file: ${err}`
        });
    }
};
/**
 * Compile the firmware file and export a firmware that Luban can use
 * @param {File} req.files.mainFile
 * @param {File} req.files.moduleFile
 * @param {string} req.body.buildVersion
 */
export const buildFirmwareFile = (req, res) => {
    const files = req.files;
    if (files.mainFile || files.moduleFile) {
        const options = {};
        if (files.mainFile) {
            options.mainPath = files.mainFile.path;
        }
        if (files.moduleFile) {
            options.modulePath = files.moduleFile.path;
        }
        options.buildVersion = req.body.buildVersion;
        packFirmware(options)
            .then((result) => {
                res.send(result);
                res.end();
            })
            .catch((err) => {
                log.error(`Unable to build package: ${err}`);
                res.status(ERR_INTERNAL_SERVER_ERROR).send({
                    msg: 'Unable to build package',
                    error: String(err)
                });
            });
    } else {
        log.warn('files.mainFile or files.moduleFile is required');
        res.status(ERR_BAD_REQUEST).send({
            msg: 'files.mainFile or files.moduleFile is required'
        });
    }
};

export const uploadCaseFile = (req, res) => {
    const { name, casePath } = req.body;
    let originalName = path.basename(name);
    const originalPath = `${DataStorage.userCaseDir}/${casePath}/${originalName}`;
    let uploadName = pathWithRandomSuffix(originalName);
    const uploadPath = `${DataStorage.tmpDir}/${uploadName}`;

    fs.copyFile(originalPath, uploadPath, async (err) => {
        if (err) {
            log.error(`Failed to upload file ${originalName}`);
            res.status(ERR_INTERNAL_SERVER_ERROR).send({
                msg: `Failed to upload file ${originalName}: ${err}`
            });
        } else {
            if (path.extname(originalName) === '.zip') {
                await unzipFile(`${uploadName}`, `${DataStorage.tmpDir}`);
                originalName = originalName.replace(/\.zip$/, '');
                uploadName = originalName;
            }
            res.send({
                originalName,
                uploadName
            });
            res.end();
        }
    });
};

/**
 * Upload G-code file, parse metadata.
 *
 * @param req
 * @param res
 */
export const uploadGcodeFile = async (req, res) => {
    let file = req.files.file;
    if (!file && req.body && typeof req.body.file === 'string') {
        file = JSON.parse(req.body.file);
    }
    let originalName, uploadName, uploadPath, originalPath;
    if (file) {
        originalPath = file.path;
        originalName = removeSpecialChars(path.basename(file.name));
        uploadName = pathWithRandomSuffix(originalName);
        uploadName = uploadName.toLowerCase();
        uploadPath = `${DataStorage.tmpDir}/${uploadName}`;

        try {
            await fs.copyFile(originalPath, uploadPath);

            const gcodeHeader = parseLubanGcodeHeader(uploadPath);
            res.send({
                originalName,
                uploadName,
                gcodeHeader
            });
            res.end();
        } catch (e) {
            log.error(`Failed to upload file ${originalName}: ${e}`);
            res.status(ERR_INTERNAL_SERVER_ERROR).send({
                msg: `Failed to upload file ${originalName}: ${e}`
            });
        }
    } else {
        const { casePath, name } = req.body;
        originalPath = `${DataStorage.userCaseDir}/${casePath}/${name}`;
        originalName = path.basename(name);
        uploadName = originalName.replace(/\.zip$/, '');
        uploadPath = `${DataStorage.tmpDir}/${uploadName}`;
        // const tmpFilePath = `${DataStorage.tmpDir}/${originalName}`;
        const gcodeFile = {
            name: originalName,
            path: originalPath
        };
        try {
            await cpFileToTmp(gcodeFile);
            await unzipFile(`${originalName}`, `${DataStorage.tmpDir}`);
            const stats = fs.statSync(uploadPath);
            const size = stats.size;
            const gcodeHeader = parseLubanGcodeHeader(uploadPath);
            res.send({
                originalName,
                uploadName,
                size,
                gcodeHeader
            });
            res.end();
        } catch (err) {
            log.error(`Failed to upload file ${originalName}: ${err}`);
            res.status(ERR_INTERNAL_SERVER_ERROR).send({
                msg: `Failed to upload file ${originalName}: ${err}`
            });
        }
    }
};

/**
 * deprecated
 */
export const uploadUpdateFile = async (req, res) => {
    const file = req.files.file;
    const originalName = removeSpecialChars(path.basename(file.name));
    const uploadName = pathWithRandomSuffix(originalName);
    const uploadPath = `${DataStorage.tmpDir}/${uploadName}`;
    try {
        await fs.copyFile(file.path, uploadPath);

        res.send({
            originalName,
            uploadName
        });
        res.end();
    } catch (err) {
        if (err) {
            log.error(`Failed to upload file ${originalName}`);
            return;
        }
    }

    const controller = textSerialChannel.getController();
    if (!controller) {
        return;
    }
    controller.command(null, 'updatefile', uploadPath, (err) => {
        if (err) {
            log.error(`Failed to upload file ${uploadPath}`);
        }
    });
};

/**
 * Env dir of a request: `env/docs/{docId}` when the body has a docId, else `env/{headType}`.
 * Answers 400 and returns null for an invalid docId.
 */
const envDirOfRequest = (res, headType, docId) => {
    try {
        return resolveEnvDir(DataStorage.envDir, headType, docId);
    } catch (e) {
        res.status(ERR_BAD_REQUEST).send({ msg: 'invalid docId' });
        return null;
    }
};

// Autosaves can overlap; writes, removals and repairs of the same env folder run one at a time
const envWriteQueue = serializeByKey();

/**
 * get environment data from saved file
 * (GET kept for 4.16 callers; GET bodies are usually empty, so the query is read too. New callers use POST.)
 */
export const getEnv = async (req, res) => {
    const { headType, docId } = { ...req.query, ...req.body };
    const envDir = envDirOfRequest(res, headType, docId);
    if (!envDir) return;
    const targetPath = `${envDir}/config.json`;
    try {
        // a write cut off earlier is repaired first (queued: a running write of the same env is not touched)
        await envWriteQueue(docId ?? headType, async () => recoverEnvDir(envDir));
        const exists = fs.existsSync(targetPath);
        if (exists) {
            const content = fs.readFileSync(targetPath).toString();
            res.send({ result: 1, content });
        } else {
            res.send({ result: 0 });
        }
        res.end();
    } catch (e) {
        log.error(`Failed to get environment: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to get environment: ${e}`
        });
    }
};

const writeEnv = async (config, content, docId) => {
    const { activePresetIds } = config;

    const machineInfo = config?.machineInfo;
    const headType = machineInfo?.headType;
    const envDir = resolveEnvDir(DataStorage.envDir, headType, docId);
    const configDir = getConfigDir(machineInfo);

    // the folder is written next to the old one and swapped in when complete (config.json last): a write
    // that is cut off (quit, killed server) leaves the previous auto-save as it was
    await replaceDir(envDir, (dir) => {
        traverse(config.models, (model) => {
            // why copy all not just 'uploadName'
            const { uploadName } = model;
            if (uploadName) {
                if (/\.svg$/.test(uploadName) && !(/parsed\.svg$/.test(uploadName))) {
                    const parseName = uploadName.replace(/\.svg$/, 'parsed.svg');
                    copyFileSync(`${DataStorage.tmpDir}/${parseName}`, `${dir}/${parseName}`);
                }
                copyFileSync(`${DataStorage.tmpDir}/${uploadName}`, `${dir}/${uploadName}`);
            }
        });

        if (config.defaultMaterialId && /^material.([0-9_]+)$/.test(config.defaultMaterialId)) {
            copyFileSync(`${configDir}/${config.defaultMaterialId}.def.json`, `${dir}/${config.defaultMaterialId}.def.json`);
        }
        const isDual = isDualExtruder(machineInfo?.toolHead?.printingToolhead);
        if (isDual && config.defaultMaterialIdRight && /^material.([0-9_]+)$/.test(config.defaultMaterialIdRight)) {
            copyFileSync(`${configDir}/${config.defaultMaterialIdRight}.def.json`, `${dir}/${config.defaultMaterialIdRight}.def.json`);
        }

        if (activePresetIds) {
            for (const stackId of [LEFT_EXTRUDER, RIGHT_EXTRUDER]) {
                const presetId = activePresetIds[stackId];
                if (presetId && /^quality.([0-9_]+)$/.test(presetId)) {
                    copyFileSync(`${configDir}/${presetId}.def.json`, `${dir}/${presetId}.def.json`);
                }
            }
        }
        if (machineInfo?.headType === HEAD_CNC || machineInfo?.headType === HEAD_LASER) {
            !!config.toolpaths?.length && config.toolpaths.forEach(toolpath => {
                if (toolpath.toolParams?.definitionId && /^tool.([0-9_]+)$/.test(toolpath.toolParams.definitionId)) {
                    copyFileSync(`${configDir}/${toolpath.toolParams.definitionId}.def.json`, `${dir}/${toolpath.toolParams.definitionId}.def.json`);
                }
            });
        }
        fs.writeFileSync(`${dir}/config.json`, content);
    });
    return { targetPath: `${envDir}/config.json` };
};


/**
 * save editor environment as files, and copy related resource files
 */
export const saveEnv = async (req, res) => {
    const { content, docId } = req.body;
    if (docId !== undefined && docId !== null && !isValidDocId(docId)) {
        res.status(ERR_BAD_REQUEST).send({ msg: 'invalid docId' });
        return;
    }
    try {
        const config = JSON.parse(content);
        const result = await envWriteQueue(docId ?? config?.machineInfo?.headType, () => writeEnv(config, content, docId));
        res.send(result);
        res.end();
    } catch (e) {
        log.error(`Failed to save environment: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to save environment: ${e}`
        });
    }
};


/**
 * recover environment saved resource files to tmp dir.
 */
export const recoverEnv = async (req, res) => {
    try {
        const { content, docId } = req.body;
        const config = JSON.parse(content); // TODO: envObj
        const { activePresetIds } = config;
        const headType = config?.machineInfo?.headType;
        const envDir = envDirOfRequest(res, headType, docId);
        if (!envDir) return;
        await envWriteQueue(docId ?? headType, async () => recoverEnvDir(envDir));

        const configDir = getConfigDir(config?.machineInfo);

        traverse(config.models, (model) => {
            const { originalName, uploadName } = model;
            copyFileSync(`${envDir}/${originalName}`, `${DataStorage.tmpDir}/${originalName}`);
            copyFileSync(`${envDir}/${uploadName}`, `${DataStorage.tmpDir}/${uploadName}`);
        });


        if (config.defaultMaterialId && /^material.([0-9_]+)$/.test(config.defaultMaterialId)) {
            copyFileSync(`${envDir}/${config.defaultMaterialId}.def.json`, `${configDir}/${config.defaultMaterialId}.def.json`);
        }
        const isDual = isDualExtruder(config.machineInfo?.toolHead?.printingToolhead);
        if (isDual && config.defaultMaterialIdRight && /^material.([0-9_]+)$/.test(config.defaultMaterialIdRight)) {
            copyFileSync(`${envDir}/${config.defaultMaterialIdRight}.def.json`, `${configDir}/${config.defaultMaterialIdRight}.def.json`);
        }

        // recover quality presets (laser / cnc environments have none)
        for (const stackId of [LEFT_EXTRUDER, RIGHT_EXTRUDER]) {
            const presetId = activePresetIds?.[stackId];
            if (presetId && /^quality.([0-9_]+)$/.test(presetId)) {
                copyFileSync(`${envDir}/${presetId}.def.json`, `${configDir}/${presetId}.def.json`);
            }
        }

        res.send({ result: 1 });
        res.end();
    } catch (e) {
        log.error(`Failed to recover environment: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to recover environment: ${e}`
        });
    }
};

/**
 * remove editor saved environment files
 */
export const removeEnv = async (req, res) => {
    const { headType, docId } = req.body;
    const envDir = envDirOfRequest(res, headType, docId);
    if (!envDir) return;
    // queued with the writes of the same env, so a running autosave cannot write the folder back half-way
    await envWriteQueue(docId ?? headType, async () => {
        // a document env is removed completely, a head type env is only emptied (as in 4.16)
        if (docId && fs.existsSync(envDir)) {
            rmDir(envDir, true);
        } else if (!docId) {
            rmDir(envDir, false);
        }
    });
    res.send(true);
    res.end();
};

/**
 * package environment to zip file
 */
export const packageEnv = async (req, res) => {
    const tails = {
        'printing': '.snap3dp',
        'laser': '.snaplzr',
        'cnc': '.snapcnc'
    };
    const { headType, docId } = req.body;
    const envDir = envDirOfRequest(res, headType, docId);
    if (!envDir) return;
    // const targetPath = `${envDir}/config.json`;
    // const content = fs.readFileSync(targetPath).toString();
    // const config = JSON.parse(content);

    const targetFile = `${uuid().substring(0, 8)}${tails[headType]}`;
    // the archive goes to Tmp; a doc env is one level deeper than a head type env
    const tmpFromEnv = path.relative(envDir, DataStorage.tmpDir).split(path.sep).join('/');
    await zipFolder(envDir, `${tmpFromEnv}/${targetFile}`);
    // config.models.forEach((model) => {
    //     const { originalName, uploadName } = model;
    //     fs.existsSync(`${DataStorage.tmpDir}/${originalName}`)
    //      && fs.copyFileSync(`${DataStorage.tmpDir}/${originalName}`, `${envDir}/${originalName}`);

    //     fs.copyFileSync(`${DataStorage.tmpDir}/${uploadName}`, `${envDir}/${uploadName}`);
    // });

    res.send({ targetFile });
    res.end();
};

/**
 * ids of the documents that have an auto-saved environment (`env/docs/{docId}/config.json`)
 */
export const listEnvDocs = async (req, res) => {
    const docsDir = `${DataStorage.envDir}/${ENV_DOCS_DIR}`;
    try {
        let names = fs.existsSync(docsDir) ? fs.readdirSync(docsDir) : [];
        // auto-saves whose write was cut off (`<id>.writing` / `<id>.previous`) are repaired first
        const interrupted = interruptedDirNames(names).filter((name) => isValidDocId(name));
        if (interrupted.length) {
            for (const docId of interrupted) {
                await envWriteQueue(docId, async () => recoverEnvDir(resolveEnvDir(DataStorage.envDir, '', docId)));
            }
            names = fs.readdirSync(docsDir);
        }
        const docIds = names.filter((name) => isValidDocId(name) && fs.existsSync(`${docsDir}/${name}/config.json`));
        res.send({ docIds });
        res.end();
    } catch (e) {
        log.error(`Failed to list environments: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to list environments: ${e}`
        });
    }
};

/**
 * Moves the 4.16 auto-save of a head type (`env/{headType}`) into the folder of a new document
 * (`env/docs/{docId}`): copied completely first, then `env/{headType}` is emptied. `{ migrated: false }`
 * when there is no 4.16 auto-save.
 */
export const migrateLegacyEnv = async (req, res) => {
    const { headType, docId } = req.body || {};
    if (!isValidDocId(docId) || ![HEAD_PRINTING, HEAD_LASER, HEAD_CNC].includes(headType)) {
        res.status(ERR_BAD_REQUEST).send({ msg: 'invalid docId or headType' });
        return;
    }
    try {
        const fromDir = resolveEnvDir(DataStorage.envDir, headType);
        const toDir = resolveEnvDir(DataStorage.envDir, headType, docId);
        const migrated = await envWriteQueue(headType, () => envWriteQueue(docId, () => migrateEnvDir(fromDir, toDir)));
        res.send({ migrated });
        res.end();
    } catch (e) {
        log.error(`Failed to migrate environment: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to migrate environment: ${e}`
        });
    }
};

/**
 * Removes the auto-saves of documents that no restored session document keeps (`body.keep`: doc ids).
 * Only `env/docs/{uuid}` folders are touched; each removal is queued with the writes of that document.
 */
export const pruneEnvDocs = async (req, res) => {
    const keep = Array.isArray(req.body?.keep) ? req.body.keep.filter((id) => isValidDocId(id)) : [];
    const docsDir = `${DataStorage.envDir}/${ENV_DOCS_DIR}`;
    try {
        const names = fs.existsSync(docsDir) ? fs.readdirSync(docsDir) : [];
        const removed = [];
        for (const docId of orphanDocDirs(names, keep)) {
            const envDir = resolveEnvDir(DataStorage.envDir, '', docId);
            await envWriteQueue(docId, async () => {
                if (fs.existsSync(envDir)) {
                    rmDir(envDir, true);
                    removed.push(docId);
                }
            });
        }
        res.send({ removed });
        res.end();
    } catch (e) {
        log.error(`Failed to prune environments: ${e}`);
        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to prune environments: ${e}`
        });
    }
};

export const uploadFileToTmp = (req, res) => {
    const { name, casePath } = req.body;
    const originalName = path.basename(name);
    const originalPath = `${DataStorage.userCaseDir}/${casePath}/${originalName}`;
    const uploadName = pathWithRandomSuffix(originalName);
    const uploadPath = `${DataStorage.tmpDir}/${uploadName}`;
    fs.copyFile(originalPath, uploadPath, (err) => {
        if (err) {
            log.error(`Failed to upload file ${originalName}`);
        } else {
            res.send({
                originalName,
                uploadName
            });
            res.end();
        }
    });
};

export const recoverProjectFile = async (req, res) => {
    const file = req.files.file || JSON.parse(req.body.file);

    try {
        file.path = DataStorage.resolveRelativePath(file.path);
        const { uploadName } = await cpFileToTmp(file);

        await unzipFile(`${uploadName}`, `${DataStorage.tmpDir}`);
        const buffer = fs.readFileSync(`${DataStorage.tmpDir}/config.json`);

        const content = buffer.toString();
        const config = JSON.parse(content);

        const machineInfo = config?.machineInfo;
        let headType = machineInfo?.headType;
        // TODO: for project file of "< version 4.1"
        if (headType === '3dp') {
            headType = HEAD_PRINTING;
            machineInfo.headType = HEAD_PRINTING;
        }
        const configDir = getConfigDir(machineInfo);

        if (config.defaultMaterialId && /^material.([0-9_]+)$/.test(config.defaultMaterialId)) {
            const fname = `${DataStorage.tmpDir}/${config.defaultMaterialId}.def.json`;
            if (fs.existsSync(fname)) {
                fs.copyFileSync(fname, path.join(configDir, `${config.defaultMaterialId}.def.json`));
            }
        }
        if (config.defaultMaterialIdRight && /^material.([0-9_]+)$/.test(config.defaultMaterialIdRight)) {
            const fname = `${DataStorage.tmpDir}/${config.defaultMaterialIdRight}.def.json`;
            if (fs.existsSync(fname)) {
                fs.copyFileSync(fname, path.join(configDir, `${config.defaultMaterialIdRight}.def.json`));
            }
        }

        // Fallback to v4.4 quality preset key
        let { activePresetIds } = config;
        if (!activePresetIds) {
            const { defaultQualityId } = config;
            activePresetIds = {
                [LEFT_EXTRUDER]: defaultQualityId,
                [RIGHT_EXTRUDER]: '',
            };

            config.activePresetIds = activePresetIds;
        }

        for (const stackId of [LEFT_EXTRUDER, RIGHT_EXTRUDER]) {
            const presetId = activePresetIds[stackId];
            if (presetId && /^quality.([0-9_]+)$/.test(presetId)) {
                const filePath = `${DataStorage.tmpDir}/${presetId}.def.json`;
                if (fs.existsSync(filePath)) {
                    fs.copyFileSync(filePath, `${configDir}/${presetId}.def.json`);
                }
            }
        }
        if (headType === HEAD_LASER || headType === HEAD_CNC) {
            config.toolpaths?.length && config.toolpaths.forEach(toolpath => {
                if (toolpath?.toolParams?.definitionId && /^tool.([0-9_]+)$/.test(toolpath?.toolParams?.definitionId)) {
                    const fname = `${DataStorage.tmpDir}/${toolpath.toolParams.definitionId}.def.json`;
                    if (fs.existsSync(fname)) {
                        fs.copyFileSync(fname, `${configDir}/${toolpath.toolParams.definitionId}.def.json`);
                    }
                }
            });
        }

        res.send({
            projectPath: file.path,
            content: JSON.stringify(config), // unwrap config
        });
        res.end();
    } catch (e) {
        log.error(`Failed to recover from project file: ${file.path}`);
        log.error(e);

        res.status(ERR_INTERNAL_SERVER_ERROR).send({
            msg: `Failed to recover from project file: ${e}`,
        });
    }
};
