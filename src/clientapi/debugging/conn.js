import lib.PubSub;

import net;
import .TargetCuppa;

var _conn;
if (DEBUG) {
  var DevKitConnection = Class(TargetCuppa, function (supr) {
    this.connectionMade = function () {

      this.sendEvent('HANDSHAKE', merge({
        type: 'device',
        appTitle: CONFIG.title,
        appId: CONFIG.appID,
        bundleId: CONFIG.bundleID
      }, this._handshakeOpts));

      supr(this, 'connectionMade', arguments);
    }

    this.connect = function (opts, cb) {
      if (typeof opts == 'function') {
        cb = opts;
        opts = null;
      }

      this._handshakeOpts = opts.handshake;

      var transport = opts && opts.transport;
      var connectOpts = opts && opts.opts;

      if (!transport) {
        if (window.parent != window) {
          // in iframe
          transport = 'postmessage';
          connectOpts = {
            port: 'devkit-simulator',
            win: window.parent
          };
        } else {
          // assume we're on a mobile device
          // transport = 'csp';
          // connectOpts = {
          //   url: '/devices/'
          // };

          transport = 'socketio';
          connectOpts = {
            namespace: '/devices/'
          };
        }
      }

      this.onConnect(bind(GLOBAL, cb));
      net.connect(this, transport, connectOpts);
    };

  });

  exports = new DevKitConnection();

}
