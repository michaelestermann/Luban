import React, { PureComponent } from 'react';
import { Menu, Submenu, Item, Separator, contextMenu } from 'react-contexify';
import PropTypes from 'prop-types';
import '../../../styles/contextmenu.styl';


// own content in the menu; the props the menu hands to its items (event, trigger props) are not passed on
const CustomItem = ({ render }) => <div>{render()}</div>;
CustomItem.propTypes = { render: PropTypes.func.isRequired };

// ref: https://fkhadra.github.io/react-contexify/api/context-menu
class ContextMenu extends PureComponent {
    static hide() {
        contextMenu.hideAll();
    }

    show(e) {
        e.preventDefault();
        contextMenu.show({
            id: this.props.id,
            event: e
        });
    }

    render() {
        const { id, menuItems = [] } = this.props;
        let key = 0;
        return (
            <div>
                <Menu id={id}>
                    {menuItems.map((menuItem) => {
                        if (!menuItem) {
                            return null;
                        }
                        const { type, label, disabled = false, onClick, items, render } = menuItem;
                        switch (type) {
                            case 'custom':
                                // own content (e.g. a point picker); it closes the menu itself
                                return (
                                    <CustomItem key={key++} render={render} />
                                );
                            case 'separator':
                                return (
                                    <Separator key={key++} />
                                );
                            case 'item':
                                return (
                                    <Item key={key++} onClick={onClick} disabled={disabled}>{label}</Item>
                                );
                            case 'subMenu':
                                return (
                                    <Submenu key={key++} label={label} disabled={disabled}>
                                        {items.map((item) => {
                                            switch (item.type) {
                                                case 'separator':
                                                    return (
                                                        <Separator key={key++} />
                                                    );
                                                case 'item':
                                                    return (
                                                        <Item key={key++} onClick={item.onClick}>{item.label}</Item>
                                                    );
                                                case 'custom':
                                                    return (
                                                        <CustomItem key={key++} render={item.render} />
                                                    );
                                                default:
                                                    return null;
                                            }
                                        })}
                                    </Submenu>
                                );
                            default:
                                return null;
                        }
                    })}
                </Menu>
            </div>
        );
    }
}

ContextMenu.propTypes = {
    id: PropTypes.string.isRequired,
    // example:
    //     items = [
    //         { name: 'a-1', disabled: false, onClick: () => console.log('a-1') },
    //         'separator',
    //         { name: 'a-2', disabled: true, onClick: () => console.log('a-2') },
    //         { name: 'a-3', disabled: false, onClick: () => console.log('a-3') }
    //     ];
    menuItems: PropTypes.array.isRequired
};

export default ContextMenu;
