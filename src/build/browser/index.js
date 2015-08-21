/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by
 * Mozilla.
 *
 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.
 *
 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */
var fs = require('graceful-fs');
fs.gracefulify(require('fs'));

var buildStreamAPI = require('../common/build-stream-api');
var offlineManifest = require('./offlineManifest');
var cacheWorker = require('./cacheWorker');
var webAppManifest = require('./webAppManifest');

var slash = require('slash');

var logger;
var INITIAL_IMPORT = 'devkit.browser.launchClient';

exports.opts = require('optimist')(process.argv)
  .alias('baseURL', 'u')
  .describe('baseURL', 'all relative resources except for index should be'
                     + 'loaded from this URL');

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-browser');

  // add in any common config keys
  require('../common/config').extend(app, config);

  // add in browser-specific config keys
  require('./browserConfig').insert(app, config, exports.opts.argv);

  return Promise.resolve().nodeify(cb);
};

function createSourceMap(api, filename) {
  var sourceMap = {};
  return api.streams.createFileStream({
    onFile: function (file) {
      if (file.history.length > 1) {
        sourceMap[slash(file.relative)] = file.history[0];
      }
    },
    onEnd: function (addFile) {
      addFile({
        filename: filename,
        contents: JSON.stringify(sourceMap)
      });
    }
  });
}

exports.createStreams = function (api, app, config) {
  // register streams
  api.streams
    .register('resource-source-map', createSourceMap(api, 'resource_source_map.json'))
    .create('spriter')
    .create('fonts')
    .create('html', {fontStream: api.streams.get('fonts')})
    .create('app-js', {
        env: 'browser',
        tasks: [],
        inlineCache: true,
        filename: config.target + '.js',
        composite: function (tasks, js, cache, config) {
          return 'NATIVE=false;'
            + 'CACHE=' + JSON.stringify(cache) + ';\n'
            + js + ';'
            + 'jsio("import ' + INITIAL_IMPORT + '");';
        }
      })
    .create('static-files')
    .register('html5CacheManifest', offlineManifest.create(api, app, config, config.target + '.manifest'));

  // get the static-files stream and add our files to it
  api.streams.get('static-files')
    .add(cacheWorker.generate(config))
    .add(webAppManifest.create(api, app, config))
    .add(config.browser.copy)
    .add(app.manifest.browser && app.manifest.browser.icons);

  // return the order in which the streams should run
  return [
    'resource-source-map',
    'spriter',
    'fonts',
    'html',
    'app-js',
    'static-files',
    'html5CacheManifest'
  ];
};

exports.build = buildStreamAPI.createStreamingBuild(exports.createStreams);

