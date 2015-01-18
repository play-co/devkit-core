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

var path = require('path');
var printf = require('printf');
var fs = require('fs');
var ff = require('ff');
// var wrench = require('wrench');
var util = require('util');
var mime = require('mime');

var nativeBuild = require('../native/native-android');
var logger;

// Static resources.
var STATIC_DIR = path.join(__dirname, 'static');

exports.opts = require('optimist')(process.argv);
  // .alias('baseURL', 'u').describe('baseURL', 'all relative resources except for index should be loaded from this URL');

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-resources-bundle');
  nativeBuild.configure(api, app, config, cb);
}

exports.build = function (api, app, config, cb) {
  var resourceList = new (require('../common/resources').ResourceList);

  var f = ff(function() {
    resourceList.add({
      target: 'Application.js',
      copyFrom: path.join(STATIC_DIR, 'Application.js')
    });
  }, function() {
    logger.log("Writing native resources");
    require('../native/resources').writeNativeResources(api, app, config, f());
  }, function () {
    logger.log("Done");
  }).cb(cb);
};
