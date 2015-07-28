var path = require('path');
var fs = require('fs');
var printf = require('printf');

var JSCompiler = require('../common/jsCompiler').JSCompiler;
var getBase64Image = require('./datauri').getBase64Image;

var FileGenerator = require('../common/FileGenerator');

var TARGET_APPLE_TOUCH_ICON_SIZE = 152;

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

var renderStylus = function(cssString, shouldCompress) {
  // Only import if used, otherwise it takes forever
  var stylus = require('stylus');
  var nib = require('nib');

  // process the stylus into css
  var stylusRenderer = stylus(cssString)
    .set('compress', shouldCompress)
    .use(nib());
  return stylusRenderer.render();
};

exports.GameHTML = Class(function () {
  this.init = function (config) {
    this._css = [];
    this._js = [];

    this._config = config;
    this._binPath = path.join(config.outputPath, 'bin', 'html');
  };

  /**
   * @param {string} css Path to some stylus file
   */
  // TODO: Actually should be "addStylus"
  this.addCSS = function (name, css) {
    var dest = path.join(this._binPath, 'css', name.replace(/\//g, '_'));
    var shouldCompress = this._config.compress;

    this._css.push(FileGenerator.dynamic(
      css,
      dest,
      function(cb) {
        cb(null, renderStylus(css, shouldCompress));
      }
    ));
  };

  this.addCSSFile = function(cssPath) {
    var dest = path.join(this._binPath, 'css', cssPath.replace(/\//g, '_'));
    var shouldCompress = this._config.compress;

    this._css.push(FileGenerator(
      cssPath,
      dest,
      function(cb) {
        fs.readFile(cssPath, 'utf8', function(err, cssSrc) {
          if (err) { reject(err); return; }

          cb(null, renderStylus(cssSrc, shouldCompress));
        });
      }
    ));
  };

  this.addJS = function (js) {
    this._js.push(js);
  };

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

  this.generate = function (api, app, config) {
    var logger = api.logging.get('build-html');

    var theCss = Promise.reduce(this._css, function(total, src) {
      return total += src + '\n';
    }, '');

    var js = this._js.join(';');
    var jsCompiler = new JSCompiler(api, app);
    var compileJS = Promise.promisify(jsCompiler.compress, jsCompiler);

    return Promise.all([
        theCss,
        config.compress
          ? compileJS('[bootstrap]', js, {showWarnings: false})
          : js
      ])
      .bind(this)
      .spread(function (css, js) {
        // browser splash
        var splashImage = config.browser.splash
                       && path.resolve(app.paths.root, config.browser.splash);
        if (!fs.existsSync(splashImage) && !config.isSimulated) {
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

        // Create HTML document.
        var html = [];

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
        if (config.target === 'browser-mobile') {
          if (!app.manifest.scaleDPR) {
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
          html.push(require('./splash')
            .getSplashHTML(config.browser.spinner, splashImage));
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
