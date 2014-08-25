var ff = require('ff');
var path = require('path');
var stylus = require('stylus');
var getBase64Image = require('./datauri').getBase64Image;

exports.compressCSS = function (css, cb) {
  stylus(css)
    .set('compress', true)
    .render(cb);
}

exports.IndexHTML = Class(function () {
  this.generate = function (api, app, config, cb) {
    // TODO: don't hardcode game.html?
    cb(null, [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<title>' + app.manifest.title + '</title>',
      '</head>',
      '<body style="margin:0px;padding:0px;' + (config.browser.desktopBodyCSS || '') + '">',
      '<iframe width="' + config.browser.canvas.width + '" height="' + config.browser.canvas.height + '"'
        + ' src="game.html"'
        + ' style="display:block;border:0;margin:0;">'
        + '</iframe>',
      '</body>',
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
    var f = ff(this, function () {
      var js = this._js.join(';');
      var css = this._css.join('\n');

      if (config.compress) {
        _builder.packager.compressCSS(css, f());

        var onCompress = f();
        // new JSCompiler(api, app);
        var compiler = _builder.packager.createCompiler(app, config, function (compiler) {
          compiler.inferOptsFromEnv('browser');
          compiler.compress('[bootstrap]', js, function (err, src) {
            compiler.strip(src, function (err, src) {
              onCompress(null, src + ';' + preloadJS);
            });
          });
        });
      } else {
        f(css, js);
      }
    }, function (css, js) {
      // browser splash
      var splashImage = config.browser.splash;
      if (!splashImage && !config.isSimulated) {
        var splashOpts = app.manifest.splash;
        var splashPaths = ['landscape1536', 'landscape768', 'portrait2048', 'portrait1136', 'portrait1024', 'portrait960', 'portrait480'];
        var i = splashPaths.length;
        splashImage = splashOpts[splashPaths[--i]];
        while (i && !splashImage) {
          splashImage = splashOpts[splashPaths[--i]];
        }
      }

      if (splashImage) {
        splashImage = path.resolve(app.paths.root, splashImage);
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
            var largest = 0;
            for (var size in iosIcons) {
              var intSize = parseInt(size);
              if (intSize > largest) {
                largest = intSize;
              }
            }
            if (largest > 0) {
              html.push('<link rel="apple-touch-icon" href="' + getBase64Image(iosIcons[largest.toString()]) + '">');
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
