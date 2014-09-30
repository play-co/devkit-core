import device;
import event.Emitter;
import event.input.dispatch as dispatch;
import math.geom.Point as Point;

exports = Class(event.Emitter, function () {

  var _simulateMouseMove = device.simulating && document.body.addEventListener;

  this.init = function () {
    this.onMouseMoveCapture = bind(this, this.onMouseMoveCapture);
    this.setShiftDown = bind(this, this.setShiftDown);
    this.onContextMenu = bind(this, this.onContextMenu);

    if (_simulateMouseMove) {
      window.addEventListener('mousemove', this.onMouseMoveCapture, true);
    }

    window.addEventListener('mousedown', this.setShiftDown, true);
    window.addEventListener('contextmenu', this.onContextMenu, true);

    GC.app.view.subscribe('InputMoveCapture', this, 'onInputMoveCapture');
    //GC.app.view.subscribe('InputStartCapture', this, 'onInputSelectCapture');
  }

  this.setShiftDown = function (e) {
    if (e.which === 3 || e.button === 2) {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }

    this._shiftDown = !!e.shiftKey;

    if (this._shiftDown) {
      this.onInputSelectCapture(e);
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }

  this.onContextMenu = function (e) {
    var data = {
      pt: {x: e.pageX, y: e.pageY}
    };

    //get the views under the pointer
    var clickEvt = {pt: [], trace: [], depth: 0};
    var clickPt = new Point(e.pageX, e.pageY);
    dispatch.traceEvt(GC.app.view, clickEvt, clickPt);

    if (!clickEvt.trace.length) return;
    data.active = clickEvt.trace[0].uid;

    //get the views under the pointer
    var mockEvt = {pt: [], trace: [], depth: 0};
    var mockPt = new Point(e.pageX, e.pageY);

    this.traceEvt(GC.app.view, mockEvt, mockPt);

    data.trace = [];
    //convert to small objects
    for (var i = mockEvt.trace.length - 1, item; item = mockEvt.trace[i]; --i) {
      data.trace.push({
        uid: item.view.uid,
        tag: item.view.getTag(),
        depth: item.depth
      });
    }

    this.emit('trace', data);

    e.stopPropagation();
    e.preventDefault();
    return false;
  }

  this.destroy = function () {
    if (_simulateMouseMove) {
      window.removeEventListener('mousedown', this.onMouseDownCapture, true);
    }

    window.removeEventListener('mousedown', this.setShiftDown, true);
    GC.app.view.unsubscribe('InputMoveCapture', this, 'onInputMoveCapture');
    //GC.app.view.unsubscribe('InputStartCapture', this, 'onInputSelectCapture');
  }

  this.onInputMoveCapture = function (evt, pt, allEvt, allPt) {
    var trace = [];

    //loop backwards through the trace
    for (var i = evt.trace.length - 1, view; view = evt.trace[i]; --i) {
      trace.push(view.uid);

      var superview = view.getSuperview();
      while (superview && superview != evt.trace[i + 1]) {
        trace.push(superview.uid);
        superview = superview.getSuperview();
      }
    }

    var data = {
      x: pt.x,
      y: pt.y,
      trace: trace
    };

    this.emit('move', data);
  }

  this.onInputSelectCapture = function (e) {
    //only send event if shift click


    var evt = {pt: [], trace: [], depth: 0};
    var pt = new Point(e.pageX, e.pageY);
    dispatch.traceEvt(GC.app.view, evt, pt);

    var trace = [];
    for (var i = evt.trace.length - 1, view; view = evt.trace[i]; --i) {
      trace.push(view.uid);

      var superview = view.getSuperview();
      while (superview && superview != evt.trace[i + 1]) {
        trace.push(superview.uid);
        superview = superview.getSuperview();
      }
    }

    var data = {
      x: pt.x,
      y: pt.y,
      trace: trace
    };

    this.emit('select', data);
  }

  this.traceEvt = function (view, evt, pt, depth) {
    depth = depth || 0;

    var localPt = view.style.localizePoint(new Point(pt));

    //if the point is contained add it to the trace
    if (view.containsLocalPoint(localPt)) {
      evt.trace.unshift({view: view, depth: depth});
      evt.pt[view.uid] = localPt;
    }

    var subviews = view.getSubviews();
    for (var i = subviews.length - 1; i >= 0; --i) {
      if (subviews[i].style.visible) {
          this.traceEvt(subviews[i], evt, localPt, depth + 1);
        }
    }

    if (subviews.length === 0) {
      evt.target = view;
      return true;
    }
  };

  this.onMouseMoveCapture = function (e) {
    //$.stopEvent(e);

    //get the event to the active target
    var mockEvt = {pt: [], trace: [], depth: 0};
    var mockPt = new Point(e.pageX, e.pageY);
    dispatch.traceEvt(GC.app.view, mockEvt, mockPt);

    this.onInputMoveCapture(mockEvt, mockPt);
  }
});
