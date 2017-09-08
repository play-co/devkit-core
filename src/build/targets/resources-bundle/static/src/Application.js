import device;
import weeby;

exports = Class(weeby.Application, function(supr) {
  this._settings = {
    alwaysRepaint: true,
    logsEnabled: true,
    showFPS: false
  };

  this.initUI = function() {};
});
