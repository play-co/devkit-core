var path = require('path');

exports.opts = require('optimist')(process.argv)
    .alias('help',  'h').describe('help', 'Display this help menu')

    .alias('debug', 'd').describe('debug', 'Create debug build')
                        .boolean('debug')
                        .default('debug', true)

    .alias('clean', 'c').describe('clean', 'Clean build before compilation')
                        .boolean('clean')
                        .default('clean', false);

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-native');

  // add in any common config keys
  require('../common/config').extend(app, config);

  var argv = exports.opts.argv;

  config.repack = argv.repack;
  config.open = argv.open;
  config.reveal = argv.reveal;
  config.provisionPath = argv.provision;
  config.signingIdentity = argv.developer;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;

  cb && cb();
};

// takes a app, subtarget(android/ios), additional opts.
exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-native');
  var outPath = config.outputResourcePath;
  var fs = require('fs-extra');
  if (exports.opts.argv.clean) {
    fs.removeSync(outPath);
    fs.mkdirsSync(outPath);
  }

  require('./resources')
  .writeNativeResources(api, app, config, function (err) {
    // do nothing if err
    if (err) { return cb && cb(err); }

    // Find files in the output directory
    var Zip = require('adm-zip');
    var glob = Promise.promisify(require('glob'));
    var readFile = Promise.promisify(fs.readFile);
    var archive = new Zip();
    var archiveName = app.manifest.shortName + '.zip';
    var archivePath = path.join(outPath, archiveName);

    console.log(app);

    return glob(path.join(outPath, '**', '*')).map(function (file) {
      var zipPath = file.replace(outPath + path.sep, '');
      // Skip any existing archive file
      if (zipPath === archiveName) {
        return;
      }

      return readFile(file).then(function (buffer) {
        archive.addFile(zipPath, buffer);
      }).catch(function (err) {
        // Ignore EISDIR (throw anything that's not an EISDIR)
        if (err.errno !== 28) { throw err; }
      });
    }).then(function () {
      archive.writeZip(archivePath);
    }).nodeify(cb);
  });
};
