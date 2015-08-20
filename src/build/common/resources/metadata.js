var fs = require('graceful-fs');
var path = require('path');
var readFile = Promise.promisify(fs.readFile);

var METADATA_JSON = 'metadata.json';

function nonEmptyFilter(a) { return a; }

var metadataCache = {};
var optionCache = {};

exports.get = function (file) {
  var dirname = path.dirname(file.sourceFile);
  if (!(dirname in optionCache)) {
    // compute all parent directories from file.base to file.path
    var parents = path.dirname(file.sourceRelativePath)
      .split(/[\\\/]/)
      .filter(nonEmptyFilter)
      .reduce(function (parents, current, i) {
        parents.push(path.join(parents[i], current));
        return parents;
      }, [file.sourceDirectory]);

    optionCache[dirname] = Promise.map(parents, function (parent) {
        var metadata = path.join(parent, METADATA_JSON);
        if (metadata in metadataCache) {
          return metadataCache[metadata];
        }

        return readFile(metadata)
          .then(function onRead(contents) {
            return (metadataCache[metadata] = JSON.parse(contents));
          })
          .catch(function onError(err) {
            if (err && err.cause && err.cause.code === 'ENOENT') {
              metadataCache[metadata] = false;
            } else {
              console.error('Unable to read metadata file:', metadata, err);
              throw err;
            }
          });
      })
      .then(function (metadatas) {
        return new Options(dirname, metadatas);
      });
  }

  return Promise.resolve(optionCache[dirname]);
};

exports.Options = Options;

function Options(dirname, metadatas) {
  this.dirname = dirname;
  this.rules = [];
  this.values = {};

  if (metadatas) {
    metadatas.forEach(this.add, this);
  }
}

Options.prototype.add = function (metadata) {
  for (var key in metadata) {
    if (key === 'rules') {
      this.rules.push.apply(this.rules, metadata.rules);
    } else {
      this.values[key] = metadata[key];
    }
  }
};

Options.prototype.get = function (filename, prop, buildOpts) {

  var rules = Options.filterRules(this.rules, filename, buildOpts);
  var n = rules.length;
  for (var i = n - 1; i >= 0; --i) {
    if (prop in rules[i]) {
      return rules[i][prop];
    }
  }

  return this.values[prop];
};

Options.filterRules = function (rules, filename, buildOpts) {
  return rules.filter(function (rule) {
    return (!buildOpts
        || (!rule['cond-buildMode']
          || rule['cond-buildMode'] === buildOpts.scheme)

        && (!rule['cond-target']
          || rule['cond-target'] === buildOpts.target))

      && (!rule['cond-fileList']
          // exact match
          || rule['cond-fileList'].indexOf(filename) >= 0
          // filtered length
          || rule['cond-fileList'].filter(function (match) {
            var n = match.length;
            return match === filename.substring(0, n)
              && (filename[n] == '/' || filename[n] == '\\');
          }).length);
  });
};
