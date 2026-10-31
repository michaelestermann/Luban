import fs from 'fs';
import path from 'path';

const HIDDEN_ATTRIBUTE = /\svisibility\s*=\s*(["'])hidden\1/gi;

/**
 * Removes visibility="hidden" attributes from SVG source text.
 */
export function stripHiddenVisibility(svg: string): string {
    return svg.replace(HIDDEN_ATTRIBUTE, '');
}

/**
 * Whether a model's source SVG was written by the editor (a drawn shape, text): only those can carry
 * the editor's own visibility="hidden". An imported SVG file (svgNodeName "image") keeps the hidden
 * elements of its author, the engine must skip them.
 */
export function editorShapeSource(modelInfo: { config?: { svgNodeName?: string } } | null | undefined): boolean {
    const nodeName = modelInfo?.config?.svgNodeName;
    return !!nodeName && nodeName !== 'image';
}

/**
 * Source files of drawn shapes could be saved while the editor had the element hidden
 * (e.g. during point editing). The toolpath engine skips hidden elements and then produces
 * an empty toolpath. For a model that is visible, use a copy of the source without the
 * hidden flag. Returns the upload name to use (the original one if nothing had to change).
 */
export function ensureVisibleSvgSource(dir: string, uploadName: string, modelVisible: boolean): string {
    if (modelVisible === false || !uploadName || !/\.svg$/i.test(uploadName)) {
        return uploadName;
    }
    const filePath = path.join(dir, uploadName);
    if (!fs.existsSync(filePath)) {
        return uploadName;
    }
    const svg = fs.readFileSync(filePath, 'utf8');
    const cleaned = stripHiddenVisibility(svg);
    if (cleaned === svg) {
        return uploadName;
    }
    const visibleName = uploadName.replace(/\.svg$/i, '-visible.svg');
    fs.writeFileSync(path.join(dir, visibleName), cleaned, 'utf8');
    return visibleName;
}
