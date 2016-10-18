let exports = {};

import { logger } from 'base';

import PubSub from 'lib/PubSub';


class Response {
  constructor(channel, id) {
    this.channel = channel;
    this.id = id;
    this.responded = false;
  }
  error(err) {
    if (this.responded) {
      return;
    }
    this.responded = true;
    this.channel._send({
      error: err,
      res: this.id
    });
  }
  send(data) {
    if (this.responded) {
      return;
    }
    this.responded = true;
    this.channel._send({
      data: data,
      res: this.id
    });
  }
}


var reqId = 0;


exports = class extends PubSub {
  constructor(name) {
    super();

    this._name = name;
    this._requests = {};

    this._onTransportConnect = this._onTransportConnect.bind(this);
    this._onTransportDisconnect = this._onTransportDisconnect.bind(this);
    this._onTransportMessage = this._onTransportMessage.bind(this);
  }
  connect() {
    return new Promise(function (resolve, reject) {
      if (this._isConnected) {
        resolve();
      } else {
        this.once('connect', resolve);
      }
    }.bind(this));
  }
  isConnected() {
    return this._isConnected;
  }
  close() {
    this._sendInternalMessage('disconnect');
  }
  setTransport(transport) {
    if (this._transport && this._transport != transport) {
      // tear-down an old transport
      this._transport.removeListener('disconnect', this._onTransportDisconnect).removeListener('connect', this._onTransportConnect).removeListener(this._name, this._onTransportMessage);
    }




    this._transport = transport;
    if (transport) {
      transport.on('disconnect', this._onTransportDisconnect).on('connect', this._onTransportConnect).on(this._name, this._onTransportMessage);

      // start connect handshake
      this._onTransportConnect();
    }
  }
  _onTransportConnect() {
    // transport connected, start a connect handshake (see if anyone is listening)
    this._sendInternalMessage('connect');
  }
  _onTransportDisconnect() {
    this._isConnected = false;
  }
  _onTransportMessage(msg) {
    if (msg.internal) {
      this._onInternalMessage(msg.internal);
    } else if (msg.res) {
      if (msg.error) {
        this._requests[msg.res].reject(msg.error);
      } else {
        this._requests[msg.res].resolve(msg.data);
      }
    } else if (msg.id) {
      super.emit(msg.name, msg.data, new Response(this, msg.id));
    } else {
      super.emit(msg.name, msg.data);
    }
  }
  _sendInternalMessage(name) {
    if (this._transport) {
      this._transport.emit(this._name, { internal: name });
    }
  }
  _onInternalMessage(msg) {
    // handle internal message protocol, used to determine if the receiver channel is listening to events
    switch (msg) {
    case 'connect':
      // complete the channel connection
      this._sendInternalMessage('connectConfirmed');




    // fall-through
    case 'connectConfirmed':
      this._isConnected = true;
      this._emit('connect');
      break;
    case 'disconnect':
      this._isConnected = false;
      this._emit('disconnect');
      break;
    }
  }
  _send(data) {
    if (this._transport) {
      this._transport.emit(this._name, data);
    } else {
      logger.warn(this._name, 'failed to send', data);
    }
  }
  _emit(name, data) {
    super.emit(...arguments);
  }
  emit(name, data) {
    if (name == 'newListener') {
      return this._emit(name, data);
    }
    this._send({
      name: name,
      data: data
    });
  }
  request(name, data) {
    return this.connect().bind(this).then(function () {
      var id = ++reqId;
      this._send({
        name: name,
        data: data,
        id: id
      });
      return new Promise(function (resolve, reject) {
        this._requests[id] = {
          resolve: resolve,
          reject: reject
        };
      }.bind(this));
    });
  }
};


exports.prototype._isConnected = false;
exports.prototype.disconnect = exports.prototype.close;


export default exports;
