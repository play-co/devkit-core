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
var nativeBuild = require('../native/native-android');
var logger;

// Static resources.
var STATIC_DIR = path.join(__dirname, 'static');

exports.opts = require('optimist')(process.argv);

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-resources-bundle');
  nativeBuild.configure(api, app, config, cb);
};

exports.build = function (api, app, config, cb) {
  // Add the static src to the path cache so we use this to find Application.js
  // instead of the projects src
  app.clientPaths.src = STATIC_DIR + '/src';

  require('../native/resources')
    .writeNativeResources(api, app, config, cb);
};
