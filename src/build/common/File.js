var path = require('path');
module.exports = Class(function () {
  // utility function to replace any windows path separators for paths that
  // will be used for URLs
  var regexSlash = /\\/g;
  function useURISlashes (str) { return str.replace(regexSlash, "/"); }

  this.init = function (opts) {
    this.ext = path.extname(opts.fullPath);
    this.basename = path.basename(opts.fullPath, this.ext);
    this.fullPath = opts.fullPath;
    this.target = useURISlashes(opts.target);
  }
});
