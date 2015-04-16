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
var fs = require('fs');
var readFile = Promise.promisify(fs.readFile);
var File = require('vinyl');
var vfs = require('vinyl-fs');
var streamFromArray = require('stream-from-array');

var logger;

// Static resources.
var STATIC_DIR = path.join(__dirname, 'chrome-static');
var browserBuild = require('../browser');

function copyFileSync(from, to) {
  fs.writeFileSync(to, fs.readFileSync(from));
}
function copyIcon(app, outputPath, size) {
  var destPath = path.join(outputPath, 'icon-' + size + '.png');
  var chrome = app.manifest.chrome;
  var iconPath = chrome && chrome.icons && chrome.icons[size];

  if (!iconPath) {
    logger.warn('No icon specified in the manifest for', size + '.',
      'Using the default icon for this size.',
      'This is probably not what you want');

    iconPath = path.join(STATIC_DIR, 'icon-' + size + '.png');
  } else {
    iconPath = path.resolve(app.paths.root, iconPath);
  }

  if (fs.existsSync(iconPath)) {
    // wrench.mkdirSyncRecursive(path.dirname(destPath));
    copyFileSync(iconPath, destPath);
  } else {
    logger.error('Could not find icon for size', size, 'at', iconPath);
  }
}

exports.opts = require('optimist')(process.argv)
  .alias('baseURL', 'u')
  .describe('baseURL', 'all relative resources except for index'
                     + ' should be loaded from this URL');

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-chrome');

  browserBuild.configure(api, app, config, cb);
};

exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-chrome');

  // Hack in a new localStorage for all modules that will point to a custom
  // Chrome friendly local storage (which is initilized before jsio)
  config.preCompressCallback = function(sourceTable) {
    var success = false;
    for (var fullPath in sourceTable) {
      var fileValues = sourceTable[fullPath];
      if (fileValues.friendlyPath === 'jsio.base') {
        fileValues.src = 'exports.localStorage=GC_CHROME._chromeLocalStorage;'
                       + fileValues.src;
        success = true;
        break;
      }
    }
    if (success) {
      logger.log('Injected custom localStorage');
    } else {
      logger.error('Failed to inject custom localStorage!');
    }
  };

  var backgroundJS;

  Promise.all([
      readFile(path.join(STATIC_DIR, 'localStorage.html'), 'utf8'),
      readFile(path.join(STATIC_DIR, 'background.js'), 'utf8')
    ])
    .spread(function (localStorageHTML, _backgroundJS) {
      // add in the custom JS to create the localStorage object
      config.browser.headHTML.push(localStorageHTML);

      // Update the background js constants
      backgroundJS = _backgroundJS
                      .replace('%(width)s', config.browser.canvas.width)
                      .replace('%(height)s', config.browser.canvas.height);

      // run a browser build, since that is all we are really doing, just with some additions
      return browserBuild.build(api, app, config);
    })
    .then(function () {
      logger.log('Chrome time!');

      // App icons
      copyIcon(app, config.outputPath, 16);
      copyIcon(app, config.outputPath, 128);

      // Build the manifest
      var manifest = {
        name: app.manifest.shortName,
        description: app.manifest.description || ('desc - ' + app.manifest.shortName),
        version: app.manifest.version || '0.0',
        manifest_version: 2,
        app: {
          background: {
            scripts: ['background.js']
          }
        },
        sandbox: {
          pages: ['index.html'],
        },
        permissions: [
          'storage'
        ],
        icons: { '16': 'icon-16.png', '128': 'icon-128.png' }
      };

      var baseDirectory = config.outputPath;
      var files = [
        new File({
          base: baseDirectory,
          path: path.join(baseDirectory, 'manifest.json'),
          contents: new Buffer(JSON.stringify(manifest))
        }),
        new File({
          base: baseDirectory,
          path: path.join(baseDirectory, 'background.js'),
          contents: new Buffer(backgroundJS)
        }),
        new File({
          base: STATIC_DIR,
          path: path.join(STATIC_DIR, 'pageWrapper.html')
        }),
        new File({
          base: STATIC_DIR,
          path: path.join(STATIC_DIR, 'pageWrapper.js')
        })
      ];

      logger.log('Writing files...');
      return new Promise(function (resolve, reject) {
          streamFromArray.obj(files)
            .pipe(vfs.dest(baseDirectory))
            .on('end', resolve)
            .on('error', reject);
        });
    }).nodeify(cb);
};
