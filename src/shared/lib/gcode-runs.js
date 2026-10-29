/**
 * CNC jobs with several tools: consecutive toolpaths with the same tool form one run,
 * and every run becomes its own G-code file (the machine has no tool changer).
 */

const TOOL_KEYS = ['definitionId', 'toolDiameter', 'toolAngle', 'toolShaftDiameter'];
const MAX_TOOLPATHS_PART_LENGTH = 60;

export function isSameTool(a, b) {
    const pa = a?.toolParams || {};
    const pb = b?.toolParams || {};
    return TOOL_KEYS.every(key => pa[key] === pb[key]);
}

export function splitToolPathsByTool(toolPaths) {
    const runs = [];
    for (const toolPath of toolPaths) {
        const run = runs[runs.length - 1];
        if (run && isSameTool(run[run.length - 1], toolPath)) {
            run.push(toolPath);
        } else {
            runs.push([toolPath]);
        }
    }
    return runs;
}

const TRANSLITERATION = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

export function sanitizeFileNamePart(s) {
    return String(s ?? '')
        .replace(/[äöüÄÖÜß]/g, c => TRANSLITERATION[c])
        .replace(/[\\/:*?"<>|]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}

export function buildGcodeFileName({ project, index, toolName, toolPathNames, suffix }) {
    const toolPaths = toolPathNames.map(sanitizeFileNamePart).join('+').slice(0, MAX_TOOLPATHS_PART_LENGTH);
    return `${sanitizeFileNamePart(project)}_${index}_${sanitizeFileNamePart(toolName)}_${toolPaths}${suffix}`;
}
