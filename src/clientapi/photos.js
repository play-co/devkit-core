/* global NATIVE, Class, logger */
import {
  logger,
  NATIVE,
  GLOBAL,
  bind
} from 'base';

import device from 'device';
import PubSub from 'lib/PubSub';


var _pendingPhoto;


var PhotosAPI = Class(PubSub, function () {
  this._onUploadFile = function (evt) {
    if (!evt || !evt.target || !evt.target.files) {
      return;
    }


    var file = evt.target.files[0];
    if (!/^image\//.test(file.type)) {
      alert('Sorry, that doesn\'t look like a valid image');
    } else {
      this.emit('photoLoading');

      var reader = new FileReader();
      reader.onload = function (evt) {
        var pending = _pendingPhoto;
        var result = evt.target.result;
        if (!result) {
          pending.reject(new Error('No image found'));
        } else {
          var res = { data: result.substring(5) };

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
      var nativeSource = preferGallery && this.hasNativeGallery ? 'gallery' : this.hasNativeCamera ? 'camera' : 'none';

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



      _pendingPhoto = {
        resolve: resolve,
        reject: reject
      };
    }.bind(this));
  };
});


PhotosAPI.prototype.hasNativeCamera = NATIVE && NATIVE.camera;
PhotosAPI.prototype.hasNativeGallery = NATIVE && NATIVE.gallery;
PhotosAPI.prototype._input = { camera: GLOBAL.document && document.createElement && document.createElement('input') };
PhotosAPI.prototype.hasFileUpload = !!PhotosAPI.prototype._input.camera && window.File && window.FileReader && window.FileList && window.Blob;


if (PhotosAPI.prototype.hasNativeCamera || PhotosAPI.prototype.hasNativeGallery) {
  NATIVE.events.registerHandler('PhotoBeginLoaded', function (data) {
    if (_pendingPhoto) {
      PhotosAPI.prototype.emit('photoLoading', data);
    }
  }.bind(PhotosAPI.prototype));

  NATIVE.events.registerHandler('PhotoLoaded', function (data) {
    if (_pendingPhoto) {
      var resolve = _pendingPhoto.resolve;
      _pendingPhoto = null;
      resolve(data);
      PhotosAPI.prototype.emit('photoLoaded', data);
    }
  }.bind(PhotosAPI.prototype));
}


if (PhotosAPI.prototype.hasFileUpload) {
  PhotosAPI.prototype._input.camera.type = 'file';
  PhotosAPI.prototype._input.camera.setAttribute('accept', 'image/*;capture=camera');

  PhotosAPI.prototype._input.gallery = document.createElement('input');
  PhotosAPI.prototype._input.gallery.type = 'file';
  PhotosAPI.prototype._input.gallery.setAttribute('accept', 'image/*;capture=gallery');

  if (window.document && document.body) {
    var form = document.createElement('form');
    form.appendChild(PhotosAPI.prototype._input.camera);
    form.appendChild(PhotosAPI.prototype._input.gallery);
    form.style.cssText = 'position:absolute;width:1px;height:1px;visibility:hidden;top:-1px;left:-1px;overflow:hidden';
    document.body.appendChild(form);

    PhotosAPI.prototype._input.camera.addEventListener('change', bind(PhotosAPI.prototype, '_onUploadFile'));
    PhotosAPI.prototype._input.gallery.addEventListener('change', bind(PhotosAPI.prototype, '_onUploadFile'));
  }
}




module.exports = new PhotosAPI();
