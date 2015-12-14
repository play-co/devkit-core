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
var fs = require('../../util/fs');
var createBuildTarget = require('../../index').createBuildTarget;
var browserBuild = require('../browser');
var Promise = require('bluebird');

var logger;

// Static resources.
var STATIC_DIR = path.join(__dirname, 'chrome-static');

exports.opts = require('optimist')(process.argv)
  .alias('baseURL', 'u')
  .describe('baseURL', 'all relative resources except for index'
                     + ' should be loaded from this URL');

createBuildTarget(exports);

exports.init = function (api, app, config) {
  logger = api.logging.get('build-chrome');

  browserBuild.init(api, app, config);

  return Promise.join(
      fs.readFileAsync(path.join(STATIC_DIR, 'localStorage.html'), 'utf8'),
      function (localStorageHTML) {
        // add in the custom JS to create the localStorage object
        config.browser.headHTML.push(localStorageHTML);
      });
};

exports.setupStreams = function (api, app, config) {

  browserBuild.setupStreams(api, app, config);

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

  // get the browser build's static-file stream and add in our static files
  api.streams.get('static-files')
    .add(fs.readFileAsync(path.join(STATIC_DIR, 'background.js'), 'utf8')
      .then(function (backgroundJS) {
        return {
          filename: 'background.js',
          contents: backgroundJS
                .replace('%(width)s', config.browser.canvas.width)
                .replace('%(height)s', config.browser.canvas.height)
        };
      }))
    .add({
      filename: 'manifest.json',
      contents: JSON.stringify({
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
      })
    })
    .add({
      filename: 'pageWrapper.html',
      src: path.join(STATIC_DIR, 'pageWrapper.html')
    })
    .add({
      filename: 'pageWrapper.js',
      src: path.join(STATIC_DIR, 'pageWrapper.js')
    })
    .add([16, 128].map(function (size) {
      var chrome = app.manifest.chrome;
      var iconPath = chrome && chrome.icons && chrome.icons[size];
      if (!iconPath) {
        logger.warn('No icon specified in the manifest for', size + '.',
          'Using the default icon for this size.',
          'This is probably not what you want');

        iconPath = path.join(STATIC_DIR, 'icon-' + size + '.png');
      }

      return {
        filename: 'icon-' + size + '.png',
        src: iconPath
      };
    }));
};

// reuse the browser build's stream order
exports.getStreamOrder = browserBuild.getStreamOrder;

