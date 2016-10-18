let exports = {};

import {
  logger,
  NATIVE,
  GLOBAL
} from 'base';

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
var state = {
  'UNSENT': 0,
  'OPENED': 1,
  'HEADERS_RECEIVED': 2,
  'LOADING': 3,
  'DONE': 4
};

class XMLHttpRequest {
  constructor() {
    this.readyState = state.UNSENT;
    this.responseText = null;
    this._requestHeaders = {};
    this.__id = id;
  }
  open(method, url, async) {
    this._method = method;
    this._url = '' + url;
    this._async = async || false;
    this.readyState = state.OPENED;
    this.status = 0;

    if (!this._async) {
      logger.warn('synchronous xhrs not supported');
    }
  }
  getResponseHeader(name) {
    return this._responseHeadersLowerCase[name.toLowerCase()];
  }
  getAllResponseHeaders() {
    var lines = [];
    var headers = this._responseHeaders;
    for (var key in headers) {
      if (!headers.hasOwnProperty(key)) {
        continue;
      }
      lines.push(key + ': ' + headers[key]);
    }
    return lines.join('\r\n');
  }
  setRequestHeader(name, value) {
    this._requestHeaders[name] = value;
  }
  send(data) {
    this._data = data || '';
    xhrs[id++] = this;
    NATIVE.xhr.send(this._method, this._url, this._async, this._data, 0, this.__id, this._requestHeaders);
  }
  uploadFile(filename) {
    this._filename = filename;
    xhrs[id++] = this;
    NATIVE.xhr.uploadFile(this.__id, this._filename, this._url, this._async, this._requestHeaders);
  }
  _onreadystatechange(state, status, response) {
    this.readyState = state;
    this.status = status;
    this.responseText = response || null;
    this.response = response || null;
    if (typeof this.onreadystatechange === 'function') {
      this.onreadystatechange();
    }
  }
  onreadystatechange() {
  }
}

var xhrs = {};
var id = 0;

exports.install = function () {
  GLOBAL.XMLHttpRequest = XMLHttpRequest;
  NATIVE.events.registerHandler('xhr', function (evt) {
    var xhr = xhrs[evt.id];
    if (xhr) {
      var headers = {};
      var headersLowercase = {};
      for (var i = 0, len = evt.headerKeys.length; i < len; i++) {
        headersLowercase[evt.headerKeys[i].toLowerCase()] = headers[evt.headerKeys[i]] = evt.headerValues[i];
      }
      xhr._responseHeaders = headers;
      xhr._responseHeadersLowerCase = headersLowercase;
      xhr._onreadystatechange(evt.state, evt.status, evt.response);
    }
    delete xhrs[evt.id];
  });

};

export default exports;
