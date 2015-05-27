var path = require('path');
var fs = require('fs');
var clc = require('cli-color');
var ff = require('ff');

exports.helpText = 'For release builds, please set the environment variables '
 + 'DEVKIT_ANDROID_KEYSTORE, DEVKIT_ANDROID_STOREPASS, DEVKIT_ANDROID_KEYPASS, '
 + 'DEVKIT_ANDROID_KEY';

exports.opts = require('optimist')
    .alias('help', 'h').describe('help', 'Display this help menu')
    .alias('install', 'i').describe('install', 'Launch `adb install` after build completes').boolean('install').default('install', false)
    .alias('open', 'o').describe('open', 'Launch the app on the phone after build completes (implicitly installs)').boolean('open').default('open', false)
    .alias('debug', 'd').describe('debug', 'Create debug build').boolean('debug').default('debug', true)
    .describe('enableReleaseLogging', 'Enable JavaScript logging in release mode').boolean('enableReleaseLogging').default('enableReleaseLogging', false)
    .alias('clean', 'c').describe('clean', 'Clean build before compilation').boolean('clean').default('clean', false)
    .alias('clearstorage', 's').describe('clearstorage', 'Clear localStorage on device').boolean('clearstorage').default('clearstorage', false)
    .alias('repack', 'js-only').describe('repack', 'only build the JavaScript').boolean('repack').default('repack', false)
    .describe('resources-only', 'skip the native build').boolean('resources-only').default('resources-only', false)

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-native');

  // add in any common config keys
  require('../common/config').extend(app, config);

  var argv = exports.opts.argv;

  config.isAndroid = true;
  config.repack = argv.repack;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;
  config.resourcesOnly = argv["resources-only"];

  if (!config.isSimulated) {
    config.outputResourcePath = path.join(config.outputPath, "assets/resources");
  }

  // add in native-specific config keys
  // require('./nativeConfig').insert(app, config, exports.opts.argv);

  if (config.isSimulated) {
    require('../browser/').configure(api, app, config, cb);
  } else {
    cb && cb();
  }
};

// takes a app, subtarget(android/ios), additional opts.
exports.build = function (api, app, config, cb) {

  logger = api.logging.get('build-native');

  // doesn't build ios - builds the js that it would use, then you shim out NATIVE
  if (config.isTestApp) {
    require('./resources').writeNativeResources(build, app, config, cb);
  } else if (config.isSimulated) {
    // Build simulated version
    //
    // When simulating, we build a native version which targets the native target
    // but uses the browser HTML to host. A native shim is supplied to mimick native
    // features, so that the code can be tested in the browser without modification.
    require('../browser/').build(api, app, config, cb);
  } else {
    var f = ff(function () {
      require('./resources').writeNativeResources(api, app, config, f());
    }, function () {
      if (!config.resourcesOnly) {
        require('../../../modules/native-android/build').build(api, app, config, f());
      }
    }).cb(cb);
  }
};
