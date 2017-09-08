/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */
import {
  GLOBAL,
  merge
} from 'base';

import analytics from 'analytics';
// TODO: introduce some logic to import desired social platform
import facebook from 'facebook';

class DevkitClient {
  constructor (buildURL, analyticsParams) {
    // might not be the right place for those properties?
    this.locale = null;

    this.startTime = Date.now();

    this.isOrientationValid = false;

    this.app = null;

    this._buildURL = buildURL;

    this._initializeSocialPlatform(analyticsParams);
  }

  attachApp (app) {
    this.app = app;
    analytics.initializeEngine(app.engine);
  }

  _initializeSocialPlatform (analyticsParams) {
    facebook.initializeAsync()
      .then(() => {
        var playerID = facebook.player.getID();
        var initParams = merge({ userID: playerID }, analyticsParams);
        analytics.initialize(initParams);

        this.locale = facebook.getLocale();

        analytics.pushEvent('PlatformInitSuccess');
      })
      .catch((e) => {
        analytics.pushError('PlatformInitFailed', e);
      })
      .finally(() => {
        this._loadBuild();
      });
  }

  _loadBuild () {

    // element.onload = function () {
    //   this.onload = null;
    //   this.onerror = null;
    // };

    var buildURL = this._buildURL;
    // these are not if/else because we want the dead code
    // elimination to work nicely.
    if (process.env.NODE_ENV == 'development') {
      var element = document.createElement('script');
      element.onerror = function (error) {
        this.onload = null;
        this.onerror = null;
        var statusCode = ' Status code: ' + error.status;
        var reason = ' Reason: ' + error.reason;
        var response = ' Response: ' + error.response;
        console.error('Build not found: ' + buildURL + statusCode + reason + response);
      };

      element.src = buildURL;
      document.getElementsByTagName('head')[0].appendChild(element);
    }
    if (process.env.NODE_ENV == 'production') {
      var xhr = new XMLHttpRequest();
      xhr.onload = function (res) {
        var src = this.responseText;
        window.eval(src);
      };
      xhr.open('GET', this._buildURL);
      xhr.send();
    }
  }
};

window.initGC = function (buildURL, analyticsParams) {
  GLOBAL.GC = new DevkitClient(buildURL, analyticsParams);
}

