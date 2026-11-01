import noop from 'lodash/noop';
import { replace } from 'lodash';
import classNames from 'classnames';
import React, { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { message } from 'antd';
import { pathWithRandomSuffix } from '../../../../shared/lib/random-utils';
import { actions as workspaceActions } from '../../../flux/workspace';
import gcodeActions from '../../../flux/workspace/actions-gcode';
import i18n from '../../../lib/i18n';
import { normalizeNameDisplay } from '../../../lib/normalize-range';
import SvgIcon from '../../components/SvgIcon';

import styles from './styles.styl';


const suffixLength = 7;

declare interface GcodePreviewItemProps {
    gcodeFile: { [key: string]: any };
    index: number;
    selected: boolean;
    onSelectFile: (_selectFileName: string, event: MouseEvent, needToUnselect?: boolean) => void;
    setSelectFileIndex: (index: number) => void;
    isEdit: boolean
    editDone: () => void
}


const GcodePreviewItem: React.FC<GcodePreviewItemProps> = (props) => {
    const dispatch = useDispatch();

    const changeNameInput = useRef<HTMLInputElement>(null);

    const { gcodeFile, index, selected, onSelectFile, setSelectFileIndex, isEdit, editDone } = props;

    const { prefixName, suffixName } = normalizeNameDisplay(gcodeFile?.renderGcodeFileName || gcodeFile?.name, suffixLength);

    let size = '';
    const { isRenaming } = gcodeFile;
    if (!gcodeFile.size) {
        size = '';
    } else if (gcodeFile.size / 1024 / 1024 > 1) {
        size = `${(gcodeFile.size / 1024 / 1024).toFixed(2)} MB`;
    } else if (gcodeFile.size / 1024 > 1) {
        size = `${(gcodeFile.size / 1024).toFixed(2)} KB`;
    } else {
        size = `${(gcodeFile.size).toFixed(2)} B`;
    }

    const lastModified = new Date(gcodeFile.lastModified);
    let date = `${lastModified.getFullYear()}.${lastModified.getMonth() + 1}.${lastModified.getDate()}   ${lastModified.getHours()}:${lastModified.getMinutes()}`;
    if (!gcodeFile.lastModified) {
        date = '';
    }

    const onKeyDown = (e) => {
        let keynum;
        if (window.event) {
            keynum = e.keyCode;
        } else if (e.which) {
            keynum = e.which;
        }
        if (keynum === 13) {
            e.target.blur();
        }
    };

    const onRenameEnd = (_uploadName: string) => {
        if (!changeNameInput.current) {
            return;
        }
        if (!changeNameInput.current.value || !changeNameInput.current.value.trim()) {
            message.error("file name can't be blank");
            changeNameInput.current.focus();
            return;
        }
        let newName = changeNameInput.current.value;
        const m = _uploadName.match(/(\.gcode|\.cnc|\.nc)$/);
        if (m) {
            newName += m[0];
        }
        dispatch(workspaceActions.renameGcodeFile(_uploadName, newName, false));
        editDone();
    };

    const onRenameStart = (_uploadName, _index, _renderGcodeFileName = '', event?: MouseEvent) => {
        if (!selected) return;
        dispatch(workspaceActions.renameGcodeFile(_uploadName, null, true));
        event && event.stopPropagation();
        setTimeout(() => {
            changeNameInput.current.value = replace(_renderGcodeFileName, /(\.gcode|\.cnc|\.nc)$/, '') || _uploadName;
            changeNameInput.current.focus();
        }, 0);
    };

    useEffect(() => {
        if (selected) {
            setSelectFileIndex(index);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- record the index when the item becomes selected; the parent picks the next file by it
    }, [selected]);

    useEffect(() => {
        if (isEdit) {
            onRenameStart(gcodeFile.uploadName, gcodeFile, gcodeFile.renderGcodeFileName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger only: start renaming when edit mode is switched on
    }, [isEdit]);

    return (
        <div
            className={classNames(
                styles['gcode-file'],
                { [styles.selected]: selected }
            )}
            key={pathWithRandomSuffix(gcodeFile.uploadName)}
            onClick={
                (event) => onSelectFile(gcodeFile.uploadName, event)
            }
            onKeyDown={noop}
            role="button"
            tabIndex={0}
        >
            {/* <button
                type="button"
                className={styles['gcode-file-remove']}
                onClick={() => {
                    onRemoveFile(gcodeFile);
                }}
            /> */}
            {/* {selected && <div className={styles['gcode-file-selected-icon']} />} */}

            <div className={styles['gcode-file-img']}>
                {gcodeFile.thumbnail && (
                    <img
                        src={gcodeFile.thumbnail}
                        draggable="false"
                        alt=""
                    />
                )}
            </div>
            <div className={classNames('input-text', styles['gcode-file-text'])}>
                <div
                    className={classNames(
                        styles['gcode-file-text-name'],
                        { [styles.haveOpacity]: isRenaming === false }
                    )}
                    role="button"
                    tabIndex={0}
                >
                    <div
                        className={styles['gcode-file-text-rename']}
                    >
                        {/* {name} */}
                        <span className={classNames(styles['prefix-name'])}>
                            {prefixName}
                        </span>
                        <span className={classNames(styles['suffix-name'])}>
                            {suffixName}
                        </span>
                    </div>

                </div>
                <div className={classNames(
                    styles['gcode-file-input-name'],
                    { [styles.haveOpacity]: isRenaming === true }
                )}
                >
                    <input
                        defaultValue={gcodeFile?.renderGcodeFileName?.replace(/(\.gcode|\.cnc|\.nc)$/, '')}
                        className={classNames('input-select')}
                        onBlur={() => onRenameEnd(gcodeFile?.uploadName)}
                        onKeyDown={(event) => onKeyDown(event)}
                        ref={changeNameInput}
                    />
                </div>
                <div className={styles['gcode-file-text-info']} title={gcodeFile.sourceName ? `${gcodeFile.sourceName} · ${date}` : undefined}>
                    {/* 4.17 tabs: the project the file was loaded from */}
                    {gcodeFile.sourceName && (
                        <span className={styles['gcode-file-source']} data-gcode-source={gcodeFile.sourceDocId}>
                            {i18n._('key-Tabs/from {{name}}', { name: gcodeFile.sourceName, interpolation: { escapeValue: false } })}
                        </span>
                    )}
                    <span>{size}</span>
                    {!gcodeFile.sourceName && <span>{date}</span>}
                </div>
            </div>
            <SvgIcon
                name="PreviewGcode"
                // name="MainToolbarHome"
                type={['static']}
                className="height-48 position-absolute right-16"
                size={24}
                onClick={() => {
                    onSelectFile(gcodeFile.uploadName, null, false);
                    dispatch(gcodeActions.renderPreviewGcodeFile(gcodeFile));
                }}
            />
        </div>
    );
};

export default React.memo(GcodePreviewItem);
