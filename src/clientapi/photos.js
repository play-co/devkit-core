/* global Class, logger */
import {
  logger,
  GLOBAL,
  bind
} from 'base';

import device from 'device';
import PubSub from 'lib/PubSub';

var _pendingPhoto;

class PhotosAPI extends PubSub {
  _onUploadFile (evt) {
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
  }
  getPhoto (opts) {
    if (_pendingPhoto) {
      logger.warn(
        'can only request one photo at a time, cancelling other request');
      _pendingPhoto.reject(new Error(
        'another photo request interrupted this one'));
    }

    var preferGallery = opts && opts.source == 'gallery';

    return new Promise(function (resolve, reject) {
      if (this.hasFileUpload) {
        var input = this._input[opts && opts.source] || this._input.camera;
        input.click();
      }

      _pendingPhoto = {
        resolve: resolve,
        reject: reject
      };
    }.bind(this));
  }
}

PhotosAPI.prototype._input = { camera: GLOBAL.document && document.createElement &&
    document.createElement('input') };
PhotosAPI.prototype.hasFileUpload = !!PhotosAPI.prototype._input.camera &&
  window.File && window.FileReader && window.FileList && window.Blob;

if (PhotosAPI.prototype.hasFileUpload) {
  PhotosAPI.prototype._input.camera.type = 'file';
  PhotosAPI.prototype._input.camera.setAttribute('accept',
    'image/*;capture=camera');

  PhotosAPI.prototype._input.gallery = document.createElement('input');
  PhotosAPI.prototype._input.gallery.type = 'file';
  PhotosAPI.prototype._input.gallery.setAttribute('accept',
    'image/*;capture=gallery');

  if (window.document && document.body) {
    var form = document.createElement('form');
    form.appendChild(PhotosAPI.prototype._input.camera);
    form.appendChild(PhotosAPI.prototype._input.gallery);
    form.style.cssText =
      'position:absolute;width:1px;height:1px;visibility:hidden;top:-1px;left:-1px;overflow:hidden';
    document.body.appendChild(form);

    PhotosAPI.prototype._input.camera.addEventListener('change', bind(PhotosAPI
      .prototype, '_onUploadFile'));
    PhotosAPI.prototype._input.gallery.addEventListener('change', bind(
      PhotosAPI.prototype, '_onUploadFile'));
  }
}

module.exports = new PhotosAPI();
