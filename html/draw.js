"use strict";

function setLocationHash(hash){
	var e = document.getElementById("buttons");
	if (e){
		var top = e.scrollTop;
		location.hash = hash;
		e.scrollTop = top;
	} else {
		location.hash = hash;
	}
}

var draw = (function(){
	var canvas = document.getElementById("canvas");
	var gl = canvas.getContext("webgl", {preserveDrawingBuffer: true});
	if (!gl) alert("Could not load webgl!");
	var buttons = document.getElementById("buttons");
	var sections = [];
	var tools = {};
	var pub = {};
	var pencil = {
			active: false,
			xpos: -1,
			ypos: -1,
			xmove: 0,
			ymove: 0,
			angle: 0,
			xscale: 1,
			yscale: 1,
			xref: 600,
			yref: 325,
			eye: 900,
		},
		state = "draw",
		touchstate = false,
		vectors = [],
		current_vector = [],
		selection = false;
	
	// These helpers let us add new tools later
	function addButton(id, cat){
		if (!(cat.toLowerCase() in sections)){
			var section = document.createElement("div");
			var p = document.createElement("p");
			p.innerHTML = cat;
			section.appendChild(p);
			sections[cat.toLowerCase()] = section;
			buttons.appendChild(section);
		}
		var button = document.createElement("a");
		button.innerHTML = id;
		button.setAttribute("id", id.toLowerCase());
		button.setAttribute("href", "javascript:void(0)");
		sections[cat.toLowerCase()].appendChild(button);
		return button;
	}
		
	function addRegularTool(id, cat, tool_fn){
		var fn = (function(id){
			return function(){
				setLocationHash(id.toLowerCase());
				state = id.toLowerCase();
			};
		})(id);
		
		var button = addButton(id, cat);
		button.addEventListener("click", fn);
		// button.addEventListener("touchend", fn);
		tools[id.toLowerCase()] = tool_fn;
	}
	
	function addClearingTool(id, cat, tool_fn){
		var fn = (function(id){
			return function(){
				setLocationHash(id.toLowerCase());
				state = id.toLowerCase();
				selection = null;
				clearCanvas(gl);
				redraw();
			};
		})(id);
		
		var button = addButton(id, cat);
		button.addEventListener("click", fn);
		// button.addEventListener("touchend", fn);
		tools[id.toLowerCase()] = tool_fn;
	}
	
	function addClickTool(id, cat, tool_fn){
		var button = addButton(id, cat);
		button.t = 0;
		var fn = function(){
			clearTimeout(button.t);
			button.t = setTimeout(tool_fn, 100);
		};
		button.addEventListener("click", fn);
		// button.addEventListener("touchend", fn);
	}
	
	// These helpers are private
	function _handler(){
		var tool = touchstate || state;
		tools[tool]();
	}
	
	function _sizer(){
		var canvas2 = document.createElement("canvas");
		canvas2.id = canvas.id;
		canvas2.width = window.innerWidth;
		canvas2.height = window.innerHeight;
		pencil.xref *= canvas2.width / canvas.width;
		pencil.yref *= canvas2.height / canvas.height;
		var p = canvas.parentNode;
		p.removeChild(canvas);
		p.appendChild(canvas2);
		canvas = canvas2;
		gl = canvas.getContext("webgl", {preserveDrawingBuffer: true});
		clearCanvas(gl);
		redraw();
		canvas.addEventListener("mousemove", _tracker);
		canvas.addEventListener("mouseup", _tracker);
		canvas.addEventListener("mousedown", _tracker);
		canvas.addEventListener("mouseout", _tracker);
		canvas.addEventListener("touchmove", _tracker);
		canvas.addEventListener("touchend", _tracker);
		canvas.addEventListener("touchstart", _tracker);
		canvas.addEventListener("touchcancel", _tracker);
	}
	
	function _tracker(e){
		var x=0, y=0;
		if (typeof e.clientX !== "undefined"){
			x = e.clientX;
			y = e.clientY;
		} else if (typeof e.touches !== "undefined" && e.touches.length > 0){
			var n = 0;
			for (var i=0; i < e.touches.length; ++i){
				x += e.touches[i].clientX;
				y += e.touches[i].clientY;
				n += 1;
			}
			x /= n;
			y /= n
		}
		x -= canvas.offsetLeft;
		y -= canvas.offsetTop;
		y = canvas.height - y;
		var track = false;
		if (e.type === "mousemove" || e.type === "touchmove"){
			track = pencil.active;
		} else if (e.type === "mouseup" || e.type === "touchend"){
			pencil.active = false;
			track = true;
		} else if (e.type === "mousedown" || e.type === "touchstart"){
			pencil.active = true;
			track = false;
		} else if (e.type === "mouseout" || e.type === "touchcancel"){
			pencil.active = false;
			track = false;
		}
		
		if (state === "draw" && typeof e.touches !== "undefined"){
			if (e.touches.length === 2){
				touchstate = "rotate/s";
				// touchstate = "rotate-scale";
			} else if (e.touches.length === 3){
				touchstate = "pan";
			} else {
				touchstate = false;
			}
		}
		
		if (track){
			var radius = Math.sqrt((x-pencil.xref)*(x-pencil.xref)+(y-pencil.yref)*(y-pencil.yref));
			pencil.xmove += x-pencil.xpos;
			pencil.ymove += y-pencil.ypos;
			pencil.angle = Math.atan2(pencil.ypos-pencil.yref, pencil.xpos-pencil.xref);
			pencil.angle -= Math.atan2(y-pencil.yref, x-pencil.xref);
			pencil.xscale = (x-pencil.xref)/(pencil.xpos-pencil.xref);
			pencil.yscale = (y-pencil.yref)/(pencil.ypos-pencil.yref);
			pencil.rscale = radius / pencil.radius;
			pencil.radius = radius;
			pencil.xpos = x;
			pencil.ypos = y;
		} else {
			pencil.xpos = x;
			pencil.ypos = y;
			pencil.xmove = 0;
			pencil.ymove = 0;
			pencil.angle = 0;
			pencil.xscale = 1;
			pencil.yscale = 1;
			pencil.radius = Math.sqrt((x-pencil.xref)*(x-pencil.xref)+(y-pencil.yref)*(y-pencil.yref));
		}
		
		_handler();
		var tip = document.getElementById("tip");
		tip.innerHTML = ""+pencil.xpos + " / " + pencil.ypos;
		e.preventDefault();
	}
	
	// These helpers act as a security workaround for chrome's
	// treatment of gl memory/scope/etc. restrictions.
	function appendCurrentVector(point){
		current_vector.push(fill4DPoint(point));
	}
	
	function resetCurrentVector(){
		while (current_vector.length) current_vector.pop();
	}
	
	function commitCurrentVector(){
		vectors.push(current_vector.slice());
	}
	
	function iterateCurrentVector(fn){
		for (var i in current_vector){
			fn(current_vector[i]);
		}
	}
	
	function iterateSelection(fn){
		var sel = selection || vectors;
		for (var i in sel){
			fn(sel[i], !!selection);
		}
	}
	
	function selectWithin(minx, miny, maxx, maxy){
		selection = [];
		var dirty = false;
		for (var i in vectors){
			var proj_vector = projectedXYPoints(gl, vectors[i], pencil.xref, pencil.yref, pencil.eye);
			for (var j in proj_vector){
				if (minx <= proj_vector[j].x && proj_vector[j].x <= maxx &&
					miny <= proj_vector[j].y && proj_vector[j].y <= maxy){
					selection.push(vectors[i]);
					dirty = true;
					break;
				}
			}
		}
		if (!dirty){
			selection = false;
		}
		var points = rectPoints(minx, miny, maxx-minx, maxy-miny);
		points = fill4DPoints(points);
		points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
		points = normalizeAbsolutePoints(gl, points);
		drawPolygonRgba(gl, points, 0.8, 0.8, 0.8, 1);
	}
	
	function deleteSelection(){
		if (selection){
			for (var i in selection){
				var j = vectors.indexOf(selection[i]);
				vectors[j] = vectors[vectors.length-1];
				vectors.pop();
			}
			
			selection = false;
		}
	}
		
	function redraw(){
		var points = [{x:0, y:pencil.yref}, {x:canvas.width, y:pencil.yref}];
		points = fill4DPoints(points);
		points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
		points = normalizeAbsolutePoints(gl, points);
		drawLineRgba(gl, points, 0.8, 0.8, 0.8, 1);
		points = [{x:pencil.xref, y:0}, {x:pencil.xref, y:canvas.height}];
		points = fill4DPoints(points);
		points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
		points = normalizeAbsolutePoints(gl, points);
		drawLineRgba(gl, points, 0.8, 0.8, 0.8, 1);
		var all_points = [];
		for (var i in vectors){
			points = vectors[i];
			//points = fill4DPoints(points);
			points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
			points = normalizeAbsolutePoints(gl, points);
			all_points = all_points.concat(points);
			all_points.push({x: 0, y: 0, z: Infinity});
			if (all_points.length >= 3000){
				drawLineStripRgba(gl, all_points, 0, 0, 0, 1);
				all_points = [];
			}
		}
		
		drawLineStripRgba(gl, all_points, 0, 0, 0, 1);
		if (selection){
			all_points = [];
			for (var i in selection){
				points = selection[i];
				//points = fill4DPoints(points);
				points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
				points = normalizeAbsolutePoints(gl, points);
				all_points = all_points.concat(points);
				all_points.push({x: 0, y: 0, z: Infinity});
				if (all_points.length >= 3000){
					drawLineStripRgba(gl, all_points, 1, 0, 0, 1);
					all_points = [];
				}
			}
			
			drawLineStripRgba(gl, all_points, 1, 0, 0, 1);
		}
	}
	
	function mostRecent(){
		if (current_vector.length >= 2){
			var points = [current_vector[current_vector.length-2], current_vector[current_vector.length-1]];
			points = fill4DPoints(points);
			points = projectedXYPoints(gl, points, pencil.xref, pencil.yref, pencil.eye);
			points = normalizeAbsolutePoints(gl, points);
			drawLineStripRgba(gl, points, 0, 0, 0, 1);
		}
	}
	
	function clear(){
		clearCanvas(gl);
	}
	
	window.addEventListener("resize", _sizer);
	window.addEventListener("load", _sizer);
	setLocationHash("draw");
	pub.pencil = pencil;
	pub.appendCurrentVector = appendCurrentVector;
	pub.resetCurrentVector = resetCurrentVector;
	pub.commitCurrentVector = commitCurrentVector;
	pub.iterateCurrentVector = iterateCurrentVector;
	pub.iterateSelection = iterateSelection;
	pub.selectWithin = selectWithin;
	pub.deleteSelection = deleteSelection;
	pub.addRegularTool = addRegularTool;
	pub.addClearingTool = addClearingTool;
	pub.addClickTool = addClickTool;
	pub.redraw = redraw;
	pub.mostRecent = mostRecent;
	pub.clear = clear;
	pub.toDataURL = function(){return canvas.toDataURL();};
	return pub;
})();

draw.addClearingTool("Draw", "Tools", function(){
	if (draw.pencil.active){
		draw.appendCurrentVector({x: draw.pencil.xpos, y: draw.pencil.ypos});
		draw.mostRecent();
	} else if (draw.pencil.xmove || draw.pencil.ymove){
		draw.commitCurrentVector();
		draw.resetCurrentVector();
	}
});

draw.addClearingTool("Line", "Tools", function(){
	if (draw.pencil.active){
		draw.appendCurrentVector({x: draw.pencil.xpos, y: draw.pencil.ypos});
		draw.mostRecent();
	} else if (draw.pencil.xmove || draw.pencil.ymove){
		var xsum = 0, ysum = 0, xxsum = 0, xysum = 0, n = 0;
		var xmin = Infinity, xmax = -Infinity;
		var ymin = Infinity, ymax = -Infinity;
		draw.iterateCurrentVector(function(point){
			xsum += point.x;
			ysum += point.y;
			xxsum += point.x*point.x;
			xysum += point.x*point.y;
			xmin = Math.min(point.x, xmin);
			xmax = Math.max(point.x, xmax);
			ymin = Math.min(point.y, ymin);
			ymax = Math.max(point.y, ymax);
			n += 1;
		});
		
		var m = (n*xysum - xsum*ysum) / (n*xxsum - xsum*xsum);
		var b = (ysum - m*xsum)/n;
		draw.resetCurrentVector();
		if (Math.abs(m) > 1/2){
			var range = ymax-ymin;
			for (var i=0.0; i <= 1.0; i += 0.1){
				draw.appendCurrentVector({x:(ymin+range*i-b)/m, y:ymin+range*i});
			}
		} else {
			var range = xmax-xmin;
			for (var i=0.0; i <= 1.0; i += 0.1){
				draw.appendCurrentVector({x:xmin+range*i, y:m*(xmin+range*i)+b});
			}
		}
		
		draw.commitCurrentVector();
		draw.resetCurrentVector();
		draw.clear();
		draw.redraw();
	}
});

draw.addRegularTool("Rotate/S", "Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xref = draw.pencil.xref;
			var yref = draw.pencil.yref;
			var zref = 0;
			draw.iterateSelection(function(sel){
				for (var i in sel){
					sel[i].x -= xref;
					sel[i].y -= yref;
					var xtemp = sel[i].x;
					var ytemp = sel[i].y;
					sel[i].x = Math.cos(draw.pencil.angle)*xtemp+Math.sin(draw.pencil.angle)*ytemp;
					sel[i].y = Math.cos(draw.pencil.angle)*ytemp-Math.sin(draw.pencil.angle)*xtemp;
					sel[i].x += xref;
					sel[i].y += yref;
					sel[i].x = draw.pencil.rscale*(sel[i].x-xref)+xref;
					sel[i].y = draw.pencil.rscale*(sel[i].y-yref)+yref;
					sel[i].z = draw.pencil.rscale*(sel[i].z-zref)+zref;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addRegularTool("Stretch", "Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xref = draw.pencil.xref;
			var yref = draw.pencil.yref;
			var zref = 0;
			draw.iterateSelection(function(sel){
				for (var i in sel){
					sel[i].x -= xref;
					sel[i].y -= yref;
					var xtemp = sel[i].x;
					var ytemp = sel[i].y;
					if (draw.pencil.xscale && draw.pencil.yscale &&
						-Infinity < draw.pencil.xscale && draw.pencil.xscale < Infinity &&
						-Infinity < draw.pencil.yscale && draw.pencil.yscale < Infinity){
						sel[i].x *= draw.pencil.xscale;
						sel[i].y *= draw.pencil.yscale;
					}
					sel[i].x += xref;
					sel[i].y += yref;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addRegularTool("Pan", "Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			draw.iterateSelection(function(sel){
				for (var i in sel){
					sel[i].x += draw.pencil.xmove;
					sel[i].y += draw.pencil.ymove;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addRegularTool("Select", "Tools", function(){
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xprev = draw.pencil.xpos - draw.pencil.xmove;
			var yprev = draw.pencil.ypos - draw.pencil.ymove;
			var minx = Math.min(xprev, draw.pencil.xpos);
			var miny = Math.min(yprev, draw.pencil.ypos);
			var maxx = Math.max(xprev, draw.pencil.xpos);
			var maxy = Math.max(yprev, draw.pencil.ypos);
			draw.clear();
			draw.selectWithin(minx, miny, maxx, maxy);
			draw.redraw();
		}
	}
});

draw.addRegularTool("Origin", "Tools", function(){
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			draw.pencil.xref = draw.pencil.xpos;
			draw.pencil.yref = draw.pencil.ypos;
			draw.clear();
			draw.redraw();
		}
	}
});

draw.addClickTool("Save", "Actions", function(){
	window.open(draw.toDataURL(), "_blank");
});

draw.addClickTool("Delete", "Actions", function(){
	draw.deleteSelection();
	draw.clear();
	draw.redraw();
});

draw.addClickTool("Join", "Actions", function(){
	var joined = false;
	draw.resetCurrentVector();
	draw.iterateSelection(function(sel, is_sel){
		if (is_sel){
			joined = true;
			for (var i in sel){
				draw.appendCurrentVector(sel[i]);
			}
			draw.appendCurrentVector({x: 0, y: 0, z: Infinity});
		}
	});

	if (joined){
		draw.deleteSelection();
		draw.commitCurrentVector();
		draw.clear();
		draw.redraw();
		draw.resetCurrentVector();
	}
});

draw.addClickTool("Copy", "Actions", function(){
	var copied = false;
	draw.resetCurrentVector();
	draw.iterateSelection(function(sel, is_sel){
		if (is_sel){
			copied = true;
			for (var i in sel){
				draw.appendCurrentVector({x: sel[i].x+20, y: sel[i].y-20, z: sel[i].z});
			}
			draw.appendCurrentVector({x: 0, y: 0, z: Infinity});
		}
	});

	if (copied){
		draw.commitCurrentVector();
		draw.clear();
		draw.redraw();
		draw.resetCurrentVector();
	}
});

draw.addClearingTool("Spring", "3D Tools", function(){
	if (draw.pencil.active){
		draw.appendCurrentVector({x: draw.pencil.xpos, y: draw.pencil.ypos});
		draw.mostRecent();
	} else if (draw.pencil.xmove || draw.pencil.ymove){
		var z = 0;
		draw.iterateCurrentVector(function(point){
			point.z = z++;
		});
		
		draw.commitCurrentVector();
		draw.resetCurrentVector();
		draw.clear();
		draw.redraw();
	}
});

draw.addClearingTool("Fence", "3D Tools", function(){
	if (draw.pencil.active){
		draw.appendCurrentVector({x: draw.pencil.xpos, y: draw.pencil.ypos});
		draw.mostRecent();
	} else if (draw.pencil.xmove || draw.pencil.ymove){
		var extra = [];
		draw.iterateCurrentVector(function(point){
			extra.push({z:20, x:point.x, y:point.y});
			extra.push({z:0, x:point.x, y:point.y});
			extra.push({z:20, x:point.x, y:point.y});
		});
		
		while (extra.length) draw.appendCurrentVector(extra.pop());
		draw.commitCurrentVector();
		draw.resetCurrentVector();
		draw.clear();
		draw.redraw();
	}
});

draw.addClearingTool("Duct", "3D Tools", function(){
	if (draw.pencil.active){
		draw.appendCurrentVector({x: draw.pencil.xpos, y: draw.pencil.ypos});
		draw.mostRecent();
	} else if (draw.pencil.xmove || draw.pencil.ymove){
		var As=[], Bs=[], Cs=[], Ds=[];
		var prev=false;
		var size = 20;
		draw.iterateCurrentVector(function(point){
			if (prev){
				var dist = Math.sqrt((point.x-prev.x)*(point.x-prev.x) + (point.y-prev.y)*(point.y-prev.y));
				if (dist >= size/2){
					var prev2point = {
						x: point.x - prev.x,
						y: point.y - prev.y
					};
					var perp = {x: prev2point.y, y: -prev2point.x};
					// size = Math.sqrt(t*perp.x*t*perp.x + t*perp.y*t*perp.y)
					// size*size = t*perp.x*t*perp.x + t*perp.y*t*perp.y
					// size*size = t*t*(perp.x*perp.x + perp.y*perp.y)
					// size*size/(perp.x*perp.x + perp.y*perp.y) = t*t
					// Math.sqrt(size*size/(perp.x*perp.x + perp.y*perp.y)) = t
					var t = Math.sqrt(size*size/(perp.x*perp.x + perp.y*perp.y));
					var plus = {
						x: prev.x + t*perp.x,
						y: prev.y + t*perp.y
					};
					var minus = {
						x: prev.x - t*perp.x,
						y: prev.y - t*perp.y
					};
					As.push({x:plus.x, y:plus.y, z:size});
					Bs.push({x:plus.x, y:plus.y, z:-size});
					Cs.push({x:minus.x, y:minus.y, z:-size});
					Ds.push({x:minus.x, y:minus.y, z:size});
					prev = point;
				}
			} else {
				prev = point;
			}
		});
		
		draw.resetCurrentVector();
		for (var i=Bs.length-1; i >= 0; --i){ // comb B on top of A
			draw.appendCurrentVector(Bs[i]);
			draw.appendCurrentVector(As[i]);
			draw.appendCurrentVector(Bs[i]);
		}
		
		for (var i=0; i < Cs.length; ++i){ // comb C on top of B
			draw.appendCurrentVector(Cs[i]);
			draw.appendCurrentVector(Bs[i]);
			draw.appendCurrentVector(Cs[i]);
		}
		
		for (var i=Ds.length-1; i >= 0; --i){ // comb D on top of C
			draw.appendCurrentVector(Ds[i]);
			draw.appendCurrentVector(Cs[i]);
			draw.appendCurrentVector(Ds[i]);
		}
		
		for (var i=0; i < Cs.length; ++i){ // comb A on top of D
			draw.appendCurrentVector(As[i]);
			draw.appendCurrentVector(Ds[i]);
			draw.appendCurrentVector(As[i]);
		}
		
		draw.commitCurrentVector();
		draw.resetCurrentVector();
		draw.clear();
		draw.redraw();
	}
});

draw.addRegularTool("Rotate Z", "3D Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xref = draw.pencil.xref;
			var yref = draw.pencil.yref;
			var zref = 0;
			var xangle = draw.pencil.xmove * Math.PI / 200;
			var yangle = draw.pencil.ymove * Math.PI / 200;
			draw.iterateSelection(function(sel){
				for (var i in sel){
					if (!isFinite(sel[i].z)) continue;
					sel[i].x -= xref;
					sel[i].y -= yref;
					sel[i].z -= zref;
					var xtemp = sel[i].x;
					var ztemp = sel[i].z;
					sel[i].x = Math.cos(xangle)*xtemp+Math.sin(xangle)*ztemp;
					sel[i].z = Math.cos(xangle)*ztemp-Math.sin(xangle)*xtemp;
					var ytemp = sel[i].y;
					var ztemp = sel[i].z;
					sel[i].y = Math.cos(yangle)*ytemp+Math.sin(yangle)*ztemp;
					sel[i].z = Math.cos(yangle)*ztemp-Math.sin(yangle)*ytemp;
					sel[i].x += xref;
					sel[i].y += yref;
					sel[i].z += zref;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addRegularTool("Rotate XZ", "3D Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xref = draw.pencil.xref;
			var yref = draw.pencil.yref;
			var zref = 0;
			var xangle = draw.pencil.xmove * Math.PI / 200;
			var yangle = draw.pencil.ymove * Math.PI / 200;
			draw.iterateSelection(function(sel){
				for (var i in sel){
					if (!isFinite(sel[i].z)) continue;
					sel[i].x -= xref;
					sel[i].y -= yref;
					sel[i].z -= zref;
					var xtemp = sel[i].x;
					var ztemp = sel[i].z;
					sel[i].x = Math.cos(xangle)*xtemp+Math.sin(xangle)*ztemp;
					sel[i].z = Math.cos(xangle)*ztemp-Math.sin(xangle)*xtemp;
					sel[i].x += xref;
					sel[i].y += yref;
					sel[i].z += zref;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addRegularTool("Rotate YZ", "3D Tools", function(){
	draw.resetCurrentVector(); // clean up for multitouch
	if (draw.pencil.active){
		if (draw.pencil.xmove || draw.pencil.ymove){
			var xref = draw.pencil.xref;
			var yref = draw.pencil.yref;
			var zref = 0;
			var xangle = draw.pencil.xmove * Math.PI / 200;
			var yangle = draw.pencil.ymove * Math.PI / 200;
			draw.iterateSelection(function(sel){
				for (var i in sel){
					if (!isFinite(sel[i].z)) continue;
					sel[i].x -= xref;
					sel[i].y -= yref;
					sel[i].z -= zref;
					var ytemp = sel[i].y;
					var ztemp = sel[i].z;
					sel[i].y = Math.cos(yangle)*ytemp+Math.sin(yangle)*ztemp;
					sel[i].z = Math.cos(yangle)*ztemp-Math.sin(yangle)*ytemp;
					sel[i].x += xref;
					sel[i].y += yref;
					sel[i].z += zref;
				}
			});
			
			draw.clear();
			draw.redraw();
			draw.pencil.xmove = 0;
			draw.pencil.ymove = 0;
		}
	}
});

draw.addClickTool("Implode", "Extra", function(){
	draw.iterateSelection(function(sel){
		var xavg = 0, yavg = 0, zavg = 0, num = 0;
		for (var i in sel){
			if (!isFinite(sel[i].z)) continue;
			xavg += sel[i].x;
			yavg += sel[i].y;
			zavg += sel[i].z;
			num += 1;
		}
		xavg /= num;
		yavg /= num;
		zavg /= num;
		for (var i in sel){
			if (!isFinite(sel[i].z)) continue;
			var x = xavg - sel[i].x;
			var y = yavg - sel[i].y;
			var z = zavg - sel[i].z;
			sel[i].x += x*0.05;
			sel[i].y += y*0.05;
			sel[i].z += z*0.05;
		}
	});
	draw.clear();
	draw.redraw();
});

draw.addClickTool("Explode", "Extra", function(){
	draw.iterateSelection(function(sel){
		var xavg = 0, yavg = 0, zavg = 0, num = 0;
		for (var i in sel){
			if (!isFinite(sel[i].z)) continue;
			xavg += sel[i].x;
			yavg += sel[i].y;
			zavg += sel[i].z;
			num += 1;
		}
		xavg /= num;
		yavg /= num;
		zavg /= num;
		for (var i in sel){
			if (!isFinite(sel[i].z)) continue;
			var x = xavg - sel[i].x;
			var y = yavg - sel[i].y;
			var z = zavg - sel[i].z;
			sel[i].x -= x*0.05;
			sel[i].y -= y*0.05;
			sel[i].z -= z*0.05;
		}
	});
	draw.clear();
	draw.redraw();
});

draw.addClickTool("Raise", "3D Tools", function(){
	draw.iterateSelection(function(sel){
		for (var i in sel){
			sel[i].z += 10;
		}
	});
	draw.clear();
	draw.redraw();
});

draw.addClickTool("Lower", "3D Tools", function(){
	draw.iterateSelection(function(sel){
		for (var i in sel){
			sel[i].z -= 10;
		}
	});
	draw.clear();
	draw.redraw();
});

draw.addClickTool("Cube", "3D Tools", function(){
	var size = 50;
	var x = Math.random()*4*size-2*size + draw.pencil.xref;
	var y = Math.random()*4*size-2*size + draw.pencil.yref;
	var z = 0;
	draw.resetCurrentVector();
	draw.appendCurrentVector({x: x-size, y: y-size, z: z-size}); // A
	draw.appendCurrentVector({x: x+size, y: y-size, z: z-size}); // B
	draw.appendCurrentVector({x: x+size, y: y+size, z: z-size}); // C
	draw.appendCurrentVector({x: x-size, y: y+size, z: z-size}); // D
	draw.appendCurrentVector({x: x-size, y: y-size, z: z-size}); // A
	draw.appendCurrentVector({x: x-size, y: y-size, z: z+size}); // A'
	draw.appendCurrentVector({x: x+size, y: y-size, z: z+size}); // B'
	draw.appendCurrentVector({x: x+size, y: y-size, z: z-size}); // B
	draw.appendCurrentVector({x: x+size, y: y-size, z: z+size}); // B'
	draw.appendCurrentVector({x: x+size, y: y+size, z: z+size}); // C'
	draw.appendCurrentVector({x: x+size, y: y+size, z: z-size}); // C
	draw.appendCurrentVector({x: x+size, y: y+size, z: z+size}); // C'
	draw.appendCurrentVector({x: x-size, y: y+size, z: z+size}); // D'
	draw.appendCurrentVector({x: x-size, y: y+size, z: z-size}); // D
	draw.appendCurrentVector({x: x-size, y: y+size, z: z+size}); // D'
	draw.appendCurrentVector({x: x-size, y: y-size, z: z+size}); // A'
	draw.commitCurrentVector();
	draw.clear();
	draw.redraw();
	draw.resetCurrentVector();
});