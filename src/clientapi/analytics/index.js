import debug from 'debug';
import userAgent from 'userAgent';

import keen from './keen';
import amplitude from 'amplitude-js/amplitude.js';
import pixel from 'facebook-pixel';

import { merge, logger } from 'base';


/**
 * Ployfill for toISOString from:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
 */
if (!Date.prototype.toISOString) {
  (function() {

    function pad(number) {
      if (number < 10) {
        return '0' + number;
      }
      return number;
    }

    Date.prototype.toISOString = function() {
      return this.getUTCFullYear() +
        '-' + pad(this.getUTCMonth() + 1) +
        '-' + pad(this.getUTCDate()) +
        'T' + pad(this.getUTCHours()) +
        ':' + pad(this.getUTCMinutes()) +
        ':' + pad(this.getUTCSeconds()) +
        '.' + (this.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) +
        'Z';
    };

  }());
}

const log = debug('everwing:Analytics');


class Analytics {

  constructor() {
    this.isInitialized = false;
    this.eventQueue = [];
    this.sessionData = {};
    this._amplitudeClient = null;
    this.pixelEnabled = false;
  }

  _initAmplitude(key) {
    this._amplitudeClient = amplitude.getInstance();
    this._amplitudeClient.init(key);
    if (!this.userID) {
      throw new Error('userID is falsey');
    }
    this._amplitudeClient.setUserId(this.userID);
  }

 /**
  * Initialize session storage
  * @param initialSessionData {object} - An object that contains initial information about this session
  */
  initializeSessionData(initialSessionData) {
    this.sessionData = initialSessionData;
  }

  /**
  * Initialize engine related information (such as FPS)
  * @param params {Engine} - the engine controlling the game
  */
  initializeEngine(engine) {
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fps = 0;
    engine.subscribe('Render', this, this.trackFPS);
  }

  /**
  * Initialize user information for this session.
  * @param params {object} - An object that contains initialization parameters
  * @param params.userID {string} - A string that uniquely identifies this user
  */
  initialize(params) {
    this.isInitialized = true;
    this.sessionID = this.createGuid();
    this.userID = params.userID;

    var isDev = userAgent.SIMULATED || process.env.NODE_ENV === 'development';
    params = isDev && params.dev ? merge(params.dev, params.prod) : params.prod;

    if (params.pixel && params.pixel.enabled) {
      this.pixelEnabled = params.pixel.enabled && pixel.enabled;
      this.pixelWhitelist = params.pixel.whitelist || {};
    }

    this.keenWhitelist = params.keen.whitelist || {};
    this.amplitudeBlacklist = params.amplitude.blacklist || {};

    if (params.amplitude.key) {
      this._initAmplitude(params.amplitude.key);
    }

    keen.init(params.keen.projectID, params.keen.writeKey);

    this.keenAddons = {
      addons: [{
        name: 'keen:ip_to_geo',
        input: { ip: 'ip_address' },
        output: 'ip_geo_info'
      }, {
        name: 'keen:ua_parser',
        input: { ua_string: 'user_agent' },
        output: 'parsed_user_agent'
      }, {
        name: 'keen:date_time_parser',
        input: {
          date_time: 'timestamp',
        },
        output: 'timestamp_info'
      }]
    };

    // force update amplitude with any user properties it may have missed
    this.setUserProperties({});

    this.pushEvent('session', {
      sessionID: this.sessionID,
      userAgent: window.navigator.userAgent
    });

    try {
      if (!localStorage.getItem('keen-analytics-device')) {
        localStorage.setItem('keen-analytics-device', 'true');
        this.pushEvent('device-install');
      }
    } catch (e) {}

    this.processEventQueue();

    window.setInterval(() => this.processEventQueue(), 5000);
  }

  /**
   * Amplitude API for tracking cohorts
   */
  setUserProperties(opts) {
    if (this.userProperties) {
      this.userProperties = merge(opts, this.userProperties);
    } else {
      this.userProperties = merge({}, opts);
    }

    if (this._amplitudeClient) {
      this._amplitudeClient.setUserProperties(this.userProperties);
    }
  }

  /**
  * Queues an analytics event to be sent to the server.
  * @param category {string} - the event category, this can be an arbitrary string such as 'sessionComplete'
  * @param data {object} - this is an arbitrary object that represents the state of the event
  */
  pushEvent (name, event) {
    event = event || {};
    event.timestamp = new Date().toISOString();

    // strip nested objects to avoid breaking analytics' event properties
    for (var key in event) {
      if (typeof event[key] === 'object') {
        delete event[key];
      }
    }

    this.eventQueue.push([name, event]);
  }

  pushError (name, error, event) {
    event = event || {};
    error = error || {};

    logger.error('Sending ERROR:', name, error, event);

    this.pushEvent(name, merge({
      errorCode: error.code || 'No Code',
      errorMessage: error.message || 'No Message',
      errorStack: error.stack || 'No Stack'
    }, event));
  }

  /**
   * Process all pending events
   */
  processEventQueue() {
    var length = this.eventQueue.length;
    if (this.isInitialized && length > 0) {
      var batch = {};
      for (var i = 0; i < length; i++) {
        var event = this.eventQueue[i];
        var key = event[0];
        var data = event[1];
        data.version = CONFIG.version;
        data.sessionID = this.sessionID;
        data.userID = this.userID;
        data.ip_address = '${keen.ip}';
        data.user_agent = '${keen.user_agent}';
        data.OS_TYPE = userAgent.OS_TYPE;
        data.OS_VERSION = userAgent.OS_VERSION;
        data.APP_RUNTIME = userAgent.APP_RUNTIME;
        data.DEVICE_TYPE = userAgent.DEVICE_TYPE;
        data.BROWSER_TYPE = userAgent.BROWSER_TYPE;
        data.BROWSER_VERSION = userAgent.BROWSER_VERSION;
        data.SIMULATED = userAgent.SIMULATED;

        if (process.env.NODE_ENV !== 'production') {
          log(`Skipping event send (development mode): key= ${key} data=`, data);
          continue;
        }

        //for now just send it straight to amplitude - they do their own batching
        // DO THIS BEFORE KEEN PROPERTY
        if(this.amplitudeBlacklist.indexOf(key) === -1)
        {
          // Only send to amplitude if it's not in the blacklist.
          this._amplitudeClient.logEvent(key, merge({}, data));
        }
        
        // Duplicate events over to Facebook pixel if they are on the PIXEL whitelist
        const sendToPixel = this.pixelEnabled && (!this.pixelWhitelist || this.pixelWhitelist.indexOf(key) >= 0);
        if (sendToPixel) {
          pixel.trackCustom(key, merge({}, data));
        }

        const sendToKeen = (!this.keenWhitelist || this.keenWhitelist.indexOf(key) >= 0);
        if (sendToKeen) {
          data.keen = this.keenAddons;
          data.userProperties = merge({}, this.userProperties);

          // special nested ab tests for Keen
          if (GC.app && GC.app.abTests) {
            GC.app.abTests.applyKeenData(data);
          }

          if (!batch[key]) {
            batch[key] = [];
          }
          batch[key].push(data);
        }
      }

      if (Object.keys(batch).length > 0) {
        keen.sendEventBatch(batch);
      }

      this.eventQueue = [];
    }
  }

  /**
   * Keen.io API for tracking AB Tests
   */

  setABTestVariants (data) {
    keen.setABTestVariants(data);
  }

  /**
   * tracking average FPS of the game for analytics purposes
   */
  trackFPS() {
    var now = window.performance.now();
    var dt = now - this.lastTime;
    var fps = 1 / (dt / 1000);
    this.frameCount++;
    this.fps += (fps - this.fps) / this.frameCount;
    this.lastTime = now;
  }

  /**
   * Get the current snapshot of the rolling average fps
   * @returns {number} - Average frames per second
   */
  getAverageFPS() {
    return this.fps;
  }

  /**
   * Reset FPS tracker values to 0
   */
  resetAverageFPS() {
    this.frameCount = 0;
    this.fps = 0;
  }

  /**
   * Quick createGuid taken from the internet:
   * http://byronsalau.com/blog/how-to-create-a-guid-uuid-in-javascript/
   * I reccomend that we switch to Chance.js or some other seeded random
   * lib in the future.
   */
  createGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
  }

}

export default new Analytics();
