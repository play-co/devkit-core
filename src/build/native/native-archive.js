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

  require('./resources').writeNativeResources(api, app, config, function (err) {
    // do nothing if err
    if (err) { return cb && cb(err); }

    // Find files in the output directory
    var archiver = require('archiver');
    var glob = Promise.promisify(require('glob'));
    var readFile = Promise.promisify(fs.readFile);
    var stat = Promise.promisify(fs.stat);
    var archiveName = app.manifest.shortName + '.zip';
    var archivePath = path.join(outPath, archiveName);

    var archive = archiver.create('zip', {});
    var output = fs.createWriteStream(archivePath);
    archive.pipe(output);

    var done = new Promise(function (resolve, reject) {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    return glob(path.join(outPath, '**', '*'))
      .map(function (file) {
        var zipPath = file.replace(outPath + path.sep, '');
        // Skip any existing archive file
        if (zipPath === archiveName) {
          return;
        }

        return stat(file)
          .then(function (stats) {
            if (stats.isDirectory()) {
              return;
            }

            return readFile(file)
              .then(function (buffer) {
                archive.append(buffer, {name: zipPath});
              });
          });
      })
      .then(function () {
        archive.finalize();
        return done;
      })
      .nodeify(cb);
  });
};
