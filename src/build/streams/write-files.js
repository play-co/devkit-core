var vfs = require('vinyl-fs');
var FilterStream = require('streamfilter');

var fs = require('../util/fs');
var createStreamWrapper = require('../util/stream-wrap').createStreamWrapper;

exports.create = function (api, app, config) {
  // the spriter outputs files directly to the spritesheets directory for
  // performance reasons, and then inserts the spritesheet File objects back
  // into the stream so future streams know about them; however, we can't
  // actually write them out. The filter removes files that have already been
  // written.
  var filter = new FilterStream(function (file, enc, cb) {
      if (config.debug && !file.written && file.stat) {
        fs.lstatAsync(file.path)
          .then(function (stat) {
            var unchanged = stat.mtime.getTime() === file.stat.mtime.getTime();
            cb(unchanged);
          }, function (err) {
            // does not exist at target location
            cb(false);
          });
      } else {
        cb(file.written);
      }
    }, {restore: true, objectMode: true, passthrough: true});

  return createStreamWrapper()
            .wrap(filter)
            .wrap(vfs.dest(config.outputResourcePath))
            .wrap(api.streams.createFileStream({
              onFile: function (file) {
                if (file.stat && file.stat.atime && file.stat.mtime) {
                  var atime = file.stat.atime.getTime();
                  var mtime = file.stat.mtime.getTime();
                  if (!isNaN(atime) && !isNaN(mtime)) {
                    try {
                      return fs.utimesAsync(file.path, atime, mtime);
                    } catch (e) {
                      // this may fail on windows
                    }
                  }
                }
              }
            }))
            .wrap(filter.restore)
};
