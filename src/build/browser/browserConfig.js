var path = require('path');

var getPath = function (filePath) {
  return path.join(__dirname, '..', '..', filePath);
};

exports.insert = function (app, config, argv) {

  var copyFiles = [getPath('clientapi/browser/cache-worker.js')];
  var webAppManifest = {
    "name": app.manifest.title,
    "short_name": app.manifest.shortname,
    "icons": [{
          "src": app.manifest.icon,
          "sizes": "512x512",
          "type": "image/png"
        }],
    "start_url": "/index.html",
    "display": "standalone"
  };

  if (config.isSimulated) {
    config.browser = {
      embedSplash: false,
      embedFonts: false,
      appleTouchIcon: false,
      appleTouchStartupImage: false,
      frame: {},
      canvas: {},
      copy: copyFiles,
      headHTML: [],
      bodyHTML: [],
      footerHTML: [],
      webAppManifest: webAppManifest,
      baseURL: ''
    };
    return;
  }

  var browserConfig = merge({}, app.manifest.browser);
  config.browser = browserConfig;

  // defaults
  merge(browserConfig, {
    // include a base64-inline image for the apple-touch-icon meta tag (if
    // webpage is saved to homescreen)
    appleTouchIcon: true,
    appleTouchStartupImage: true,

    // embed fonts disabled by default (load over URL), if true, base64 encode
    // them into the css
    embedFonts: false,

    // embed a base64 splash screen (background-size: cover)
    embedSplash: true,
    cache: [],
    copy: copyFiles,
    desktopBodyCSS: '',

    // html to insert
    headHTML: [],
    bodyHTML: [],
    footerHTML: [],

    // web app manifest, converted to json
    webAppManifest: webAppManifest,

    // browser framing options
    frame: merge(browserConfig.frame, {width: 320, height: 480}),
    canvas: merge(browserConfig.canvas, {width: 320, height: 480}),
    baseURL: argv.baseURL || ''
  });

  if (config.isSimulated) {
    // native simulated builds should disable most of these flags
    browserConfig.appleTouchIcon = false;
    browserConfig.appleTouchStartupImage = false;
    browserConfig.embedSplash = true;
  }

  if (browserConfig.spinner) {
    // provide defaults for the browser splash screen spinner
    merge(browserConfig.spinner, {
      x: '50%', y: '50%',
      width: '90px', height: '90px',
      color0: 'rgba(255, 255, 255, 0.2)', color1: '#FFF'
    });

    // convert numbers to numbers with units
    ['width', 'height'].forEach(function (key) {
      var match = browserConfig.spinner[key].match(/^-?[0-9.]+(.*)$/);
      browserConfig.spinner[key] = {
        value: parseFloat(browserConfig.spinner[key]),
        unit: match && match[1] || 'px'
      };
    });
  }

  // Exclude jsio in browser builds (we include it separately)
  config.excludeJsio = !config.isSimulated;
};
