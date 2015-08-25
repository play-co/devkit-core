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
    onFinish: function (addFile) {
      addFile({
        filename: filename,
        contents: JSON.stringify(sourceMap)
      });
    }
  });
}

exports.createStreams = function (api, app, config) {
  // register streams
  var streams = api.streams;

  streams.register('resource-source-map', createSourceMap(api, 'resource_source_map.json'));
  streams.create('spriter');
  var fontStream = streams.create('fonts');
  streams.create('html', {fontStream: fontStream});
  streams.create('app-js', {
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
    });
  streams.register('html5-cache-manifest', offlineManifest.create(api, app, config, config.target + '.manifest'));

  streams.create('static-files')
    .add(cacheWorker.generate(config))
    .add(webAppManifest.create(api, app, config))
    .add(config.browser.copy)
    .add(app.manifest.browser && app.manifest.browser.icons);

  // return the order in which the streams should run
  var order = [
    'resource-source-map',
    'spriter',
    'fonts',
    'html',
    'static-files',
    'app-js',
    'html5-cache-manifest',
    'output'
  ];

  if (config.compressImages) {
    order.push('image-compress');
  }

  return order;
};

exports.build = buildStreamAPI.createStreamingBuild(exports.createStreams);

