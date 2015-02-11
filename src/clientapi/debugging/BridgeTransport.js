import lib.PubSub as EventEmitter;
import nextTick;

/**
 * The BridgeTransport creates two Transport objects that look like vaguely
 * like socket.io connections (have `.on` and `.emit`) where `.emit` on
 * transport A fires events on transport B.
 *
 * All events fire in the next tick to simulate a true connection and prevent
 * unexpected race conditions.
 */
module.exports = Class(function () {
  this.init = function () {
    this.a = new Transport();
    this.b = new Transport();
    this.a.target = this.b;
    this.b.target = this.a;
  }

  var Transport = Class(EventEmitter, function (supr) {
    this.emit = function (name, data) {
      nextTick(EventEmitter.prototype.emit.bind(this.target, name, data));
    }
  });
});
