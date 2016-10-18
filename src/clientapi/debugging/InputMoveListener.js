let exports = {};

import { bind } from 'base';

import device from 'device';
import Emitter from 'event/Emitter';
import dispatch from 'event/input/dispatch';
import Point from 'math/geom/Point';


var _useDOMEvents = device.isSimulator && document.body.addEventListener;


exports = class extends Emitter {
  constructor(opts) {
    super();

    opts = opts || {};

    this._requireShiftClick = !!opts.requireShiftClick;
    this.onMouseMoveCapture = bind(this, this.onMouseMoveCapture);
    this._checkShift = bind(this, this._checkShift);
    this.onContextMenu = bind(this, this.onContextMenu);
  }
  connect() {
    if (_useDOMEvents) {
      window.addEventListener('mousemove', this.onMouseMoveCapture, true);
      window.addEventListener('contextmenu', this.onContextMenu, true);
      window.addEventListener('mousedown', this._checkShift, true);
    }




    GC.app.view.subscribe('InputMoveCapture', this, 'onInputMoveCapture');
    GC.app.view.subscribe('InputStartCapture', this, '_cancelEvent');
    GC.app.view.subscribe('InputSelectCapture', this, 'onInputSelectCapture');
  }
  disconnect() {
    if (_useDOMEvents) {
      window.removeEventListener('mousedown', this._checkShift, true);
      window.removeEventListener('mousemove', this.onMouseMoveCapture, true);
      window.removeEventListener('contextmenu', this.onContextMenu, true);
    }




    GC.app.view.unsubscribe('InputMoveCapture', this, 'onInputMoveCapture');
    GC.app.view.unsubscribe('InputStartCapture', this, '_cancelEvent');
    GC.app.view.unsubscribe('InputSelectCapture', this, 'onInputSelectCapture');
  }
  _cancelEvent(evt) {
    evt.cancel();
  }
  _checkShift(e) {
    if (e.which === 3 || e.button === 2) {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }




    this._shiftDown = !!e.shiftKey;

    if (!GC.app.engine.isRunning()) {
      // get the event to the active target
      var mockEvt = {
        pt: [],
        trace: [],
        depth: 0
      };
      var mockPt = new Point(e.pageX, e.pageY);
      dispatch.traceEvt(GC.app.view, mockEvt, mockPt);

      this.onInputSelectCapture(mockEvt, mockPt);

      e.stopPropagation();
      e.preventDefault();
    }
  }
  onContextMenu(e) {
    var fullTrace = this.getFullTrace(e.pageX, e.pageY);
    if (!fullTrace.trace.length) {
      return;
    }




    this.emit('trace', {
      x: e.pageX,
      y: e.pageY,
      target: fullTrace.target,
      trace: fullTrace.trace
    });

    e.stopPropagation();
    e.preventDefault();
    return false;
  }
  onInputMoveCapture(evt, pt, allEvt, allPt) {
    var fullTrace = this.getFullTrace(pt.x, pt.y);

    var data = {
      x: pt.x,
      y: pt.y,
      target: fullTrace.target,
      evtTrace: evt.trace,
      // trace of just the views that can receive input events
      trace: fullTrace.trace
    };

    // trace of all visible views
    this.emit('move', data);
  }
  onInputSelectCapture(evt, pt) {
    if (!this._requireShiftClick || this._shiftDown) {
      evt.cancel();
      var trace = this.getFullTrace(pt.x, pt.y);
      this.emit('select', trace);
    }
  }
  getFullTrace(x, y) {
    var fullTrace = {
      pt: [],
      trace: [],
      depth: 0
    };
    this._getFullTrace(GC.app.view, fullTrace, new Point(x, y), 0);
    return fullTrace;
  }
  _getFullTrace(view, evt, pt, depth) {
    var localPt = view.style.localizePoint(new Point(pt));

    //if the point is contained add it to the trace
    if (view.containsLocalPoint(localPt)) {
      evt.trace.unshift({
        view: view,
        depth: depth
      });
      evt.pt[view.uid] = localPt;
      if (depth >= evt.depth) {
        evt.depth = depth;
        evt.target = view;
      }
    }




    var subviews = view.getSubviews();
    var n = subviews.length;
    for (var i = 0; i < n; ++i) {
      if (subviews[i].style.visible) {
        this._getFullTrace(subviews[i], evt, localPt, depth + 1);
      }
    }
  }
  onMouseMoveCapture(e) {
    if (!GC.app.engine.isRunning()) {
      // get the event to the active target
      var mockEvt = {
        pt: [],
        trace: [],
        depth: 0
      };
      var mockPt = new Point(e.pageX, e.pageY);
      dispatch.traceEvt(GC.app.view, mockEvt, mockPt);

      this.onInputMoveCapture(mockEvt, mockPt);
    }
  }
};

export default exports;
