const MBTradePage               = require('./mb_trade/mb_tradepage');
const TradePage_Beta            = require('./trade/beta/tradepage');
const Highchart                 = require('./trade/charts/highchartws').Highchart;
const reloadPage                = require('./trade/common').reloadPage;
const Notifications             = require('./trade/notifications').Notifications;
const WSTickDisplay             = require('./trade/tick_trade').WSTickDisplay;
const TradePage                 = require('./trade/tradepage');
const ViewPopupWS               = require('./user/view_popup/view_popupws');
const ViewBalanceUI             = require('./user/viewbalance/viewbalance.ui').ViewBalanceUI;
const Client                    = require('../base/client').Client;
const validate_loginid          = require('../base/client').validate_loginid;
const Clock                     = require('../base/clock').Clock;
const GTM                       = require('../base/gtm').GTM;
const Header                    = require('../base/header').Header;
const getLanguage               = require('../base/language').getLanguage;
const localize                  = require('../base/localize').localize;
const Login                     = require('../base/login').Login;
const State                     = require('../base/storage').State;
const getPropertyValue          = require('../base/utility').getPropertyValue;
const getLoginToken             = require('../common_functions/common_functions').getLoginToken;
const SessionDurationLimit      = require('../common_functions/session_duration_limit').SessionDurationLimit;
const getAppId                  = require('../../config').getAppId;
const getSocketURL              = require('../../config').getSocketURL;
const Cookies                   = require('../../lib/js-cookie');

/*
 * It provides a abstraction layer over native javascript Websocket.
 *
 * Provide additional functionality like if connection is close, open
 * it again and process the buffered requests
 *
 *
 * Usage:
 *
 * `BinarySocket.init()` to initiate the connection
 * `BinarySocket.send({contracts_for : 1})` to send message to server
 */
const BinarySocketClass = function() {
    'use strict';

    let binarySocket,
        bufferedSends = [],
        manualClosed = false,
        events = {},
        authorized = false,
        req_number = 0,
        req_id     = 0,
        wrongAppId = 0;

    const timeouts  = {};
    const socketUrl = getSocketURL() + '?app_id=' + getAppId() + '&l=' + getLanguage();
    const promises  = {};
    const no_duplicate_requests = [
        'authorize',
        'get_settings',
        'residence_list',
    ];
    const waiting_list = {
        items: {},
        add  : (msg_type, promise_obj) => {
            if (!waiting_list.items[msg_type]) {
                waiting_list.items[msg_type] = [];
            }
            waiting_list.items[msg_type].push(promise_obj);
        },
        resolve: (response) => {
            const msg_type = response.msg_type;
            const this_promises = waiting_list.items[msg_type];
            if (this_promises && this_promises.length) {
                this_promises.forEach((pr) => {
                    if (!waiting_list.another_exists(pr, msg_type)) {
                        pr.resolve(response);
                    }
                });
                waiting_list.items[msg_type] = [];
            }
        },
        another_exists: (pr, msg_type) => (
            Object.keys(waiting_list.items)
                .some(type => (
                    type !== msg_type &&
                    $.inArray(pr, waiting_list.items[type]) >= 0
                ))
        ),
    };

    const clearTimeouts = function() {
        Object.keys(timeouts).forEach(function(key) {
            clearTimeout(timeouts[key]);
            delete timeouts[key];
        });
    };

    const isReady = function () {
        return binarySocket && binarySocket.readyState === 1;
    };

    const isClose = function () {
        return !binarySocket || binarySocket.readyState === 2 || binarySocket.readyState === 3;
    };

    const sendBufferedSends = function () {
        while (bufferedSends.length > 0) {
            binarySocket.send(JSON.stringify(bufferedSends.shift()));
        }
    };

    const wait = (...msg_types) => {
        const promise_obj = new PromiseClass();
        let is_resolved = true;
        msg_types.forEach((msg_type) => {
            const last_response = State.get(['response', msg_type]);
            if (!last_response) {
                if (msg_type !== 'authorize' || Client.is_logged_in()) {
                    waiting_list.add(msg_type, promise_obj);
                    is_resolved = false;
                }
            } else if (msg_types.length === 1) {
                promise_obj.resolve(last_response);
            }
        });
        if (is_resolved) {
            promise_obj.resolve();
        }
        return promise_obj.promise;
    };

    const send = function(data, force_send) {
        const promise_obj = new PromiseClass();

        if (!force_send) {
            const msg_type = no_duplicate_requests.find(c => c in data);
            const last_response = State.get(['response', msg_type]);
            if (last_response) {
                promise_obj.resolve(last_response);
                return promise_obj.promise;
            }
        }

        if (!data.req_id) {
            data.req_id = ++req_id;
        }
        promises[data.req_id] = {
            callback : (response) => { promise_obj.resolve(response); },
            subscribe: !!data.subscribe,
        };

        if (isReady()) {
            if (!data.hasOwnProperty('passthrough') && !data.hasOwnProperty('verify_email')) {
                data.passthrough = {};
            }
            // temporary check
            if ((data.contracts_for || data.proposal) && !data.passthrough.hasOwnProperty('dispatch_to') && !State.get('is_mb_trading')) {
                data.passthrough.req_number = ++req_number;
                timeouts[req_number] = setTimeout(function() {
                    if (typeof reloadPage === 'function' && data.contracts_for) {
                        window.alert("The server didn't respond to the request:\n\n" + JSON.stringify(data) + '\n\n');
                        reloadPage();
                    } else {
                        $('.price_container').hide();
                    }
                }, 60 * 1000);
            } else if (data.contracts_for && !data.passthrough.hasOwnProperty('dispatch_to') && State.get('is_mb_trading')) {
                data.passthrough.req_number = ++req_number;
                timeouts[req_number] = setTimeout(function() {
                    MBTradePage.onDisconnect();
                }, 10 * 1000);
            }

            binarySocket.send(JSON.stringify(data));
        } else {
            bufferedSends.push(data);
            if (isClose()) {
                init(1);
            }
        }

        return promise_obj.promise;
    };

    const init = function (es) {
        if (wrongAppId === getAppId()) {
            return;
        }
        if (!es) {
            events = {};
        }
        if (typeof es === 'object') {
            bufferedSends = [];
            manualClosed = false;
            events = es;
            clearTimeouts();
        }

        if (isClose()) {
            binarySocket = new WebSocket(socketUrl);
        }

        binarySocket.onopen = function () {
            const apiToken = getLoginToken();
            if (apiToken && !authorized && localStorage.getItem('client.tokens')) {
                binarySocket.send(JSON.stringify({ authorize: apiToken }));
            } else {
                sendBufferedSends();
            }

            if (typeof events.onopen === 'function') {
                events.onopen();
            }

            if (isReady()) {
                if (!Login.is_login_pages()) {
                    validate_loginid();
                    binarySocket.send(JSON.stringify({ website_status: 1 }));
                }
                if (!Clock.getClockStarted()) Clock.start_clock_ws();
            }
        };

        binarySocket.onmessage = function(msg) {
            const response = JSON.parse(msg.data);
            if (response) {
                const passthrough = getPropertyValue(response, ['echo_req', 'passthrough']);
                let dispatch_to;
                if (passthrough) {
                    dispatch_to = passthrough.dispatch_to;
                    const this_req_number = passthrough.req_number;
                    if (this_req_number) {
                        clearInterval(timeouts[this_req_number]);
                        delete timeouts[this_req_number];
                    } else {
                        switch (dispatch_to) {
                            case 'ViewPopupWS':       ViewPopupWS.dispatch(response); break;
                            case 'ViewChartWS':       Highchart.dispatch(response);   break;
                            case 'ViewTickDisplayWS': WSTickDisplay.dispatch(response); break;
                            // no default
                        }
                    }
                }

                const type = response.msg_type;

                // store in State
                if (!response.echo_req.subscribe || type === 'balance') {
                    State.set(['response', type], $.extend({}, response));
                }
                // resolve the send promise
                const this_req_id = response.req_id;
                const pr = this_req_id ? promises[this_req_id] : null;
                if (pr && typeof pr.callback === 'function') {
                    pr.callback(response);
                    if (!pr.subscribe) {
                        delete promises[this_req_id];
                    }
                }
                // resolve the wait promise
                waiting_list.resolve(response);

                const error_code = getPropertyValue(response, ['error', 'code']);
                if (type === 'authorize') {
                    if (response.error) {
                        const isActiveTab = sessionStorage.getItem('active_tab') === '1';
                        if (error_code === 'SelfExclusion' && isActiveTab) {
                            sessionStorage.removeItem('active_tab');
                            window.alert(response.error.message);
                        }
                        Client.send_logout_request(isActiveTab);
                    } else if (response.authorize.loginid !== Cookies.get('loginid')) {
                        Client.send_logout_request(true);
                    } else if (dispatch_to !== 'cashier_password') {
                        authorized = true;
                        if (!Login.is_login_pages()) {
                            Client.response_authorize(response);
                            send({ balance: 1, subscribe: 1 });
                            send({ get_settings: 1 });
                            send({ get_account_status: 1 });
                            send({ payout_currencies: 1 });
                            const residence = response.authorize.country || Cookies.get('residence');
                            if (residence) {
                                Client.set('residence', residence);
                                send({ landing_company: residence });
                            }
                            if (!Client.get('is_virtual')) {
                                send({ get_self_exclusion: 1 });
                                // TODO: remove this when back-end adds it as a status to get_account_status
                                send({ get_financial_assessment: 1 });
                            }
                        }
                        sendBufferedSends();
                    }
                } else if (type === 'balance') {
                    ViewBalanceUI.updateBalances(response);
                } else if (type === 'time') {
                    Clock.time_counter(response);
                } else if (type === 'logout') {
                    Client.do_logout(response);
                } else if (type === 'landing_company') {
                    Header.upgrade_message_visibility();
                    if (response.error) return;
                    // Header.metatrader_menu_item_visibility(response); // to be uncommented once MetaTrader launched
                    const company = Client.current_landing_company();
                    if (company) {
                        Client.set('default_currency', company.legal_default_currency);
                    }
                } else if (type === 'get_self_exclusion') {
                    SessionDurationLimit.exclusionResponseHandler(response);
                } else if (type === 'payout_currencies') {
                    Client.set('currencies', response.payout_currencies.join(','));
                } else if (type === 'get_settings' && response.get_settings) {
                    const country_code = response.get_settings.country_code;
                    if (country_code) {
                        if (!Cookies.get('residence')) {
                            Client.set('residence', country_code);
                            Client.set_cookie('residence', country_code);
                            send({ landing_company: country_code });
                        }
                    }
                    GTM.event_handler(response.get_settings);
                    if (response.get_settings.is_authenticated_payment_agent) {
                        $('#topMenuPaymentAgent').removeClass('invisible');
                    }
                    Client.set('first_name', response.get_settings.first_name);
                }

                switch (error_code) {
                    case 'WrongResponse':
                    case 'OutputValidationFailed':
                        $('#content').empty().html('<div class="container"><p class="notice-msg center-text">' + (error_code === 'WrongResponse' && response.error.message ? response.error.message : localize('Sorry, an error occurred while processing your request.')) + '</p></div>');
                        break;
                    case 'RateLimit':
                        $('#ratelimit-error-message:hidden').css('display', 'block');
                        break;
                    case 'InvalidToken':
                        if (!/^(reset_password|new_account_virtual|paymentagent_withdraw|cashier)$/.test(type)) {
                            Client.send_logout_request();
                        }
                        break;
                    case 'InvalidAppID':
                        wrongAppId = getAppId();
                        window.alert(response.error.message);
                        break;
                    // no default
                }

                if (typeof events.onmessage === 'function') {
                    events.onmessage(msg);
                }
            }
        };

        binarySocket.onclose = function () {
            authorized = false;
            clearTimeouts();

            if (!manualClosed && wrongAppId !== getAppId()) {
                const toCall = State.get('is_trading')      ? TradePage.onDisconnect      :
                               State.get('is_beta_trading') ? TradePage_Beta.onDisconnect :
                               State.get('is_mb_trading')   ? MBTradePage.onDisconnect    : '';
                if (toCall) {
                    Notifications.show({ text: localize('Connection error: Please check your internet connection.'), uid: 'CONNECTION_ERROR', dismissible: true });
                    timeouts.error = setTimeout(function() {
                        toCall();
                    }, 10 * 1000);
                } else {
                    init(1);
                }
            }
            if (typeof events.onclose === 'function') {
                events.onclose();
            }
        };

        binarySocket.onerror = function (error) {
            console.log('socket error', error);
        };
    };

    const close = function () {
        manualClosed = true;
        bufferedSends = [];
        events = {};
        if (binarySocket) {
            binarySocket.close();
        }
    };

    const clear = function() {
        bufferedSends = [];
        manualClosed = false;
        events = {};
    };

    return {
        init         : init,
        wait         : wait,
        send         : send,
        close        : close,
        socket       : function () { return binarySocket; },
        clear        : clear,
        clearTimeouts: clearTimeouts,
    };
};

class PromiseClass {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}

const BinarySocket = new BinarySocketClass();

module.exports = {
    BinarySocket: BinarySocket,
};
