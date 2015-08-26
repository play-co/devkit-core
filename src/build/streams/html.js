var path = require('path');
var stylus = require('stylus');
var nib = require('nib');
var printf = require('printf');
var fs = require('../util/fs');
var appJS = require('./app-js');
var JSConfig = require('../jsConfig').JSConfig;
var JSCompiler = require('../jsCompiler').JSCompiler;
var getBase64Image = require('../util/datauri').getBase64Image;

var TARGET_APPLE_TOUCH_ICON_SIZE = 152;
var STATIC_BOOTSTRAP_CSS = getStaticFilePath('bootstrap.styl');
var STATIC_BOOTSTRAP_JS = getStaticFilePath('bootstrap.js');
var STATIC_LIVE_EDIT_JS = getStaticFilePath('liveEdit.js');

// Static resources.
function getStaticFilePath(filePath) {
  return path.join(__dirname, '..', 'targets', 'browser', 'static', filePath);
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

exports.create = function (api, app, config, opts) {
  var isMobile = (config.target !== 'browser-desktop');
  var isLiveEdit = (config.target === 'live-edit');

  var jsConfig = new JSConfig(api, app, config);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);
  var compileJS = Promise.promisify(jsCompiler.compile, jsCompiler);

  // start file-system tasks in background immediately
  var tasks = [
    getPreloadJS(config, compileJS),
    fs.readFileAsync(STATIC_BOOTSTRAP_CSS, 'utf8'),
    fs.readFileAsync(STATIC_BOOTSTRAP_JS, 'utf8'),
    isLiveEdit && fs.readFileAsync(STATIC_LIVE_EDIT_JS, 'utf8')
  ];

  // generate html when stream ends
  return api.streams.createFileStream({
    onFinish: function (addFile) {
      // wait for file-system tasks to finish
      return Promise.all(tasks)
        .spread(function (preloadJS, bootstrapCSS, bootstrapJS, liveEditJS) {
          var gameHTML = new exports.GameHTML();

          gameHTML.addCSS(bootstrapCSS);
          if (opts.fontStream) {
            jsConfig.add('embeddedFonts', opts.fontStream.getNames());
            gameHTML.addCSS(opts.fontStream.getCSS({
              embedFonts: config.browser.embedFonts
            }));
          }

          if (config.browser.canvas.css) {
            gameHTML.addCSS('#timestep_onscreen_canvas{'
                          + config.browser.canvas.css
                          + '}');
          }

          gameHTML.addJS(jsConfig.toString());
          gameHTML.addJS(bootstrapJS);
          gameHTML.addJS(printf('bootstrap("%(initialImport)s", "%(target)s")', {
              initialImport: appJS.initialImports.browser,
              target: config.target
            }));
          gameHTML.addJS(preloadJS);

          liveEditJS && gameHTML.addJS(liveEditJS);

          var hasWebAppManifest = !!config.browser.webAppManifest;
          if (hasWebAppManifest) {
            config.browser.headHTML.push('<link rel="manifest" href="web-app-manifest.json">');
          }

          var hasIndexPage = !isMobile;
          addFile({
            filename: hasIndexPage ? 'game.html' : 'index.html',
            contents: gameHTML.generate(api, app, config)
          });

          if (hasIndexPage) {
            addFile({
              filename: 'index.html',
              contents: new exports.IndexHTML().generate(api, app, config)
            });
          }
        });
    }
  });
};

exports.IndexHTML = Class(function () {
  this.generate = function (api, app, config) {
    return Promise.try(function () {
        return [
        '<!DOCTYPE html>',
        '<html>',
        '  <head>',
        '    <title>' + app.manifest.title + '</title>',
        '  </head>',
        '',
        '  <body style="margin:0;padding:0;'
              + (config.browser.desktopBodyCSS || '')
              + '" onresize="onResize()">',
        '    <div id="gameWrapper">',
        '      <iframe id="game" src="game.html"'
                + 'style="display:block;border:0;margin:0;padding:0;">',
        '      </iframe>',
        '    </div>',
        '',
        '    <script>',
        '      function onResize(allowResize) {',
        '        var w = window, d = w.document, de = d.documentElement;',
        '        var width = Math.max(de.clientWidth, w.innerWidth || 0);',
        '        var height = Math.max(de.clientHeight, w.innerHeight || 0);',
        '        var game = d.getElementById("game");',
        '',
        '        if (allowResize) {',
        '          var BG_WIDTH = ' + config.browser.canvas.width + ';',
        '          var BG_HEIGHT = ' + config.browser.canvas.height + ';',
        '          var BG_RATIO = BG_WIDTH / BG_HEIGHT;',
        '          var ratio = width / height;',
        '          var horzFit = ratio <= BG_RATIO;',
        '          var scale = horzFit',
        '                    ? width / BG_WIDTH',
        '                    : height / BG_HEIGHT;',
        '',
        '          game.width = scale * BG_WIDTH;',
        '          game.height = scale * BG_HEIGHT;',
        '',
        '          if (game.width > BG_WIDTH) {',
        '            game.height *= BG_WIDTH / game.width;',
        '            game.width = BG_WIDTH;',
        '          }',
        '',
        '          if (game.height > BG_HEIGHT) {',
        '            game.width *= BG_HEIGHT / game.height;',
        '            game.height = BG_HEIGHT;',
        '          }',
        '        }',
        '',
        '        var gameWrapper = document.getElementById("gameWrapper");',
        '        var s = gameWrapper.style;',
        '        s.width = "1px";',
        '        s.height = "1px";',
        '        s.marginTop = ((height - game.height) / 2) + "px";',
        '        s.marginLeft = ((width - game.width) / 2) + "px";',
        '      };',
        '',
        '      onResize(true);',
        '    </script>',
        '  </body>',
        '</html>'
      ].join('\n');
    });
  };
});

exports.GameHTML = Class(function () {
  this.init = function () {
    this._css = [];
    this._js = [];
  };

  this.addCSS = function (css) { this._css.push(css); };
  this.addJS = function (js) { this._js.push(js); };

  // return smallest icon size larger than targetSize or the largest icon if
  // none are larger than targetSize
  this._getClosestIcon = function (logger, targetSize, iconPath, icons) {

    if (!icons) { return; }

    var closestSize = 0;
    var closestIcon;

    for (var size in icons) {
      if (typeof icons[size] !== 'string') { continue; }

      var intSize = parseInt(size);
      var icon = path.join(iconPath, icons[size]);
      if (!fs.existsSync(icon)) {
        var msg = printf('icon manifest.ios[%(size)s] does not exist'
                       + ' (%(path)s)', {
                            size: intSize,
                            path: icon
                          });
        logger.warn(msg);
        continue;
      }

      var isCloserBelow = closestSize < targetSize
                        && intSize > closestSize;
      var isCloserAbove = closestSize > targetSize
                        && intSize > targetSize
                        && intSize < closestSize;
      if (isCloserBelow || isCloserAbove) {
        closestSize = intSize;
        closestIcon = icon;
      }
    }

    return closestIcon;
  };

  function getSplashHTML(config, image) {
    return image && fs.existsAsync(image)
      .then(function (exists) {
        if (exists) {
          require('./splash')
            .getSplashHTML(config.browser.spinner, image);
        }
      });
  }

  this.generate = function (api, app, config) {
    var logger = api.logging.get('build-html');

    var css = this._css.join('\n');
    var js = this._js.join(';');
    var stylusRenderer = stylus(css)
          .set('compress', config.compress)
          .use(nib());
    var jsCompiler = new JSCompiler(api, app);
    var renderCSS = Promise.promisify(stylusRenderer.render, stylusRenderer);
    var compileJS = Promise.promisify(jsCompiler.compress, jsCompiler);

    // browser splash
    var splashImage = config.browser.splash
                   && path.resolve(app.paths.root, config.browser.splash);

    // Create HTML document.
    var html = [];

    return Promise.all([
        renderCSS(),
        config.compress
          ? compileJS('[bootstrap]', js, {showWarnings: false})
          : js,
        splashImage && fs.existsAsync(splashImage) || false
      ])
      .bind(this)
      .spread(function (css, js, splashHTML, splashExists) {
        if (!splashExists && !config.isSimulated) {
          var splashPaths = {
            'portrait': ['portrait2048', 'portrait1136',
                          'portrait1024', 'portrait960', 'portrait480'],
            'landscape': ['landscape1536', 'landscape768']
          };

          // get list of splash images to test
          var splashes = [];
          if (app.manifest.supportedOrientations) {
            if (app.manifest.supportedOrientations.portrait) {
              splashes = splashes.concat(splashPaths.portrait);
            }
            if (app.manifest.supportedOrientations.landscape) {
              splashes = splashes.concat(splashPaths.landscape);
            }
          } else {
            splashes = splashes
              .concat(splashPaths.portrait)
              .concat(splashPaths.landscape);
          }
          splashes.push('universal');

          // test if each splash path is in the manifest
          var img;
          for (var i = 0; i < splashes.length; i++) {
            img = app.manifest.splash && app.manifest.splash[splashes[i]];
            img = img && path.resolve(app.paths.root, img);
            if (img && fs.existsSync(img)) {
              // take first matching image found?
              // TODO: figure out correct logic here
              splashImage = img;
              break;
            }
          }

        }

        // Check if there is a manifest.
        html.push('<!DOCTYPE html>');
        if (config.debug || config.isSimulated) {
          html.push('<html>');
        } else {
          html.push('<html manifest="' + config.target + '.manifest">');
        }

        html.push(
          '<head>',
            config.browser.baseURL
              ? '<base href="' + config.browser.baseURL + '">'
              : '',
          '<title>',
            app.manifest.title,
          '</title>'
        );

        // Targeting mobile browsers requires viewport settings.
        if (config.target === 'browser-mobile' || config.isSimulated) {
          if (app.manifest.scaleDPR === false) {
            html.push('<meta name="viewport"'
                + ' content="user-scalable=no,target-densitydpi=low"/>');
          } else {
            html.push('<meta name="viewport"'
                + ' content="user-scalable=no,target-densitydpi=device-dpi"/>');
          }

          // Various iOS mobile settings for installing as a top application.
          html.push('<meta name="apple-mobile-web-app-capable"'
              + ' content="yes"/>');

          if (config.browser.icon && app.manifest.browser && app.manifest.browser.icons) {
            var icon = this._getClosestIcon(logger,
                                            192,
                                            app.paths.root,
                                            app.manifest.browser.icons);
            if (icon) {
              html.push('<link rel="icon" size="192x192"'
                        + ' href="' + icon + '">');
            }
          }

          if (config.browser.appleTouchIcon && app.manifest.ios && app.manifest.ios.icons) {
            var icon = this._getClosestIcon(logger,
                                            TARGET_APPLE_TOUCH_ICON_SIZE,
                                            app.paths.root,
                                            app.manifest.ios.icons);
            if (icon) {
              html.push('<link rel="apple-touch-icon"'
                        + ' href="' + icon + '">');
            }
          }

          if (config.browser.appleTouchStartupImage && splashImage) {
            html.push('<link rel="apple-touch-startup-image"'
                      + ' href="' + getBase64Image(splashImage) + '">');
          }
        }

        // Finish writing HTML file.
        html.push(
          '<style>' + css + '</style>',
          config.browser.headHTML.join('\n') || '',
          '</head>',
          '<body>',
          config.browser.bodyHTML.join('\n') || ''
        );

        if (config.browser.embedSplash && splashImage) {
          return getSplashHTML();
        }
      })
      .then(function (splashHTML) {
        if (splashHTML) {
          html.push(splashHTML);
        }

        html.push(
          '</body>',
          '<script>', js, '</script>',

          // load after config object
          config.browser.footerHTML.join('\n') || '',
          '<script>',
          // 'IMG_CACHE=' + JSON.stringify(imgCache) + ';',

          // fix old android sizing bugs
          'window.addEventListener("load", function(event) {',
            'var ua = navigator.userAgent;',
            'if(/Kik/.test(ua) && /Android/.test(ua)) {',
            'var el = document.getElementById("_GCSplash");',
            'var w = window.innerWidth;',
            'el.style.width = w + "px";',
            'var h = window.innerHeight;',
            'el.style.height = h + "px";',
          '}}, false);',
          '</script>',
          '</html>'
        );

        return html.join('');
      });
  };
});
