var fs = require('fs');
var path = require('path');
var readFile = Promise.promisify(fs.readFile);

var buildStreamAPI = require('../common/build-stream-api');

// Packaging for Native.
// Native on any platform requires a compiled JavaScript file, so we make this
// generic and include it here.

exports.createStreams = function (api, app, config) {
  var logger = api.logging.get('native-resources');
  logger.log(config.target + ': writing resources for', config.appID);

  api.streams.create('spriter');

  api.streams.create('app-js', {
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

  api.streams.create('static-files')
    .add({filename: 'manifest.json', contents: JSON.stringify(app.manifest)});

  // return the order in which the streams should run
  return [
    'spriter',
    'app-js',
    'static-files',
    'output',
    config.compressImages && 'image-compress'
  ];
};

exports.writeNativeResources = buildStreamAPI.createStreamingBuild(exports.createStreams);
