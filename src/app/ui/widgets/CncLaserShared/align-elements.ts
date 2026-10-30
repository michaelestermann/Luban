import { actions as editorActions } from '../../../flux/editor';

export const HORIZONTAL_ALIGN = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
};

export const VERTICAL_ALIGN = {
    TOP: 'top',
    MIDDLE: 'middle',
    BOTTOM: 'bottom'
};

/**
 * Align the selected SVG elements vertically to the first one (top / middle / bottom).
 * Shared by the TransformationSection alignment row and the selection bar.
 */
export const alignElementsVertical = (dispatch, headType: string, elements, align: string) => {
    const referenceElement = elements[0];
    const referenceY = referenceElement.y.baseVal.value;
    const referenceHeight = referenceElement.height.baseVal.value;

    elements.forEach(element => {
        let newY;
        const centerElement = element.height.baseVal.value / 2;
        if (align === VERTICAL_ALIGN.TOP) {
            newY = referenceY + centerElement;
        } else if (align === VERTICAL_ALIGN.MIDDLE) {
            newY = referenceY + referenceHeight / 2;
        } else {
            newY = referenceY + referenceHeight - centerElement;
        }

        dispatch(editorActions.moveElementsImmediately(headType, [element], { newY }));
    });

    dispatch(editorActions.selectElements(headType, elements));
};

/** Align the selected SVG elements horizontally to the first one (left / center / right). */
export const alignElementsHorizontal = (dispatch, headType: string, elements, align: string) => {
    const referenceElement = elements[0];
    const referenceX = referenceElement.x.baseVal.value;
    const referenceWidth = referenceElement.width.baseVal.value;

    elements.forEach(element => {
        let newX;
        const centerElement = element.width.baseVal.value / 2;
        if (align === HORIZONTAL_ALIGN.LEFT) {
            newX = referenceX + centerElement;
        } else if (align === HORIZONTAL_ALIGN.CENTER) {
            newX = referenceX + referenceWidth / 2;
        } else {
            newX = referenceX + referenceWidth - centerElement;
        }
        dispatch(editorActions.moveElementsImmediately(headType, [element], { newX }));
    });

    dispatch(editorActions.selectElements(headType, elements));
};
