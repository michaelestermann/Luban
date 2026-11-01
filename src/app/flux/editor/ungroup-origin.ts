/**
 * Ungroup keeps the work origin on the former members: the rebind is an `OriginOperation2D` in the
 * ungroup's own compound, so one Ctrl+Z restores the group and the origin on it.
 */
import { Origin } from '../../constants/coordinate';
import CompoundOperation from '../../core/CompoundOperation';
import { rebindOnUngroup } from '../../lib/work-origin';
import OriginOperation2D from '../operation-history/OriginOperation2D';

export function pushOriginRebind(compound: CompoundOperation, args: {
    origin: Origin; groupID: string; memberIDs: string[]; apply: (origin: Origin) => void;
}): boolean {
    const after = args.origin ? rebindOnUngroup(args.origin, args.groupID, args.memberIDs) : null;
    if (!after) {
        return false;
    }
    compound.push(new OriginOperation2D({ before: args.origin, after, apply: args.apply }));
    return true;
}
