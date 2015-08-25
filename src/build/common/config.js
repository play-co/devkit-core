var path = require('path');

exports.extend = function (app, config) {

  // application id
  config.appID = app.manifest.appID || "";

  // target build directory relative to app base directory
  config.localBuildPath = path.relative(config.appPath, config.outputPath);

  // where spritesheets go
  config.spritesheetsDirectory = path.join(config.outputResourcePath, 'spritesheets');

  // default to non-power-of-two aligned sheets, set to true for native builds
  config.powerOfTwoSheets = false;

  // compress images in the release scheme unless --no-compress was provided
  config.compressImages = config.scheme === 'release' && config.compress !== false;

  // if --compress-images or --no-compress-images is provided, override other
  // compression settings
  if ('compress-images' in config.argv) {
    config.compressImages = !!config.argv['compress-images'];
  }

  // Generate a default bundleID

  // construct a bundleID the same way Android constructs the packageName:
  var studio = app.manifest.studio && app.manifest.studio.domain;
  if (!studio) {
    studio = "my-studio.com";
  }

  var names = studio.split(/\./g).reverse();
  studio = names.join('.');
  var defaultName = studio + "." + app.manifest.shortName;

  config.bundleID = app.manifest.ios && app.manifest.ios.bundleID || defaultName;
  config.packageName = app.manifest.android && app.manifest.android.packageName || defaultName;

};
