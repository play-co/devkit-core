var exec = require('child_process').exec;
var ff = require('ff');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var printf = require('printf');
var etags = require('etags');

var Resource = Class(function () {
  this.init = function (opts) {
    this.target = opts.target;
    this.copyFrom = opts.copyFrom;

    if ('contents' in opts) {
      this.contents = opts.contents;
    }
  }
});

exports.ResourceList = Class(function () {
  this.init = function () {
    this._resources = [];
  }

  this.add = function (opts) {
    this._resources.push(new Resource(opts));
  }

  this.write = function (targetDirectory, appPath, cb) {
    write(this._resources.slice(0), targetDirectory, appPath).nodeify(cb);
  }

  this.getHashes = function (targetDirectory, appPath, cb) {
    var f = ff(function () {
      var hashes = {};
      f(hashes);

      this._resources.forEach(function (res) {
        var next = f.waitPlain();
        var targetPath = path.join(this._targetDirectory, res.target);
        etags.hash(targetPath, function (err, md5) {
          if (!err) {
            hashes[targetPath] = md5;
          }
          next();
        });
      });
    }).cb(cb);
  }

  this.writeSourceMap = function (targetDirectory, imageSourceMap, cb) {
    fs.writeFile(path.join(targetDirectory, 'resource_source_map.json'), JSON.stringify(merge(imageSourceMap, this.toSourceMap())), cb);
  }

  this.toSourceMap = function () {
    var res = {};
    this._resources.forEach(function (resource) {
      if (resource.target && resource.copyFrom) {
        res[resource.target] = resource.copyFrom;
      }
    });
    return res;
  }
});

var mkdirp = Promise.promisify(mkdirp);
var writeFile = Promise.promisify(fs.writeFile);

function write(resources, targetDirectory, appPath) {
  return Promise.map(resources, function (resource) {
    var targetFile = path.join(targetDirectory, resource.target);
    return mkdirp(path.dirname(targetFile)).then(function () {
      if ('contents' in resource) {
        return writeFile(targetFile, resource.contents);
      } else if (resource.copyFrom && resource.copyFrom != targetFile) {
        var cmd = printf('cp -p "%(src)s" "%(dest)s"', {
          src: resource.copyFrom,
          dest: targetFile
        });

        return new Promise(function (resolve, reject) {
          exec(cmd, {cwd: this._appPath}, function (err, stdout, stderr) {
            if (err && err.code != 1) {
              console.log(JSON.stringify(code));
              reject(new Error('code ' + code + '\n' + stdout + '\n' + stderr));
            } else {
              resolve();
            }
          });
        });
      }
    });
  }, {concurrency: 8});
}
