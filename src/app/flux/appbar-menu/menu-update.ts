/**
 * The application menu is recomputed after every burst of Redux actions. Publishing it
 * re-renders the app bar and rebuilds the native Electron menu (a synchronous IPC round
 * trip), so an unchanged menu is not published again.
 */
export type PublishedMenu = { menu: unknown[]; signature: string } | null;

// click handlers are not part of the signature (JSON drops functions)
export const menuSignature = (menu: unknown[]): string => {
    try {
        return JSON.stringify(menu);
    } catch (e) {
        // not serializable: never equal, always published
        return `unserializable:${Math.random()}`;
    }
};

/**
 * @param last      the menu array last published by this check and its signature
 * @param current   the menu array in the state now (other actions publish new arrays)
 * @param signature signature of the recomputed menu
 */
export const isMenuUnchanged = (last: PublishedMenu, current: unknown[], signature: string): boolean => {
    return !!last && last.menu === current && last.signature === signature;
};
