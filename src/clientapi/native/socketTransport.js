/**
 * @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */

jsio('import net.interfaces')
jsio('import .reader')

function onError(opts) {
	logger.log('SOCKET ERROR: ', JSON.stringify(opts));
}

var sockets = {};

NATIVE.events.registerHandler('socketOpened', function (evt) {
	var socket = sockets[evt.id];
	if (socket) {
		socket.onConnect();
	}

});
NATIVE.events.registerHandler('socketClosed', function (evt) {
	var socket = sockets[evt.id];
	if (socket) {
		socket.onClose();
	}
	delete sockets[evt.id];
});

NATIVE.events.registerHandler('socketError', function (evt) {
	var socket = sockets[evt.id];
	if (socket) {
		socket.onError(evt.message);
	}
});

NATIVE.events.registerHandler('socketRead', function (evt) {
	var socket = sockets[evt.id];
	if (socket) {
		socket.reader.read(evt.data);
	}
});


exports.Transport = Class(net.interfaces.Transport, function () {
	this.init = function (socket) {
		this._socket = socket;
	}
	
	this.makeConnection = function (protocol) {
		this._socket.onRead  = function (data) {
			try { 
				protocol.dataReceived.apply(protocol, arguments); 
			} catch (e) { 
				logger.log(e, e.stack, arguments[0])
			}
		};

		this._socket.onError = bind(protocol, 'onError');
		this._socket.onClose = bind(protocol, 'connectionLost');
	}
	
	this.write = function (data) {
		this._socket.send(data);
	}

	this.loseConnection = function () {
		this._socket.close();
	}
});

//TODO add timeout

exports.Socket = function (host, port) {
	var socket = new NATIVE.Socket(host, port);
	socket.reader = new reader.Reader(bind(socket, 'onRead'));
	sockets[socket.__id] = socket;
	return socket;
}

exports.Connector = Class('ios.socket', net.interfaces.Connector, function () {
	this.connect = function () {
		this._state = net.interfaces.STATE.CONNECTING;
		
		var host = this._opts.host,
			port = this._opts.port,
			timeout = this._opts.connectTimeout,
			socket = new exports.Socket(host, port, timeout);
		
	    logger.log('connecting to', host, port, timeout);
		socket.onConnect = bind(this, 'onSocketConnect', socket);
		socket.onError = bind(this, function (err) {
			logger.error(err);
			this.onDisconnect();
		});
	}
	
	this.onSocketConnect = function (socket) {
	    logger.log('connected!')
		this.onConnect(new exports.Transport(socket));
	}
});

