var path = require('path');
var Promise = require('bluebird');
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

exports.create = function (api, app, config, opts) {
  var isMobile = (config.target !== 'browser-desktop');
  var isLiveEdit = (config.target === 'live-edit');

  var jsConfig = new JSConfig(api, app, config);
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

  // start file-system tasks in background immediately
  var tasks = [
    fs.readFileAsync(STATIC_BOOTSTRAP_CSS, 'utf8'),
    fs.readFileAsync(STATIC_BOOTSTRAP_JS, 'utf8'),
    isLiveEdit && fs.readFileAsync(STATIC_LIVE_EDIT_JS, 'utf8')
  ];

  // generate html when stream ends
  return api.streams.createFileStream({
    onFinish: function (addFile) {
      // wait for file-system tasks to finish
      return Promise.all(tasks)
        .spread(function (bootstrapCSS, bootstrapJS, liveEditJS) {
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
          gameHTML.addJS(printf('GC_LOADER.init("%(target)s")', {
              target: config.target
            }));

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
      var html = [];
      html.push('<!DOCTYPE html>');
      html.push('<html>');
      html.push('  <head>');
      html.push('    <meta charset="UTF-8">');
      html.push('    <title>' + app.manifest.title + '</title>');
      applyOpenGraphMetaProperties(html, config);
      html.push('  </head>');
      html.push('');
      html.push('  <body style="margin:0;padding:0;'
              + (config.browser.desktopBodyCSS || '')
              + '" onresize="onResize()">');
      html.push('    <div id="gameWrapper">');
      html.push('      <iframe id="game" src="game.html"'
              + 'style="display:block;border:0;margin:0;padding:0;">');
      html.push('      </iframe>');
      html.push('    </div>');
      html.push('');
      html.push('    <script>');
      html.push('      function onResize(allowResize) {');
      html.push('        var w = window, d = w.document, de = d.documentElement;');
      html.push('        var width = Math.max(de.clientWidth, w.innerWidth || 0);');
      html.push('        var height = Math.max(de.clientHeight, w.innerHeight || 0);');
      html.push('        var game = d.getElementById("game");');
      html.push('');
      html.push('        if (allowResize) {');
      html.push('          var BG_WIDTH = ' + config.browser.canvas.width + ';');
      html.push('          var BG_HEIGHT = ' + config.browser.canvas.height + ';');
      html.push('          var BG_RATIO = BG_WIDTH / BG_HEIGHT;');
      html.push('          var ratio = width / height;');
      html.push('          var horzFit = ratio <= BG_RATIO;');
      html.push('          var scale = horzFit');
      html.push('                    ? width / BG_WIDTH');
      html.push('                    : height / BG_HEIGHT;');
      html.push('');
      html.push('          game.width = scale * BG_WIDTH;');
      html.push('          game.height = scale * BG_HEIGHT;');
      html.push('');
      html.push('          if (game.width > BG_WIDTH) {');
      html.push('            game.height *= BG_WIDTH / game.width;');
      html.push('            game.width = BG_WIDTH;');
      html.push('          }');
      html.push('');
      html.push('          if (game.height > BG_HEIGHT) {');
      html.push('            game.width *= BG_HEIGHT / game.height;');
      html.push('            game.height = BG_HEIGHT;');
      html.push('          }');
      html.push('        }');
      html.push('');
      html.push('        var gameWrapper = document.getElementById("gameWrapper");');
      html.push('        var s = gameWrapper.style;');
      html.push('        s.width = "1px";');
      html.push('        s.height = "1px";');
      html.push('        s.marginTop = ((height - game.height) / 2) + "px";');
      html.push('        s.marginLeft = ((width - game.width) / 2) + "px";');
      html.push('      };');
      html.push('');
      html.push('      onResize(true);');
      html.push('    </script>');
      html.push('  </body>');
      html.push('</html>');
      return html.join('\n');
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
          return require('../targets/browser/splash')
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
        splashImage && fs.existsAsync(splashImage) || false,
        config.browser.hasApplicationCache && fs.readFileAsync(getStaticFilePath('app-cache-events.js'), 'utf8'),
        require('../targets/browser/orientation').addOrientationHTML(app, config)
      ])
      .bind(this)
      .spread(function (css, js, splashExists, appCacheEvents) {
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
        if (!config.browser || !config.browser.hasApplicationCache) {
          html.push('<html>');
        } else {
          html.push('<html manifest="' + config.target + '.manifest">');
          config.browser.footerHTML.push('<script>' + appCacheEvents + '</script>');
        }

        html.push(
          '<head>',
          '<meta charset="UTF-8">',
            config.browser.baseURL
              ? '<base href="' + config.browser.baseURL + '">'
              : '',
          '<title>',
            app.manifest.title,
          '</title>'
        );
        applyOpenGraphMetaProperties(html, config);

        // Targeting mobile browsers requires viewport settings.
        if (config.target === 'browser-mobile' || config.isSimulated) {

          html.push('<meta name="viewport"'
              + ' content="user-scalable=no,width=device-width,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0,shrink-to-fit=no"/>');

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
          return getSplashHTML(config, splashImage);
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



// add open graph meta properties to an array of HTML lines
function applyOpenGraphMetaProperties (html, config) {
  var og = config.browser.openGraph;
  for (var key in og) {
    html.push('    <meta property="og:' + key + '" content="' + og[key] + '" />');
  }
};
