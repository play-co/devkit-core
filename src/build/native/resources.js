var fs = require('fs');
var path = require('path');
var readFile = Promise.promisify(fs.readFile);
var vfs = require('vinyl-fs');

var resources = require('../common/resources');

// Packaging for Native.
// Native on any platform requires a compiled JavaScript file, so we make this
// generic and include it here.

exports.writeNativeResources = function (api, app, config, cb) {
  var logger = api.logging.get('native-resources');
  logger.log(config.target + ': writing resources for', config.appID);

  var outputDirectory = config.outputResourcePath;
  require('../common/build-stream-api').addToAPI(api, app, config);

  var appJS = api.streams.get('app-js', {
      env: 'native',
      tasks: [
        readFile(path.join(__dirname, 'env.js'), 'utf8')
      ],
      inlineCache: true,
      filename: 'native.js',
      composite: function (tasks, js, cache, config) {
        var envJS = tasks[0];
        return config.toString()
          + ';CACHE=' + JSON.stringify(cache)
          + ';\n'
          + envJS + ';\n'
          + js + ';';
      }
    });

  var stream = resources.createFileStream(api, app, config, outputDirectory)
    .pipe(api.streams.get('spriter'))
    .pipe(appJS)
    .pipe(api.insertFilesStream([
        {name: 'manifest.json', contents: JSON.stringify(app.manifest)}
      ]))
    .pipe(vfs.dest(outputDirectory));

  return api.streamToPromise(stream)
    .nodeify(cb);
};
