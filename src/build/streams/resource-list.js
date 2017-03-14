var Promise = require('bluebird');
var path = require('path');

var IGNORE_LIST = [
  '.json',
  '.mp3',
  '.ogg',
  '.mp4',
  '.3gp',
  '.m4a',
  '.aac',
  '.flac',
  '.mkv',
  '.wav'
];

/**
 * Create a simple list of non-sound and non-inlined resources packaged with the app
 **/

exports.create = function (api, config) {
  var logger = api.logging.get('resource-list');
  var list = [];

  var stream = api.streams.createFileStream({

    onFile: function (file) {
      for (var i = 0, len = IGNORE_LIST.length; i < len; i++) {
        if (file.path.indexOf(IGNORE_LIST[i]) !== -1) {
          return;
        }
      }
      list.push(path.relative(config.outputResourcePath, file.path));
    },

    onFinish: function (addFile) {
      addFile({
        filename: 'resources/resource-list.json',
        contents: JSON.stringify(list)
      });
    }

  });


  return stream;
};
