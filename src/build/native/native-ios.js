var path = require('path');
var fs = require('fs');
var clc = require('cli-color');
var ff = require('ff');

exports.opts = require('optimist')(process.argv)
    .alias('help', 'h').describe('help', 'Display this help menu')
    .alias('debug', 'd').describe('debug', 'Create debug build').boolean('debug').default('debug', true)
    .alias('clean', 'c').describe('clean', 'Clean build before compilation').boolean('clean').default('clean', false)
    .alias('ipa', 'i').describe('ipa', 'Generate appName.ipa file as output for TestFlight').boolean('ipa').default('ipa', false)
    .describe('sdk', '(optional) Specify an iOS SDK other than the default one').string('sdk')
    .alias('provision', 'p').describe('provision', '(required for --ipa) Path to .mobileprovision profile file').string('provision')
    .alias('developer', 'v').describe('developer', '(required for --ipa) Name of developer').string('developer')
    .alias('open', 'o').describe('open', 'Open the XCode project after building, defaults to true for non-ipa builds, pass --no-open to override')
    .describe('reveal').describe('reveal', 'Shows ipa or XCode project in Finder after build')

exports.build = function (api, app, buildTarget, opts, cb) {
  var argv = exports.opts.argv;

  // Merge command-line arguments into build options
  opts.argv = argv;

  // builder.common.track("BasilBuildNativeIOS", {"clean":argv.clean, "debug":argv.debug, "compress":opts.compress});
  ios.build(api, app, buildTarget, opts, cb);
};

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-native');

  // add in any common config keys
  require('../common/config').extend(app, config);

  var argv = exports.opts.argv;

  config.isIOS = true;
  config.repack = argv.repack;
  config.open = argv.open;
  config.reveal = argv.reveal;
  config.provisionPath = argv.provision;
  config.signingIdentity = argv.developer;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;

  if (argv.ipa) {
    config.ipaPath = path.join(config.outputPath, app.manifest.shortName + '.ipa');

    // unless config.open is explicity provided, set it to false
    if (!(config.open === 'true' || config.open === 1 || config.open === true)) {
      config.open = false;
    }
  } else if (config.open === undefined) {
    config.open = true;
  }

  // TODO: can override the following for external projects
  // config.xcodeProjectPath

  // TODO: if cocos2d or other, change this
  if (!config.isSimulated) {
    config.outputResourcePath = path.join(config.outputPath, "xcodeproject", "resources", "resources.bundle");
  }

  // add in native-specific config keys
  // require('./nativeConfig').insert(app, config, exports.opts.argv);

  if (config.isSimulated) {
    require('../browser/').configure(api, app, config, cb);
  } else {
    cb && cb();
  }
}

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
      require('../../../modules/native-ios/build').build(api, app, config, f());
    }).cb(cb);
  }
};
