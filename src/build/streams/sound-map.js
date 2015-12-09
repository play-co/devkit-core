var Promise = require('bluebird');
var path = require('path');


var SOUND_EXTS = {
  '.mp3': true,
  '.ogg': true,
  '.mp4': true,
  '.3gp': true,
  '.m4a': true,
  '.aac': true,
  '.flac': true,
  '.mkv': true,
  '.wav': true
};

/**
 * simple stream wrapper that exposes a functional interface to add files to the
 * end of a stream
 */
exports.create = function (api, config) {
  var filesToAdd = [];

  var logger = api.logging.get('sound-map');
  var soundMap = {};
  var stream = api.streams.createFileStream({
    onFile: function (file) {
      if (file.extname in SOUND_EXTS) {
        soundMap[path.relative(config.outputResourcePath, file.path)] = true;
      }
    },
    onFinish: function (addFile) {
      addFile({
        filename: "resources/sound-map.json",
        contents: JSON.stringify(soundMap)
      });
    }
  });


  return stream;
};
