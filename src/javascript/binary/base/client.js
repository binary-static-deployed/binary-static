const moment               = require('moment');
const BinaryPjax           = require('./binary_pjax');
const CookieStorage        = require('./storage').CookieStorage;
const LocalStore           = require('./storage').LocalStore;
const State                = require('./storage').State;
const default_redirect_url = require('./url').default_redirect_url;
const getLoginToken        = require('../common_functions/common_functions').getLoginToken;
const japanese_client      = require('../common_functions/country_base').japanese_client;
const RealityCheckData     = require('../websocket_pages/user/reality_check/reality_check.data');
const Cookies              = require('../../lib/js-cookie');

const Client = (function () {
    const client_object = {};

    const parseLoginIDList = function(string) {
        if (!string) return [];
        return string.split('+').sort().map(function(str) {
            const items = str.split(':');
            const id = items[0];
            const is_real = items[1] === 'R';
            const is_financial = /^MF/.test(id);
            const is_gaming = /^MLT/.test(id);

            if (is_real) client_object.has_real = is_real;
            if (is_financial) client_object.has_financial = is_financial;
            if (is_gaming) client_object.has_gaming = is_gaming;

            return {
                id           : id,
                real         : is_real,
                disabled     : items[2] === 'D',
                financial    : is_financial,
                non_financial: is_gaming,
            };
        });
    };

    const init = function () {
        client_object.loginid_array = parseLoginIDList(Cookies.get('loginid_list') || '');

        set('email',     Cookies.get('email'));
        set('loginid',   Cookies.get('loginid'));
        set('residence', Cookies.get('residence'));
        localStorage.removeItem('client.is_logged_in'); // cleanup
    };

    const is_logged_in = function() {
        return (
            get('tokens') &&
            getLoginToken() &&
            Cookies.get('loginid') &&
            client_object.loginid_array.length > 0
        );
    };

    const validate_loginid = function() {
        const loginid_list = Cookies.get('loginid_list');
        const client_id    = Cookies.get('loginid');
        if (!client_id || !loginid_list) return;

        const valid_loginids = new RegExp('^(MX|MF|VRTC|MLT|CR|FOG|VRTJ|JP)[0-9]+$', 'i');

        if (!valid_loginids.test(client_id)) {
            send_logout_request();
        }

        const accIds = loginid_list.split('+');
        accIds.forEach(function(acc_id) {
            if (!valid_loginids.test(acc_id.split(':')[0])) {
                send_logout_request();
            }
        });
    };

    const redirect_if_is_virtual = function(redirectPage) {
        const is_virtual = get('is_virtual');
        if (is_virtual) {
            BinaryPjax.load(redirectPage || '');
        }
        return is_virtual;
    };

    const redirect_if_login = function() {
        const client_is_logged_in = is_logged_in();
        if (client_is_logged_in) {
            BinaryPjax.load(default_redirect_url());
        }
        return client_is_logged_in;
    };

    const set = function(key, value) {
        client_object[key] = value;
        return LocalStore.set('client.' + key, value);
    };

    // use this function to get variables that have values
    const get = function(key) {
        let value = client_object[key] || LocalStore.get('client.' + key) || '';
        if (!Array.isArray(value) && (+value === 1 || +value === 0 || value === 'true' || value === 'false')) {
            value = JSON.parse(value || false);
        }
        return value;
    };

    const response_authorize = function(response) {
        const authorize = response.authorize;
        if (!Cookies.get('email')) {
            set_cookie('email', authorize.email);
            set('email', authorize.email);
        }
        set('session_start', parseInt(moment().valueOf() / 1000));
        set('is_virtual', authorize.is_virtual);
        set('landing_company_name', authorize.landing_company_name);
        set('landing_company_fullname', authorize.landing_company_fullname);
        set('currency', authorize.currency);
    };

    const should_accept_tnc = () => {
        if (get('is_virtual')) return false;
        const website_tnc_version = State.get(['response', 'website_status', 'website_status', 'terms_conditions_version']);
        const client_tnc_status = State.get(['response', 'get_settings', 'get_settings', 'client_tnc_status']);
        return client_tnc_status && website_tnc_version && client_tnc_status !== website_tnc_version;
    };

    const clear_storage_values = function() {
        // clear all client values from local storage
        Object.keys(localStorage).forEach(function(c) {
            if (/^client\.(?!(tokens$))/.test(c)) {
                LocalStore.set(c, '');
            }
        });
        const hash = window.location.hash;
        if (/no-reality-check/.test(hash)) {
            window.location.hash = hash.replace('no-reality-check', '');
        }
        sessionStorage.setItem('currencies', '');
    };

    const get_token = function(client_loginid) {
        let token;
        const tokens = get('tokens');
        if (client_loginid && tokens) {
            const tokensObj = JSON.parse(tokens);
            if (tokensObj.hasOwnProperty(client_loginid) && tokensObj[client_loginid]) {
                token = tokensObj[client_loginid];
            }
        }
        return token;
    };

    const add_token = function(client_loginid, token) {
        if (!client_loginid || !token || get_token(client_loginid)) {
            return false;
        }
        const tokens = get('tokens');
        const tokensObj = tokens && tokens.length > 0 ? JSON.parse(tokens) : {};
        tokensObj[client_loginid] = token;
        set('tokens', JSON.stringify(tokensObj));
        return true;
    };

    const set_cookie = function(cookieName, Value, domain) {
        const cookie_expire = new Date();
        cookie_expire.setDate(cookie_expire.getDate() + 60);
        const cookie = new CookieStorage(cookieName, domain);
        cookie.write(Value, cookie_expire, true);
    };

    const process_new_account = function(client_email, client_loginid, token, virtual_client) {
        if (!client_email || !client_loginid || !token) {
            return;
        }
        // save token
        add_token(client_loginid, token);
        // set cookies
        set_cookie('email',        client_email);
        set_cookie('login',        token);
        set_cookie('loginid',      client_loginid);
        set_cookie('loginid_list', virtual_client ? client_loginid + ':V:E' : client_loginid + ':R:E+' + Cookies.get('loginid_list'));
        // set local storage
        localStorage.setItem('GTM_newaccount', '1');
        localStorage.setItem('active_loginid', client_loginid);
        RealityCheckData.clear();
        window.location.href = default_redirect_url(); // need to redirect not using pjax
    };

    const can_upgrade_gaming_to_financial = function(data) {
        return (data.hasOwnProperty('financial_company') && data.financial_company.shortcode === 'maltainvest');
    };

    const can_upgrade_virtual_to_financial = function(data) {
        return (data.hasOwnProperty('financial_company') && !data.hasOwnProperty('gaming_company') && data.financial_company.shortcode === 'maltainvest');
    };

    const can_upgrade_virtual_to_japan = function(data) {
        return (data.hasOwnProperty('financial_company') && !data.hasOwnProperty('gaming_company') && data.financial_company.shortcode === 'japan');
    };

    const has_gaming_financial_enabled = function() {
        let has_financial = false,
            has_gaming = false,
            looping_user;
        for (let i = 0; i < client_object.loginid_array.length; i++) {
            looping_user = client_object.loginid_array[i];
            if (looping_user.financial && !looping_user.disabled && !looping_user.non_financial) {
                has_financial = true;
            } else if (!looping_user.financial && !looping_user.disabled && looping_user.non_financial) {
                has_gaming = true;
            }
        }
        return has_gaming && has_financial;
    };

    const activate_by_client_type = function(section = 'body') {
        if (is_logged_in()) {
            BinarySocket.wait('authorize', 'website_status').then(() => {
                $('#client-logged-in').addClass('gr-centered');
                $('.client_logged_in').removeClass('invisible');
                if (get('is_virtual')) {
                    $(section).find('.client_virtual').removeClass('invisible');
                    $('#topbar').addClass('secondary-bg-color').removeClass('primary-color-dark');
                } else {
                    $(section).find('.client_real').not((japanese_client() ? '.ja-hide' : '')).removeClass('invisible');
                    $('#topbar').addClass('primary-color-dark').removeClass('secondary-bg-color');
                }
            });
        } else {
            $(section).find('.client_logged_out').removeClass('invisible');
            $('#topbar').removeClass('secondary-bg-color').addClass('primary-color-dark');
        }
    };

    const send_logout_request = function(showLoginPage) {
        if (showLoginPage) {
            sessionStorage.setItem('showLoginPage', 1);
        }
        BinarySocket.send({ logout: '1' });
    };

    const do_logout = function(response) {
        if (response.logout !== 1) return;
        clear_storage_values();
        LocalStore.remove('client.tokens');
        const cookies = ['login', 'loginid', 'loginid_list', 'email', 'settings', 'reality_check', 'affiliate_token', 'affiliate_tracking', 'residence'];
        const domains = [
            '.' + document.domain.split('.').slice(-2).join('.'),
            '.' + document.domain,
        ];

        let parent_path = window.location.pathname.split('/', 2)[1];
        if (parent_path !== '') {
            parent_path = '/' + parent_path;
        }

        cookies.forEach(function(c) {
            const regex = new RegExp(c);
            Cookies.remove(c, { path: '/', domain: domains[0] });
            Cookies.remove(c, { path: '/', domain: domains[1] });
            Cookies.remove(c);
            if (regex.test(document.cookie) && parent_path) {
                Cookies.remove(c, { path: parent_path, domain: domains[0] });
                Cookies.remove(c, { path: parent_path, domain: domains[1] });
                Cookies.remove(c, { path: parent_path });
            }
        });
        window.location.reload();
    };

    const current_landing_company = function() {
        const landing_company_response = State.get(['response', 'landing_company', 'landing_company']) || {};
        let client_landing_company = {};
        Object.keys(landing_company_response).forEach(function (key) {
            if (client_object.landing_company_name === landing_company_response[key].shortcode) {
                client_landing_company = landing_company_response[key];
            }
        });
        return client_landing_company;
    };

    const is_financial = () => (client_object.loginid_array.find(obj => (obj.id === get('loginid'))) || {}).financial;

    const should_complete_tax = () => is_financial() && !/crs_tin_information/.test((State.get(['response', 'get_account_status', 'get_account_status']) || {}).status);

    return {
        init                  : init,
        validate_loginid      : validate_loginid,
        redirect_if_is_virtual: redirect_if_is_virtual,
        redirect_if_login     : redirect_if_login,
        set                   : set,
        get                   : get,
        response_authorize    : response_authorize,
        should_accept_tnc     : should_accept_tnc,
        clear_storage_values  : clear_storage_values,
        get_token             : get_token,
        add_token             : add_token,
        set_cookie            : set_cookie,
        process_new_account   : process_new_account,
        is_logged_in          : is_logged_in,

        can_upgrade_gaming_to_financial : can_upgrade_gaming_to_financial,
        can_upgrade_virtual_to_financial: can_upgrade_virtual_to_financial,
        can_upgrade_virtual_to_japan    : can_upgrade_virtual_to_japan,
        has_gaming_financial_enabled    : has_gaming_financial_enabled,
        activate_by_client_type         : activate_by_client_type,

        send_logout_request: send_logout_request,
        do_logout          : do_logout,
        is_financial       : is_financial,
        should_complete_tax: should_complete_tax,

        current_landing_company: current_landing_company,
    };
})();

module.exports = {
    Client          : Client,
    validate_loginid: Client.validate_loginid,
};
