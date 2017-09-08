import EventEmitter from 'lib/PubSub';
import { bind } from 'base';

var _onTick = window.requestAnimationFrame || window.setTimeout;
function nextTick (cb, ctx) {
  if (ctx) {
    cb = bind(cb, ctx);
  }
  _onTick(cb);
}


class Transport extends EventEmitter {
  emit (name, data) {
    nextTick(EventEmitter.prototype.emit.bind(this.target, name, data));
  }
}

/**
 * The BridgeTransport creates two Transport objects that look like vaguely
 * like socket.io connections (have `.on` and `.emit`) where `.emit` on
 * transport A fires events on transport B.
 *
 * All events fire in the next tick to simulate a true connection and prevent
 * unexpected race conditions.
 */
module.exports = class {
  constructor () {
    this.a = new Transport();
    this.b = new Transport();
    this.a.target = this.b;
    this.b.target = this.a;
  }
};
