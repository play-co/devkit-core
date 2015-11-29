import device;

exports.screenshot = function (cb) {
  var canvas = GC.app.engine.getElement();

  var Canvas = device.get('Canvas');
  var _debugCanvas = new Canvas({
      width: canvas.width,
      height: canvas.height
    });

  if (_debugCanvas && _debugCanvas.toDataURL) {
    var ctx = _debugCanvas.getContext('2d');
    var reDomain = /^https?:\/\/(.*?)\//;
    var origDrawImage = ctx.drawImage;
    ctx.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
      var match = img.src && img.src.match(reDomain);
      if (match && match[1] != location.host) {
        if (dw != undefined && dh != undefined) {
          this.drawBrokenImage(dx, dy, dw, dh);
        } else if (dx != undefined) {
          this.drawBrokenImage(dx, dy, sw, sh);
        } else if (sw != undefined) {
          this.drawBrokenImage(sx, sy, sw, sh);
        } else {
          this.drawBrokenImage(sx, sy, img.width, img.height);
        }
      } else {
        origDrawImage.apply(this, arguments);
      }
    };

    ctx.drawBrokenImage = function (x, y, w, h) {
      var lineWidth = 6;
      x = x || 0;
      y = y || 0;
      if (w && h) {
        this.save();
        this.clipRect(x, y, w, h);
        this.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.fillRect(x, y, w, h);
        this.lineWidth = lineWidth;
        this.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
        this.strokeStyle = 'rgba(255, 0, 0)';
        this.fillStyle = 'red';
        this.font = 'bold 15px Helvetica';
        this.textAlign = 'center';
        this.textBaseline = 'middle';
        this.fillText("X", x + w / 2, y + h / 2);
        this.restore();
      }
    };

    GC.app.engine.getView().__view.wrapRender(ctx, {});

    var base64Image;
    try {
      base64Image = _debugCanvas.toDataURL('image/png');
    } catch (e) {
      cb({
        NOT_SUPPORTED: true,
        error: e
      });
    }

    if (base64Image) {
      cb(null, {
        width: _debugCanvas.width,
        height: _debugCanvas.height,
        base64Image: base64Image
      });
    }
  } else {
    cb({
      NOT_SUPPORTED: true
    });
  }
};
