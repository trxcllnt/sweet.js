'use strict';
var _ = require('underscore'), assert = require('assert'), unwrapSyntax = require('../syntax').unwrapSyntax, makeIdent = require('../syntax').makeIdent, resolve = require('../stx/resolve').resolve, StringMap = require('./stringMap'), List = require('immutable').List;
function Env() {
    // stores compiletime values
    this._map = new StringMap();
    // for fast path checking
    this._names = new StringMap();
}
Env.prototype.set = function (stx, phase, value) {
    assert(phase != null, 'must provide a phase');
    assert(value != null, 'must provide a value');
    // store the unresolved name string into the fast path lookup map
    this._names.set(unwrapSyntax(stx), true);
    this._map.set(resolve(stx, phase), value);
};
function isToksAdjacent(a, b) {
    var arange = a.token.sm_range || a.token.range || a.token.endRange;
    var brange = b.token.sm_range || b.token.range || b.token.endRange;
    return arange && brange && arange[1] === brange[0];
}
function isValidName(stx) {
    return stx.isIdentifier() || stx.isKeyword() || stx.isPunctuator();
}
function getName(stxl) {
    var head = stxl.first(), last = head;
    if (!isValidName(head)) {
        return List();
    }
    return List.of(head).concat(stxl.rest().takeWhile(function (stx) {
        var take = isValidName(stx) && isToksAdjacent(last, stx);
        last = stx;
        return take;
    }));
}
Env.prototype.get = function (stx, phase) {
    assert(phase != null, 'must provide phase');
    // normalize to a list
    stx = Array.isArray(stx) ? List(stx) : List.of(stx);
    var resolvedName, nameStr, nameStx, name = getName(stx);
    if (name.size === 0) {
        return null;
    } else if (name.size === 1) {
        if (// simple case, don't need to create a new syntax object
            this._names.get(unwrapSyntax(name.first()))) {
            resolvedName = resolve(name.first(), phase);
            if (this._map.has(resolvedName)) {
                return this._map.get(resolvedName);
            }
        }
        return null;
    } else {
        while (name.size > 0) {
            nameStr = name.map(unwrapSyntax).join('');
            if (this._names.get(nameStr)) {
                nameStx = makeIdent(nameStr, name.first());
                resolvedName = resolve(nameStx, phase);
                if (this._map.has(resolvedName)) {
                    return this._map.get(resolvedName);
                }
            }
            name = name.pop();
        }
        return null;
    }
};
Env.prototype.hasName = function (stx) {
    return this._names.has(unwrapSyntax(stx));
};
Env.prototype.has = function (stx, phase) {
    return this.get(stx, phase) !== null;
};
Env.prototype.keysStr = function () {
    return this._map.keys();
};
Env.prototype.getStr = function (key) {
    return this._map.get(key);
};
module.exports = Env;