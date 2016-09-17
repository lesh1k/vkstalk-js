'use strict';

const co = require('co');
const cheerio = require('cheerio');
const async_lib = require('async');

const ph = require('./helpers/phantom.js');
const db = require('./db.js');
const parse = require('./parser.js');
const format = require('./format.js');
const helpers = require('./helpers/helpers.js');
const db_helpers = require('./helpers/db_helpers.js');
const logger = require('./logger.js');

const CONFIG = require('../config/config.json');
const Data = db.get('data');
const DataUpdates = db.get('data_updates');
let USER_ID = null;
let logs_written = 0;
let retry_count = 0;
let URL;
let instance;
let instance_respawn;

module.exports = exports = {};

exports.work = function(user_id) {
    if (!user_id) {
        throw Error('No user ID supplied.');
    }

    USER_ID = user_id;
    URL = CONFIG.url + USER_ID;
    scrape();
};









function scrape() {
    logger.info('Start scraping', {
        user_id: USER_ID
    });

    async_lib.auto({
        url: async_lib.constant(URL),
        html: ['url', getPageContent],
        $: ['html', async_lib.asyncify(getHtmlHandler)],
        is_page_open: ['$', async_lib.asyncify(isUserPageOpen)], // This one is not yet used
        user_data: ['$', async_lib.asyncify(collectUserData)],
        prev_user_data: callback => {
            Data.findOne({user_id: USER_ID}, {sort: {timestamp: -1}})
                .then(callback.bind(null, null))
                .catch(callback);
        },
        user_updates: ['user_data', 'prev_user_data', async_lib.asyncify(checkUserDataForUpdates)],
        store_user_updates: ['user_data', 'user_updates', 'prev_user_data', (results, callback) => {
            const {user_updates, prev_user_data, user_data} = results;
            if (user_updates && typeof user_updates === 'object' && prev_user_data) {
                const doc = {
                    user_id: USER_ID,
                    updates: user_updates,
                    timestamp: user_data.timestamp
                };
                logger.info('Write user updates to DB', {
                    doc: doc
                });
                DataUpdates.insert(doc);
                callback(null, true);
            }

            callback(null, false);
        }],
        store_user_data: ['user_data', 'user_updates', 'prev_user_data', (results, callback) => {
            const {user_updates, user_data} = results;
            if (user_updates) {
                logger.info('Write user data to DB', {
                    user_id: USER_ID,
                    data: user_data
                });

                Data.insert(user_data);
                logs_written++;
                callback(null, true);
            }

            callback(null, false);
        }],
        send_data: ['user_data', 'user_updates', 'store_user_data', (results, callback) => {
            const {user_updates, user_data} = results;

            helpers.sendData({
                type: 'stalk-data',
                data: {
                    user: user_data,
                    updates: user_updates,
                    logs_written: logs_written
                }
            });

            callback(null, true);
        }]


    }, 1, (err, results) => {
        if (err) {
            logger.error('Error', err);
            setTimeout(() => {
                throw err;
            }, 2000);
        } else {
            logger.debug('Done!');
        }

        setTimeout(() => {
            process.exit();
        }, 2000);

    });

    // co(function*() {
    //         // const $ = yield* function* getHtmlHandler() {
    //         //     const html = yield* getPageContent(URL);
    //         //     const $ = cheerio.load(html);
    //         //     return $;
    //         // };
    //
    //
    //
    //
    //         // if (!isUserPageOpen($)) {
    //         //     retry_count++;
    //         //     return;
    //         // }
    //         // retry_count = 0;
    //
    //
    //
    //         // logger.info('Extract user data from fetched HTML', {
    //         //     user_id: USER_ID
    //         // });
    //         // const user_data = collectUserData($);
    //
    //
    //
    //
    //         // logger.info('Check if new data has updates', {
    //         //     user_id: USER_ID
    //         // });
    //         // const user_updates = yield* checkUserDataForUpdates(user_data);
    //
    //
    //
    //
    //         // if (user_updates) {
    //         //     logger.info('Write user data to DB', {
    //         //         user_id: USER_ID,
    //         //         data: user_data
    //         //     });
    //         //     const entries_count = yield Data.count({
    //         //         user_id: USER_ID
    //         //     });
    //         //
    //         //     if (typeof user_updates === 'object' && entries_count) {
    //         //         const doc = {
    //         //             user_id: USER_ID,
    //         //             updates: user_updates,
    //         //             timestamp: user_data.timestamp
    //         //         };
    //         //         logger.info('Write user updates to DB', {
    //         //             doc: doc
    //         //         });
    //         //         yield DataUpdates.insert(doc);
    //         //     }
    //         //
    //         //     yield Data.insert(user_data);
    //         //     logs_written++;
    //         // }
    //
    //
    //
    //
    //
    //         // const data = {
    //         //     user: user_data,
    //         //     updates: user_updates,
    //         //     logs_written: logs_written
    //         // };
    //         //
    //         //
    //         //
    //         //
    //         //
    //         // helpers.sendData({
    //         //     type: 'stalk-data',
    //         //     data: data
    //         // });
    //
    //
    //
    //     })
    //     .then(() => {
    //         const timeout = CONFIG.interval * 1000;
    //         logger.info('Set timeout for next scrape() call.', {
    //             user_id: USER_ID,
    //             timeout: timeout
    //         });
    //
    //
    //
    //
    //         if (retry_count) {
    //             logger.error('Cannot scrape page. !isUserPageOpen($) == true', {
    //                 user_id: USER_ID,
    //                 url: URL
    //             });
    //             logger.info('Scrape round skipped. Retry after timeout', {
    //                 user_id: USER_ID
    //             });
    //
    //             const message = format('retryConnectionMessage', retry_count, CONFIG.max_retry_attempts, USER_ID, URL, timeout);
    //             logger.warn(message);
    //             helpers.sendData({
    //                 error: message
    //             });
    //
    //             if (retry_count >= CONFIG.max_retry_attempts) {
    //                 helpers.terminate('Max retry attempts reached.', `Failed ${retry_count} of ${CONFIG.max_retry_attempts} attempts.`);
    //             }
    //         }
    //
    //
    //
    //         setTimeout(scrape, timeout);
    //     })
    //     .catch(err => {
    //         logger.error('[CRITICAL] Caught exception in scrape()', err, {
    //             user_id: USER_ID,
    //             critical: true
    //         });
    //
    //
    //
    //
    //
    //         helpers.sendData({
    //             error: '[CRITICAL ERROR] The process will terminate now. For more info see the logs'
    //         });
    //         setTimeout(() => {
    //             process.exit(1);
    //         }, 2000);
    //     });
}





/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////

function getHtmlHandler({html}) {
    const $ = cheerio.load(html);
    return $;
}


function getPageContent({url}, callback) {
    co(function*() {

        if (!instance || new Date().getTime() > instance_respawn) {
            if (instance_respawn) {
                logger.info('Exiting phantom instance before respawn', {
                    user_id: USER_ID
                });
                instance.exit();
            }

            logger.debug('Yield new phantom instance', {
                user_id: USER_ID
            });
            instance = yield* ph.initPhantomInstance();

            instance_respawn = new Date().getTime() + CONFIG.phantom_respawn_interval;
            logger.debug(`Set respawn phantom time to ${new Date(instance_respawn)}`, {
                user_id: USER_ID,
                respawn: new Date(instance_respawn)
            });
        }




        logger.info('Fetching data...');
        helpers.sendData({
            data: 'Fetching data...'
        });
        const html = yield* ph.fetchPageContent(url, instance, false);

        return html;
    }).then(html => callback(null, html));
}

function isUserPageOpen({$}) {
    const is_hidden_or_deleted = ($ => {
        if ($('#page_current_info, .profile_online').length === 0 || $('.profile_deleted_text').length > 0) {
            return true;
        }

        return false;
    })($);

    if ($('#profile').length > 0 && !is_hidden_or_deleted) {
        return true;
    }

    return false;
}

function collectUserData({$}) {
    logger.info('Extract user data from fetched HTML', {
        user_id: USER_ID
    });
    const data = {
        user_id: USER_ID,
        timestamp: new Date()
    };

    CONFIG.parse_map.forEach(item => {
        const parsed = parse(item.type, $, item);
        data[parsed.key] = parsed.value;
    });

    const detailed_info = parse('detailedProfileInformation', $);
    const counters = parse('counters', $);
    const content_counters = parse('contentCounters', $);
    Object.assign(data, detailed_info, counters, content_counters);
    data['Last seen'] = format('lastSeenTime', data['Last seen']);

    return data;
}

function checkUserDataForUpdates({user_data, prev_user_data}) {
    logger.info('Check if new data has updates', {
        user_id: USER_ID
    });

    if (!prev_user_data) {
        logger.debug('No entries for this user.');
        // No entries for this USER_ID yet
        return 'First DB entry for user. Congrats!';
    }

    const updates = getDiff(prev_user_data, user_data);

    return updates;
}

function getDiff(last_document, data) {
    let updates = {};

    let excluded = CONFIG.keys_to_exclude_when_looking_for_updates.concat(['timestamp']);
    let keys = Object.keys(data).filter(k => excluded.indexOf(k) === -1);
    for (let k of keys) {
        if (data[k] !== last_document[k]) {
            updates[k] = {
                old: last_document[k],
                current: data[k]
            };
        }
    }

    if (Object.keys(updates).length) {
        return updates;
    }

    return null;
}
