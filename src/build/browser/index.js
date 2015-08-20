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
var path = require('path');
var fs = require('graceful-fs');
fs.gracefulify(require('fs'));

var File = require('vinyl');
var vfs = require('vinyl-fs');

var buildStreamAPI = require('../common/build-stream-api');
var offlineManifest = require('./offlineManifest');
var resources = require('../common/resources');
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
  return api.createFilterStream(function (file) {
    if (file.history.length > 1) {
      sourceMap[slash(file.relative)] = file.history[0];
    }
  }, function (addFile, cb) {
    addFile(filename, JSON.stringify(sourceMap));
    cb();
  });
}

exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-browser');
  var outputDirectory = config.outputResourcePath;
  buildStreamAPI.addToAPI(api, app, config);

  var fontListStream = api.streams.get('fonts');
  var stream = resources.createFileStream(api, app, config, outputDirectory)
    .pipe(createSourceMap(api, 'resource_source_map.json'))
    .pipe(api.streams.get('spriter'))
    .pipe(fontListStream)
    .pipe(api.streams.get('html', {fontList: fontListStream}))
    .pipe(offlineManifest.create(api, app, config, config.target + '.manifest'))
    .pipe(api.streams.get('app-js', {
      env: 'browser',
      tasks: [],
      inlineCache: true,
      filename: config.target + '.js',
      composite: function (tasks, js, cache, config) {
        return config.toString()
          + 'NATIVE=false;'
          + 'CACHE=' + JSON.stringify(cache) + ';\n'
          + js + ';'
          + 'jsio("import ' + INITIAL_IMPORT + '");';
      }
    }))
    .pipe(api.insertFilesStream([
        cacheWorker.generate(config),
        webAppManifest.create(api, app, config)
      ]
      .concat(copyFiles(config, outputDirectory))
      .concat(getBrowserIcons(app, outputDirectory))))
    .pipe(api.createFilterStream(function (file) {
      console.log('writing', file.path);
    }))
    .pipe(vfs.dest(outputDirectory));

  return api.streamToPromise(stream)
    .nodeify(cb);
};

/**
 * get extra resources for copying
 *
 * @returns {File[]} the files specified in an app's manifest for copying
 */
function copyFiles(config, outputDirectory) {
  return config.browser.copy && config.browser.copy.map(function (resource) {

    var filePath = path.resolve(config.appPath, resource);
    var base;
    var relativePath = path.relative(filePath, config.appPath);
    if (/^\.\./.test(relativePath)) {
      base = path.dirname(filePath);
      relativePath = path.basename(filePath);
    } else {
      base = config.appPath;
    }

    var f = new File({
      base: base,
      path: filePath,
      contents: fs.createReadStream(filePath)
    });

    f.base = outputDirectory;
    f.path = path.join(outputDirectory, relativePath);
    return f;
  }) || [];
}

function getBrowserIcons(app, outputDirectory) {
  // add browser icons
  var browserIcons = app.manifest.browser && app.manifest.browser.icons;
  var icons = [];
  if (browserIcons) {
    browserIcons.forEach(function (icon) {
      var srcPath = path.join(app.paths.root, icon.src);
      if (fs.existsSync(srcPath)) {
        icons.push(new File({
          base: outputDirectory,
          path: path.join(outputDirectory, icon.src),
          contents: fs.createReadStream(srcPath)
        }));
      }
    });
  }

  return icons;
}
