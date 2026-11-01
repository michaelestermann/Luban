import EventEmitter from 'events';
import { isUndefined } from 'lodash';
import { Pool, Thread, Worker as ThreadsWorker, spawn } from 'threads';

import { machineStore } from '../../store/local-storage';
import log from '../log';
import { LoadModelOptions } from '../../workers/loadModel';
import CalculateSectionPoints, { IMessage as TCalculateSectionPointsMessage } from './ClippingPoolManager.worker';
import './Pool.worker';
import './clipperPool.worker';
import { isWorkerStartFailure, runWorkerTask, WORKER_START_TIMEOUT } from './worker-task';

type TListener = [string, (res: unknown) => void]

export const WorkerEvents = {
    clipperWorkerBusy: 'clipperWorkerBusy',
    clipperWorkerDestroyed: 'clipperWorkerDestroyed',
    clipperWorkerStop: 'clipperWorkerStop',
    clipperWorkerIdle: 'clipperWorkerIdle'
};

class WorkerManager extends EventEmitter {
    private pool: Pool<Thread>;
    private clipperWorker: Worker;
    private listenerMap = new Map<string, TListener>();

    public clipperWorkerEnable = false;

    public constructor() {
        super();
        let enable3dpLivePreview = machineStore.get('enable3dpLivePreview');
        if (isUndefined(enable3dpLivePreview)) {
            enable3dpLivePreview = true;
        }
        this.clipperWorkerEnable = enable3dpLivePreview;
    }

    public setClipperWorkerEnable(bool: boolean) {
        if (!bool && this.clipperWorkerEnable && this.clipperWorker) {
            this.clipperWorker.terminate();
            this.clipperWorker = null;
        }
        this.clipperWorkerEnable = bool;
    }

    public initPool(): void {
        if (!this.pool) {
            this.pool = Pool(
                async () => spawn(new ThreadsWorker('./worker/Pool.worker.js'), { timeout: WORKER_START_TIMEOUT }),
                {
                    size: 2,
                },
            ) as unknown as Pool<Thread>;
        }
    }

    public getPool(): Pool<Thread> {
        if (!this.pool) {
            this.initPool();
        }

        return this.pool;
    }

    public arrangeModels<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('arrangeModels', data, onMessage, onComplete);
    }

    public autoRotateModels<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('autoRotateModels', data, onMessage, onComplete);
    }

    public boxSelect<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('boxSelect', data, onMessage, onComplete);
    }

    public gcodeToArraybufferGeometry<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('gcodeToArraybufferGeometry', data, onMessage, onComplete);
    }

    public gcodeToBufferGeometry<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('gcodeToBufferGeometry', data, onMessage, onComplete);
    }

    public loadModel<T>(data: LoadModelOptions, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('loadModel', data, onMessage, onComplete);
    }

    public scaleToFitWithRotate<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('scaleToFitWithRotate', data, onMessage, onComplete);
    }

    public toolpathRenderer<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        // a crashed render job reports like a failed render
        const onError = (err: unknown) => onMessage({ status: 'err', value: err instanceof Error ? err.message : String(err) } as unknown as T);
        this.exec('toolpathRenderer', data, onMessage, onComplete, onError);
    }

    public generatePlateAdhesion<T>(data: unknown, onMessage: (data: T) => void, onComplete?: () => void) {
        this.exec('generatePlateAdhesion', data, onMessage, onComplete);
    }

    public async stopCalculateSectionPoints(modelID: string) {
        const preListener = this.listenerMap.get(modelID);
        if (preListener) {
            // remove the last listening in time
            const [topic] = preListener;
            this.emit(`${topic}`, {
                type: 'FINISH',
                clippingMap: null,
                innerWallMap: null,
                skinMap: null,
                infillMap: null
            });
            this.listenerMap.delete(modelID);

            this.clipperWorker && this.clipperWorker.postMessage(['cancel-job', { modelID }]);
        }
    }

    public stopClipper() {
        if (this.clipperWorker) {
            // stop-job
            this.clipperWorker.postMessage(['stop-job']);
        }
    }

    public continueClipper() {
        if (this.clipperWorker) {
            // continue-job
            this.clipperWorker.postMessage(['continue-job']);
        }
    }

    public async calculateSectionPoints<T>(data: TCalculateSectionPointsMessage) {
        if (!this.clipperWorker) {
            this.clipperWorker = new CalculateSectionPoints();
            this.clipperWorker.onmessage = (res) => {
                // message pipeline
                const { jobID } = res.data;
                this.emit(`CLIPPER:${jobID}`, res.data);
            };
        }

        const jobID = Math.random();
        const modelID = data.modelID;
        return new Promise<T>((resolve, reject) => {
            const preListener = this.listenerMap.get(modelID);
            if (preListener) {
                // remove the last listening in time
                this.removeListener(...preListener);
            }
            const listener = (res) => {
                // get from worker
                if (res.type === 'CANCEL') {
                    reject();
                } else {
                    resolve(res);
                }
            };
            this.once(`CLIPPER:${jobID}`, listener);
            this.listenerMap.set(modelID, [
                `CLIPPER:${jobID}`, listener
            ]);
            // send to worker
            this.clipperWorker.postMessage([data, jobID]);
        });
    }

    private exec<T>(method: string, data: unknown, onMessage?: (payload: T) => void, onComplete?: () => void, onError?: (err: unknown) => void) {
        let started = false;
        const pool = this.getPool();
        let task = pool.queue(async (worker) => {
            started = true;
            // a failing job must end too, or it keeps its pool slot forever
            return runWorkerTask<T>(worker[method](data), {
                onMessage,
                onError,
                onComplete: () => {
                    task = null;
                    onComplete && onComplete();
                }
            });
        });
        // the job never ran (its worker did not start): report the failure, or the caller waits forever
        task.then(undefined, (err: unknown) => {
            if (isWorkerStartFailure(err) && this.pool === pool) {
                // a worker that missed its start stays broken: the next job gets a new pool
                this.pool = null;
                pool.terminate(true).catch(() => undefined);
            }
            if (started) {
                return;
            }
            task = null;
            if (onError) {
                onError(err);
            } else {
                log.error(`Worker job ${method} failed`, err);
            }
            onComplete && onComplete();
        });
        return {
            terminate: () => {
                task && task.cancel();
            }
        };
    }
}

const manager = new WorkerManager();
export default manager;
