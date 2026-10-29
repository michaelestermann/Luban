import { Box3, Vector3 } from 'three';

import { buildGcodeFileName } from '../../shared/lib/gcode-runs';

type ToolPathInfo = { id: string; name: string; toolParams?: { definitionName?: string } };

/** Project part of G-code file names: opened project file, else the first model's name. */
export const projectBaseName = (openedFile: { name?: string } | null | undefined, firstModelName: string | undefined): string => {
    if (openedFile?.name) {
        return openedFile.name.replace(/\.[^.]+$/, '');
    }
    if (firstModelName) {
        return firstModelName.substr(0, 128).replace(/(\.svg|\.dxf|\.png|\.jpg|\.jpeg|\.bmp)$/, '');
    }
    return 'Luban';
};

/** Display name, tool and toolpaths of every generated file, in milling order. */
export const describeGcodeFiles = <T extends { toolPathIds?: string[] }>(
    gcodeFiles: T[],
    toolPaths: ToolPathInfo[],
    project: string,
    suffix: string
) => {
    return gcodeFiles.map((file, i) => {
        const fileToolPaths = (file.toolPathIds || [])
            .map(id => toolPaths.find(toolPath => toolPath.id === id))
            .filter(Boolean);
        const toolName = fileToolPaths[0]?.toolParams?.definitionName || 'CUT';
        const toolPathNames = fileToolPaths.map(toolPath => toolPath.name);
        return {
            ...file,
            index: i + 1,
            toolName,
            toolPathNames,
            renderGcodeFileName: buildGcodeFileName({ project, index: i + 1, toolName, toolPathNames, suffix })
        };
    });
};

/** Editor state of one generated G-code file (as stored in `gcodeFile`). */
export const toGcodeFileState = (gcodeFile, renderGcodeFileName: string) => {
    const boundingBox = new Box3(
        new Vector3(gcodeFile.boundingBox.min.x, gcodeFile.boundingBox.min.y, gcodeFile.boundingBox.min.z),
        new Vector3(gcodeFile.boundingBox.max.x, gcodeFile.boundingBox.max.y, gcodeFile.boundingBox.max.z),
    );
    return {
        name: gcodeFile.name,
        uploadName: gcodeFile.name,
        size: gcodeFile.size,
        lastModified: gcodeFile.lastModified,
        boundingBox: boundingBox,
        estimatedTime: gcodeFile.estimatedTime,
        thumbnail: gcodeFile.thumbnail,
        renderGcodeFileName: renderGcodeFileName,
        type: gcodeFile.header[';header_type'],
        work_speed: gcodeFile.header[';work_speed(mm/minute)'],
        estimated_time: gcodeFile.header[';estimated_time(s)'],

        // cnc
        jog_speed: gcodeFile.header[';jog_speed(mm/minute)'],
        power: gcodeFile.header[';power(%)'],
        is_rotate: gcodeFile.header[';is_rotate'] === 'true',
        gcodeAxisWorkRange: {
            max: {
                x: gcodeFile.header[';max_x(mm)'],
                y: gcodeFile.header[';max_y(mm)'],
                z: gcodeFile.header[';max_z(mm)'],
                b: gcodeFile.header[';max_b(mm)']
            },
            min: {
                x: gcodeFile.header[';min_x(mm)'],
                y: gcodeFile.header[';min_y(mm)'],
                z: gcodeFile.header[';min_z(mm)'],
                b: gcodeFile.header[';min_b(mm)']
            }
        },
        motorMode: gcodeFile.header[';motorMode']
    };
};
