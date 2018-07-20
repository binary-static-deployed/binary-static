import PropTypes          from 'prop-types';
import React              from 'react';
import {
    AccountInfo,
    AccountUpgrade,
    LoginButton,
    MenuLinks,
    ToggleMenuDrawer,
    ToggleNotificationsDrawer,
    }                     from '../../Components/Layout/Header';
import { connect }        from '../../../Stores/connect';
import { formatMoney }    from '../../../../_common/base/currency_base';

const Header = ({ 
    balance, 
    can_upgrade,
    currency, 
    loginid, 
    items, 
    is_logged_in, 
    onClick, 
    onClickUpgrade,
}) => (
    <header className='shadow'>
        <div className='menu-items'>
            <div className='menu-left'>
                <ToggleMenuDrawer />
                <MenuLinks items={items} />
            </div>
            <div className='menu-right'>
                <div className='acc-balance-container'>
                    { is_logged_in ?
                        <React.Fragment>
                            <AccountInfo 
                                balance={formatMoney(currency, balance, true)}
                                currency={currency}
                                loginid={loginid}
                            />
                            { can_upgrade && <AccountUpgrade onClick={onClickUpgrade} /> }
                        </React.Fragment>
                        :
                        <LoginButton onClick={onClick} />
                    }
                </div>
            </div>
            <ToggleNotificationsDrawer />
        </div>
    </header>
);

Header.propTypes = {
    balance       : PropTypes.string,
    can_upgrade   : PropTypes.bool,
    currency      : PropTypes.string,
    loginid       : PropTypes.string,
    items         : PropTypes.array,
    is_dark_mode  : PropTypes.bool, // TODO: add dark theme handler
    is_logged_in  : PropTypes.bool,
    onClick       : PropTypes.func, // TODO: add click handler
    onClickUpgrade: PropTypes.func, // TODO: add click handler
};

export default connect(
    ({ ui, client }) => ({
        is_dark_mode: ui.is_dark_mode_on,
        balance     : client.balance,
        can_upgrade : client.can_upgrade,
        currency    : client.currency,
        loginid     : client.loginid,
        is_logged_in: client.is_logged_in,
    })
)(Header);