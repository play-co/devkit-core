var path = require('path');
var Promise = require('bluebird');
var createBuildTarget = require('../../index').createBuildTarget;

exports.helpText = 'For release builds, please set the environment variables '
 + 'DEVKIT_ANDROID_KEYSTORE, DEVKIT_ANDROID_STOREPASS, DEVKIT_ANDROID_KEYPASS, '
 + 'DEVKIT_ANDROID_KEY';

exports.opts = require('optimist')
    .describe('help', 'Display this help menu')
      .alias('help', 'h')
    .describe('install', 'Launch `adb install` after build completes')
      .alias('install', 'i')
      .boolean('install')
      .default('install', false)
    .describe('open', 'Launch the app on the phone after build completes (implicitly installs)')
      .alias('open', 'o')
      .boolean('open')
      .default('open', false)
    .describe('debug', 'Create debug build')
      .alias('debug', 'd')
      .boolean('debug')
      .default('debug', true)
    .describe('enableReleaseLogging', 'Enable JavaScript logging in release mode')
      .boolean('enableReleaseLogging')
      .default('enableReleaseLogging', false)
    .describe('clean', 'Clean build before compilation')
      .alias('clean', 'c')
      .boolean('clean')
      .default('clean', false)
    .describe('clearstorage', 'Clear localStorage on device')
      .alias('clearstorage', 's')
      .boolean('clearstorage')
      .default('clearstorage', false)
    .describe('repack', 'only build the JavaScript')
      .alias('repack', 'js-only')
      .boolean('repack')
      .default('repack', false)
    .describe('target-sdk-version', 'set a custom android target sdk version')
      .default('target-sdk-version', 14)
    .describe('min-sdk-version', 'set a custom android min sdk version')
      .default('min-sdk-version', 8)
    .describe('reveal', 'show the apk in Finder')
      .default('reveal', false)
    .describe('resources-only', 'skip the native build')
      .boolean('resources-only')
      .default('resources-only', false);

createBuildTarget(exports);

exports.init = function (api, app, config) {
  if (!config.isSimulated) {
    config.outputResourcePath = path.join(config.outputPath, "assets/resources");
  }

  var argv = exports.opts.argv;

  config.isAndroid = true;
  config.repack = argv.repack;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;
  config.resourcesOnly = argv["resources-only"];
  config.activityName = (app.manifest.shortName || 'Main') + 'Activity';

  if (config.isSimulated) {
    require('../browser').init(api, app, config);
  } else {
    config.powerOfTwoSheets = true;
  }
};

var nativeBuild = require('./native-build');

exports.setupStreams = function (api, app, config) {
  if (config.isSimulated) {
    return require('../browser').setupStreams(api, app, config);
  }

  nativeBuild.setupStreams(api, app, config);

  function androidBuild() {
    var android = require('../../../../modules/native-android/build');
    var build = Promise.promisify(android.build, android);
    return build(api, app, config);
  }

  api.streams.registerFunction('android', androidBuild);
};

exports.getStreamOrder = function (api, app, config) {

  if (config.isSimulated) {
    return require('../browser').getStreamOrder(api, app, config);
  }

  var order = nativeBuild.getStreamOrder(api, app, config);
  if (!config.resourcesOnly) {
    order.push('android');
  }

  return order;
};
