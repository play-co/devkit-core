import jsio.lib.PubSub;
import jsio.util.setProperty as setProperty;

var DOMException = function () {
  Error.apply(this, arguments);
};

DOMException.prototype = Object.create(Error.prototype);

var HTMLElement = exports = Class(jsio.lib.PubSub, function () {

  this.init = function () {
    this.childNodes = [];
  };

  this.setAttribute = function (name, value) {
    if (!this._html_attrs) { this._html_attrs = {}; }

    this._html_attrs[name] = '' + value;
  };

  this.getAttribute = function (name) {
    var value = this._html_attrs && this._html_attrs[name];
    if (typeof value == 'string') {
      return value;
    }

    return '';
  };

  this.addEventListener = function (type, callback, useCapture) { this.subscribe(type, this, callback); }
  this.removeEventListener = function (type, callback, useCapture) { this.unsubscribe(type, this, callback); }

  setProperty(this, 'style', {
    get: function () {
      return this._style || (this._style = {});
    },
    set: function () {

    }
  });

  this.appendChild = function (node) {
    var parent = this.parentNode;
    while (parent) {
      if (parent === node) {
        throw new DOMException("Failed to execute 'appendChild' on 'Node': The new child element contains the parent.");
      }

      parent = parent.parentNode;
    }

    if (node.parentNode) { node.parentNode.removeChild(node); }
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  };

  this.removeChild = function (node) {
    var index = this.childNodes.indexOf(node);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
      node.parentNode = null;
    }
  };

  this.insertBefore = function (node, before) {
    var parent = this.parentNode;
    while (parent) {
      if (parent === node) {
        throw new DOMException("Failed to execute 'insertBefore' on 'Node': The new child element contains the parent.");
      }

      parent = parent.parentNode;
    }

    if (node.parentNode) { node.parentNode.removeChild(node); }

    var index = this.childNodes.indexOf(before);
    if (index === -1) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(index, 0, node);
    }

    return node;
  };
});

window.HTMLElement = HTMLElement;
