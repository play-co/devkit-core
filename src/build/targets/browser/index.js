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
var createBuildTarget = require('../../index').createBuildTarget;
var cacheWorker = require('./cacheWorker');
var webAppManifest = require('./webAppManifest');

var slash = require('slash');

var logger;
var INITIAL_IMPORT = 'devkit.browser.launchClient';

exports.opts = require('optimist')(process.argv)
  .describe('application-cache', 'include an html5 ApplicationCache manifest file')
    .default('application-cache', false)
  .describe('web-app-manifest', 'include a WebApp manifest')
    .default('web-app-manifest', true)
  .describe('base-url', 'all relative resources except for index should be'
                     + 'loaded from this URL');

createBuildTarget(exports);

exports.init = function (api, app, config) {
  logger = api.logging.get('build-browser');
  var argv = exports.opts.argv;

  var webAppManifest = {
    "name": app.manifest.title,
    "short_name": app.manifest.shortname,
    "icons": JSON.parse(JSON.stringify(app.manifest.icons || [])),
    "start_url": "index.html",
    "display": "standalone"
  };

  if (config.isSimulated && !/browser/.test(config.target)) {
    config.browser = {
      embedSplash: false,
      embedFonts: false,
      appleTouchIcon: false,
      appleTouchStartupImage: false,
      frame: {},
      canvas: {},
      copy: [],
      headHTML: [],
      bodyHTML: [],
      footerHTML: [],
      hasApplicationCache: false,
      hasWebAppManifest: true,
      webAppManifest: webAppManifest,
      baseURL: ''
    };
    return;
  }

  config.browser = {};

  merge(config.browser,
      app.manifest.browser, // copy in keys from manifest
      { // copy in defaults (if not present)
        // include image for the apple-touch-icon meta tag (if webpage is saved to
        // homescreen)
        icon: true,
        appleTouchIcon: true,
        appleTouchStartupImage: true,

        // rich social graph meta properties
        openGraph: {},

        // embed fonts disabled by default (load over URL), if true, base64 encode
        // them into the css
        embedFonts: false,

        // embed a base64 splash screen (background-size: cover)
        embedSplash: true,
        cache: [],
        copy: [],
        desktopBodyCSS: '',

        // html to insert
        headHTML: [],
        bodyHTML: [],
        footerHTML: [],

        hasApplicationCache: argv['application-cache'],
        hasWebAppManifest: argv['web-app-manifest'],

        // web app manifest, converted to json
        webAppManifest: webAppManifest,

        // browser framing options
        frame: {},
        canvas: {},
        baseURL: exports.opts.argv.baseURL || ''
      });

  merge(config.browser.frame, {width: 320, height: 480});
  merge(config.browser.canvas, {width: 320, height: 480});

  var spinnerOpts = config.browser.spinner;
  if (spinnerOpts) {
    // provide defaults for the browser splash screen spinner
    merge(spinnerOpts, {
      x: '50%', y: '50%',
      width: '90px', height: '90px',
      color0: 'rgba(255, 255, 255, 0.2)', color1: '#FFF'
    });

    // convert numbers to numbers with units
    ['width', 'height'].forEach(function (key) {
      var match = spinnerOpts[key].match(/^-?[0-9.]+(.*)$/);
      spinnerOpts[key] = {
        value: parseFloat(spinnerOpts[key]),
        unit: match && match[1] || 'px'
      };
    });
  }
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
        inline: false,
        contents: JSON.stringify(sourceMap)
      });
    }
  });
}

exports.setupStreams = function (api, app, config) {
  // register streams
  var streams = api.streams;

  streams.register('resource-source-map', createSourceMap(api, 'resource_source_map.json'));
  streams.create('spriter');
  streams.create('sound-map');
  var fontStream = streams.create('fonts');
  streams.create('html', {fontStream: fontStream});
  streams.create('app-js', {
      env: 'browser',
      tasks: [],
      inlineCache: true,
      filename: config.target + '.js',
      composite: function (tasks, js, cache, jsConfig) {
        return 'NATIVE=false;'
          + 'CACHE=' + JSON.stringify(cache) + ';\n'
          + js + ';'
          + 'GC_LOADER.onLoadApp("import ' + INITIAL_IMPORT + '");';
      }
    });

  var staticFileStream = streams.create('static-files')
    .add(cacheWorker.generate(config))
    .add(config.browser.copy)
    .add(app.manifest.browser && app.manifest.browser.icons);

  if (config.browser.hasWebAppManifest) {
    staticFileStream.add(webAppManifest.create(api, app, config));
  }
};

exports.getStreamOrder = function (api, app, config) {
  var order = [
    config.resourceSourceMap && 'resource-source-map',
    'spriter',
    'sound-map',
    'fonts',
    'html',
    'app-js',
    'static-files',
    config.browser.hasApplicationCache && 'application-cache-manifest',
    'write-files'
  ];

  if (config.compressImages) {
    order.push('image-compress');
  }

  return order;
};
