/* Runs INSIDE a Web Worker, which itself lives in a sandboxed (opaque-origin) iframe. */
var py = null;

function seen() { return typeof WeakSet !== "undefined" ? new WeakSet() : null; }

function fmt(v, depth, circ) {
  depth = depth || 0;
  if (typeof v === "string") return depth ? JSON.stringify(v) : v;
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  var t = typeof v;
  if (t === "number" || t === "boolean") return String(v);
  if (t === "bigint") return v + "n";
  if (t === "symbol") return v.toString();
  if (t === "function") return "[Function" + (v.name ? ": " + v.name : " (anonymous)") + "]";
  if (v instanceof Error) return v.stack || (v.name + ": " + v.message);
  circ = circ || seen();
  if (circ) { if (circ.has(v)) return "[Circular]"; circ.add(v); }
  if (depth > 3) return Array.isArray(v) ? "[Array]" : "[Object]";
  try {
    if (v instanceof Map) return "Map(" + v.size + ") {" + Array.from(v).map(function (kv) { return fmt(kv[0], depth + 1, circ) + " => " + fmt(kv[1], depth + 1, circ); }).join(", ") + "}";
    if (v instanceof Set) return "Set(" + v.size + ") {" + Array.from(v).map(function (x) { return fmt(x, depth + 1, circ); }).join(", ") + "}";
    if (Array.isArray(v)) return "[" + v.map(function (x) { return fmt(x, depth + 1, circ); }).join(", ") + "]";
    if (v instanceof Date) return v.toISOString();
    var keys = Object.keys(v);
    if (!keys.length) return "{}";
    return "{ " + keys.map(function (k) { return k + ": " + fmt(v[k], depth + 1, circ); }).join(", ") + " }";
  } catch (e) { return String(v); }
}

function out(level, args) {
  postMessage({ t: "log", level: level, text: Array.prototype.map.call(args, function (a) { return fmt(a); }).join(" ") });
}
console.log = console.info = console.debug = function () { out("log", arguments); };
console.warn = function () { out("warn", arguments); };
console.error = function () { out("error", arguments); };
console.table = function (x) { out("log", [x]); };
console.clear = function () { postMessage({ t: "clear" }); };

/* ---- keep the worker alive until pending async work (timers, fetches) has settled ---- */
var active = 0;
var timers = {};
var _st = self.setTimeout, _ct = self.clearTimeout, _fetch = self.fetch;
self.setTimeout = function (fn, ms) {
  var extra = Array.prototype.slice.call(arguments, 2);
  active++;
  var id = _st(function () {
    if (timers[id]) { delete timers[id]; active--; }
    if (typeof fn === "function") fn.apply(self, extra);
  }, ms);
  timers[id] = true;
  return id;
};
self.clearTimeout = function (id) {
  if (timers[id]) { delete timers[id]; active--; }
  return _ct(id);
};
if (_fetch) {
  self.fetch = function () {
    active++;
    var p = _fetch.apply(self, arguments);
    var done = function () { active--; };
    p.then(done, done);
    return p;
  };
}
// setInterval is left untracked on purpose: it keeps running until Stop / the time limit
self.addEventListener("unhandledrejection", function (ev) {
  out("error", ["Unhandled promise rejection:", ev.reason]);
});

function settle() {
  return new Promise(function (res) {
    var quiet = 0;
    (function tick() {
      _st(function () {
        quiet = active === 0 ? quiet + 1 : 0;
        if (quiet >= 3) res(); else tick();
      }, 25);
    })();
  });
}

onmessage = async function (e) {
  var m = e.data;
  try {
    if (m.kind === "js") {
      var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      var r = await new AsyncFunction(m.code)();
      await settle();
      if (r !== undefined) postMessage({ t: "log", level: "result", text: fmt(r, 1) });
    } else {
      if (!py) {
        postMessage({ t: "status", text: "Loading Python runtime (first run only, ~10 MB)…" });
        importScripts(m.pyUrl + "pyodide.js");
        py = await loadPyodide({ indexURL: m.pyUrl });
        postMessage({ t: "status", text: "Running…" });
      }
      py.setStdout({ batched: function (s) { postMessage({ t: "log", level: "log", text: s }); } });
      py.setStderr({ batched: function (s) { postMessage({ t: "log", level: "error", text: s }); } });
      var res = await py.runPythonAsync(m.code);
      if (res !== undefined && res !== null) postMessage({ t: "log", level: "result", text: String(res) });
    }
  } catch (err) {
    var text = String((err && (err.stack || err.message)) || err);
    if (m.kind === "py") {
      // show only the user's part of the traceback, not pyodide's internal frames
      var all = text.split("\n");
      var from = -1;
      for (var i = 0; i < all.length; i++) { if (all[i].indexOf("<exec>") !== -1) { from = i; break; } }
      if (from > 0) text = ["Traceback (most recent call last):"].concat(all.slice(from)).join("\n");
      text = text.replace(/^PythonError: /, "");
    }
    postMessage({ t: "log", level: "error", text: text });
  }
  postMessage({ t: "done" });
};
