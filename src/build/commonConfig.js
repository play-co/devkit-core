var path = require('path');

var DEFAULT_LANG = 'en';

exports.extend = function (app, config) {

  var appPath = app.paths.root;

  // application id
  config.appID = app.manifest.appID || "";

  // build cache files
  if (!config.cacheDirectory) {
    if (/^build\//.test(path.relative(appPath, config.outputPath))) {
      config.cacheDirectory = path.join(appPath, 'build', 'cache');
    } else {
      config.cacheDirectory = path.join(config.outputPath, 'devkit-cache');
    }
  }

  if (!config.cachePrefix) {
    config.cachePrefix = [
          config.scheme,
          config.target,
          (config.isSimulated ? 'sim' : '')
        ].join('-');
  }

  // where spritesheets go
  var _spritesheetsDirectory = config.spritesheetsDirectory;
  Object.defineProperty(config, 'spritesheetsDirectory', {
      configurable: true,
      get: function () {
        return _spritesheetsDirectory
          || (_spritesheetsDirectory = path.join(config.outputResourcePath, 'spritesheets'));
      },
      set: function (dir) {
        _spritesheetsDirectory = dir;
      }
    });

  // default to non-power-of-two aligned sheets, set to true for native builds
  config.powerOfTwoSheets = false;

  // default to removing unused sheets from build dir only in release mode
  config.removeUnusedSheets = config.scheme == 'release';

  // compress images in the release scheme unless --no-compress was provided
  config.compressImages = config.scheme === 'release' && config.compress !== false;

  // if --compress-images or --no-compress-images is provided, override other
  // compression settings
  if ('compress-images' in config.argv) {
    config.compressImages = !!config.argv['compress-images'];
  }

  // generate a resource source map
  if ('resource-source-map' in config.argv) {
    config.resourceSourceMap = !!config.argv['resource-source-map'];
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

  config.studioName = studio;
  config.bundleID = app.manifest.ios && app.manifest.ios.bundleID || defaultName;
  config.packageName = app.manifest.android && app.manifest.android.packageName || defaultName;

  var title = app.manifest.title;
  var titles = app.manifest.titles || {};
  if (title === null && titles === null) {
    title = app.manifest.shortName || 'Untitled';
  }

  if (!titles[DEFAULT_LANG]) {
    titles[DEFAULT_LANG] = title;
  }

  config.titles = titles;
  config.title = title;
};
