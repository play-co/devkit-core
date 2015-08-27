var Duplex = require('readable-stream').Duplex;

exports.createStreamWrapper = function () {
  return new WrapStreams();
};

function WrapStreams() {
  Duplex.call(this, {objectMode: true});

  var onData = function (chunk, encoding) {
    this.push(chunk, encoding);
  }.bind(this);

  var onEnd = function () {
    this.push(null);
  }.bind(this);

  this.on('finish', function () {
    this._firstStream.end();
  });

  this.once('pipe', function () {
    this._lastStream.on('data', onData);
    this._lastStream.on('end', onEnd);
  }.bind(this));
};

WrapStreams.prototype = Object.create(Duplex.prototype);

WrapStreams.prototype.wrap = function (stream) {
  if (!this._firstStream) {
    this._firstStream = stream;
    this._lastStream = stream;
  } else {
    this._lastStream = this._lastStream.pipe(stream);
  }

  stream.on('error', function (err) {
    this.emit('error', err);
  }.bind(this));

  return this;
};

WrapStreams.prototype._write = function (chunk, encoding, cb) {
  // forward chunks into the first stream
  this._firstStream.write(chunk, encoding);
  cb();
};

WrapStreams.prototype._read = function () {

};
