var path = require('path');
var Promise = require('bluebird');
var createBuildTarget = require('../../index').createBuildTarget;

exports.opts = require('optimist')(process.argv)
  .describe('help', 'Display this help menu')
    .alias('help', 'h')
  .describe('debug', 'Create debug build')
    .alias('debug', 'd')
    .boolean('debug')
    .default('debug', true)
  .describe('clean', 'Clean build before compilation')
    .alias('clean', 'c')
    .boolean('clean')
    .default('clean', false)
  .describe('ipa', 'Generate appName.ipa file as output for TestFlight')
    .alias('ipa', 'i')
    .boolean('ipa')
    .default('ipa', false)
  .describe('sdk', '(optional) Specify an iOS SDK other than the default one')
    .string('sdk')
  .describe('provision', '(required for --ipa) Path to .mobileprovision profile file')
    .alias('provision', 'p')
    .string('provision')
  .describe('developer', '(required for --ipa) Name of developer')
    .alias('developer', 'v')
    .string('developer')
  .describe('open', 'Open the XCode project after building, defaults to true for non-ipa builds, pass --no-open to override')
    .alias('open', 'o')
  .describe('reveal', 'Shows ipa or XCode project in Finder after build');

createBuildTarget(exports);

exports.init = function (api, app, config) {

  // native-ios needs a global logger :( fixme
  logger = api.logging.get('native-ios');

  if (!config.isSimulated) {
    config.xcodeResourcesPath = path.join('resources', 'resources.bundle');
    config.outputResourcePath = path.join(config.outputPath, "xcodeproject", config.xcodeResourcesPath);
  }

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

  function runIOSBuild() {
    var iosBuild = require('../../../../modules/native-ios/build');
    return Promise
      .resolve()
      .then(function () {
        if (!config.repack) {
          return iosBuild.createXcodeProject(config);
        }
      })
      .then(function () {
        return iosBuild.build(api, app, config);
      });
  }

  api.streams.registerFunction('ios', runIOSBuild);
};

exports.getStreamOrder = function (api, app, config) {

  if (config.isSimulated) {
    return require('../browser').getStreamOrder(api, app, config);
  }

  var order = nativeBuild.getStreamOrder(api, app, config);
  if (!config.resourcesOnly) {
    order.push('ios');
  }

  return order;
};
