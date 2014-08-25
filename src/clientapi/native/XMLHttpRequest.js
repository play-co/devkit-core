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

var XMLHttpRequest = Class(function () {
	var state = {
		"UNSENT": 0,
		"OPENED": 1,
		"HEADERS_RECEIVED": 2,
		"LOADING": 3,
		"DONE": 4
	};
	this.init = function () {
		this.readyState = state.UNSENT;
		this.responseText = null;
		this._requestHeaders = {};
		this.__id = id;
	}

	this.open = function (method, url, async) {
		this._method = method;
		this._url = '' + url;
		this._async = async || false;
		this.readyState = state.OPENED;
		this.status = 0;

		if (!this._async) {
			logger.warn("synchronous xhrs not supported");
		}
	}

	this.getResponseHeader = function (name) { return this._responseHeaders[name]; }

	this.getAllResponseHeaders = function () { return this._responseHeaders; }
	
	this.setRequestHeader = function (name, value) {
		this._requestHeaders[name] = value;
	}

	this.send = function (data) {
		this._data = data || "";
		xhrs[id++] = this;
		NATIVE.xhr.send(this._method, this._url, this._async, this._data, 0, this.__id, this._requestHeaders);
	}

	this.uploadFile = function (filename) {
		this._filename = filename;
		xhrs[id++] = this;
		NATIVE.xhr.uploadFile(this.__id, this._filename, this._url, this._async, this._requestHeaders);
	}

	this._onreadystatechange = function (state, status, response) {
		this.readyState = state;
		this.status = status;
		this.responseText = response || null;
        this.response = response || null;
		if (typeof this.onreadystatechange === 'function') {
			this.onreadystatechange();
		}
	}

	this.onreadystatechange = function () {}
});

var xhrs = {};
var id = 0;

exports.install = function () {
	GLOBAL.XMLHttpRequest = XMLHttpRequest;
	NATIVE.events.registerHandler('xhr', function (evt) {
		var xhr = xhrs[evt.id];
		if (xhr) {
			var headers = {};
			for(var i = 0, len = evt.headerKeys.length; i < len; i++) {
				headers[evt.headerKeys[i]] = evt.headerValues[i];
			}
			xhr._responseHeaders = headers;
			xhr._onreadystatechange(evt.state, evt.status, evt.response);
		}
		delete xhrs[evt.id];
	});

}
