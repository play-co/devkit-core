/* global NATIVE, Class, logger */

import device;
import lib.PubSub;

var PhotosAPI = Class(lib.PubSub, function () {
  this.hasNativeCamera = NATIVE && NATIVE.camera;
  this.hasNativeGallery = NATIVE && NATIVE.gallery;
  this._input = {
    camera: GLOBAL.document && document.createElement && document.createElement('input')
  };
  this.hasFileUpload = !!this._input.camera && window.File && window.FileReader && window.FileList && window.Blob;

  var _pendingPhoto;

  if (this.hasNativeCamera || this.hasNativeGallery) {
    NATIVE.events.registerHandler('PhotoBeginLoaded', function (data) {
      if (_pendingPhoto) {
        this.emit('photoLoading', data);
      }
    }.bind(this));

    NATIVE.events.registerHandler('PhotoLoaded', function (data) {
      if (_pendingPhoto) {
        var resolve = _pendingPhoto.resolve;
        _pendingPhoto = null;
        resolve(data);
        this.emit('photoLoaded', data);
      }
    }.bind(this));
  }

  if (this.hasFileUpload) {
    this._input.camera.type = 'file';
    this._input.camera.setAttribute('accept', 'image/*;capture=camera');

    this._input.gallery = document.createElement('input');
    this._input.gallery.type = 'file';
    this._input.gallery.setAttribute('accept', 'image/*;capture=gallery');

    if (window.document && document.body) {

      var form = document.createElement('form');
      form.appendChild(this._input.camera);
      form.appendChild(this._input.gallery);
      form.style.cssText = 'position:absolute;width:1px;height:1px;visibility:hidden;top:-1px;left:-1px;overflow:hidden';
      document.body.appendChild(form);

      this._input.camera.addEventListener('change', bind(this, '_onUploadFile'));
      this._input.gallery.addEventListener('change', bind(this, '_onUploadFile'));
    }
  }

  this._onUploadFile = function (evt) {
    if (!evt || !evt.target || !evt.target.files) { return; }

    var file = evt.target.files[0];
    if (!/^image\//.test(file.type)) {
      alert("Sorry, that doesn't look like a valid image");
    } else {
      this.emit('photoLoading');

      var reader = new FileReader();
      reader.onload = function (evt) {
        var pending = _pendingPhoto;
        var result = evt.target.result;
        if (!result) {
          pending.reject(new Error('No image found'));
        } else {
          var res = {
            data: result.substring(5)
          };

          pending.resolve(res);
          this.emit('photoLoaded', res);
        }
      }.bind(this);

      reader.readAsDataURL(file);
    }
  };

  this.getPhoto = function (opts) {
    if (_pendingPhoto) {
      logger.warn('can only request one photo at a time, cancelling other request');
      _pendingPhoto.reject(new Error('another photo request interrupted this one'));
    }

    var preferGallery = opts && opts.source == 'gallery';

    return new Promise(function (resolve, reject) {
      var nativeSource = (preferGallery && this.hasNativeGallery
        ? 'gallery'
        : this.hasNativeCamera
          ? 'camera'
          : 'none');

      if (nativeSource !== 'none') {
        var args = ['photo' + Date.now()];

        // ios requires width, height, crop/no-crop
        if (device.isIOS) {
          args.push(128, 128, 1);
        }

        var api = NATIVE[nativeSource];
        api.getPhoto.apply(api, args);
      } else if (this.hasFileUpload) {
        var input = this._input[opts && opts.source] || this._input.camera;
        input.click();
      }

      _pendingPhoto = {resolve: resolve, reject: reject};
    }.bind(this));
  };
});

module.exports = new PhotosAPI();

