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

// this whole file should not get included in release
if (DEBUG) {
	import net;
	import net.protocols.Cuppa;

	import ._DEBUG;

	var _conn;
	GLOBAL._DEBUG = new _DEBUG();

	exports.getConn = function () { return _conn; }

	exports.connect = function (opts, cb) {
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
				transport = 'csp';
				connectOpts = {
					url: 'http://' + window.location.host + '/plugins/native_debugger/mobile_csp'
				};
			}
		}

		_conn = new DebugConn();
		_conn.onConnect(bind(GLOBAL, cb, _conn));
		net.connect(_conn, transport, connectOpts);

		return _conn;
	}

	var DebugConn = Class(net.protocols.Cuppa, function (supr) {

		this.init = function () {
			supr(this, 'init', arguments);

			this._clients = [];
		}

		this.setApp = function (app) {
			this._clients.forEach(function (client) {
				if (client.setApp) {
					client.setApp(app);
				}
			});
		}

		this.addClient = function (client) {
			this._clients.push(client);
			client.setConn(this);
		}

		this.initLogProxy = function () {
			import .logProxy;
			logProxy.install(this);
		}

		this.initRemoteEval = function () {
			import .remoteEval;
			remoteEval.install(this);
		}
	});

	if ('onerror' in window) {
		window.addEventListener('error', function (e) {
			import squill.Widget;
			var errDialog = new squill.Widget({
				parent: document.body,
				style: {
					position: 'absolute',
					zIndex: 1000,
					background: 'rgba(0, 0, 0, 0.5)',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					padding: '0px 20px',
					top: '0px',
					bottom: '0px',
					left: '0px',
					right: '0px',
					opacity: 0,
					transition: 'opacity 0.5s'
				},
				children: [
					{
						style: {
							background: 'rgba(255, 255, 255, 0.85)',
							padding: '10px 20px 20px',
							borderRadius: '5px',
							border: '3px solid red',
							boxShadow: 'inset 0px 0px 3px black'
						},
						children: [
							{tag: 'h3', text: 'an uncaught error occurred!'},
							{tag: 'div', text: e.message, style: {fontFamily: 'monospace', wordWrap: 'break-word', marginBottom: '10px'}},
							{id: 'halt', type: 'button', text: 'halt'},
							{id: 'resume', type: 'button', text: 'resume'}
						]
					}
				]
			});

			setTimeout(function () {
				errDialog.getElement().style.opacity = 1;
			}, 0);

			errDialog.halt.on('Select', function () {
				errDialog.remove();
			});

			errDialog.resume.on('Select', function () {
				import timer;
				timer.start();
				errDialog.remove();
			});
		});
	}
}
