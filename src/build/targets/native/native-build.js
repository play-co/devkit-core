var fs = require('../../util/fs');
var path = require('path');

// Packaging for Native.
// Native on any platform requires a compiled JavaScript file, so we make this
// generic and include it here.

exports.setupStreams = function (api, app, config) {

  var logger = api.logging.get('native-resources');
  logger.log(config.target + ': writing resources for', config.appID);

  api.streams.create('spriter');
  api.streams.create('sound-map');
  api.streams.create('app-js', {
    env: 'native',
    tasks: [
      fs.readFileAsync(path.join(__dirname, 'env.js'), 'utf8')
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
};

exports.getStreamOrder = function (api, app, config) {
  return [
    'spriter',
    'sound-map',
    'app-js',
    'static-files',
    'write-files',
    config.compressImages && 'image-compress'
  ];
};
