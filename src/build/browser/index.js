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
var util = require('util');
var mime = require('mime');

var logger;
var INITIAL_IMPORT = 'devkit.browser.launchClient';

// Static resources.
var STATIC_GA_JS = fs.readFileSync(path.join(__dirname, 'browser-static/ga.js'), 'utf8');
var STATIC_BOOTSTRAP_CSS = path.join(__dirname, 'browser-static/bootstrap.styl');
var STATIC_BOOTSTRAP_JS = path.join(__dirname, 'browser-static/bootstrap.js');

exports.opts = require('optimist')(process.argv)
  .alias('baseURL', 'u').describe('baseURL', 'all relative resources except for index should be loaded from this URL');

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-browser');

  // add in any common config keys
  require('../common/config').extend(app, config);

  // add in browser-specific config keys
  require('./browserConfig').insert(app, config, exports.opts.argv);

  cb && cb();
}

exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-browser');

  // filenames starting with build/debug are already in the build directory
  // otherwise they need to be inline-cached into the HTML or copied into the build directory
  var imgCache = {};

  var isMobile = (config.target != 'browser-desktop');
  var isDocs = (config.target == 'browser-docs');
  var CSSFontList = require('./fonts').CSSFontList;
  var InlineCache = require('../common/inlineCache').InlineCache;
  var resourceList = new (require('../common/resources').ResourceList);
  var JSConfig = require('../common/jsConfig').JSConfig;
  var JSCompiler = require('../common/jsCompiler').JSCompiler;

  var html = require('./html');
  var gameHTML = new html.GameHTML();
  var inlineCache = new InlineCache();
  var fontList = new CSSFontList();
  var jsConfig = new JSConfig(api, app, config);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);

  var files;

  var f = ff(function () {
    logger.log("Packaging resources...");
    require('../common/packager').getFiles(api, app, config, f());
  }, function (_files) {
    files = _files;

    logger.log("Creating HTML and JavaScript...");

    if (/^native/.test(config.target)) {
      f('jsio=function(){window._continueLoad()}');
    } else {

      if (isDocs && !config.preCompressCallback) {
        config.preCompressCallback = function(sourceTable) {
          for (var fullPath in sourceTable) {
            var fileValues = sourceTable[fullPath];
            if (fileValues.friendlyPath === 'src.Application') {
              logger.log('Removing Application.js from sourceTable');
              delete sourceTable[fullPath];
              return;
            }
          }
          logger.warn('Could not find Application.js in sourceTable');
        };
      }

      jsCompiler.compile({
        initialImport: 'devkit.browser.bootstrap.launchBrowser',
        appendImport: false,
        preCompress: config.preCompressCallback
      }, f());
    }

    fs.readFile(STATIC_BOOTSTRAP_CSS, 'utf8', f());
    fs.readFile(STATIC_BOOTSTRAP_JS, 'utf8', f());

    // cache other files as needed
    inlineCache.addFiles(files.other, f.wait());
    fontList.addFiles(files.other, f.wait());
  }, function (preloadJS, bootstrapCSS, bootstrapJS) {
    jsConfig.add('embeddedFonts', fontList.getNames());

    // miscellaneous files must be copied into the build
    files.other.forEach(function (file) {
      if (!inlineCache.has(file.target)) {
        resourceList.add({
          target: file.target,
          copyFrom: file.fullPath
        });
      }
    });

    // TODO: what's the point of this?
    files.images.forEach(function (file) {
      resourceList.add({target: file.target});
    });

    jsCompiler.compile({
      env: 'browser',
      initialImport: INITIAL_IMPORT,
      appendImport: false,
      includeJsio: !config.excludeJsio,
      debug: config.scheme == 'debug',
      preCompress: config.preCompressCallback
    }, f());

    // We need to generate a couple different files if this is going to be a
    // Docs export
    if (isDocs) {
      // CSS //
      var cssContents = '';
      cssContents += bootstrapCSS;
      cssContents += fontList.getCSS({
        embedFonts: config.browser.embedFonts,
        formats: require('./fonts').getFormatsForTarget(config.target)
      });

      if (config.browser.canvas.css) {
        cssContents += ("#timestep_onscreen_canvas{" + config.browser.canvas.css + "}");
      }

      var stylus = require('stylus');
      var nib = require('nib');
      stylus(cssContents)
        .set('compress', config.compress)
        .use(nib())
        .render(function(err, res){
          if (res) {
            resourceList.add({
              target: 'styles.css',
              contents: res
            });
          }
        });
      // JS //
      var jsContents = '';
      jsContents += jsConfig.toString()+';\n';
      jsContents += (bootstrapJS)+';\n';
      jsContents += (printf('bootstrap("%(initialImport)s", "%(target)s")', {
          initialImport: INITIAL_IMPORT,
          target: config.target
        }))+';\n';
      jsContents += (preloadJS)+';\n';
      jsContents += ('var GC_DOCS = GC_DOCS || { _isDocs: true }; ')+';\n';

      resourceList.add({
        target: 'game.js',
        contents: jsContents
      });
      // HTML
      // gameHTML.addHTML('<p>test</p>');
      // gameHTML.generate(api, app, config, f());

      f(null, [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '<title>' + app.manifest.title + '</title>',
        '<link rel="stylesheet" type="text/css" href="styles.css">',
        '</head>',
        '<body style="margin:0px;padding:0px;' + (config.browser.desktopBodyCSS || '') + '">',
        '</body>',
        '<script src="game.js"></script>',
        '</html>'
      ].join('\n'));
    } else {
      gameHTML.addCSS(bootstrapCSS);
      gameHTML.addCSS(fontList.getCSS({
        embedFonts: config.browser.embedFonts,
        formats: require('./fonts').getFormatsForTarget(config.target)
      }));

      if (config.browser.canvas.css) {
        gameHTML.addCSS("#timestep_onscreen_canvas{" + config.browser.canvas.css + "}");
      }

      gameHTML.addJS(jsConfig.toString());
      gameHTML.addJS(bootstrapJS);
      gameHTML.addJS(printf('bootstrap("%(initialImport)s", "%(target)s")', {
          initialImport: INITIAL_IMPORT,
          target: config.target
        }));
      gameHTML.addJS(preloadJS);

      // Condense resources.
      gameHTML.generate(api, app, config, f());
    }

    if (!isMobile) {
      new html.IndexHTML().generate(api, app, config, f());
    }
  }, function (gameJS, html, wrapperHTML) {
    if (wrapperHTML) {
      resourceList.add({
        target: 'index.html',
        contents: wrapperHTML
      });
    }

    resourceList.add({
      target: wrapperHTML ? 'game.html' : 'index.html',
      contents: html
    });

    resourceList.add({
      target: config.target + '.js',
      contents: 'NATIVE=false;'
        + 'CACHE=' + JSON.stringify(inlineCache) + ';\n'
        + gameJS + ';'
        + 'jsio("import ' + INITIAL_IMPORT + '");'
    });

    resourceList.add({
      target: config.target + '.manifest',
      contents: require('./offlineManifest').generate(app, config, resourceList)
    });

    // add extra resources for copying
    config.browser.copy && config.browser.copy.forEach(function (resource) {
      // TODO: ensure resource is a local path already or else bad
      // things will happen
      resourceList.add({
        target: resource,
        source: path.join(config.appPath, resource)
      });
    });

    logger.log('Writing files...');
    resourceList.write(config.outputPath, config.appPath, f());
    resourceList.writeSourceMap(config.outputPath, files.imageSourceMap, f());
  }, function () {
    logger.log('Done');
  }).cb(cb);
};
