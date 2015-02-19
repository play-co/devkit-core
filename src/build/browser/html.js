var path = require('path');
var fs = require('fs');

var ff = require('ff');
var stylus = require('stylus');
var nib = require('nib');
var printf = require('printf');

var JSCompiler = require('../common/jsCompiler').JSCompiler;
var getBase64Image = require('./datauri').getBase64Image;

var TARGET_APPLE_TOUCH_ICON_SIZE = 152;

exports.IndexHTML = Class(function () {
  this.generate = function (api, app, config, cb) {
    cb(null, [
      '<!DOCTYPE html>',
      '<html>',
      '  <head>',
      '    <title>' + app.manifest.title + '</title>',
      '  </head>',
      '',
      '  <body style="margin:0;padding:0;' + (config.browser.desktopBodyCSS || '') + '" onresize="onResize()">',
      '    <div id="gameWrapper">',
      '      <iframe id="game" src="game.html" style="display:block;border:0;margin:0;padding:0;"></iframe>',
      '    </div>',
      '',
      '    <script>',
      '      function onResize(allowResize) {',
      '        var width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);',
      '        var height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);',
      '        var game = document.getElementById("game");',
      '',
      '        if (allowResize) {',
      '          var BG_WIDTH = ' + config.browser.canvas.width + ';',
      '          var BG_HEIGHT = ' + config.browser.canvas.height + ';',
      '          var BG_RATIO = BG_WIDTH / BG_HEIGHT;',
      '          var ratio = width / height;',
      '          var horzFit = ratio <= BG_RATIO;',
      '          var scale = horzFit ? width / BG_WIDTH : height / BG_HEIGHT;',
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
      '        gameWrapper.style.width = "1px";',
      '        gameWrapper.style.height = "1px";',
      '        gameWrapper.style["margin-top"] = ((height - game.height) / 2) + "px";',
      '        gameWrapper.style["margin-left"] = ((width - game.width) / 2) + "px";',
      '      };',
      '',
      '      onResize(true);',
      '    </script>',
      '  </body>',
      '</html>'
    ].join('\n'));
  }
});

exports.GameHTML = Class(function () {
  this.init = function () {
    this._css = [];
    this._js = [];
  }

  this.addCSS = function (css) { this._css.push(css); }
  this.addJS = function (js) { this._js.push(js); }

  this.generate = function (api, app, config, cb) {
    var logger = api.logging.get('build-html');

    var f = ff(this, function () {
      var css = this._css.join('\n');
      stylus(css)
        .set('compress', config.compress)
        .use(nib())
        .render(f());

      var js = this._js.join(';');
      if (config.compress) {
        var onCompress = f();
        var compiler = new JSCompiler(api, app);
        compiler.compress('[bootstrap]', js, {showWarnings: false}, function (err, src) {
          compiler.strip(src, {}, function (err, src) {
            onCompress(null, src);
          });
        });
      } else {
        f(js);
      }
    }, function (css, js) {
      // browser splash
      var splashImage = config.browser.splash && path.resolve(app.paths.root, config.browser.splash);
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
        config.browser.baseURL ? '<base href="' + config.browser.baseURL + '">' : '',
        '<title>' + app.manifest.title + '</title>'
      );

      // Targeting mobile browsers requires viewport settings.
      if (config.target == 'browser-mobile') {
        if (!app.manifest.scaleDPR) {
          html.push('<meta name="viewport" content="user-scalable=no,target-densitydpi=low" />');
        } else {
          html.push('<meta name="viewport" content="user-scalable=no,target-densitydpi=device-dpi" />');
        }

        // Various iOS mobile settings for installing as a top application.
        html.push('<meta name="apple-mobile-web-app-capable" content="yes"/>')

        if (config.browser.appleTouchIcon) {
          // Apple Touch icons
          var iosIcons = app.manifest.ios && app.manifest.ios.icons;
          if (iosIcons) {
            // get smallest icon size >= TARGET_APPLE_TOUCH_ICON_SIZE, or the
            // largest icon if none is >= TARGET_APPLE_TOUCH_ICON_SIZE
            var closestSize = 0;
            var closestIcon;

            for (var size in iosIcons) {
              var intSize = parseInt(size);
              var icon = path.join(app.paths.root, iosIcons[size]);
              if (!fs.existsSync(icon)) {
                logger.warn(printf('icon manifest.ios[%(size)s] does not exist (%(path)s)', {
                  size: intSize,
                  path: icon
                }));
                continue;
              }

              if (closestSize < TARGET_APPLE_TOUCH_ICON_SIZE && intSize > closestSize
                  || closestSize > TARGET_APPLE_TOUCH_ICON_SIZE && intSize > TARGET_APPLE_TOUCH_ICON_SIZE && intSize < closestSize)
              {
                closestSize = intSize;
                closestIcon = icon;
              }
            }

            if (closestIcon) {
              html.push('<link rel="apple-touch-icon" href="' + getBase64Image(closestIcon) + '">');
            }
          }
        }

        if (config.browser.appleTouchStartupImage && splashImage) {
          html.push('<link rel="apple-touch-startup-image" href="' + getBase64Image(splashImage) + '">');
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
        html.push(require('./splash').getSplashHTML(config.browser.spinner, splashImage));
      }

      html.push(
        '</body>',
        '<script>', js, '</script>',

        // load after config object
        config.browser.footerHTML.join('\n') || '',
        '<script>',
        // 'IMG_CACHE=' + JSON.stringify(imgCache) + ';',

        // fix old android sizing bugs
        'window.addEventListener("load", function(event) { if (/Kik/.test(navigator.userAgent) && /Android/.test(navigator.userAgent)) { var el = document.getElementById("_GCSplash"); var w = window.innerWidth; el.style.width = w + "px"; var h = window.innerHeight; el.style.height = h + "px"; } }, false);',
        '</script>',
        '</html>'
      );

      f(html.join(''));
    }).cb(cb);
  }
});
