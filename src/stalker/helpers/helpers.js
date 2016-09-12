'use strict';

const logger = require('../logger.js');
const memwatch = require('memwatch-next');
const cluster = require('cluster');
const extend = require('extend');

module.exports = exports = {};

exports.getProcessLaunchDate = function() {
    logger.debug('Function call. getProcessLaunchDate()', {
        args: [].slice.call(arguments)
    });
    // The result is not absolutely precise.
    // Deviations of up to 2 seconds are to be expected
    const ms_in_second = 1000;
    const now = new Date().getTime();
    const uptime = process.uptime() * ms_in_second;
    return new Date(now - uptime);
};

exports.capitalize = function(str) {
    logger.debug('Function call. capitalize(str)', {
        args: [].slice.call(arguments)
    });
    if (!str.length || typeof str !== 'string') {
        return str;
    }

    str = str[0].toUpperCase() + str.substr(1);
    return str;
};

exports.convertTimeTo24hrs = function(time) {
    logger.debug('Function call. convertTimeTo24hrs(time)', {
        args: [].slice.call(arguments)
    });
    let parts = time.split(' ');
    let hours = parts[0].split(':')[0];
    let minutes = parts[0].split(':')[1];
    let period = parts[1];

    if (period === 'am') {
        if (hours.length === 1) {
            hours = '0' + hours;
        } else if (hours === '12') {
            hours = '00';
        }
    } else {
        if (hours !== '12') {
            hours = String(parseInt(hours, 10) + 12);
        }
    }

    return `${hours}:${minutes}`;
};

exports.terminate = function(reason, message) {
    logger.debug('Function call. terminate(reason, message)', {
        args: [].slice.call(arguments)
    });
    logger.error('Manual call of process.exit()', {
        reason: reason,
        message: message
    });
    process.exit();
};

exports.monitorMemoryLeaks = function() {
    memwatch.on('leak', function(info) {
        logger.warn('Possible MEMORY LEAK detected', info);
    });
};

exports.sendData = function(message, fallback_to_console = false) {
    const message_sample = {
        type: 'string', // message, stalk-data, data
        data: 'Sample message', // either a string or an object
        error: null
    };

    const to_send = extend(true, message_sample, message);
    if (!isValidMessage(to_send)) {
        logger.error('Invalid message format', {
            message: to_send
        });
        setTimeout(() => {
            throw Error('stalker.helpers.sendData - Invalid message format');
        }, 2000);
        return;
    }

    if (cluster.isWorker) {
        logger.debug('Sending data to master, via process.send', {
            message: to_send
        });
        process.send(to_send);
    } else if (fallback_to_console) {
        logger.info('Call to sendData(data) from the Master process. process.send not available, falling back to console.log');
        console.log(to_send);
    } else {
        let msg = 'Call to sendData(data) from the Master process.';
        msg += 'process.send not available, fallback to console.log forbidden. Nothing to do here';
        logger.info(msg, {
            message: to_send
        });
    }
};

function isValidMessage(message) {
    const log_prefix = 'isValidMessage(message).';
    const MESSAGE_TYPES = ['object', 'stalk-data'];

    if (typeof message.data === 'string' || message.error) {
        return true;
    }

    if (MESSAGE_TYPES.indexOf(message.type) === -1) {
        logger.error(
            `${log_prefix} Unknown message.type "${message.type}"`, {
                message: message
            }
        );
        return false;
    }

    if (message.type !== 'error' && typeof message.data !== 'object') {
        logger.error(
            `${log_prefix} Unexpected message.data for message.type="${message.type}"` +
            `Expected message.data to be 'object', but it is '${typeof message.data}'`, {
                message: message
            }
        );
        return false;
    }

    return true;
}
