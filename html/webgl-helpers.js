"use strict";

//// GL State Helpers ////
// GL is a large state machine. To aid in maintaining
// a sane GL state, these helpers serve to set up,
// call back, then tear down.

// bind a buffer
function withBufferBound(gl, buffer, cb){
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	cb();
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

// bind a shader program
function withProgram(gl, program, cb){
	gl.useProgram(program);
	cb();
	gl.useProgram(null);
}

// bind a 4d vertex
function withVertexAttribArray(gl, program, attr, cb){
	var attrib = gl.getAttribLocation(program, attr);
	gl.enableVertexAttribArray(attrib);
	gl.vertexAttribPointer(attrib, 4, gl.FLOAT, false, 0, 0); // pointer, 4 for xyzw, type, normalized?, stride, offset
	cb();
	gl.disableVertexAttribArray(attrib);
}

// The three above chained together for simplicity
function withBufferProgramAttrib(gl, buffer, program, attr, cb){
	withBufferBound(gl, buffer, function(){
		withProgram(gl, program, function(){
			withVertexAttribArray(gl, program, attr, cb);
		})
	});
}

//// GL Program Helpers ////
// GL draws following the instructions of a shader program
// these are broken into two components: the vertex shader
// and the fragment shader

// A helper to make embedding shader programs simpler
function stringInserts(str, inserts){
	for (var key in inserts){
		var re = new RegExp("\\$"+key, "g");
		str = str.replace(re, inserts[key])
	}
	
	return str;
}

// A helper to compile a shader program based on the given "inserts"
function compileProgram(gl, vertex_code, fragment_code, inserts){
	var vertex_shader = gl.createShader(gl.VERTEX_SHADER),
		fragment_shader = gl.createShader(gl.FRAGMENT_SHADER);
	
	gl.shaderSource(vertex_shader, stringInserts(vertex_code, inserts||{}));
	gl.shaderSource(fragment_shader, stringInserts(fragment_code, inserts||{}));
	
	gl.compileShader(vertex_shader);
	gl.compileShader(fragment_shader);
	
	if (!gl.getShaderParameter(vertex_shader, gl.COMPILE_STATUS)){
		console.error("An error occured compiling the vertex shader: "+gl.getShaderInfoLog(vertex_shader));
	}
	
	if (!gl.getShaderParameter(fragment_shader, gl.COMPILE_STATUS)){
		console.error("An error occured compiling the fragment shader"+gl.getShaderInfoLog(fragment_shader));
	}
	
	var shader_program = gl.createProgram();
	gl.attachShader(shader_program, vertex_shader);
	gl.attachShader(shader_program, fragment_shader);
	gl.linkProgram(shader_program);
	return shader_program;
}

// A program that fills/plots with a fixed color in terms of rgba
function rgbaProgram(gl, options){
	options.r = options.r || 0;
	options.g = options.g || 0;
	options.b = options.b || 0;
	options.a = options.a || 1;
	var vertex_code = "attribute vec4 coordinates; void main(void){gl_Position=coordinates;gl_PointSize=3.0;}",
		fragment_code = "void main(void){gl_FragColor=vec4($r, $g, $b, $a);}";
		
	return compileProgram(gl, vertex_code, fragment_code, options);
}

// A program that fills/plots with a gradient color from one corner of the screen to the next
function gradProgram(gl, options){
	if (typeof gradProgram.Z === "undefined"){
		var vertex_code = "attribute vec4 coordinates; void main(void){gl_Position=coordinates;gl_PointSize=3.0;}",
			fragment_code = "void main(void){gl_FragColor=vec4(gl_FragCoord.x/640.0, gl_FragCoord.y/480.0, 0, 1);}";
			
		gradProgram.Z = compileProgram(gl, vertex_code, fragment_code);
	}
	
	return gradProgram.Z;
}

//// GL Points Helpers ////
// GL stores points in a compact array, where
// -1 is the bottom/left and +1 is the top/right.
// Expressing points always in this way may not be
// useful, so I use the term "normalize" below
// to talk about converting back to this form.

// This helper "fills in" a 4D point so I don't have to worry about
// z, w, etc. if I don't want to elsewhere
function fill4DPoint(point){
	var p = {
		x: point.x || 0,
		y: point.y || 0,
		z: point.z || 0,
		w: point.w || 1
	};
	
	return p;
}

// List version of fill4DPoint
function fill4DPoints(points){
	var ps = [];
	for (var i in points){
		ps.push(fill4DPoint(points[i]));
	}
	return ps;
}

// Normalize a point where (0,0) is the bottom left
// and (w, h) is the top right.
function normalizeAbsolutePoint(gl, point){
	var p = fill4DPoint(point);
	p.x = (p.x - gl.drawingBufferWidth/2) / (gl.drawingBufferWidth/2);
	p.y = (p.y - gl.drawingBufferHeight/2) / (gl.drawingBufferHeight/2);
	return p;
}

// Normalize a point where (0.00, 0.00) is the bottom left
// and (1.00, 1.00) is the top right
function normalizeRelativePoint(gl, point){
	var p = fill4DPoint(point);
	p.x = 2*(p.x - 0.5);
	p.y = 2*(p.y - 0.5);
	return p;
}

// Normalize a point where (0.00, 0.00) is the bottom left
// and (1.00w/w, 1.00w/h) is the top right
function normalizeXRelativePoint(gl, point){
	var p = fill4DPoint(point);
	p.x = p.x*gl.drawingBufferWidth;
	p.y = p.y*gl.drawingBufferWidth;
	return normalizeAbsolutePoint(gl, p);
}

// Normalize a point where (0.00, 0.00) is the bottom left
// and (1.00h/w, 1.00h/h) is the top right
function normalizeYRelativePoint(gl, point){
	var p = fill4DPoint(point);
	p.x = p.x*gl.drawingBufferHeight;
	p.y = p.y*gl.drawingBufferHeight;
	return normalizeAbsolutePoint(gl, p);
}

// List version of normalizeAbsolutePoint
function normalizeAbsolutePoints(gl, points){
	var ps = [];
	for (var i in points){
		ps.push(normalizeAbsolutePoint(gl, points[i]));
	}
	return ps;
}

// List version of normalizeRelativePoint
function normalizeRelativePoints(gl, points){
	var ps = [];
	for (var i in points){
		ps.push(normalizeRelativePoint(gl, points[i]));
	}
	return ps;
}

// List version of normalizeXRelativePoint
function normalizeXRelativePoints(gl, points){
	var ps = [];
	for (var i in points){
		ps.push(normalizeXRelativePoint(gl, points[i]));
	}
	return ps;
}

// List version of normalizeYRelativePoint
function normalizeYRelativePoints(gl, points){
	var ps = [];
	for (var i in points){
		ps.push(normalizeYRelativePoint(gl, points[i]));
	}
	return ps;
}

// Sets Z to zero after scaling XY appropriately
// the "eye" is at (refx, refy, refz); if point.z == 0,
// then no scaling is applied
function projectedXYPoint(gl, point, refx, refy, refz){
	var vector = [point.x-refx, point.y-refy, point.z-refz];
	if (point.z < refz){
        var t = refz / vector[2];
        return {z:0, x:refx-t*vector[0], y:refy-t*vector[1]};
    } else {
        return {x:0, y:0, z:Infinity};
    }
}

// List version of projectedXYPoint
function projectedXYPoints(gl, points, refx, refy, refz){
	var ps = [];
	for (var i in points){
		ps.push(projectedXYPoint(gl, points[i], refx, refy, refz));
	}
	return ps;
}

// Packs normalized points into the proper array
// structure for GL
function pointsToBuffer(gl, points){
	var vertices = [];
	for (var i in points){
		var p = fill4DPoint(points[i]);
		vertices.push(p.x);
		vertices.push(p.y);
		vertices.push(p.z);
		vertices.push(p.w);
	}
	
	var buffer = gl.createBuffer();
	withBufferBound(gl, buffer, function(){
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
	});
	
	return buffer;
}

//// Drawing Helpers ////
// Drawing in GL is handled by the gl.drawArrays and
// other such functions; these behave according to what is
// currently bound in the GL state machine.
// Drawing is done with respects to the viewport,
// a rectangular region of the screen.

// Clears the viewport with white
function clearCanvas(gl){
	gl.clearColor(1.0, 1.0, 1.0, 1.0); // rgba
	gl.clear(gl.COLOR_BUFFER_BIT);
}

// Set the viewport relative (proportionally) to the screen
function relativeViewport(gl, scaleleft, scalebottom, scalex, scaley){
	gl.viewport(scaleleft*gl.drawingBufferWidth, scalebottom*gl.drawingBufferHeight,
		scalex*gl.drawingBufferWidth, scaley*gl.drawingBufferHeight);
}

// A general purpose drawing helper
// It draws the given type of plot using the given type of program
// and over the given array of normalized, but unpacked points
function drawRaw(gl, type, program, points, options){
	withBufferProgramAttrib(gl, pointsToBuffer(gl, points),
		program(gl, options), "coordinates",
		function(){
			gl.drawArrays(type, 0, points.length); // https://msdn.microsoft.com/en-us/library/dn302395(v=vs.85).aspx
		});
}

// Draws gradient points
function drawPoints(gl, points){
	drawRaw(gl, gl.POINTS, gradProgram, points, {});
}

// Draws points of color rgba
function drawPointsRgba(gl, points, r, g, b, a){
	drawRaw(gl, gl.POINTS, rgbaProgram, points, {r:r, g:g, b:b, a:a});
}

// Draws a gradient polygon using the triangle fan method
function drawPolygon(gl, points){
	drawRaw(gl, gl.TRIANGLE_FAN, gradProgram, points, {});
}

// Draws a polygon of color rgba using the triangle fan method
function drawPolygonRgba(gl, points, r, g, b, a){
	drawRaw(gl, gl.TRIANGLE_FAN, rgbaProgram, points, {r:r, g:g, b:b, a:a});
}

// Draws a gradient line
function drawLine(gl, points){
	drawRaw(gl, gl.LINES, gradProgram, points, {});
}

// Draws a line of color rgba
function drawLineRgba(gl, points, r, g, b, a){
	drawRaw(gl, gl.LINES, rgbaProgram, points, {r:r, g:g, b:b, a:a});
}

// Draws a gradient line strip
function drawLineStrip(gl, points){
	drawRaw(gl, gl.LINE_STRIP, gradProgram, points, {});
}

// Draws a line strip of color rgba
function drawLineStripRgba(gl, points, r, g, b, a){
	drawRaw(gl, gl.LINE_STRIP, rgbaProgram, points, {r:r, g:g, b:b, a:a});
}

//// Shape Generation Helpers ////
// Since much of the work comes from declaring arrays of points,
// these helpers expedite that process.
// These helpers should work regardless of whether
// the points are absolute, normalized, xRelative, etc.
// Therefore, the return values of these methods still must
// be normalized by the user before passed to the draw methods.

// Return an array of num points arranged in a circle
function circlePoints(cx, cy, r, num){
	num = num || 15;
	var points = [];
	var skip = 2*Math.PI / num;
	for (var i=0; i <= num; ++i){
		points.push({
			x: cx + r*Math.sin(i*skip),
			y: cy + r*Math.cos(i*skip)
		});
	}
	return points;
}

// Return an array of num points arranged in an arc
function arcPoints(cx, cy, r, theta1, theta2, num){
	num = num || 15;
	var points = [];
	var dir = (theta1 < theta2);
	while (theta1 < 0) theta1 += 2*Math.PI;
	while (theta2 < 0) theta2 += 2*Math.PI;
	while (theta1 > 2*Math.PI) theta1 -= 2*Math.PI;
	while (theta2 > 2*Math.PI) theta2 -= 2*Math.PI;
	if (dir && theta1 > theta2) theta2 += 2*Math.PI;
	if (!dir && theta1 < theta2) theta1 += 2*Math.PI;
	var skip = (theta2-theta1)/num;
	for (var i=0; i <= num; ++i){
		points.push({
			x: cx + r*Math.cos(theta1+i*skip),
			y: cy + r*Math.sin(theta1+i*skip)
		});
	}
	return points;
}

// Return an array for a num-point star
// where each tip continues to the tip skew after itself
function starPoints(cx, cy, r, num, skew){
	skew = skew || 2;
	function starRatio(num){ // helper to find proper ratio
		if (num <= 5){
			return 2.61803398875; // from golden ratio
		} else {
			// enumerate points
			var skip = 2*Math.PI / num;
			var points = [
				{x: -Math.sin(0),             y: -Math.cos(0)},
				{x: -Math.sin(skip),          y: -Math.cos(skip)},
				{x: -Math.sin(skew*skip),     y: -Math.cos(skew*skip)},
				{x: -Math.sin((skew+1)*skip), y: -Math.cos((skew+1)*skip)}
			];
			// for (var i=0; i <= 3; ++i){
			// 	points.push({
			// 		x: -Math.sin(i*skip),
			// 		y: -Math.cos(i*skip)
			// 	});
			// }
			// k is intersect L1 and L2
			// L1 from points[0] to points[2]
			// L2 from points[1] to points[3]
			var k = intersectLines(points[0], points[2], points[1], points[3]);
			
			// radius of unit-star-tip point over radius of unit-star-dent point
			var ratio = 1 / Math.sqrt(k.x*k.x + k.y*k.y);
			return ratio;
		}
	}
	
	num = num || 5;
	var points = [];
	var skip = Math.PI / num;
	var ratio = starRatio(num);
	points.push({x: cx, y: cy});
	for (var i=0; i <= num*2; ++i){
		var t = (i%2)? r : r/ratio; //2.61803398875;
		points.push({
			x: cx - t*Math.sin(i*skip),
			y: cy - t*Math.cos(i*skip)
		});
	}
	return points;
}

// Return an array of points for a rectangle
function rectPoints(lx, by, w, h){
	return [
		{x: lx, y: by},
		{x: lx, y: by+h},
		{x: lx+w, y: by+h},
		{x: lx+w, y: by}
	];
}


// Return scalar n-ary dot product of an array of points
function dotProductPoints(points){
	var prod = {x: 1, y: 1, z: 1, w: 1};
	for (var i in points){
		for (var f in points[i]){
			prod[f] *= points[i][f];
		}
	}
	
	var sum = 0;
	for (var f in prod){
		sum += prod[f];
	}
	
	return sum;
}

// return point at intersection of ab and xy
function intersectLines(a, b, x, y){
	// a + t*ab = x + u*xy
	// a.xyp + t*ab.xyp = x.xyp
	// t*ab.xyp = x.xyp - a.xyp
	// t = (x.xyp - a.xyp) / (ab.xyp)
	var ab = {x: b.x-a.x, y: b.y-a.y};
	var xy = {x: y.x - x.x, y: y.y-x.y};
	var xyp = {x: -xy.y, y: xy.x};
	var t = (dotProductPoints([x, xyp]) - dotProductPoints([a, xyp])) /
		dotProductPoints([ab, xyp]);
	var k = {x: a.x + t*ab.x, y: a.y + t*ab.y};
	return k;
}