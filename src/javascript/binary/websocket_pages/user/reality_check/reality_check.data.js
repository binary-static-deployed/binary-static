const moment     = require('moment');
const LocalStore = require('../../../base/storage').LocalStore;
const template   = require('../../../base/utility').template;

const RealityCheckData = (() => {
    'use strict';

    const reality_object = {};

    const resetInvalid = () => {
        const ack = get('ack');
        const interval = +(get('interval'));
        if (ack !== 0 && ack !== 1) {
            set('ack', 0);
        }
        if (!interval) {
            set('interval', 600000);
        }
    };

    const summaryData = (data) => {
        const start_time = moment.utc(new Date(data.start_time * 1000));
        const current_time = moment.utc();

        const session_duration = moment.duration(current_time.diff(start_time));
        const duration_string = template('[_1] days [_2] hours [_3] minutes', [
            session_duration.get('days'),
            session_duration.get('hours'),
            session_duration.get('minutes'),
        ]);

        const turnover = +(data.buy_amount) + (+(data.sell_amount));
        const profit_loss = +(data.sell_amount) - (+(data.buy_amount));

        const start_time_string = template('Your trading statistics since [_1].', [start_time.format('YYYY-MM-DD HH:mm:ss') + ' GMT']);
        return {
            start_time_string: start_time_string,
            login_time       : start_time.format('YYYY-MM-DD HH:mm:ss') + ' GMT',
            current_time     : current_time.format('YYYY-MM-DD HH:mm:ss') + ' GMT',
            session_duration : duration_string,
            loginid          : data.loginid,
            currency         : data.currency,
            turnover         : (+turnover).toFixed(2),
            profit_loss      : (+profit_loss).toFixed(2),
            contracts_bought : data.buy_count,
            contracts_sold   : data.sell_count,
            open_contracts   : data.open_contract_count,
            potential_profit : (+(data.potential_profit)).toFixed(2),
        };
    };

    const set = (key, value) => {
        reality_object[key] = value;
        return LocalStore.set('client.reality_check.' + key, value);
    };

    // use this function to get variables that have values
    const get = function(key) {
        let value = reality_object[key] || LocalStore.get('client.reality_check.' + key) || '';
        if (+value === 1 || +value === 0 || value === 'true' || value === 'false') {
            value = JSON.parse(value || false);
        }
        return value;
    };

    const clear_storage_values = function() {
        // clear all reality check values from local storage
        Object.keys(localStorage).forEach(function(c) {
            if (/^client\.reality_check\./.test(c)) {
                LocalStore.set(c, '');
            }
        });
    };

    return {
        resetInvalid: resetInvalid,
        summaryData : summaryData,
        set         : set,
        get         : get,
        clear       : clear_storage_values,
    };
})();

module.exports = RealityCheckData;
