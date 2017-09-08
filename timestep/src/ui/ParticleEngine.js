let exports = {};

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
/**
 * @class ui.ParticleEngine;
 */
import {
  delay,
  logger
} from 'base';

import View from 'ui/View';
import Image from 'ui/resource/Image';
import performance from 'performance';

// Math references
var sin = Math.sin;
var cos = Math.cos;
var min = Math.min;
var max = Math.max;

// class-wide image cache
var imageCache = {};

// animation transtion functions borrowed from animate
var TRANSITION_LINEAR = 'linear';
var TRANSITIONS = {
  linear: function (n) {
    return n;
  },
  easeIn: function (n) {
    return n * n;
  },
  easeInOut: function (n) {
    return (n *= 2) < 1 ? 0.5 * n * n * n : 0.5 * ((n -= 2) * n * n + 2);
  },
  easeOut: function (n) {
    return n * (2 - n);
  }
};

class ParticleStyle {
  consturctor () {
    this.x = 0;
    this.y = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.anchorX = 0;
    this.anchorY = 0;
    this.centerAnchor = false;
    this.width = 0;
    this.height = 0;
    this.r = 0;
    this.opacity = 1;
    this.scale = 1;
    this.scaleX = 1;
    this.scaleY = 1;
    this.flipX = false;
    this.flipY = false;
    this.visible = true;
  }
}

class Particle {
  constructor (image) {
    this.image = image;
    this.style = new ParticleStyle();

    this.reset();
  }

  reset () {
    this.x = 0;
    this.y = 0;
    this.r = 0;
    this.anchorX = 0;
    this.anchorY = 0;
    this.width = 1;
    this.height = 1;
    this.scale = 1;
    this.dscale = 0;
    this.ddscale = 0;
    this.scaleX = 1;
    this.dscaleX = 0;
    this.ddscaleX = 0;
    this.scaleY = 1;
    this.dscaleY = 0;
    this.ddscaleY = 0;
    this.dx = 0;
    this.dy = 0;
    this.dr = 0;
    this.danchorX = 0;
    this.danchorY = 0;
    this.ddx = 0;
    this.ddy = 0;
    this.ddr = 0;
    this.ddanchorX = 0;
    this.ddanchorY = 0;
    this.dwidth = 0;
    this.dheight = 0;
    this.ddwidth = 0;
    this.ddheight = 0;
    this.opacity = 1;
    this.dopacity = 0;
    this.ddopacity = 0;
    this.ttl = 1000;
    this.delay = 0;
    this.flipX = false;
    this.flipY = false;
    this.visible = false;
    this.polar = false;
    this.ox = 0;
    this.oy = 0;
    this.theta = 0;
    this.radius = 0;
    this.dtheta = 0;
    this.dradius = 0;
    this.ddtheta = 0;
    this.ddradius = 0;
    this.elapsed = 0;
    this.compositeOperation = null;
    this.transition = TRANSITION_LINEAR;
    this.onStart = null;
    this.triggers = [];

    return this;
  }
}

/**
 * @extends ui.View
 */
exports = class extends View {
  constructor (opts) {
    opts = opts || {};
    // particle engines don't allow input events
    opts.canHandleEvents = false;
    opts.blockEvents = true;
    super(opts);

    // container array for particle objects about to be emitted
    this._particleDataArray = [];

    // recycled and active particle views
    this._freeParticles = [];
    this._activeParticles = [];

    // pre-initialization
    var initCount = opts.initCount;
    initCount && this._initParticlePool(initCount);
    this._logViewCreation = initCount > 0;
  }

  render (ctx) {
    // console.error('rendering particle engine', this._activeParticles.length)
    for (var p = 0; p < this._activeParticles.length; p += 1) {
      var particle = this._activeParticles[p];
      var style = particle.style;
      particle.image.renderShort(ctx, 0, 0, style.width, style.height);
    }
  }

  _initParticlePool (count) {
    for (var i = 0; i < count; i++) {
      this._freeParticles.push(new Particle());
    }
  }
  obtainParticleArray (count, opts) {
    opts = opts || {};

    count = performance.getAdjustedParticleCount(count, opts.performanceScore,
      opts.allowReduction);

    for (var i = 0; i < count; i++) {
      this._particleDataArray.push(this._freeParticles.pop() || new Particle());
    }
    // OK to use an array here
    return this._particleDataArray;
  }
  emitParticles (particleDataArray) {
    var count = particleDataArray.length;
    var active = this._activeParticles;
    var free = this._freeParticles;
    for (var i = 0; i < count; i++) {
      // get particle data object and recycled view if possible
      var data = particleDataArray.pop();
      var particle = free.pop();
      if (!particle) {
        particle = new Particle();
        if (this._logViewCreation) {
          logger.warn(this.getTag(), 'created View:', particle.getTag());
        }
      }

      particle.image = data.image;
      // var image = data.image;
      // if (particle.setImage && particle.lastImage !== image) {
      //   var img = imageCache[image];
      //   if (img === void 0) {
      //     img = imageCache[image] = new Image({ url: image });
      //   }
      //   particle.setImage(img);
      //   particle.lastImage = image;
      // }

      // apply style properties
      var s = particle.style;
      s.x = data.x;
      s.y = data.y;
      s.r = data.r;
      s.anchorX = data.anchorX;
      s.anchorY = data.anchorY;
      s.width = data.width;
      s.height = data.height;
      s.scale = data.scale;
      s.scaleX = data.scaleX;
      s.scaleY = data.scaleY;
      s.opacity = data.opacity;
      s.flipX = data.flipX;
      s.flipY = data.flipY;
      s.compositeOperation = data.compositeOperation;
      s.visible = data.visible;

      for (var property in data) {
        if (particle[property] !== undefined) {
          particle[property] = data[property];
        }
      }

      // start particles if there's no delay
      if (!data.delay) {
        s.visible = true;
        data.onStart && data.onStart(particle);
      } else if (data.delay < 0) {
        throw new Error('Particles cannot have negative delay values!');
      }

      if (data.ttl < 0) {
        throw new Error(
          'Particles cannot have negative time-to-live values!');
      }

      // and finally emit the particle
      this._prepareTriggers(data);
      active.push(particle);
    }
  }
  _prepareTriggers (data) {
    var triggers = data.triggers;
    for (var i = 0, len = triggers.length; i < len; i++) {
      var trig = triggers[i];
      trig.isStyle = trig.isStyle !== void 0 ? trig.isStyle : trig.property
        .charAt(0) !== 'd';
    }
  }
  _killParticle (particle, index) {
    this._activeParticles.splice(index, 1);

    particle.reset();
    particle.style.visible = false;

    this._freeParticles.push(particle);
  }
  killAllParticles () {
    var active = this._activeParticles;
    while (active.length) {
      var particle = active[0];
      this._killParticle(particle, particle.pData, 0);
    }
  }
  runTick (dt) {
    var i = 0;
    var active = this._activeParticles;
    var free = this._freeParticles;
    while (i < active.length) {
      var particle = active[i];
      var s = particle.style;
      var data = particle;

      // handle particle delays
      if (data.delay > 0) {
        data.delay -= dt;
        if (data.delay <= 0) {
          s.visible = true;
          data.onStart && data.onStart(particle);
        } else {
          i++;
          continue;
        }
      }

      // is it dead yet?
      data.elapsed += dt;
      if (data.elapsed >= data.ttl) {
        this._killParticle(particle, i);
        continue;
      }

      // calculate the percent of one second elapsed; deltas are in units / second
      var pct = dt / 1000;
      if (data.transition !== TRANSITION_LINEAR) {
        var getTransitionProgress = TRANSITIONS[data.transition];
        var prgBefore = getTransitionProgress((data.elapsed - dt) / data.ttl);
        var prgAfter = getTransitionProgress(data.elapsed / data.ttl);
        pct = (prgAfter - prgBefore) * data.ttl / 1000;
      }

      // translation
      if (data.polar) {
        data.radius += pct * data.dradius;
        data.theta += pct * data.dtheta;
        data.dradius += pct * data.ddradius;
        data.dtheta += pct * data.ddtheta;
        // allow cartesian translation of the origin point
        data.ox += pct * data.dx;
        data.oy += pct * data.dy;
        data.dx += pct * data.ddx;
        data.dy += pct * data.ddy;
        // polar position
        s.x = data.x = data.ox + data.radius * cos(data.theta);
        s.y = data.y = data.oy + data.radius * sin(data.theta);
      } else {
        // cartesian by default
        var dx = pct * data.dx;
        if (dx !== 0) {
          s.x = data.x += dx;
        }
        var dy = pct * data.dy;
        if (dy !== 0) {
          s.y = data.y += dy;
        }
        data.dx += pct * data.ddx;
        data.dy += pct * data.ddy;
      }

      // anchor translation
      var dax = pct * data.danchorX;
      if (dax !== 0) {
        s.anchorX = data.anchorX += dax;
      }
      var day = pct * data.danchorY;
      if (day !== 0) {
        s.anchorY = data.anchorY += day;
      }
      data.danchorX += pct * data.ddanchorX;
      data.danchorY += pct * data.ddanchorY;

      // stretching
      var dw = pct * data.dwidth;
      if (dw !== 0) {
        s.width = data.width += dw;
      }
      var dh = pct * data.dheight;
      if (dh !== 0) {
        s.height = data.height += dh;
      }
      data.dwidth += pct * data.ddwidth;
      data.dheight += pct * data.ddheight;

      // rotation
      var dr = pct * data.dr;
      if (dr !== 0) {
        s.r = data.r += dr;
      }
      data.dr += pct * data.ddr;

      // scaling
      var ds = pct * data.dscale;
      if (ds !== 0) {
        s.scale = data.scale = max(0, data.scale + ds);
      }
      var dsx = pct * data.dscaleX;
      if (dsx !== 0) {
        s.scaleX = data.scaleX = max(0, data.scaleX + dsx);
      }
      var dsy = pct * data.dscaleY;
      if (dsy !== 0) {
        s.scaleY = data.scaleY = max(0, data.scaleY + dsy);
      }
      data.dscale += pct * data.ddscale;
      data.dscaleX += pct * data.ddscaleX;
      data.dscaleY += pct * data.ddscaleY;

      // opacity
      var dop = pct * data.dopacity;
      if (dop !== 0) {
        s.opacity = data.opacity = max(0, min(1, data.opacity + dop));
      }
      data.dopacity += pct * data.ddopacity;

      // triggers
      var index = 0;
      var triggers = data.triggers;
      while (index < triggers.length) {
        var trig = triggers[index];
        // where can the property be found, style or data?
        var where = trig.isStyle ? s : data;
        if (trig.smaller && where[trig.property] < trig.value) {
          trig.action(particle);
          if (trig.count) {
            trig.count -= 1;
            if (trig.count <= 0) {
              triggers.splice(index, 1);
              index -= 1;
            }
          }
        } else if (!trig.smaller && where[trig.property] > trig.value) {
          trig.action(particle);
          if (trig.count) {
            trig.count -= 1;
            if (trig.count <= 0) {
              triggers.splice(index, 1);
              index -= 1;
            }
          }
        }
        index += 1;
      }
      i += 1;
    }
  }
  getActiveParticles () {
    return this._activeParticles;
  }
  forEachActiveParticle (fn, ctx) {
    var views = this._activeParticles;
    for (var i = views.length - 1; i >= 0; i--) {
      fn.call(ctx, views[i], i);
    }
  }
};

export default exports;
