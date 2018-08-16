import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import Widget from '../../components/Widget';
import i18n from '../../lib/i18n';
import {
    WidgetState,
    DefaultSortableHandle,
    DefaultMinimizeButton,
    DefaultDropdownButton
} from '../Common';
import GenerateGcodeParameters from './GenerateGcodeParameters';
import styles from '../styles.styl';


class LaserParamsWidget extends PureComponent {
    static propTypes = {
        widgetId: PropTypes.string.isRequired
    };
    state = {};

    constructor(props) {
        super(props);
        WidgetState.bind(this);
    }

    render() {
        const widgetState = this.state.widgetState;

        return (
            <Widget fullscreen={widgetState.fullscreen}>
                <Widget.Header>
                    <Widget.Title>
                        <DefaultSortableHandle />
                        {i18n._('Generate G-code')}
                    </Widget.Title>
                    <Widget.Controls className="sortable-filter">
                        <DefaultMinimizeButton widgetState={widgetState} />
                        <DefaultDropdownButton widgetState={widgetState} />
                    </Widget.Controls>
                </Widget.Header>
                <Widget.Content
                    className={classNames(
                        styles['widget-content'],
                        { [styles.hidden]: widgetState.minimized }
                    )}
                >
                    <GenerateGcodeParameters />
                </Widget.Content>
            </Widget>
        );
    }
}

export default LaserParamsWidget;