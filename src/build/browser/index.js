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
var File = require('vinyl');
var vfs = require('vinyl-fs');
// var newer = require('gulp-newer');
var slash = require('slash');
var streamFromArray = require('stream-from-array');

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

  cb && cb();
};

exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-browser');

  var isMobile = (config.target !== 'browser-desktop');
  var isLiveEdit = (config.target === 'live-edit');
  var resources = require('../common/resources');
  var CSSFontList = require('./fonts').CSSFontList;
  var JSConfig = require('../common/jsConfig').JSConfig;
  var JSCompiler = require('../common/jsCompiler').JSCompiler;

  var sprite = require('../common/spriter')
                            .sprite
                            .bind(null, api, app, config);

  var html = require('./html');
  var gameHTML = new html.GameHTML();
  var fontList = new CSSFontList();
  var jsConfig = new JSConfig(api, app, config);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);

  var compileJS = Promise.promisify(jsCompiler.compile, jsCompiler);

  function getPreloadJS() {
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

  var baseDirectory = config.outputResourcePath;

  resources.getDirectories(api, app, config)
    .then(function (directories) {
      return Promise.all([
          resources.getFiles(baseDirectory, directories),
          readFile(getLocalFilePath('../../clientapi/browser/cache-worker.js'), 'utf8'),
          getPreloadJS(),
          readFile(STATIC_BOOTSTRAP_CSS, 'utf8'),
          readFile(STATIC_BOOTSTRAP_JS, 'utf8'),
          isLiveEdit && readFile(STATIC_LIVE_EDIT_JS, 'utf8'),
          config.spriteImages !== false && sprite(directories),
          compileJS({
            env: 'browser',
            initialImport: [INITIAL_IMPORT].concat(config.imports).join(', '),
            appendImport: false,
            includeJsio: !config.excludeJsio,
            debug: config.scheme === 'debug',
            preCompress: config.preCompressCallback
          })
        ]);
    })
    .spread(function (files, cacheWorkerJS, preloadJS, bootstrapCSS, bootstrapJS,
                      liveEditJS, spriterResult, jsSrc) {
      logger.log('Creating HTML and JavaScript...');

      jsConfig.add('embeddedFonts', fontList.getNames());

      var sourceMap = {};
      if (spriterResult) {
        // remove sprited files from file list
        files = files.filter(function (file) {
          return !(file.originalRelativePath in spriterResult.sourceMap);
        });

        files = files.concat(spriterResult.files);
        sourceMap = merge(sourceMap, spriterResult.sourceMap);
      }

      files.map(fontList.add.bind(fontList));

      var tasks = [];

      // We need to generate a couple different files if this is going to be a
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
      tasks.push(gameHTML.generate(api, app, config)
        .then(function (html) {
          files.push(new File({
            base: baseDirectory,
            path: path.join(baseDirectory, hasIndexPage
                                                 ? 'game.html'
                                                 : 'index.html'),
            contents: new Buffer(html)
          }));
        }));

      if (hasIndexPage) {
        tasks.push(new html.IndexHTML()
          .generate(api, app, config)
          .then(function (indexHTML) {
            files.push(new File({
              base: baseDirectory,
              path: path.join(baseDirectory, 'index.html'),
              contents: new Buffer(indexHTML)
            }));
          }));
      }

      var InlineCache = require('../common/inlineCache').InlineCache;
      var inlineCache = new InlineCache(logger);
      var addToInlineCache = inlineCache.add.bind(inlineCache);
      return Promise
        .all(tasks)
        .then(function () {
          return Promise.resolve(files)
            .filter(addToInlineCache);
        })
        .then(function (files) {
          files.push(new File({
              base: baseDirectory,
              path: path.join(baseDirectory, config.target + '.js'),
              contents: new Buffer('NATIVE=false;'
                + 'CACHE=' + JSON.stringify(inlineCache) + ';\n'
                + jsSrc + ';'
                + 'jsio("import ' + INITIAL_IMPORT + '");')
            }));

          files.forEach(function (file) {
            if (file.history.length > 1) {
              sourceMap[slash(file.relative)] = file.history[0];
            }
          });

          files.push(new File({
            base: baseDirectory,
            path: path.join(baseDirectory, config.target + '.manifest'),
            contents: require('./offlineManifest')
                        .generate(app, config, files)
          }));

          files.push(new File({
            base: baseDirectory,
            path: path.join(baseDirectory, 'resource_source_map.json'),
            contents: new Buffer(JSON.stringify(sourceMap))
          }));

          if (config.browser.webAppManifest) {
            var webAppManifest = JSON.stringify(config.browser.webAppManifest);
            var file = new File({
              base: baseDirectory,
              path: path.join(baseDirectory, 'web-app-manifest.json'),
              contents: new Buffer(webAppManifest)
            });
            file.inline = false;
            files.push(file);
          }

          // add extra resources for copying
          config.browser.copy && config.browser.copy.forEach(function (resource) {

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

            f.base = baseDirectory;
            f.path = path.join(baseDirectory, relativePath);

            files.push(f);
          });

          // https://github.com/petkaantonov/bluebird/issues/332
          logger.log('Writing files...');
          return new Promise(function (resolve, reject) {
            streamFromArray.obj(files)
              // .pipe(newer(baseDirectory))
              .pipe(vfs.dest(baseDirectory))
              .on('end', resolve)
              .on('error', reject);
          });
        });
    }).then(function () {
      logger.log('Done');
    }).nodeify(cb);
};
