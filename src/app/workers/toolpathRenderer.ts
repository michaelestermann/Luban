import { Observable } from 'rxjs';

import ToolPathGeometryConverter from './GcodeToBufferGeometry/ToolPathGeometryConverter';
import { renderToolPathFiles, ToolpathRendererData } from './toolpath-render-files';
import log from '../lib/log';

const toolpathRenderer = (taskResult: ToolpathRendererData) => {
    return new Observable((observer) => {
        const convert = async (filename: string, onProgress: (progress: number) => void) => {
            log.info(`Generate geometry from tool path, ${filename}`);
            return new ToolPathGeometryConverter().load(filename, onProgress);
        };
        renderToolPathFiles(taskResult, convert, (message) => observer.next(message))
            .catch((err) => observer.next({ status: 'err', headType: taskResult.headType, value: String(err) }))
            .finally(() => observer.complete());
    });
};

export default toolpathRenderer;
