import BaseTagParser from './BaseTagParser';

const KAPPA = 0.5522847498;


class RectTagParser extends BaseTagParser {
    parse(node, attributes) {
        this.initialize(attributes);

        const x = attributes.x || 0;
        const y = attributes.y || 0;
        const width = attributes.width || 0; // auto
        const height = attributes.height || 0; // auto
        let rx = attributes.rx; // auto
        let ry = attributes.ry; // auto

        if (!rx && !ry) {
            rx = 0;
            ry = 0;
        } else if (!rx && ry) {
            rx = ry;
        } else if (!ry && rx) {
            ry = rx;
        }
        if (rx < 0) {
            rx = 0;
        }
        if (ry < 0) {
            ry = 0;
        }
        if (rx > width / 2) {
            rx = width / 2;
        }
        if (ry > height / 2) {
            ry = height / 2;
        }

        if (rx === 0 && ry === 0) {
            this.moveTo(x, y);
            this.lineTo(x + width, y);
            this.markSegment('line');
            this.lineTo(x + width, y + height);
            this.markSegment('line');
            this.lineTo(x, y + height);
            this.markSegment('line');
        } else {
            // quarter ellipses as cubics (control points at kappa of the radius), each ending exactly at its end point
            const kx = rx * KAPPA;
            const ky = ry * KAPPA;
            const corner = rx === ry ? 'arc' : 'curve';
            this.moveTo(x + rx, y);
            this.lineTo(x + width - rx, y);
            this.markSegment('line');
            this.cubicBezTo(x + width - rx, y, x + width - rx + kx, y, x + width, y + ry - ky, x + width, y + ry);
            this.lineTo(x + width, y + ry);
            this.markSegment(corner);
            this.lineTo(x + width, y + height - ry);
            this.markSegment('line');
            this.cubicBezTo(x + width, y + height - ry, x + width, y + height - ry + ky, x + width - rx + kx, y + height, x + width - rx, y + height);
            this.lineTo(x + width - rx, y + height);
            this.markSegment(corner);
            this.lineTo(x + rx, y + height);
            this.markSegment('line');
            this.cubicBezTo(x + rx, y + height, x + rx - kx, y + height, x, y + height - ry + ky, x, y + height - ry);
            this.lineTo(x, y + height - ry);
            this.markSegment(corner);
            this.lineTo(x, y + ry);
            this.markSegment('line');
            this.cubicBezTo(x, y + ry, x, y + ry - ky, x + rx - kx, y, x + rx, y);
            this.lineTo(x + rx, y);
            this.markSegment(corner);
        }

        this.commitPath(true);

        return this.createShape();
    }
}

export default RectTagParser;
