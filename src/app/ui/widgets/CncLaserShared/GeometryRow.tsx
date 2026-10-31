import React, { useReducer } from 'react';

import i18n from '../../../lib/i18n';
import { formatMm, geometryRows, GeometryKey, selectionGeometry } from '../../SVGEditor/measure/geometry-length';
import { modelGeometry } from '../../SVGEditor/measure/model-geometry';
import ps from './properties.styl';

const LABELS: Record<GeometryKey, string> = {
    length: 'key-CncLaser/Geometry-Length',
    totalLength: 'key-CncLaser/Geometry-Total cut length',
    circumference: 'key-CncLaser/Geometry-Circumference',
    perimeter: 'key-CncLaser/Geometry-Perimeter',
    radius: 'key-CncLaser/Geometry-Radius',
    width: 'key-CncLaser/Geometry-Width',
    height: 'key-CncLaser/Geometry-Height',
};

interface GeometryRowProps {
    // selected models (SvgModel / SvgGroup)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    models: any[];
}

/**
 * Read-only geometry of the selection (length, circumference, ...) under Position & size.
 */
const GeometryRow: React.FC<GeometryRowProps> = ({ models }) => {
    // re-render once an imported file has been parsed
    const [, onLoaded] = useReducer((n: number) => n + 1, 0);
    const items = models.reduce((all, model) => all.concat(modelGeometry(model, onLoaded)), []);
    const geometry = selectionGeometry(items);
    const rows = geometry ? geometryRows(geometry) : [];
    const loading = geometry && rows.length === 0 && geometry.length === null;
    if (rows.length === 0 && !loading) {
        return null;
    }
    return (
        <div className={ps.geometry} aria-label={i18n._('key-CncLaser/Geometry-Geometry')}>
            <span className={ps['geometry-title']}>{i18n._('key-CncLaser/Geometry-Geometry')}</span>
            {loading && <span className={ps['geometry-item']}>…</span>}
            {rows.map(row => (
                <span key={row.key} className={ps['geometry-item']}>
                    <span className={ps.prefix}>{i18n._(LABELS[row.key])}</span>
                    <b>{formatMm(row.value)}</b>
                    <span className={ps.unit}>mm</span>
                </span>
            ))}
        </div>
    );
};

export default GeometryRow;
