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
var printf = require('printf');

var fs = require('graceful-fs');
fs.gracefulify(require('fs'));

var File = require('vinyl');
var vfs = require('vinyl-fs');

var fonts = require('./fonts');
var JSConfig = require('../common/jsConfig').JSConfig;
var buildStreamAPI = require('../common/build-stream-api');
var offlineManifest = require('./offlineManifest');
var resources = require('../common/resources');
var JSCompiler = require('../common/jsCompiler').JSCompiler;
var cacheWorker = require('./cacheWorker');
var webAppManifest = require('./webAppManifest');
var devkitSpriter = require('../common/spriter');

var slash = require('slash');

var readFile = Promise.promisify(fs.readFile);

var logger;
var INITIAL_IMPORT = 'devkit.browser.launchClient';

// Static resources.
function getLocalFilePath(filePath) {
  return path.join(__dirname, filePath);
}
var STATIC_BOOTSTRAP_CSS = getLocalFilePath('browser-static/bootstrap.styl');
var STATIC_BOOTSTRAP_JS = getLocalFilePath('browser-static/bootstrap.js');
var STATIC_LIVE_EDIT_JS = getLocalFilePath('browser-static/liveEdit.js');

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
  buildStreamAPI.addToAPI(api, outputDirectory);

  var spriter = devkitSpriter.sprite(api, path.join(outputDirectory, 'spritesheets'));
  var fontList = fonts.create(api);
  var jsConfig = new JSConfig(api, app, config);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);
  var compileJS = Promise.promisify(jsCompiler.compile, jsCompiler);

  var inlineCache = require('../common/inlineCache').create(logger);
  var compileAppJS = compileJS({
        env: 'browser',
        initialImport: [INITIAL_IMPORT].concat(config.imports).join(', '),
        appendImport: false,
        includeJsio: !config.excludeJsio,
        debug: config.scheme === 'debug',
        preCompress: config.preCompressCallback
      });

  function getAppJS(addFile, cb) {
    // insertFilesStream defers this call until the end of the stream, so
    // inlineCache will be fully populated. Still need to wait on the compiler.
    compileAppJS
      .then(function (jsSrc) {
        addFile(config.target + '.js', 'NATIVE=false;'
            + 'CACHE=' + JSON.stringify(inlineCache) + ';\n'
            + jsSrc + ';'
            + 'jsio("import ' + INITIAL_IMPORT + '");');
        cb();
      });
  }

  var stream = resources.createFileStream(api, app, config, outputDirectory)
    .pipe(createSourceMap(api, 'resource_source_map.json'))
    .pipe(spriter)
    .pipe(fontList)
    .pipe(inlineCache)
    .pipe(generateHTML(api, app, config, compileJS, fontList, jsConfig))
    .pipe(offlineManifest.create(api, app, config, config.target + '.manifest'))
    .pipe(api.insertFilesStream([
        cacheWorker.generate(config),
        webAppManifest.create(api, app, config),
        getAppJS
      ]
      .concat(copyFiles(config, outputDirectory))
      .concat(getBrowserIcons(app, outputDirectory))))
    .pipe(api.createFilterStream(function (file) {
      console.log('writing', file.path);
    }))
    .pipe(vfs.dest(outputDirectory));

  // https://github.com/petkaantonov/bluebird/issues/332
  return new Promise(function (resolve, reject) {
      stream.on('end', resolve).on('error', reject);
    })
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

function getPreloadJS(config, compileJS) {
  // get preload JS
  if (/^native/.test(config.target)) {
    return Promise.resolve('jsio=function(){window._continueLoad()}');
  }

  var isLiveEdit = (config.target === 'live-edit');
  if (isLiveEdit && !config.preCompressCallback) {
    config.preCompressCallback = function(sourceTable) {
      for (var fullPath in sourceTable) {
        var fileValues = sourceTable[fullPath];
        if (fileValues.friendlyPath === 'ui.resource.Image') {
          logger.log('Patching ui.resource.Image to look for'
                   + 'GC_LIVE_EDIT._imgBase');

          var regex = /(this._setSrcImg.+{)/;
          var insert = 'if(url&&GC_LIVE_EDIT._imgBase){'
                     + 'url=GC_LIVE_EDIT._imgBase+url;'
                     + '}';

          fileValues.src = fileValues.src.replace(regex, '$1' + insert);
        }
      }
    };
  }

  return compileJS({
    initialImport: 'devkit.browser.bootstrap.launchBrowser',
    appendImport: false,
    preCompress: config.preCompressCallback
  });
}

function generateHTML(api, app, config, compileJS, fontList, jsConfig) {
  var html = require('./html');
  var isMobile = (config.target !== 'browser-desktop');
  var isLiveEdit = (config.target === 'live-edit');

  var gameHTML = new html.GameHTML();

  // start file-system tasks in background immediately
  var tasks = Promise.all([
    getPreloadJS(config, compileJS),
    readFile(STATIC_BOOTSTRAP_CSS, 'utf8'),
    readFile(STATIC_BOOTSTRAP_JS, 'utf8'),
    isLiveEdit && readFile(STATIC_LIVE_EDIT_JS, 'utf8')
  ]);

  // generate html when stream ends
  var stream = api.createEndStream(function (addFile, cb) {

    // wait for file-system tasks to finish
    tasks.spread(function (preloadJS, bootstrapCSS, bootstrapJS, liveEditJS) {
      jsConfig.add('embeddedFonts', fontList.getNames());

      gameHTML.addCSS(bootstrapCSS);
      gameHTML.addCSS(fontList.getCSS({
        embedFonts: config.browser.embedFonts,
        formats: require('./fonts').getFormatsForTarget(config.target)
      }));

      if (config.browser.canvas.css) {
        gameHTML.addCSS('#timestep_onscreen_canvas{'
                      + config.browser.canvas.css
                      + '}');
      }

      gameHTML.addJS(jsConfig.toString());
      gameHTML.addJS(bootstrapJS);
      gameHTML.addJS(printf('bootstrap("%(initialImport)s", "%(target)s")', {
          initialImport: INITIAL_IMPORT,
          target: config.target
        }));
      gameHTML.addJS(preloadJS);

      liveEditJS && gameHTML.addJS(liveEditJS);

      var hasWebAppManifest = !!config.browser.webAppManifest;
      if (hasWebAppManifest) {
        config.browser.headHTML.push('<link rel="manifest" href="web-app-manifest.json">');
      }

      var hasIndexPage = !isMobile;
      var pages = [];
      pages.push(gameHTML.generate(api, app, config)
        .then(function (html) {
          addFile(hasIndexPage ? 'game.html' : 'index.html', html);
        }));

      if (hasIndexPage) {
        pages.push(new html.IndexHTML()
          .generate(api, app, config)
          .then(function (indexHTML) {
            addFile('index.html', indexHTML);
          }));
      }

      return pages;
    })
    .all()
    .nodeify(cb);
  });

  return stream;
}
