exports = Class(function () {
	this.init = function () {
		this._plugins = {};
	}

	this.register = function (name, plugin) {
		this._plugins[name] = plugin;
	}

	this.getPlugin = function (name) {
		return this._plugins[name];
	}
});
