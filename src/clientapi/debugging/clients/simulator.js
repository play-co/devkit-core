exports = new (Class(function () {

  var dispatchWindowEvent = function(eventName) {
    var e = document.createEvent('Event');
    e.initEvent(eventName, true, true);
    window.dispatchEvent(e);
  };

  this.setConn = function (conn) {
    if (this._client) { this._client.end(); }

    var client = conn.getClient('simulator');
    this._client = client;

    this._isHomeScreen = false;
    client.onEvent('HOME_BUTTON', bind(this, function () {
      var app = GC.app;

      this._isHomeScreen = !this._isHomeScreen;
      if (this._isHomeScreen) {
        dispatchWindowEvent('pagehide');
        app.engine.pause();

        var canvas = document.getElementsByTagName('canvas');
        if (canvas.length) {
          canvas = canvas[0];
          if (canvas.getContext) {
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
      } else {
        dispatchWindowEvent('pageshow');
        app.engine.resume();
      }
    }));

    client.onEvent('BACK_BUTTON', bind(this, function (evt) {
      GLOBAL.NATIVE.onBackButton && GLOBAL.NATIVE.onBackButton(evt);
    }));

    client.onRequest('SCREENSHOT', bind(this, function (req) {
      _DEBUG && _DEBUG.screenshot(function (err, res) {
        if (err) {
          req.error(err);
        } else {
          req.respond(res);
        }
      });
    }));

    client.onEvent('MUTE', bind(this, function (evt) {
      console.log('MUTE', evt.args.shouldMute);
      GC.app.muteAll(evt.args.shouldMute);
    }));

    this._isPaused = false;
    client.onEvent('PAUSE', bind(this, function () {
      console.log("PAUSED")
      if (!GC) { return; }

      this.setPaused(true);
    }));

    client.onEvent('RESUME', bind(this, function () {
      if (!GC) { return; }

      this.setPaused(false);
    }));

    client.onEvent('STEP', bind(this, function () {
      if (!GC) return;
      var app = GC.app;

      app.engine.stepFrame();
      _paused = true;
    }));

  }

  this.setPaused = function (isPaused) {
    this._isPaused = isPaused;

    var app = GC.app;
    if (this._isPaused) {
      app.engine.pause();
    } else {
      app.engine.resume();
    }
  }
}))();
