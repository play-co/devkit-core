/**
 * @license
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

/* globals jsio, logging, logger, CONFIG, DEBUG */

var env = jsio.__env;
env.debugPath = function (path) {
  var protocol = 'http:';
  var domain = env.name == 'android' ? CONFIG.packageName : CONFIG.bundleID;
  return protocol + '//' + domain + '/' + path.replace(/^[.\/\\]+/, '');
};

GLOBAL.console = logging.get('console');
window.self = window;

// add bluebird promise implementation to global scope
import Promise;
GLOBAL.Promise = Promise;

// initialize native JS API wrappers
import platforms.native.initialize;

import device;
device.init();

import .common;
common.install();

startApp();

/**
 * Anonymous statistics, this information helps us improve the DevKit by
 * providing us information about which versions are out there.
 *
 * You can remove this or replace it with your own analytics if you like.
 */
function analytics () {
  var config = GLOBAL.CONFIG;
  var params = 'appID:' + encodeURIComponent(config.appID || '') + '&' +
      'bundleID:' + encodeURIComponent(config.bundleID || '') + '&' +
      'appleID:' + encodeURIComponent(config.appleID || '') + '&' +
      'version:' + encodeURIComponent(config.version || '') + '&' +
      'sdkVersion:' + encodeURIComponent(config.sdkVersion || '') + '&' +
      'isAndroid:' + (device.isAndroid ? 1 : 0) + '&' +
      'isIOS:' + (device.isIOS ? 1 : 0);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://www.gameclosure.com/analytics?' + params, true);
  xhr.send();
}

function startApp() {
  import devkit;
  GLOBAL.GC = new devkit.ClientAPI();

  analytics();
  GLOBAL.GC.buildApp('launchUI');
}

