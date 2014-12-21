(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"../stx/resolve":13,"../syntax":15,"./stringMap":2,"assert":26,"immutable":34,"underscore":50}],2:[function(require,module,exports){
'use strict';
function StringMap(o) {
    this.__data = o || {};
}
StringMap.prototype = {
    keys: function () {
        return Object.keys(this.__data);
    },
    has: function (key) {
        return Object.prototype.hasOwnProperty.call(this.__data, key);
    },
    get: function (key) {
        return this.has(key) ? this.__data[key] : void 0;
    },
    set: function (key, value) {
        this.__data[key] = value;
    },
    extend: function () {
        var args = _.map(_.toArray(arguments), function (x) {
            return x.__data;
        });
        _.extend.apply(_, [this.__data].concat(args));
        return this;
    }
};
module.exports = StringMap;
},{}],3:[function(require,module,exports){
'use strict';
var _ = require('underscore'), syn = require('../syntax'), assert = require('assert');
var syntaxFromToken = syn.syntaxFromToken, adjustLineContext = syn.adjustLineContext, fresh = syn.fresh;
var push = Array.prototype.push;
function inherit(parent, child, methods) {
    var P = function () {
    };
    P.prototype = parent.prototype;
    child.prototype = new P();
    child.prototype.constructor = child;
    _.extend(child.prototype, methods);
}
function TermTree() {
}
TermTree.properties = [];
TermTree.create = function () {
    return new TermTree();
};
TermTree.prototype = {
    'isTermTree': true,
    'destruct': function (context, options) {
        assert(context, 'must pass in the context to destruct');
        options = options || {};
        var self = this;
        if (options.stripCompileTerm && this.isCompileTimeTerm) {
            return [];
        }
        if (options.stripModuleTerm && this.isModuleTimeTerm) {
            return [];
        }
        return _.reduce(this.constructor.properties, function (acc, prop) {
            if (self[prop] && self[prop].isTermTree) {
                push.apply(acc, self[prop].destruct(context, options));
                return acc;
            } else if (self[prop] && self[prop].token && self[prop].token.inner) {
                var src = self[prop].token;
                var keys = Object.keys(src);
                var newtok = {};
                for (var i = 0, len = keys.length, key; i < len; i++) {
                    key = keys[i];
                    newtok[key] = src[key];
                }
                var clone = syntaxFromToken(newtok, self[prop]);
                clone.token.inner = _.reduce(clone.token.inner, function (acc$2, t) {
                    if (t && t.isTermTree) {
                        push.apply(acc$2, t.destruct(context, options));
                        return acc$2;
                    }
                    acc$2.push(t);
                    return acc$2;
                }, []);
                acc.push(clone);
                return acc;
            } else if (Array.isArray(self[prop])) {
                var destArr = _.reduce(self[prop], function (acc$2, t) {
                    if (t && t.isTermTree) {
                        push.apply(acc$2, t.destruct(context, options));
                        return acc$2;
                    }
                    acc$2.push(t);
                    return acc$2;
                }, []);
                push.apply(acc, destArr);
                return acc;
            } else if (self[prop]) {
                acc.push(self[prop]);
                return acc;
            } else {
                return acc;
            }
        }, []);
    },
    'addDefCtx': function (def) {
        var self = this;
        _.each(this.constructor.properties, function (prop) {
            if (Array.isArray(self[prop])) {
                self[prop] = _.map(self[prop], function (item) {
                    return item.addDefCtx(def);
                });
            } else if (self[prop]) {
                self[prop] = self[prop].addDefCtx(def);
            }
        });
        return this;
    },
    'rename': function (id, name, phase) {
        var self = this;
        _.each(this.constructor.properties, function (prop) {
            if (Array.isArray(self[prop])) {
                self[prop] = _.map(self[prop], function (item) {
                    return item.rename(id, name, phase);
                });
            } else if (self[prop]) {
                self[prop] = self[prop].rename(id, name, phase);
            }
        });
        return this;
    },
    'imported': function (id, name, phase) {
        var self = this;
        _.each(this.constructor.properties, function (prop) {
            if (Array.isArray(self[prop])) {
                self[prop] = _.map(self[prop], function (item) {
                    return item.imported(id, name, phase);
                });
            } else if (self[prop]) {
                self[prop] = self[prop].imported(id, name, phase);
            }
        });
        return this;
    }
};
function EOFTerm(eof) {
    this.eof = eof;
}
EOFTerm.properties = ['eof'];
EOFTerm.create = function (eof) {
    return new EOFTerm(eof);
};
inherit(TermTree, EOFTerm, { 'isEOFTerm': true });
function KeywordTerm(keyword) {
    this.keyword = keyword;
}
KeywordTerm.properties = ['keyword'];
KeywordTerm.create = function (keyword) {
    return new KeywordTerm(keyword);
};
inherit(TermTree, KeywordTerm, { 'isKeywordTerm': true });
function PuncTerm(punc) {
    this.punc = punc;
}
PuncTerm.properties = ['punc'];
PuncTerm.create = function (punc) {
    return new PuncTerm(punc);
};
inherit(TermTree, PuncTerm, { 'isPuncTerm': true });
function DelimiterTerm(delim) {
    this.delim = delim;
}
DelimiterTerm.properties = ['delim'];
DelimiterTerm.create = function (delim) {
    return new DelimiterTerm(delim);
};
inherit(TermTree, DelimiterTerm, { 'isDelimiterTerm': true });
function ModuleTimeTerm() {
}
ModuleTimeTerm.properties = [];
ModuleTimeTerm.create = function () {
    return new ModuleTimeTerm();
};
inherit(TermTree, ModuleTimeTerm, { 'isModuleTimeTerm': true });
function ModuleTerm(body) {
    this.body = body;
}
ModuleTerm.properties = ['body'];
ModuleTerm.create = function (body) {
    return new ModuleTerm(body);
};
inherit(ModuleTimeTerm, ModuleTerm, { 'isModuleTerm': true });
function ImportTerm(kw, clause, fromkw, from) {
    this.kw = kw;
    this.clause = clause;
    this.fromkw = fromkw;
    this.from = from;
}
ImportTerm.properties = [
    'kw',
    'clause',
    'fromkw',
    'from'
];
ImportTerm.create = function (kw, clause, fromkw, from) {
    return new ImportTerm(kw, clause, fromkw, from);
};
inherit(ModuleTimeTerm, ImportTerm, { 'isImportTerm': true });
function ImportForMacrosTerm(kw, clause, fromkw, from, forkw, macroskw) {
    this.kw = kw;
    this.clause = clause;
    this.fromkw = fromkw;
    this.from = from;
    this.forkw = forkw;
    this.macroskw = macroskw;
}
ImportForMacrosTerm.properties = [
    'kw',
    'clause',
    'fromkw',
    'from',
    'forkw',
    'macroskw'
];
ImportForMacrosTerm.create = function (kw, clause, fromkw, from, forkw, macroskw) {
    return new ImportForMacrosTerm(kw, clause, fromkw, from, forkw, macroskw);
};
inherit(ModuleTimeTerm, ImportForMacrosTerm, { 'isImportForMacrosTerm': true });
function NamedImportTerm(names) {
    this.names = names;
}
NamedImportTerm.properties = ['names'];
NamedImportTerm.create = function (names) {
    return new NamedImportTerm(names);
};
inherit(ModuleTimeTerm, NamedImportTerm, { 'isNamedImportTerm': true });
function DefaultImportTerm(name) {
    this.name = name;
}
DefaultImportTerm.properties = ['name'];
DefaultImportTerm.create = function (name) {
    return new DefaultImportTerm(name);
};
inherit(ModuleTimeTerm, DefaultImportTerm, { 'isDefaultImportTerm': true });
function NamespaceImportTerm(star, askw, name) {
    this.star = star;
    this.askw = askw;
    this.name = name;
}
NamespaceImportTerm.properties = [
    'star',
    'askw',
    'name'
];
NamespaceImportTerm.create = function (star, askw, name) {
    return new NamespaceImportTerm(star, askw, name);
};
inherit(ModuleTimeTerm, NamespaceImportTerm, { 'isNamespaceImportTerm': true });
function BindingTerm(importName) {
    this.importName = importName;
}
BindingTerm.properties = ['importName'];
BindingTerm.create = function (importName) {
    return new BindingTerm(importName);
};
inherit(ModuleTimeTerm, BindingTerm, { 'isBindingTerm': true });
function QualifiedBindingTerm(importName, askw, localName) {
    this.importName = importName;
    this.askw = askw;
    this.localName = localName;
}
QualifiedBindingTerm.properties = [
    'importName',
    'askw',
    'localName'
];
QualifiedBindingTerm.create = function (importName, askw, localName) {
    return new QualifiedBindingTerm(importName, askw, localName);
};
inherit(ModuleTimeTerm, QualifiedBindingTerm, { 'isQualifiedBindingTerm': true });
function ExportNameTerm(kw, name) {
    this.kw = kw;
    this.name = name;
}
ExportNameTerm.properties = [
    'kw',
    'name'
];
ExportNameTerm.create = function (kw, name) {
    return new ExportNameTerm(kw, name);
};
inherit(ModuleTimeTerm, ExportNameTerm, { 'isExportNameTerm': true });
function ExportDefaultTerm(kw, defaultkw, decl) {
    this.kw = kw;
    this.defaultkw = defaultkw;
    this.decl = decl;
}
ExportDefaultTerm.properties = [
    'kw',
    'defaultkw',
    'decl'
];
ExportDefaultTerm.create = function (kw, defaultkw, decl) {
    return new ExportDefaultTerm(kw, defaultkw, decl);
};
inherit(ModuleTimeTerm, ExportDefaultTerm, { 'isExportDefaultTerm': true });
function ExportDeclTerm(kw, decl) {
    this.kw = kw;
    this.decl = decl;
}
ExportDeclTerm.properties = [
    'kw',
    'decl'
];
ExportDeclTerm.create = function (kw, decl) {
    return new ExportDeclTerm(kw, decl);
};
inherit(ModuleTimeTerm, ExportDeclTerm, { 'isExportDeclTerm': true });
function CompileTimeTerm() {
}
CompileTimeTerm.properties = [];
CompileTimeTerm.create = function () {
    return new CompileTimeTerm();
};
inherit(TermTree, CompileTimeTerm, { 'isCompileTimeTerm': true });
function LetMacroTerm(name, body) {
    this.name = name;
    this.body = body;
}
LetMacroTerm.properties = [
    'name',
    'body'
];
LetMacroTerm.create = function (name, body) {
    return new LetMacroTerm(name, body);
};
inherit(CompileTimeTerm, LetMacroTerm, { 'isLetMacroTerm': true });
function MacroTerm(name, body) {
    this.name = name;
    this.body = body;
}
MacroTerm.properties = [
    'name',
    'body'
];
MacroTerm.create = function (name, body) {
    return new MacroTerm(name, body);
};
inherit(CompileTimeTerm, MacroTerm, { 'isMacroTerm': true });
function AnonMacroTerm(body) {
    this.body = body;
}
AnonMacroTerm.properties = ['body'];
AnonMacroTerm.create = function (body) {
    return new AnonMacroTerm(body);
};
inherit(CompileTimeTerm, AnonMacroTerm, { 'isAnonMacroTerm': true });
function OperatorDefinitionTerm(type, name, prec, assoc, body) {
    this.type = type;
    this.name = name;
    this.prec = prec;
    this.assoc = assoc;
    this.body = body;
}
OperatorDefinitionTerm.properties = [
    'type',
    'name',
    'prec',
    'assoc',
    'body'
];
OperatorDefinitionTerm.create = function (type, name, prec, assoc, body) {
    return new OperatorDefinitionTerm(type, name, prec, assoc, body);
};
inherit(CompileTimeTerm, OperatorDefinitionTerm, { 'isOperatorDefinitionTerm': true });
function VariableDeclarationTerm(ident, eq, init, comma) {
    this.ident = ident;
    this.eq = eq;
    this.init = init;
    this.comma = comma;
}
VariableDeclarationTerm.properties = [
    'ident',
    'eq',
    'init',
    'comma'
];
VariableDeclarationTerm.create = function (ident, eq, init, comma) {
    return new VariableDeclarationTerm(ident, eq, init, comma);
};
inherit(TermTree, VariableDeclarationTerm, { 'isVariableDeclarationTerm': true });
function StatementTerm() {
}
StatementTerm.properties = [];
StatementTerm.create = function () {
    return new StatementTerm();
};
inherit(TermTree, StatementTerm, { 'isStatementTerm': true });
function EmptyTerm() {
}
EmptyTerm.properties = [];
EmptyTerm.create = function () {
    return new EmptyTerm();
};
inherit(StatementTerm, EmptyTerm, { 'isEmptyTerm': true });
function CatchClauseTerm(keyword, params, body) {
    this.keyword = keyword;
    this.params = params;
    this.body = body;
}
CatchClauseTerm.properties = [
    'keyword',
    'params',
    'body'
];
CatchClauseTerm.create = function (keyword, params, body) {
    return new CatchClauseTerm(keyword, params, body);
};
inherit(StatementTerm, CatchClauseTerm, { 'isCatchClauseTerm': true });
function ForStatementTerm(keyword, cond) {
    this.keyword = keyword;
    this.cond = cond;
}
ForStatementTerm.properties = [
    'keyword',
    'cond'
];
ForStatementTerm.create = function (keyword, cond) {
    return new ForStatementTerm(keyword, cond);
};
inherit(StatementTerm, ForStatementTerm, { 'isForStatementTerm': true });
function ReturnStatementTerm(keyword, expr) {
    this.keyword = keyword;
    this.expr = expr;
}
ReturnStatementTerm.properties = [
    'keyword',
    'expr'
];
ReturnStatementTerm.create = function (keyword, expr) {
    return new ReturnStatementTerm(keyword, expr);
};
inherit(StatementTerm, ReturnStatementTerm, {
    'isReturnStatementTerm': true,
    'destruct': function (context, options) {
        var expr = this.expr.destruct(context, options);
        // need to adjust the line numbers to make sure that the expr
        // starts on the same line as the return keyword. This might
        // not be the case if an operator or infix macro perturbed the
        // line numbers during expansion.
        expr = adjustLineContext(expr, this.keyword.keyword);
        return this.keyword.destruct(context, options).concat(expr);
    }
});
function ExprTerm() {
}
ExprTerm.properties = [];
ExprTerm.create = function () {
    return new ExprTerm();
};
inherit(StatementTerm, ExprTerm, { 'isExprTerm': true });
function UnaryOpTerm(op, expr) {
    this.op = op;
    this.expr = expr;
}
UnaryOpTerm.properties = [
    'op',
    'expr'
];
UnaryOpTerm.create = function (op, expr) {
    return new UnaryOpTerm(op, expr);
};
inherit(ExprTerm, UnaryOpTerm, { 'isUnaryOpTerm': true });
function PostfixOpTerm(expr, op) {
    this.expr = expr;
    this.op = op;
}
PostfixOpTerm.properties = [
    'expr',
    'op'
];
PostfixOpTerm.create = function (expr, op) {
    return new PostfixOpTerm(expr, op);
};
inherit(ExprTerm, PostfixOpTerm, { 'isPostfixOpTerm': true });
function BinOpTerm(left, op, right) {
    this.left = left;
    this.op = op;
    this.right = right;
}
BinOpTerm.properties = [
    'left',
    'op',
    'right'
];
BinOpTerm.create = function (left, op, right) {
    return new BinOpTerm(left, op, right);
};
inherit(ExprTerm, BinOpTerm, { 'isBinOpTerm': true });
function AssignmentExpressionTerm(left, op, right) {
    this.left = left;
    this.op = op;
    this.right = right;
}
AssignmentExpressionTerm.properties = [
    'left',
    'op',
    'right'
];
AssignmentExpressionTerm.create = function (left, op, right) {
    return new AssignmentExpressionTerm(left, op, right);
};
inherit(ExprTerm, AssignmentExpressionTerm, { 'isAssignmentExpressionTerm': true });
function ConditionalExpressionTerm(cond, question, tru, colon, fls) {
    this.cond = cond;
    this.question = question;
    this.tru = tru;
    this.colon = colon;
    this.fls = fls;
}
ConditionalExpressionTerm.properties = [
    'cond',
    'question',
    'tru',
    'colon',
    'fls'
];
ConditionalExpressionTerm.create = function (cond, question, tru, colon, fls) {
    return new ConditionalExpressionTerm(cond, question, tru, colon, fls);
};
inherit(ExprTerm, ConditionalExpressionTerm, { 'isConditionalExpressionTerm': true });
function NamedFunTerm(keyword, star, name, params, body) {
    this.keyword = keyword;
    this.star = star;
    this.name = name;
    this.params = params;
    this.body = body;
}
NamedFunTerm.properties = [
    'keyword',
    'star',
    'name',
    'params',
    'body'
];
NamedFunTerm.create = function (keyword, star, name, params, body) {
    return new NamedFunTerm(keyword, star, name, params, body);
};
inherit(ExprTerm, NamedFunTerm, { 'isNamedFunTerm': true });
function AnonFunTerm(keyword, star, params, body) {
    this.keyword = keyword;
    this.star = star;
    this.params = params;
    this.body = body;
}
AnonFunTerm.properties = [
    'keyword',
    'star',
    'params',
    'body'
];
AnonFunTerm.create = function (keyword, star, params, body) {
    return new AnonFunTerm(keyword, star, params, body);
};
inherit(ExprTerm, AnonFunTerm, { 'isAnonFunTerm': true });
function ArrowFunTerm(params, arrow, body) {
    this.params = params;
    this.arrow = arrow;
    this.body = body;
}
ArrowFunTerm.properties = [
    'params',
    'arrow',
    'body'
];
ArrowFunTerm.create = function (params, arrow, body) {
    return new ArrowFunTerm(params, arrow, body);
};
inherit(ExprTerm, ArrowFunTerm, { 'isArrowFunTerm': true });
function ObjDotGetTerm(left, dot, right) {
    this.left = left;
    this.dot = dot;
    this.right = right;
}
ObjDotGetTerm.properties = [
    'left',
    'dot',
    'right'
];
ObjDotGetTerm.create = function (left, dot, right) {
    return new ObjDotGetTerm(left, dot, right);
};
inherit(ExprTerm, ObjDotGetTerm, { 'isObjDotGetTerm': true });
function ObjGetTerm(left, right) {
    this.left = left;
    this.right = right;
}
ObjGetTerm.properties = [
    'left',
    'right'
];
ObjGetTerm.create = function (left, right) {
    return new ObjGetTerm(left, right);
};
inherit(ExprTerm, ObjGetTerm, { 'isObjGetTerm': true });
function TemplateTerm(template) {
    this.template = template;
}
TemplateTerm.properties = ['template'];
TemplateTerm.create = function (template) {
    return new TemplateTerm(template);
};
inherit(ExprTerm, TemplateTerm, { 'isTemplateTerm': true });
function CallTerm(fun, args) {
    this.fun = fun;
    this.args = args;
}
CallTerm.properties = [
    'fun',
    'args'
];
CallTerm.create = function (fun, args) {
    return new CallTerm(fun, args);
};
inherit(ExprTerm, CallTerm, { 'isCallTerm': true });
function QuoteSyntaxTerm(stx) {
    this.stx = stx;
}
QuoteSyntaxTerm.properties = ['stx'];
QuoteSyntaxTerm.create = function (stx) {
    return new QuoteSyntaxTerm(stx);
};
inherit(ExprTerm, QuoteSyntaxTerm, {
    'isQuoteSyntaxTerm': true,
    'destruct': function (context, options) {
        var tempId = fresh();
        context.templateMap.set(tempId, this.stx.token.inner);
        return [
            syn.makeIdent('getTemplate', this.stx),
            syn.makeDelim('()', [syn.makeValue(tempId, this.stx)], this.stx)
        ];
    }
});
function PrimaryExpressionTerm() {
}
PrimaryExpressionTerm.properties = [];
PrimaryExpressionTerm.create = function () {
    return new PrimaryExpressionTerm();
};
inherit(ExprTerm, PrimaryExpressionTerm, { 'isPrimaryExpressionTerm': true });
function ThisExpressionTerm(keyword) {
    this.keyword = keyword;
}
ThisExpressionTerm.properties = ['keyword'];
ThisExpressionTerm.create = function (keyword) {
    return new ThisExpressionTerm(keyword);
};
inherit(PrimaryExpressionTerm, ThisExpressionTerm, { 'isThisExpressionTerm': true });
function LitTerm(lit) {
    this.lit = lit;
}
LitTerm.properties = ['lit'];
LitTerm.create = function (lit) {
    return new LitTerm(lit);
};
inherit(PrimaryExpressionTerm, LitTerm, { 'isLitTerm': true });
function BlockTerm(body) {
    this.body = body;
}
BlockTerm.properties = ['body'];
BlockTerm.create = function (body) {
    return new BlockTerm(body);
};
inherit(PrimaryExpressionTerm, BlockTerm, { 'isBlockTerm': true });
function ArrayLiteralTerm(array) {
    this.array = array;
}
ArrayLiteralTerm.properties = ['array'];
ArrayLiteralTerm.create = function (array) {
    return new ArrayLiteralTerm(array);
};
inherit(PrimaryExpressionTerm, ArrayLiteralTerm, { 'isArrayLiteralTerm': true });
function IdTerm(id) {
    this.id = id;
}
IdTerm.properties = ['id'];
IdTerm.create = function (id) {
    return new IdTerm(id);
};
inherit(PrimaryExpressionTerm, IdTerm, { 'isIdTerm': true });
function PartialTerm() {
}
PartialTerm.properties = [];
PartialTerm.create = function () {
    return new PartialTerm();
};
inherit(TermTree, PartialTerm, { 'isPartialTerm': true });
function PartialOperationTerm(stx, left) {
    this.stx = stx;
    this.left = left;
}
PartialOperationTerm.properties = [
    'stx',
    'left'
];
PartialOperationTerm.create = function (stx, left) {
    return new PartialOperationTerm(stx, left);
};
inherit(PartialTerm, PartialOperationTerm, { 'isPartialOperationTerm': true });
function PartialExpressionTerm(stx, left, combine) {
    this.stx = stx;
    this.left = left;
    this.combine = combine;
}
PartialExpressionTerm.properties = [
    'stx',
    'left',
    'combine'
];
PartialExpressionTerm.create = function (stx, left, combine) {
    return new PartialExpressionTerm(stx, left, combine);
};
inherit(PartialTerm, PartialExpressionTerm, { 'isPartialExpressionTerm': true });
function BindingStatementTerm(keyword, decls) {
    this.keyword = keyword;
    this.decls = decls;
}
BindingStatementTerm.properties = [
    'keyword',
    'decls'
];
BindingStatementTerm.create = function (keyword, decls) {
    return new BindingStatementTerm(keyword, decls);
};
inherit(StatementTerm, BindingStatementTerm, {
    'isBindingStatementTerm': true,
    'destruct': function (context, options) {
        return this.keyword.destruct(context, options).concat(_.reduce(this.decls, function (acc, decl) {
            push.apply(acc, decl.destruct(context, options));
            return acc;
        }, []));
    }
});
function VariableStatementTerm(keyword, decls) {
    this.keyword = keyword;
    this.decls = decls;
}
VariableStatementTerm.properties = [
    'keyword',
    'decls'
];
VariableStatementTerm.create = function (keyword, decls) {
    return new VariableStatementTerm(keyword, decls);
};
inherit(BindingStatementTerm, VariableStatementTerm, { 'isVariableStatementTerm': true });
function LetStatementTerm(keyword, decls) {
    this.keyword = keyword;
    this.decls = decls;
}
LetStatementTerm.properties = [
    'keyword',
    'decls'
];
LetStatementTerm.create = function (keyword, decls) {
    return new LetStatementTerm(keyword, decls);
};
inherit(BindingStatementTerm, LetStatementTerm, { 'isLetStatementTerm': true });
function ConstStatementTerm(keyword, decls) {
    this.keyword = keyword;
    this.decls = decls;
}
ConstStatementTerm.properties = [
    'keyword',
    'decls'
];
ConstStatementTerm.create = function (keyword, decls) {
    return new ConstStatementTerm(keyword, decls);
};
inherit(BindingStatementTerm, ConstStatementTerm, { 'isConstStatementTerm': true });
function ParenExpressionTerm(args, delim, commas) {
    this.args = args;
    this.delim = delim;
    this.commas = commas;
}
ParenExpressionTerm.properties = [
    'args',
    'delim',
    'commas'
];
ParenExpressionTerm.create = function (args, delim, commas) {
    return new ParenExpressionTerm(args, delim, commas);
};
inherit(PrimaryExpressionTerm, ParenExpressionTerm, {
    'isParenExpressionTerm': true,
    'destruct': function (context, options) {
        var commas = this.commas.slice();
        var src = this.delim.token;
        var keys = Object.keys(src);
        var newtok = {};
        for (var i = 0, len = keys.length, key; i < len; i++) {
            key = keys[i];
            newtok[key] = src[key];
        }
        var delim = syntaxFromToken(newtok, this.delim);
        delim.token.inner = _.reduce(this.args, function (acc, term) {
            assert(term && term.isTermTree, 'expecting term trees in destruct of ParenExpression');
            push.apply(acc, term.destruct(context, options));
            if (// add all commas except for the last one
                commas.length > 0) {
                acc.push(commas.shift());
            }
            return acc;
        }, []);
        return DelimiterTerm.create(delim).destruct(context, options);
    }
});
module.exports = {
    TermTree: TermTree,
    EOFTerm: EOFTerm,
    KeywordTerm: KeywordTerm,
    PuncTerm: PuncTerm,
    DelimiterTerm: DelimiterTerm,
    ModuleTimeTerm: ModuleTimeTerm,
    ModuleTerm: ModuleTerm,
    ImportTerm: ImportTerm,
    ImportForMacrosTerm: ImportForMacrosTerm,
    NamedImportTerm: NamedImportTerm,
    NamespaceImportTerm: NamespaceImportTerm,
    DefaultImportTerm: DefaultImportTerm,
    BindingTerm: BindingTerm,
    QualifiedBindingTerm: QualifiedBindingTerm,
    ExportNameTerm: ExportNameTerm,
    ExportDefaultTerm: ExportDefaultTerm,
    ExportDeclTerm: ExportDeclTerm,
    CompileTimeTerm: CompileTimeTerm,
    LetMacroTerm: LetMacroTerm,
    MacroTerm: MacroTerm,
    AnonMacroTerm: AnonMacroTerm,
    OperatorDefinitionTerm: OperatorDefinitionTerm,
    VariableDeclarationTerm: VariableDeclarationTerm,
    StatementTerm: StatementTerm,
    EmptyTerm: EmptyTerm,
    CatchClauseTerm: CatchClauseTerm,
    ForStatementTerm: ForStatementTerm,
    ReturnStatementTerm: ReturnStatementTerm,
    ExprTerm: ExprTerm,
    UnaryOpTerm: UnaryOpTerm,
    PostfixOpTerm: PostfixOpTerm,
    BinOpTerm: BinOpTerm,
    AssignmentExpressionTerm: AssignmentExpressionTerm,
    ConditionalExpressionTerm: ConditionalExpressionTerm,
    NamedFunTerm: NamedFunTerm,
    AnonFunTerm: AnonFunTerm,
    ArrowFunTerm: ArrowFunTerm,
    ObjDotGetTerm: ObjDotGetTerm,
    ObjGetTerm: ObjGetTerm,
    TemplateTerm: TemplateTerm,
    CallTerm: CallTerm,
    QuoteSyntaxTerm: QuoteSyntaxTerm,
    PrimaryExpressionTerm: PrimaryExpressionTerm,
    ThisExpressionTerm: ThisExpressionTerm,
    LitTerm: LitTerm,
    BlockTerm: BlockTerm,
    ArrayLiteralTerm: ArrayLiteralTerm,
    IdTerm: IdTerm,
    PartialTerm: PartialTerm,
    PartialOperationTerm: PartialOperationTerm,
    PartialExpressionTerm: PartialExpressionTerm,
    BindingStatementTerm: BindingStatementTerm,
    VariableStatementTerm: VariableStatementTerm,
    LetStatementTerm: LetStatementTerm,
    ConstStatementTerm: ConstStatementTerm,
    ParenExpressionTerm: ParenExpressionTerm
};
},{"../syntax":15,"assert":26,"underscore":50}],4:[function(require,module,exports){
'use strict';
function SyntaxTransform(trans, isOp, builtin, fullName) {
    this.fn = trans;
    this.isOp = isOp;
    this.builtin = builtin;
    this.fullName = fullName;
}
function VarTransform(id) {
    this.id = id;
}
exports.SyntaxTransform = SyntaxTransform;
exports.VarTransform = VarTransform;
},{}],5:[function(require,module,exports){
var _ = require("underscore");
var sweet = require("./sweet");
var syn = require("./syntax");
var storage_code = 'editor_code';
var storage_mode = 'editor_mode';

$(function() {
    var starting_code = $("#editor").text();
    var compileWithSourcemap = $("body").attr("data-sourcemap") === "true";

    var editor = CodeMirror.fromTextArea($('#editor')[0], {
        lineNumbers: true,
        smartIndent: false,
        indentWithTabs: true,
        tabSize: 4,
        autofocus: true,
        theme: 'solarized dark'
    });

    var currentStep = 1;

    if (window.location.hash) {
        editor.setValue(decodeURI(window.location.hash.slice(1)));
    } else {
        editor.setValue(localStorage[storage_code] ? localStorage[storage_code] : starting_code);
    }
    if(localStorage[storage_mode]) {
        editor.setOption("keyMap", localStorage[storage_mode]);
    }

    var output = CodeMirror.fromTextArea($('#output')[0], {
        lineNumbers: true,
        theme: 'solarized dark',
        readOnly: true
    });

    $('#btn-vim').click(function() {
        editor.setOption('keyMap', 'vim');
        editor.focus();
        localStorage[storage_mode] = "vim";
    });
    $('#btn-emacs').click(function() {
        editor.setOption('keyMap', 'emacs');
        editor.focus();
        localStorage[storage_mode] = "emacs";
    });

    $('#btn-step').click(function() {
        var unparsedString = syn.prettyPrint(
            sweet.expand(editor.getValue(), 
                         undefined, 
                         currentStep++),
            $("#ck-hygiene").prop("checked"));
        $("#lab-step").text(currentStep);
        output.setValue(unparsedString); 
    });

    var updateTimeout;
    editor.on("change", function(e) {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(updateExpand, 200);
    });

    function updateExpand() {
        var code = editor.getValue();
        var expanded, compiled, res;
        window.location = "editor.html#" + encodeURI(code);
        localStorage[storage_code] = code;
        try {
            if (compileWithSourcemap) {
                res = sweet.compile(code, {
                    sourceMap: true,
                    filename: "test.js",
                    readableNames: true
                })[0];
            } else {
                res = sweet.compile(code, {
                    sourceMap: false,
                    readableNames: true
                })[0];
            }
            compiled = res.code;
            output.setValue(compiled);

            $('#errors').text('');
            $('#errors').hide();
        } catch (e) {
            $('#errors').text(e);
            $('#errors').show();
        }
    }
    updateExpand();
});

},{"./sweet":14,"./syntax":15,"underscore":50}],6:[function(require,module,exports){
/*
  Copyright (C) 2012 Tim Disney <tim@disnet.me>


  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/*global require: true, exports:true, console: true
*/
// import @ from "contracts.js"
'use strict';
var codegen = require('escodegen'), _ = require('underscore'), parser = require('./parser'), syn = require('./syntax'), se = require('./scopedEval'), StringMap = require('./data/stringMap'), Env = require('./data/env'), SyntaxTransform = require('./data/transforms').SyntaxTransform, VarTransform = require('./data/transforms').VarTransform, resolve = require('./stx/resolve').resolve, marksof = require('./stx/resolve').marksof, arraysEqual = require('./stx/resolve').arraysEqual, makeImportEntries = require('./mod/importEntry').makeImportEntries, ExportEntry = require('./mod/exportEntry').ExportEntry, ModuleRecord = require('./mod/moduleRecord').ModuleRecord, patternModule = require('./patterns'), vm = require('vm'), Immutable = require('immutable'), assert = require('assert'), termTree = require('./data/termTree');
var throwSyntaxError = syn.throwSyntaxError;
var throwSyntaxCaseError = syn.throwSyntaxCaseError;
var SyntaxCaseError = syn.SyntaxCaseError;
var unwrapSyntax = syn.unwrapSyntax;
var makeIdent = syn.makeIdent;
var adjustLineContext = syn.adjustLineContext;
var fresh = syn.fresh;
var TermTree = termTree.TermTree, EOFTerm = termTree.EOFTerm, KeywordTerm = termTree.KeywordTerm, PuncTerm = termTree.PuncTerm, DelimiterTerm = termTree.DelimiterTerm, ModuleTimeTerm = termTree.ModuleTimeTerm, ModuleTerm = termTree.ModuleTerm, ImportTerm = termTree.ImportTerm, ImportForMacrosTerm = termTree.ImportForMacrosTerm, NamedImportTerm = termTree.NamedImportTerm, DefaultImportTerm = termTree.DefaultImportTerm, NamespaceImportTerm = termTree.NamespaceImportTerm, BindingTerm = termTree.BindingTerm, QualifiedBindingTerm = termTree.QualifiedBindingTerm, ExportNameTerm = termTree.ExportNameTerm, ExportDefaultTerm = termTree.ExportDefaultTerm, ExportDeclTerm = termTree.ExportDeclTerm, CompileTimeTerm = termTree.CompileTimeTerm, LetMacroTerm = termTree.LetMacroTerm, MacroTerm = termTree.MacroTerm, AnonMacroTerm = termTree.AnonMacroTerm, OperatorDefinitionTerm = termTree.OperatorDefinitionTerm, VariableDeclarationTerm = termTree.VariableDeclarationTerm, StatementTerm = termTree.StatementTerm, EmptyTerm = termTree.EmptyTerm, CatchClauseTerm = termTree.CatchClauseTerm, ForStatementTerm = termTree.ForStatementTerm, ReturnStatementTerm = termTree.ReturnStatementTerm, ExprTerm = termTree.ExprTerm, UnaryOpTerm = termTree.UnaryOpTerm, PostfixOpTerm = termTree.PostfixOpTerm, BinOpTerm = termTree.BinOpTerm, AssignmentExpressionTerm = termTree.AssignmentExpressionTerm, ConditionalExpressionTerm = termTree.ConditionalExpressionTerm, NamedFunTerm = termTree.NamedFunTerm, AnonFunTerm = termTree.AnonFunTerm, ArrowFunTerm = termTree.ArrowFunTerm, ObjDotGetTerm = termTree.ObjDotGetTerm, ObjGetTerm = termTree.ObjGetTerm, TemplateTerm = termTree.TemplateTerm, CallTerm = termTree.CallTerm, QuoteSyntaxTerm = termTree.QuoteSyntaxTerm, PrimaryExpressionTerm = termTree.PrimaryExpressionTerm, ThisExpressionTerm = termTree.ThisExpressionTerm, LitTerm = termTree.LitTerm, BlockTerm = termTree.BlockTerm, ArrayLiteralTerm = termTree.ArrayLiteralTerm, IdTerm = termTree.IdTerm, PartialTerm = termTree.PartialTerm, PartialOperationTerm = termTree.PartialOperationTerm, PartialExpressionTerm = termTree.PartialExpressionTerm, BindingStatementTerm = termTree.BindingStatementTerm, VariableStatementTerm = termTree.VariableStatementTerm, LetStatementTerm = termTree.LetStatementTerm, ConstStatementTerm = termTree.ConstStatementTerm, ParenExpressionTerm = termTree.ParenExpressionTerm;
var scopedEval = se.scopedEval;
var syntaxFromToken = syn.syntaxFromToken;
var joinSyntax = syn.joinSyntax;
var builtinMode = false;
var expandCount = 0;
var maxExpands;
var availableModules;
var push = Array.prototype.push;
function wrapDelim(towrap, delimSyntax) {
    assert(delimSyntax.isDelimiterToken(), 'expecting a delimiter token');
    return syntaxFromToken({
        type: parser.Token.Delimiter,
        value: delimSyntax.token.value,
        inner: towrap,
        range: delimSyntax.token.range,
        startLineNumber: delimSyntax.token.startLineNumber,
        lineStart: delimSyntax.token.lineStart
    }, delimSyntax);
}
function getParamIdentifiers(argSyntax) {
    if (argSyntax.isDelimiter()) {
        return _.filter(argSyntax.token.inner, function (stx) {
            return stx.token.value !== ',';
        });
    } else if (argSyntax.isIdentifier()) {
        return [argSyntax];
    } else {
        assert(false, 'expecting a delimiter or a single identifier for function parameters');
    }
}
function stxIsUnaryOp(stx) {
    var staticOperators = [
        '+',
        '-',
        '~',
        '!',
        'delete',
        'void',
        'typeof',
        'yield',
        'new',
        '++',
        '--'
    ];
    return _.contains(staticOperators, unwrapSyntax(stx));
}
function stxIsBinOp(stx) {
    var staticOperators = [
        '+',
        '-',
        '*',
        '/',
        '%',
        '||',
        '&&',
        '|',
        '&',
        '^',
        '==',
        '!=',
        '===',
        '!==',
        '<',
        '>',
        '<=',
        '>=',
        'in',
        'instanceof',
        '<<',
        '>>',
        '>>>'
    ];
    return _.contains(staticOperators, unwrapSyntax(stx));
}
function getUnaryOpPrec(op) {
    var operatorPrecedence = {
        'new': 16,
        '++': 15,
        '--': 15,
        '!': 14,
        '~': 14,
        '+': 14,
        '-': 14,
        'typeof': 14,
        'void': 14,
        'delete': 14,
        'yield': 2
    };
    return operatorPrecedence[op];
}
function getBinaryOpPrec(op) {
    var operatorPrecedence = {
        '*': 13,
        '/': 13,
        '%': 13,
        '+': 12,
        '-': 12,
        '>>': 11,
        '<<': 11,
        '>>>': 11,
        '<': 10,
        '<=': 10,
        '>': 10,
        '>=': 10,
        'in': 10,
        'instanceof': 10,
        '==': 9,
        '!=': 9,
        '===': 9,
        '!==': 9,
        '&': 8,
        '^': 7,
        '|': 6,
        '&&': 5,
        '||': 4
    };
    return operatorPrecedence[op];
}
function getBinaryOpAssoc(op) {
    var operatorAssoc = {
        '*': 'left',
        '/': 'left',
        '%': 'left',
        '+': 'left',
        '-': 'left',
        '>>': 'left',
        '<<': 'left',
        '>>>': 'left',
        '<': 'left',
        '<=': 'left',
        '>': 'left',
        '>=': 'left',
        'in': 'left',
        'instanceof': 'left',
        '==': 'left',
        '!=': 'left',
        '===': 'left',
        '!==': 'left',
        '&': 'left',
        '^': 'left',
        '|': 'left',
        '&&': 'left',
        '||': 'left'
    };
    return operatorAssoc[op];
}
function stxIsAssignOp(stx) {
    var staticOperators = [
        '=',
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '<<=',
        '>>=',
        '>>>=',
        '|=',
        '^=',
        '&='
    ];
    return _.contains(staticOperators, unwrapSyntax(stx));
}
function enforestImportClause(stx) {
    if (stx[0] && stx[0].isDelimiter()) {
        return {
            result: NamedImportTerm.create(stx[0]),
            rest: stx.slice(1)
        };
    } else if (stx[0] && stx[0].isPunctuator() && unwrapSyntax(stx[0]) === '*' && stx[1] && unwrapSyntax(stx[1]) === 'as' && stx[2]) {
        return {
            result: NamespaceImportTerm.create(stx[0], stx[1], stx[2]),
            rest: stx.slice(3)
        };
    } else {
        return {
            result: DefaultImportTerm.create(stx[0]),
            rest: stx.slice(1)
        };
    }
}
function enforestImportClauseList(stx) {
    var res = [];
    var clause = enforestImportClause(stx);
    var rest = clause.rest;
    res.push(clause.result);
    if (rest[0] && rest[0].isPunctuator() && unwrapSyntax(rest[0]) === ',') {
        res.push(rest[0]);
        clause = enforestImportClause(rest.slice(1));
        res.push(clause.result);
        rest = clause.rest;
    }
    return {
        result: res,
        rest: rest
    };
}
function enforestImport(head, rest) {
    assert(unwrapSyntax(head) === 'import', 'only call for imports');
    var clause = enforestImportClauseList(rest);
    rest = clause.rest;
    if (rest[0] && unwrapSyntax(rest[0]) === 'from' && rest[1] && rest[1].isStringLiteral() && rest[2] && unwrapSyntax(rest[2]) === 'for' && rest[3] && unwrapSyntax(rest[3]) === 'macros') {
        var importRest;
        if (rest[4] && rest[4].isPunctuator() && rest[4].token.value === ';') {
            importRest = rest.slice(5);
        } else {
            importRest = rest.slice(4);
        }
        return {
            result: ImportForMacrosTerm.create(head, clause.result, rest[0], rest[1], rest[2], rest[3]),
            rest: importRest
        };
    } else if (rest[0] && unwrapSyntax(rest[0]) === 'from' && rest[1] && rest[1].isStringLiteral()) {
        var importRest;
        if (rest[2] && rest[2].isPunctuator() && rest[2].token.value === ';') {
            importRest = rest.slice(3);
        } else {
            importRest = rest.slice(2);
        }
        return {
            result: ImportTerm.create(head, clause.result, rest[0], rest[1]),
            rest: importRest
        };
    } else {
        throwSyntaxError('enforest', 'unrecognized import syntax', rest);
    }
}
function enforestVarStatement(stx, context, varStx) {
    var decls = [];
    var rest = stx;
    var rhs;
    if (!rest.length) {
        throwSyntaxError('enforest', 'Unexpected end of input', varStx);
    }
    if (expandCount >= maxExpands) {
        return null;
    }
    while (rest.length) {
        if (rest[0].isIdentifier()) {
            if (rest[1] && rest[1].isPunctuator() && rest[1].token.value === '=') {
                rhs = get_expression(rest.slice(2), context);
                if (rhs.result == null) {
                    throwSyntaxError('enforest', 'Unexpected token', rhs.rest[0]);
                }
                if (rhs.rest[0] && rhs.rest[0].isPunctuator() && rhs.rest[0].token.value === ',') {
                    decls.push(VariableDeclarationTerm.create(rest[0], rest[1], rhs.result, rhs.rest[0]));
                    rest = rhs.rest.slice(1);
                    continue;
                } else {
                    decls.push(VariableDeclarationTerm.create(rest[0], rest[1], rhs.result, null));
                    rest = rhs.rest;
                    break;
                }
            } else if (rest[1] && rest[1].isPunctuator() && rest[1].token.value === ',') {
                decls.push(VariableDeclarationTerm.create(rest[0], null, null, rest[1]));
                rest = rest.slice(2);
            } else {
                decls.push(VariableDeclarationTerm.create(rest[0], null, null, null));
                rest = rest.slice(1);
                break;
            }
        } else {
            throwSyntaxError('enforest', 'Unexpected token', rest[0]);
        }
    }
    return {
        result: decls,
        rest: rest
    };
}
function enforestAssignment(stx, context, left, prevStx, prevTerms) {
    var op = stx[0];
    var rightStx = stx.slice(1);
    var opTerm = PuncTerm.create(stx[0]);
    var opPrevStx = tagWithTerm(opTerm, [stx[0]]).concat(tagWithTerm(left, left.destruct(context).reverse()), prevStx);
    var opPrevTerms = [
        opTerm,
        left
    ].concat(prevTerms);
    var opRes = enforest(rightStx, context, opPrevStx, opPrevTerms);
    if (opRes.result) {
        if (// Lookbehind was matched, so it may not even be a binop anymore.
            opRes.prevTerms.length < opPrevTerms.length) {
            return opRes;
        }
        var right = opRes.result;
        if (// only a binop if the right is a real expression
            // so 2+2++ will only match 2+2
            right.isExprTerm) {
            var term = AssignmentExpressionTerm.create(left, op, right);
            return {
                result: term,
                rest: opRes.rest,
                prevStx: prevStx,
                prevTerms: prevTerms
            };
        }
    } else {
        return opRes;
    }
}
function enforestParenExpression(parens, context) {
    var argRes, enforestedArgs = [], commas = [];
    var innerTokens = parens.token.inner;
    while (innerTokens.length > 0) {
        argRes = enforest(innerTokens, context);
        if (!argRes.result || !argRes.result.isExprTerm) {
            return null;
        }
        enforestedArgs.push(argRes.result);
        innerTokens = argRes.rest;
        if (innerTokens[0] && innerTokens[0].token.value === ',') {
            // record the comma for later
            commas.push(innerTokens[0]);
            // but dump it for the next loop turn
            innerTokens = innerTokens.slice(1);
        } else {
            // either there are no more tokens or
            // they aren't a comma, either way we
            // are done with the loop
            break;
        }
    }
    return innerTokens.length ? null : ParenExpressionTerm.create(enforestedArgs, parens, commas);
}
function makeMultiToken(stxl) {
    assert(Array.isArray(stxl), 'must be an array');
    return makeIdent(stxl.map(unwrapSyntax).join(''), stxl[0]);
}
function resolveFast(stx, context, phase) {
    return hasSyntaxTransform(stx, context, phase) ? resolve(stx, phase) : unwrapSyntax(stx);
}
function getCompiletimeValue(stx, context, phase) {
    var env = context.env.get(stx, phase);
    return env !== null ? env : context.store.get(stx, phase);
}
function getSyntaxTransform(stx, context, phase) {
    var t = context.env.get(stx, phase);
    if (!(t instanceof VarTransform)) {
        return t !== null ? t : context.store.get(stx, phase);
    }
    return null;
}
function hasSyntaxTransform(stx, context, phase) {
    return getSyntaxTransform(stx, context, phase) !== null;
}
function hasCompiletimeValue(stx, context, phase) {
    return context.env.has(stx, phase) || context.store.has(stx, phase);
}
function expandMacro(stx, context, opCtx, opType, macroObj) {
    var // pull the macro transformer out the environment
    head = stx[0];
    var rest = stx.slice(1);
    macroObj = macroObj || getSyntaxTransform(stx, context, context.phase);
    var stxArg = rest.slice(macroObj.fullName.length - 1);
    var transformer;
    if (opType != null) {
        assert(opType === 'binary' || opType === 'unary', 'operator type should be either unary or binary: ' + opType);
        transformer = macroObj[opType].fn;
    } else {
        transformer = macroObj.fn;
    }
    assert(typeof transformer === 'function', 'Macro transformer not bound for: ' + head.token.value);
    var // create a new mark to be used for the input to
    // the macro
    newMark = fresh();
    var transformerContext = makeExpanderContext(_.defaults({ mark: newMark }, context));
    // apply the transformer
    var rt;
    try {
        rt = transformer([head].concat(stxArg), transformerContext, opCtx.prevStx, opCtx.prevTerms);
    } catch (e) {
        if (e instanceof SyntaxCaseError) {
            var // add a nicer error for syntax case
            nameStr = macroObj.fullName.map(function (stx$2) {
                return stx$2.token.value;
            }).join('');
            if (opType != null) {
                var argumentString = '`' + stxArg.slice(0, 5).map(function (stx$2) {
                    return stx$2.token.value;
                }).join(' ') + '...`';
                throwSyntaxError('operator', 'Operator `' + nameStr + '` could not be matched with ' + argumentString, head);
            } else {
                var argumentString = '`' + stxArg.slice(0, 5).map(function (stx$2) {
                    return stx$2.token.value;
                }).join(' ') + '...`';
                throwSyntaxError('macro', 'Macro `' + nameStr + '` could not be matched with ' + argumentString, head);
            }
        } else {
            // just rethrow it
            throw e;
        }
    }
    if (!builtinMode && !macroObj.builtin) {
        expandCount++;
    }
    if (!Array.isArray(rt.result)) {
        throwSyntaxError('enforest', 'Macro must return a syntax array', stx[0]);
    }
    if (rt.result.length > 0) {
        var adjustedResult = adjustLineContext(rt.result, head);
        if (stx[0].token.leadingComments) {
            if (adjustedResult[0].token.leadingComments) {
                adjustedResult[0].token.leadingComments = adjustedResult[0].token.leadingComments.concat(head.token.leadingComments);
            } else {
                adjustedResult[0].token.leadingComments = head.token.leadingComments;
            }
        }
        rt.result = adjustedResult;
    }
    return rt;
}
function comparePrec(left, right, assoc) {
    if (assoc === 'left') {
        return left <= right;
    }
    return left < right;
}
function toksAdjacent(a, b) {
    var arange = a.token.sm_range || a.token.range || a.token.endRange;
    var brange = b.token.sm_range || b.token.range || b.token.endRange;
    return arange && brange && arange[1] === brange[0];
}
function syntaxInnerValuesEq(synA, synB) {
    var a = synA.token.inner, b = synB.token.inner;
    return function (ziped) {
        return _.all(ziped, function (pair) {
            return unwrapSyntax(pair[0]) === unwrapSyntax(pair[1]);
        });
    }(a.length === b.length && _.zip(a, b));
}
function enforest(toks, context, prevStx, prevTerms) {
    assert(toks.length > 0, 'enforest assumes there are tokens to work with');
    prevStx = prevStx || [];
    prevTerms = prevTerms || [];
    if (expandCount >= maxExpands) {
        return {
            result: null,
            rest: toks
        };
    }
    function step(head, rest, opCtx) {
        var innerTokens;
        assert(Array.isArray(rest), 'result must at least be an empty array');
        if (head.isTermTree) {
            var isCustomOp = false;
            var uopMacroObj;
            var uopSyntax;
            if (head.isPuncTerm || head.isKeywordTerm || head.isIdTerm) {
                if (head.isPuncTerm) {
                    uopSyntax = head.punc;
                } else if (head.isKeywordTerm) {
                    uopSyntax = head.keyword;
                } else if (head.isIdTerm) {
                    uopSyntax = head.id;
                }
                uopMacroObj = getSyntaxTransform([uopSyntax].concat(rest), context, context.phase);
                isCustomOp = uopMacroObj && uopMacroObj.isOp;
            }
            // look up once (we want to check multiple properties on bopMacroObj
            // without repeatedly calling getValueInEnv)
            var bopMacroObj;
            if (rest[0] && rest[1]) {
                bopMacroObj = getSyntaxTransform(rest, context, context.phase);
            }
            if (// unary operator
                isCustomOp && uopMacroObj.unary || uopSyntax && stxIsUnaryOp(uopSyntax)) {
                var uopPrec;
                if (isCustomOp && uopMacroObj.unary) {
                    uopPrec = uopMacroObj.unary.prec;
                } else {
                    uopPrec = getUnaryOpPrec(unwrapSyntax(uopSyntax));
                }
                var opRest = rest;
                var uopMacroName;
                if (uopMacroObj) {
                    uopMacroName = [uopSyntax].concat(rest.slice(0, uopMacroObj.fullName.length - 1));
                    opRest = rest.slice(uopMacroObj.fullName.length - 1);
                }
                var leftLeft = opCtx.prevTerms[0] && opCtx.prevTerms[0].isPartialTerm ? opCtx.prevTerms[0] : null;
                var unopTerm = PartialOperationTerm.create(head, leftLeft);
                var unopPrevStx = tagWithTerm(unopTerm, head.destruct(context).reverse()).concat(opCtx.prevStx);
                var unopPrevTerms = [unopTerm].concat(opCtx.prevTerms);
                var unopOpCtx = _.extend({}, opCtx, {
                    combine: function (t) {
                        if (t.isExprTerm) {
                            if (isCustomOp && uopMacroObj.unary) {
                                var rt$2 = expandMacro(uopMacroName.concat(t.destruct(context)), context, opCtx, 'unary');
                                var newt = get_expression(rt$2.result, context);
                                assert(newt.rest.length === 0, 'should never have left over syntax');
                                return opCtx.combine(newt.result);
                            }
                            return opCtx.combine(UnaryOpTerm.create(uopSyntax, t));
                        } else {
                            // not actually an expression so don't create
                            // a UnaryOp term just return with the punctuator
                            return opCtx.combine(head);
                        }
                    },
                    prec: uopPrec,
                    prevStx: unopPrevStx,
                    prevTerms: unopPrevTerms,
                    op: unopTerm
                });
                return step(opRest[0], opRest.slice(1), unopOpCtx);
            } else if (head.isExprTerm && (rest[0] && rest[1] && (stxIsBinOp(rest[0]) && !bopMacroObj || bopMacroObj && bopMacroObj.isOp && bopMacroObj.binary))) {
                var opRes;
                var op = rest[0];
                var left = head;
                var rightStx = rest.slice(1);
                var leftLeft = opCtx.prevTerms[0] && opCtx.prevTerms[0].isPartialTerm ? opCtx.prevTerms[0] : null;
                var leftTerm = PartialExpressionTerm.create(head.destruct(context), leftLeft, function () {
                    return step(head, [], opCtx);
                });
                var opTerm = PartialOperationTerm.create(op, leftTerm);
                var opPrevStx = tagWithTerm(opTerm, [rest[0]]).concat(tagWithTerm(leftTerm, head.destruct(context)).reverse(), opCtx.prevStx);
                var opPrevTerms = [
                    opTerm,
                    leftTerm
                ].concat(opCtx.prevTerms);
                var isCustomOp = bopMacroObj && bopMacroObj.isOp && bopMacroObj.binary;
                var bopPrec;
                var bopAssoc;
                if (isCustomOp && bopMacroObj.binary) {
                    bopPrec = bopMacroObj.binary.prec;
                    bopAssoc = bopMacroObj.binary.assoc;
                } else {
                    bopPrec = getBinaryOpPrec(unwrapSyntax(op));
                    bopAssoc = getBinaryOpAssoc(unwrapSyntax(op));
                }
                assert(bopPrec !== undefined, 'expecting a precedence for operator: ' + op);
                var newStack;
                if (comparePrec(bopPrec, opCtx.prec, bopAssoc)) {
                    var bopCtx = opCtx;
                    var combResult = opCtx.combine(head);
                    if (opCtx.stack.length > 0) {
                        return step(combResult.term, rest, opCtx.stack[0]);
                    }
                    left = combResult.term;
                    newStack = opCtx.stack;
                    opPrevStx = combResult.prevStx;
                    opPrevTerms = combResult.prevTerms;
                } else {
                    newStack = [opCtx].concat(opCtx.stack);
                }
                assert(opCtx.combine !== undefined, 'expecting a combine function');
                var opRightStx = rightStx;
                var bopMacroName;
                if (isCustomOp) {
                    bopMacroName = rest.slice(0, bopMacroObj.fullName.length);
                    opRightStx = rightStx.slice(bopMacroObj.fullName.length - 1);
                }
                var bopOpCtx = _.extend({}, opCtx, {
                    combine: function (right) {
                        if (right.isExprTerm) {
                            if (isCustomOp && bopMacroObj.binary) {
                                var leftStx = left.destruct(context);
                                var rightStx$2 = right.destruct(context);
                                var rt$2 = expandMacro(bopMacroName.concat(syn.makeDelim('()', leftStx, leftStx[0]), syn.makeDelim('()', rightStx$2, rightStx$2[0])), context, opCtx, 'binary');
                                var newt = get_expression(rt$2.result, context);
                                assert(newt.rest.length === 0, 'should never have left over syntax');
                                return {
                                    term: newt.result,
                                    prevStx: opPrevStx,
                                    prevTerms: opPrevTerms
                                };
                            }
                            return {
                                term: BinOpTerm.create(left, op, right),
                                prevStx: opPrevStx,
                                prevTerms: opPrevTerms
                            };
                        } else {
                            return {
                                term: head,
                                prevStx: opPrevStx,
                                prevTerms: opPrevTerms
                            };
                        }
                    },
                    prec: bopPrec,
                    op: opTerm,
                    stack: newStack,
                    prevStx: opPrevStx,
                    prevTerms: opPrevTerms
                });
                return step(opRightStx[0], opRightStx.slice(1), bopOpCtx);
            } else if (head.isExprTerm && (rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()')) {
                var parenRes = enforestParenExpression(rest[0], context);
                if (parenRes) {
                    return step(CallTerm.create(head, parenRes), rest.slice(1), opCtx);
                }
            } else if (head.isExprTerm && (rest[0] && resolveFast(rest[0], context, context.phase) === '?')) {
                var question = rest[0];
                var condRes = enforest(rest.slice(1), context);
                if (condRes.result) {
                    var truExpr = condRes.result;
                    var condRight = condRes.rest;
                    if (truExpr.isExprTerm && condRight[0] && resolveFast(condRight[0], context, context.phase) === ':') {
                        var colon = condRight[0];
                        var flsRes = enforest(condRight.slice(1), context);
                        var flsExpr = flsRes.result;
                        if (flsExpr.isExprTerm) {
                            if (// operators are combined before the ternary
                                opCtx.prec >= 4) {
                                var // ternary is like a operator with prec 4
                                headResult = opCtx.combine(head);
                                var condTerm = ConditionalExpressionTerm.create(headResult.term, question, truExpr, colon, flsExpr);
                                if (opCtx.stack.length > 0) {
                                    return step(condTerm, flsRes.rest, opCtx.stack[0]);
                                } else {
                                    return {
                                        result: condTerm,
                                        rest: flsRes.rest,
                                        prevStx: headResult.prevStx,
                                        prevTerms: headResult.prevTerms
                                    };
                                }
                            } else {
                                var condTerm = ConditionalExpressionTerm.create(head, question, truExpr, colon, flsExpr);
                                return step(condTerm, flsRes.rest, opCtx);
                            }
                        }
                    }
                }
            } else if (head.isDelimiterTerm && head.delim.token.value === '()' && rest[0] && rest[0].isPunctuator() && resolveFast(rest[0], context, context.phase) === '=>') {
                var arrowRes = enforest(rest.slice(1), context);
                if (arrowRes.result && arrowRes.result.isExprTerm) {
                    return step(ArrowFunTerm.create(head.delim, rest[0], arrowRes.result.destruct(context)), arrowRes.rest, opCtx);
                } else {
                    throwSyntaxError('enforest', 'Body of arrow function must be an expression', rest.slice(1));
                }
            } else if (head.isIdTerm && rest[0] && rest[0].isPunctuator() && resolveFast(rest[0], context, context.phase) === '=>') {
                var res = enforest(rest.slice(1), context);
                if (res.result && res.result.isExprTerm) {
                    return step(ArrowFunTerm.create(head.id, rest[0], res.result.destruct(context)), res.rest, opCtx);
                } else {
                    throwSyntaxError('enforest', 'Body of arrow function must be an expression', rest.slice(1));
                }
            } else if (head.isDelimiterTerm && head.delim.token.value === '()') {
                if (// empty parens are acceptable but enforest
                    // doesn't accept empty arrays so short
                    // circuit here
                    head.delim.token.inner.length === 0) {
                    return step(ParenExpressionTerm.create([EmptyTerm.create()], head.delim, []), rest, opCtx);
                } else {
                    var parenRes = enforestParenExpression(head.delim, context);
                    if (parenRes) {
                        return step(parenRes, rest, opCtx);
                    }
                }
            } else if (head.isExprTerm && ((head.isIdTerm || head.isObjGetTerm || head.isObjDotGetTerm || head.isThisExpressionTerm) && rest[0] && rest[1] && !bopMacroObj && stxIsAssignOp(rest[0]))) {
                var opRes = enforestAssignment(rest, context, head, prevStx, prevTerms);
                if (opRes && opRes.result) {
                    return step(opRes.result, opRes.rest, _.extend({}, opCtx, {
                        prevStx: opRes.prevStx,
                        prevTerms: opRes.prevTerms
                    }));
                }
            } else if (head.isExprTerm && (rest[0] && (unwrapSyntax(rest[0]) === '++' || unwrapSyntax(rest[0]) === '--'))) {
                if (// Check if the operator is a macro first.
                    hasSyntaxTransform(rest[0], context, context.phase)) {
                    var headStx = tagWithTerm(head, head.destruct(context).reverse());
                    var opPrevStx = headStx.concat(prevStx);
                    var opPrevTerms = [head].concat(prevTerms);
                    var opRes = enforest(rest, context, opPrevStx, opPrevTerms);
                    if (opRes.prevTerms.length < opPrevTerms.length) {
                        return opRes;
                    } else if (opRes.result) {
                        return step(head, opRes.result.destruct(context).concat(opRes.rest), opCtx);
                    }
                }
                return step(PostfixOpTerm.create(head, rest[0]), rest.slice(1), opCtx);
            } else if (head.isExprTerm && (rest[0] && rest[0].token.value === '[]')) {
                return step(ObjGetTerm.create(head, DelimiterTerm.create(rest[0])), rest.slice(1), opCtx);
            } else if (head.isExprTerm && (rest[0] && unwrapSyntax(rest[0]) === '.' && !hasSyntaxTransform(rest[0], context, context.phase) && rest[1] && (rest[1].isIdentifier() || rest[1].isKeyword()))) {
                if (// Check if the identifier is a macro first.
                    hasSyntaxTransform(rest[1], context, context.phase)) {
                    var headStx = tagWithTerm(head, head.destruct(context).reverse());
                    var dotTerm = PuncTerm.create(rest[0]);
                    var dotTerms = [dotTerm].concat(head, prevTerms);
                    var dotStx = tagWithTerm(dotTerm, [rest[0]]).concat(headStx, prevStx);
                    var dotRes = enforest(rest.slice(1), context, dotStx, dotTerms);
                    if (dotRes.prevTerms.length < dotTerms.length) {
                        return dotRes;
                    } else if (dotRes.result) {
                        return step(head, [rest[0]].concat(dotRes.result.destruct(context), dotRes.rest), opCtx);
                    }
                }
                return step(ObjDotGetTerm.create(head, rest[0], rest[1]), rest.slice(2), opCtx);
            } else if (head.isDelimiterTerm && head.delim.token.value === '[]') {
                return step(ArrayLiteralTerm.create(head), rest, opCtx);
            } else if (head.isDelimiterTerm && head.delim.token.value === '{}') {
                return step(BlockTerm.create(head), rest, opCtx);
            } else if (head.isIdTerm && unwrapSyntax(head.id) === '#quoteSyntax' && rest[0] && rest[0].token.value === '{}') {
                return step(QuoteSyntaxTerm.create(rest[0]), rest.slice(1), opCtx);
            } else if (head.isKeywordTerm && unwrapSyntax(head.keyword) === 'return') {
                if (rest[0] && rest[0].token.lineNumber === head.keyword.token.lineNumber) {
                    var returnPrevStx = tagWithTerm(head, head.destruct(context)).concat(opCtx.prevStx);
                    var returnPrevTerms = [head].concat(opCtx.prevTerms);
                    var returnExpr = enforest(rest, context, returnPrevStx, returnPrevTerms);
                    if (returnExpr.prevTerms.length < opCtx.prevTerms.length) {
                        return returnExpr;
                    }
                    if (returnExpr.result.isExprTerm) {
                        return step(ReturnStatementTerm.create(head, returnExpr.result), returnExpr.rest, opCtx);
                    }
                } else {
                    return step(ReturnStatementTerm.create(head, EmptyTerm.create()), rest, opCtx);
                }
            } else if (head.isKeywordTerm && unwrapSyntax(head.keyword) === 'let') {
                var nameTokens = [];
                if (rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()') {
                    nameTokens = rest[0].token.inner;
                } else {
                    nameTokens.push(rest[0]);
                }
                if (// Let macro
                    rest[1] && rest[1].token.value === '=' && rest[2] && rest[2].token.value === 'macro') {
                    var mac = enforest(rest.slice(2), context);
                    if (mac.result) {
                        if (!mac.result.isAnonMacroTerm) {
                            throwSyntaxError('enforest', 'expecting an anonymous macro definition in syntax let binding', rest.slice(2));
                        }
                        return step(LetMacroTerm.create(nameTokens, mac.result.body), mac.rest, opCtx);
                    }
                } else {
                    var lsRes = enforestVarStatement(rest, context, head.keyword);
                    if (lsRes && lsRes.result) {
                        return step(LetStatementTerm.create(head, lsRes.result), lsRes.rest, opCtx);
                    }
                }
            } else if (head.isKeywordTerm && unwrapSyntax(head.keyword) === 'var' && rest[0]) {
                var vsRes = enforestVarStatement(rest, context, head.keyword);
                if (vsRes && vsRes.result) {
                    return step(VariableStatementTerm.create(head, vsRes.result), vsRes.rest, opCtx);
                }
            } else if (head.isKeywordTerm && unwrapSyntax(head.keyword) === 'const' && rest[0]) {
                var csRes = enforestVarStatement(rest, context, head.keyword);
                if (csRes && csRes.result) {
                    return step(ConstStatementTerm.create(head, csRes.result), csRes.rest, opCtx);
                }
            } else if (head.isKeywordTerm && unwrapSyntax(head.keyword) === 'for' && rest[0] && rest[0].token.value === '()') {
                return step(ForStatementTerm.create(head.keyword, rest[0]), rest.slice(1), opCtx);
            }
        } else {
            assert(head && head.token, 'assuming head is a syntax object');
            var macroObj = expandCount < maxExpands && getSyntaxTransform([head].concat(rest), context, context.phase);
            if (// macro invocation
                macroObj && typeof macroObj.fn === 'function' && !macroObj.isOp) {
                var rt = expandMacro([head].concat(rest), context, opCtx, null, macroObj);
                var newOpCtx = opCtx;
                if (rt.prevTerms && rt.prevTerms.length < opCtx.prevTerms.length) {
                    newOpCtx = rewindOpCtx(opCtx, rt);
                }
                if (rt.result.length > 0) {
                    return step(rt.result[0], rt.result.slice(1).concat(rt.rest), newOpCtx);
                } else {
                    return step(EmptyTerm.create(), rt.rest, newOpCtx);
                }
            } else if (head.isIdentifier() && unwrapSyntax(head) === 'macro' && resolve(head, context.phase) === 'macro' && rest[0] && rest[0].token.value === '{}') {
                return step(AnonMacroTerm.create(rest[0].token.inner), rest.slice(1), opCtx);
            } else if (head.isIdentifier() && unwrapSyntax(head) === 'macro' && resolve(head, context.phase) === 'macro') {
                var nameTokens = [];
                if (rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()') {
                    nameTokens = rest[0].token.inner;
                } else {
                    nameTokens.push(rest[0]);
                }
                if (rest[1] && rest[1].isDelimiter()) {
                    return step(MacroTerm.create(nameTokens, rest[1].token.inner), rest.slice(2), opCtx);
                } else {
                    throwSyntaxError('enforest', 'Macro declaration must include body', rest[1]);
                }
            } else if (head.isIdentifier() && head.token.value === 'unaryop' && rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()' && rest[1] && rest[1].isNumericLiteral() && rest[2] && rest[2].isDelimiter() && rest[2] && rest[2].token.value === '{}') {
                var trans = enforest(rest[2].token.inner, context);
                return step(OperatorDefinitionTerm.create(syn.makeValue('unary', head), rest[0].token.inner, rest[1], null, trans.result.body), rest.slice(3), opCtx);
            } else if (head.isIdentifier() && head.token.value === 'binaryop' && rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()' && rest[1] && rest[1].isNumericLiteral() && rest[2] && rest[2].isIdentifier() && rest[3] && rest[3].isDelimiter() && rest[3] && rest[3].token.value === '{}') {
                var trans = enforest(rest[3].token.inner, context);
                return step(OperatorDefinitionTerm.create(syn.makeValue('binary', head), rest[0].token.inner, rest[1], rest[2], trans.result.body), rest.slice(4), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'function' && rest[0] && rest[0].isIdentifier() && rest[1] && rest[1].isDelimiter() && rest[1].token.value === '()' && rest[2] && rest[2].isDelimiter() && rest[2].token.value === '{}') {
                rest[1].token.inner = rest[1].token.inner;
                rest[2].token.inner = rest[2].token.inner;
                return step(NamedFunTerm.create(head, null, rest[0], rest[1], rest[2]), rest.slice(3), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'function' && rest[0] && rest[0].isPunctuator() && rest[0].token.value === '*' && rest[1] && rest[1].isIdentifier() && rest[2] && rest[2].isDelimiter() && rest[2].token.value === '()' && rest[3] && rest[3].isDelimiter() && rest[3].token.value === '{}') {
                rest[2].token.inner = rest[2].token.inner;
                rest[3].token.inner = rest[3].token.inner;
                return step(NamedFunTerm.create(head, rest[0], rest[1], rest[2], rest[3]), rest.slice(4), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'function' && rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()' && rest[1] && rest[1].isDelimiter() && rest[1].token.value === '{}') {
                rest[0].token.inner = rest[0].token.inner;
                rest[1].token.inner = rest[1].token.inner;
                return step(AnonFunTerm.create(head, null, rest[0], rest[1]), rest.slice(2), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'function' && rest[0] && rest[0].isPunctuator() && rest[0].token.value === '*' && rest[1] && rest[1].isDelimiter() && rest[1].token.value === '()' && rest[2] && rest[2].isDelimiter && rest[2].token.value === '{}') {
                rest[1].token.inner = rest[1].token.inner;
                rest[2].token.inner = rest[2].token.inner;
                return step(AnonFunTerm.create(head, rest[0], rest[1], rest[2]), rest.slice(3), opCtx);
            } else if ((head.isDelimiter() && head.token.value === '()' || head.isIdentifier()) && rest[0] && rest[0].isPunctuator() && resolveFast(rest[0], context, context.phase) === '=>' && rest[1] && rest[1].isDelimiter() && rest[1].token.value === '{}') {
                return step(ArrowFunTerm.create(head, rest[0], rest[1]), rest.slice(2), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'catch' && rest[0] && rest[0].isDelimiter() && rest[0].token.value === '()' && rest[1] && rest[1].isDelimiter() && rest[1].token.value === '{}') {
                rest[0].token.inner = rest[0].token.inner;
                rest[1].token.inner = rest[1].token.inner;
                return step(CatchClauseTerm.create(head, rest[0], rest[1]), rest.slice(2), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'this') {
                return step(ThisExpressionTerm.create(head), rest, opCtx);
            } else if (head.isNumericLiteral() || head.isStringLiteral() || head.isBooleanLiteral() || head.isRegularExpression() || head.isNullLiteral()) {
                return step(LitTerm.create(head), rest, opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'import') {
                var imp = enforestImport(head, rest);
                return step(imp.result, imp.rest, opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'export' && rest[0] && rest[0].isDelimiter()) {
                return step(ExportNameTerm.create(head, rest[0]), rest.slice(1), opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'export' && rest[0] && rest[0].isKeyword() && unwrapSyntax(rest[0]) === 'default' && rest[1]) {
                var res = enforest(rest.slice(1), context);
                return step(ExportDefaultTerm.create(head, rest[0], res.result), res.rest, opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'export' && rest[0]) {
                var res = enforest(rest, context);
                return step(ExportDeclTerm.create(head, res.result), res.rest, opCtx);
            } else if (head.isIdentifier()) {
                return step(IdTerm.create(head), rest, opCtx);
            } else if (head.isPunctuator()) {
                return step(PuncTerm.create(head), rest, opCtx);
            } else if (head.isKeyword() && unwrapSyntax(head) === 'with') {
                throwSyntaxError('enforest', 'with is not supported in sweet.js', head);
            } else if (head.isKeyword()) {
                return step(KeywordTerm.create(head), rest, opCtx);
            } else if (head.isDelimiter()) {
                return step(DelimiterTerm.create(head), rest, opCtx);
            } else if (head.isTemplate()) {
                return step(TemplateTerm.create(head), rest, opCtx);
            } else if (head.isEOF()) {
                assert(rest.length === 0, 'nothing should be after an EOF');
                return step(EOFTerm.create(head), [], opCtx);
            } else {
                // todo: are we missing cases?
                assert(false, 'not implemented');
            }
        }
        if (// Potentially an infix macro
            // This should only be invoked on runtime syntax terms
            !head.isMacroTerm && !head.isLetMacroTerm && !head.isAnonMacroTerm && !head.isOperatorDefinitionTerm && rest.length && hasSyntaxTransform(rest, context, context.phase) && getSyntaxTransform(rest, context, context.phase).isOp === false) {
            var infLeftTerm = opCtx.prevTerms[0] && opCtx.prevTerms[0].isPartialTerm ? opCtx.prevTerms[0] : null;
            var infTerm = PartialExpressionTerm.create(head.destruct(context), infLeftTerm, function () {
                return step(head, [], opCtx);
            });
            var infPrevStx = tagWithTerm(infTerm, head.destruct(context)).reverse().concat(opCtx.prevStx);
            var infPrevTerms = [infTerm].concat(opCtx.prevTerms);
            var infRes = expandMacro(rest, context, {
                prevStx: infPrevStx,
                prevTerms: infPrevTerms
            });
            if (infRes.prevTerms && infRes.prevTerms.length < infPrevTerms.length) {
                var infOpCtx = rewindOpCtx(opCtx, infRes);
                return step(infRes.result[0], infRes.result.slice(1).concat(infRes.rest), infOpCtx);
            } else {
                return step(head, infRes.result.concat(infRes.rest), opCtx);
            }
        }
        var // done with current step so combine and continue on
        combResult = opCtx.combine(head);
        if (opCtx.stack.length === 0) {
            return {
                result: combResult.term,
                rest: rest,
                prevStx: combResult.prevStx,
                prevTerms: combResult.prevTerms
            };
        } else {
            return step(combResult.term, rest, opCtx.stack[0]);
        }
    }
    return step(toks[0], toks.slice(1), {
        combine: function (t) {
            return {
                term: t,
                prevStx: prevStx,
                prevTerms: prevTerms
            };
        },
        prec: 0,
        stack: [],
        op: null,
        prevStx: prevStx,
        prevTerms: prevTerms
    });
}
function rewindOpCtx(opCtx, res) {
    if (// If we've consumed all pending operators, we can just start over.
        // It's important that we always thread the new prevStx and prevTerms
        // through, otherwise the old ones will still persist.
        !res.prevTerms.length || !res.prevTerms[0].isPartialTerm) {
        return _.extend({}, opCtx, {
            combine: function (t) {
                return {
                    term: t,
                    prevStx: res.prevStx,
                    prevTerms: res.prevTerms
                };
            },
            prec: 0,
            op: null,
            stack: [],
            prevStx: res.prevStx,
            prevTerms: res.prevTerms
        });
    }
    // To rewind, we need to find the first (previous) pending operator. It
    // acts as a marker in the opCtx to let us know how far we need to go
    // back.
    var op = null;
    for (var i = 0; i < res.prevTerms.length; i++) {
        if (!res.prevTerms[i].isPartialTerm) {
            break;
        }
        if (res.prevTerms[i].isPartialOperationTerm) {
            op = res.prevTerms[i];
            break;
        }
    }
    if (// If the op matches the current opCtx, we don't need to rewind
        // anything, but we still need to persist the prevStx and prevTerms.
        opCtx.op === op) {
        return _.extend({}, opCtx, {
            prevStx: res.prevStx,
            prevTerms: res.prevTerms
        });
    }
    for (var i = 0; i < opCtx.stack.length; i++) {
        if (opCtx.stack[i].op === op) {
            return _.extend({}, opCtx.stack[i], {
                prevStx: res.prevStx,
                prevTerms: res.prevTerms
            });
        }
    }
    assert(false, 'Rewind failed.');
}
function get_expression(stx, context) {
    if (stx[0].term) {
        for (var termLen = 1; termLen < stx.length; termLen++) {
            if (stx[termLen].term !== stx[0].term) {
                break;
            }
        }
        if (// Guard the termLen because we can have a multi-token term that
            // we don't want to split. TODO: is there something we can do to
            // get around this safely?
            stx[0].term.isPartialExpressionTerm && termLen === stx[0].term.stx.length) {
            var expr = stx[0].term.combine().result;
            for (var i = 1, term = stx[0].term; i < stx.length; i++) {
                if (stx[i].term !== term) {
                    if (term && term.isPartialTerm) {
                        term = term.left;
                        i--;
                    } else {
                        break;
                    }
                }
            }
            return {
                result: expr,
                rest: stx.slice(i)
            };
        } else if (stx[0].term.isExprTerm) {
            return {
                result: stx[0].term,
                rest: stx.slice(termLen)
            };
        } else {
            return {
                result: null,
                rest: stx
            };
        }
    }
    var res = enforest(stx, context);
    if (!res.result || !res.result.isExprTerm) {
        return {
            result: null,
            rest: stx
        };
    }
    return res;
}
function tagWithTerm(term, stx) {
    return stx.map(function (s) {
        s = s.clone();
        s.term = term;
        return s;
    });
}
function applyMarkToPatternEnv(newMark, env) {
    function dfs(match) {
        if (match.level === 0) {
            // replace the match property with the marked syntax
            match.match = _.map(match.match, function (stx) {
                return stx.mark(newMark);
            });
        } else {
            _.each(match.match, function (match$2) {
                dfs(match$2);
            });
        }
    }
    _.keys(env).forEach(function (key) {
        dfs(env[key]);
    });
}
function markIn(arr, mark) {
    return arr.map(function (stx) {
        return stx.mark(mark);
    });
}
function markDefOut(arr, mark, def) {
    return arr.map(function (stx) {
        return stx.mark(mark).addDefCtx(def);
    });
}
function loadMacroDef(body, context, phase) {
    var expanded = body[0].destruct(context, { stripCompileTerm: true });
    var stub = parser.read('()');
    stub[0].token.inner = expanded;
    var flattend = flatten(stub);
    var bodyCode = codegen.generate(parser.parse(flattend, { phase: phase }));
    var localCtx;
    var macroGlobal = {
        makeValue: syn.makeValue,
        makeRegex: syn.makeRegex,
        makeIdent: syn.makeIdent,
        makeKeyword: syn.makeKeyword,
        makePunc: syn.makePunc,
        makeDelim: syn.makeDelim,
        localExpand: function (stx, stop) {
            assert(!stop || stop.length === 0, 'localExpand stop lists are not currently supported');
            var markedStx = markIn(stx, localCtx.mark);
            var terms = expand(markedStx, localCtx);
            var newStx = terms.reduce(function (acc, term) {
                acc.push.apply(acc, term.destruct(localCtx, { stripCompileTerm: true }));
                return acc;
            }, []);
            return markDefOut(newStx, localCtx.mark, localCtx.defscope);
        },
        filename: context.filename,
        getExpr: function (stx) {
            if (stx.length === 0) {
                return {
                    success: false,
                    result: [],
                    rest: []
                };
            }
            var markedStx = markIn(stx, localCtx.mark);
            var r = get_expression(markedStx, localCtx);
            return {
                success: r.result !== null,
                result: r.result === null ? [] : markDefOut(r.result.destruct(localCtx, { stripCompileTerm: true }), localCtx.mark, localCtx.defscope),
                rest: markDefOut(r.rest, localCtx.mark, localCtx.defscope)
            };
        },
        getIdent: function (stx) {
            if (stx[0] && stx[0].isIdentifier()) {
                return {
                    success: true,
                    result: [stx[0]],
                    rest: stx.slice(1)
                };
            }
            return {
                success: false,
                result: [],
                rest: stx
            };
        },
        getLit: function (stx) {
            if (stx[0] && patternModule.typeIsLiteral(stx[0].token.type)) {
                return {
                    success: true,
                    result: [stx[0]],
                    rest: stx.slice(1)
                };
            }
            return {
                success: false,
                result: [],
                rest: stx
            };
        },
        unwrapSyntax: syn.unwrapSyntax,
        throwSyntaxError: throwSyntaxError,
        throwSyntaxCaseError: throwSyntaxCaseError,
        prettyPrint: syn.prettyPrint,
        parser: parser,
        __fresh: fresh,
        _: _,
        patternModule: patternModule,
        getPattern: function (id) {
            return context.patternMap.get(id);
        },
        getPatternMap: function () {
            return context.patternMap;
        },
        getTemplate: function (id) {
            assert(context.templateMap.has(id), 'missing template');
            return syn.cloneSyntaxArray(context.templateMap.get(id));
        },
        getTemplateMap: function () {
            // the template map is global across all context during compilation
            return context.templateMap;
        },
        applyMarkToPatternEnv: applyMarkToPatternEnv,
        mergeMatches: function (newMatch, oldMatch) {
            newMatch.patternEnv = _.extend({}, oldMatch.patternEnv, newMatch.patternEnv);
            return newMatch;
        },
        console: console
    };
    context.env.keysStr().forEach(function (key) {
        var val = context.env.getStr(key);
        if (// load the compile time values into the global object
            val && val.value) {
            macroGlobal[key] = val.value;
        }
    });
    var macroFn;
    if (vm) {
        macroFn = vm.runInNewContext('(function() { return ' + bodyCode + ' })()', macroGlobal);
    } else {
        macroFn = scopedEval(bodyCode, macroGlobal);
    }
    return function (stx, context$2, prevStx, prevTerms) {
        localCtx = context$2;
        return macroFn(stx, context$2, prevStx, prevTerms);
    };
}
function expandToTermTree(stx, context) {
    assert(context, 'expander context is required');
    var f, head, prevStx, restStx, prevTerms, macroDefinition;
    var rest = stx;
    while (rest.length > 0) {
        assert(rest[0].token, 'expecting a syntax object');
        f = enforest(rest, context, prevStx, prevTerms);
        // head :: TermTree
        head = f.result;
        // rest :: [Syntax]
        rest = f.rest;
        if (!head) {
            // no head means the expansions stopped prematurely (for stepping)
            restStx = rest;
            break;
        }
        var destructed = tagWithTerm(head, f.result.destruct(context));
        prevTerms = [head].concat(f.prevTerms);
        prevStx = destructed.reverse().concat(f.prevStx);
        if (head.isImportTerm) {
            var // record the import in the module record for easier access
            entries = context.moduleRecord.addImport(head);
            var // load up the (possibly cached) import module
            importMod = loadImport(unwrapSyntax(head.from), context);
            // visiting an imported module loads the compiletime values
            // into the compiletime environment for this phase
            context = visit(importMod.term, importMod.record, context.phase, context);
            // bind the imported names in the rest of the module
            // todo: how to handle references before an import?
            rest = bindImportInMod(entries, rest, importMod.term, importMod.record, context, context.phase);
        }
        if (head.isImportForMacrosTerm) {
            var // record the import in the module record for easier access
            entries = context.moduleRecord.addImport(head);
            var // load up the (possibly cached) import module
            importMod = loadImport(unwrapSyntax(head.from), context);
            // invoking an imported module loads the runtime values
            // into the environment for this phase
            context = invoke(importMod.term, importMod.record, context.phase + 1, context);
            // visiting an imported module loads the compiletime values
            // into the compiletime environment for this phase
            context = visit(importMod.term, importMod.record, context.phase + 1, context);
            // bind the imported names in the rest of the module
            // todo: how to handle references before an import?
            rest = bindImportInMod(entries, rest, importMod.term, importMod.record, context, context.phase + 1);
        }
        if ((head.isExportDefaultTerm || head.isMacroTerm) && expandCount < maxExpands) {
            var macroDecl = head.isExportDefaultTerm ? head.decl : head;
            if (!(// raw function primitive form
                macroDecl.body[0] && macroDecl.body[0].isKeyword() && macroDecl.body[0].token.value === 'function')) {
                throwSyntaxError('load macro', 'Primitive macro form must contain a function for the macro body', macroDecl.body);
            }
            // expand the body
            macroDecl.body = expand(macroDecl.body, makeExpanderContext(_.extend({}, context, { phase: context.phase + 1 })));
            //  and load the macro definition into the environment
            macroDefinition = loadMacroDef(macroDecl.body, context, context.phase + 1);
            var nameStx = makeMultiToken(macroDecl.name);
            addToDefinitionCtx([nameStx], context.defscope, false, context.paramscope);
            context.env.set(nameStx, context.phase, new SyntaxTransform(macroDefinition, false, builtinMode, macroDecl.name));
        }
        if (head.isLetMacroTerm && expandCount < maxExpands) {
            if (!(// raw function primitive form
                head.body[0] && head.body[0].isKeyword() && head.body[0].token.value === 'function')) {
                throwSyntaxError('load macro', 'Primitive macro form must contain a function for the macro body', head.body);
            }
            // expand the body
            head.body = expand(head.body, makeExpanderContext(_.extend({ phase: context.phase + 1 }, context)));
            //  and load the macro definition into the environment
            macroDefinition = loadMacroDef(head.body, context, context.phase + 1);
            var freshName = fresh();
            var oldName = head.name;
            var nameStx = makeMultiToken(head.name);
            var renamedName = nameStx.rename(nameStx, freshName);
            // store a reference to the full name in the props object.
            // this allows us to communicate the original full name to
            // `visit` later on.
            renamedName.props.fullName = oldName;
            head.name = [renamedName];
            rest = _.map(rest, function (stx$2) {
                return stx$2.rename(nameStx, freshName);
            });
            context.env.set(renamedName, context.phase, new SyntaxTransform(macroDefinition, false, builtinMode, oldName));
        }
        if (head.isOperatorDefinitionTerm) {
            if (!(// raw function primitive form
                head.body[0] && head.body[0].isKeyword() && head.body[0].token.value === 'function')) {
                throwSyntaxError('load macro', 'Primitive macro form must contain a function for the macro body', head.body);
            }
            // expand the body
            head.body = expand(head.body, makeExpanderContext(_.extend({ phase: context.phase + 1 }, context)));
            var //  and load the macro definition into the environment
            opDefinition = loadMacroDef(head.body, context, context.phase + 1);
            var nameStx = makeMultiToken(head.name);
            addToDefinitionCtx([nameStx], context.defscope, false, context.paramscope);
            var opObj = getSyntaxTransform(nameStx, context, context.phase);
            if (!opObj) {
                opObj = {
                    isOp: true,
                    builtin: builtinMode,
                    fullName: head.name
                };
            }
            assert(unwrapSyntax(head.type) === 'binary' || unwrapSyntax(head.type) === 'unary', 'operator must either be binary or unary');
            opObj[unwrapSyntax(head.type)] = {
                fn: opDefinition,
                prec: head.prec.token.value,
                assoc: head.assoc ? head.assoc.token.value : null
            };
            context.env.set(nameStx, context.phase, opObj);
        }
        if (head.isNamedFunTerm) {
            addToDefinitionCtx([head.name], context.defscope, true, context.paramscope);
        }
        if (head.isVariableStatementTerm || head.isLetStatementTerm || head.isConstStatementTerm) {
            addToDefinitionCtx(_.map(head.decls, function (decl) {
                return decl.ident;
            }), context.defscope, true, context.paramscope);
        }
        if (head.isBlockTerm && head.body.isDelimiterTerm) {
            head.body.delim.token.inner.forEach(function (term) {
                if (term.isVariableStatementTerm) {
                    addToDefinitionCtx(_.map(term.decls, function (decl) {
                        return decl.ident;
                    }), context.defscope, true, context.paramscope);
                }
            });
        }
        if (head.isDelimiterTerm) {
            head.delim.token.inner.forEach(function (term) {
                if (term.isVariableStatementTerm) {
                    addToDefinitionCtx(_.map(term.decls, function (decl) {
                        return decl.ident;
                    }), context.defscope, true, context.paramscope);
                }
            });
        }
        if (head.isForStatementTerm) {
            var forCond = head.cond.token.inner;
            if (forCond[0] && resolve(forCond[0], context.phase) === 'let' && forCond[1] && forCond[1].isIdentifier()) {
                var letNew = fresh();
                var letId = forCond[1];
                forCond = forCond.map(function (stx$2) {
                    return stx$2.rename(letId, letNew);
                });
                // hack: we want to do the let renaming here, not
                // in the expansion of `for (...)` so just remove the `let`
                // keyword
                head.cond.token.inner = expand([forCond[0]], context).concat(expand(forCond.slice(1), context));
                if (// nice and easy case: `for (...) { ... }`
                    rest[0] && rest[0].token.value === '{}') {
                    rest[0] = rest[0].rename(letId, letNew);
                } else {
                    var // need to deal with things like `for (...) if (...) log(...)`
                    bodyEnf = enforest(rest, context);
                    var bodyDestructed = bodyEnf.result.destruct(context);
                    var renamedBodyTerm = bodyEnf.result.rename(letId, letNew);
                    tagWithTerm(renamedBodyTerm, bodyDestructed);
                    rest = bodyEnf.rest;
                    prevStx = bodyDestructed.reverse().concat(prevStx);
                    prevTerms = [renamedBodyTerm].concat(prevTerms);
                }
            } else {
                head.cond.token.inner = expand(head.cond.token.inner, context);
            }
        }
    }
    return {
        // prevTerms are stored in reverse for the purposes of infix
        // lookbehind matching, so we need to re-reverse them.
        terms: prevTerms ? prevTerms.reverse() : [],
        restStx: restStx,
        context: context
    };
}
function addToDefinitionCtx(idents, defscope, skipRep, paramscope) {
    assert(idents && idents.length > 0, 'expecting some variable identifiers');
    // flag for skipping repeats since we reuse this function to place both
    // variables declarations (which need to skip redeclarations) and
    // macro definitions which don't
    skipRep = skipRep || false;
    _.chain(idents).filter(function (id) {
        if (skipRep) {
            var /*
                   When var declarations repeat in the same function scope:

                   var x = 24;
                   ...
                   var x = 42;

                   we just need to use the first renaming and leave the
                   definition context as is.
                */
            varDeclRep = _.find(defscope, function (def) {
                return def.id.token.value === id.token.value && arraysEqual(marksof(def.id.context), marksof(id.context));
            });
            var /*
                    When var declaration repeat one of the function parameters:

                    function foo(x) {
                        var x;
                    }

                    we don't need to add the var to the definition context.
                */
            paramDeclRep = _.find(paramscope, function (param) {
                return param.token.value === id.token.value && arraysEqual(marksof(param.context), marksof(id.context));
            });
            return typeof varDeclRep === 'undefined' && typeof paramDeclRep === 'undefined';
        }
        return true;
    }).each(function (id) {
        var name = fresh();
        defscope.push({
            id: id,
            name: name
        });
    });
}
function expandTermTreeToFinal(term, context) {
    assert(context && context.env, 'environment map is required');
    if (term.isArrayLiteralTerm) {
        term.array.delim.token.inner = expand(term.array.delim.token.inner, context);
        return term;
    } else if (term.isBlockTerm) {
        term.body.delim.token.inner = expand(term.body.delim.token.inner, context);
        return term;
    } else if (term.isParenExpressionTerm) {
        term.args = _.map(term.args, function (arg) {
            return expandTermTreeToFinal(arg, context);
        });
        return term;
    } else if (term.isCallTerm) {
        term.fun = expandTermTreeToFinal(term.fun, context);
        term.args = expandTermTreeToFinal(term.args, context);
        return term;
    } else if (term.isReturnStatementTerm) {
        term.expr = expandTermTreeToFinal(term.expr, context);
        return term;
    } else if (term.isUnaryOpTerm) {
        term.expr = expandTermTreeToFinal(term.expr, context);
        return term;
    } else if (term.isBinOpTerm || term.isAssignmentExpressionTerm) {
        term.left = expandTermTreeToFinal(term.left, context);
        term.right = expandTermTreeToFinal(term.right, context);
        return term;
    } else if (term.isObjGetTerm) {
        term.left = expandTermTreeToFinal(term.left, context);
        term.right.delim.token.inner = expand(term.right.delim.token.inner, context);
        return term;
    } else if (term.isObjDotGetTerm) {
        term.left = expandTermTreeToFinal(term.left, context);
        term.right = expandTermTreeToFinal(term.right, context);
        return term;
    } else if (term.isConditionalExpressionTerm) {
        term.cond = expandTermTreeToFinal(term.cond, context);
        term.tru = expandTermTreeToFinal(term.tru, context);
        term.fls = expandTermTreeToFinal(term.fls, context);
        return term;
    } else if (term.isVariableDeclarationTerm) {
        if (term.init) {
            term.init = expandTermTreeToFinal(term.init, context);
        }
        return term;
    } else if (term.isVariableStatementTerm) {
        term.decls = _.map(term.decls, function (decl) {
            return expandTermTreeToFinal(decl, context);
        });
        return term;
    } else if (term.isDelimiterTerm) {
        // expand inside the delimiter and then continue on
        term.delim.token.inner = expand(term.delim.token.inner, context);
        return term;
    } else if (term.isIdTerm) {
        var varTrans = getCompiletimeValue(term.id, context, context.phase);
        if (varTrans instanceof VarTransform) {
            term.id = syntaxFromToken(term.id.token, varTrans.id);
        }
        return term;
    } else if (term.isNamedFunTerm || term.isAnonFunTerm || term.isCatchClauseTerm || term.isArrowFunTerm || term.isModuleTerm) {
        // function definitions need a bunch of hygiene logic
        // push down a fresh definition context
        var newDef = [];
        var paramSingleIdent = term.params && term.params.isIdentifier();
        var params;
        if (term.params && term.params.isDelimiter()) {
            params = term.params;
        } else if (paramSingleIdent) {
            params = term.params;
        } else {
            params = syn.makeDelim('()', [], null);
        }
        var bodies;
        if (Array.isArray(term.body)) {
            bodies = syn.makeDelim('{}', term.body, null);
        } else {
            bodies = term.body;
        }
        bodies = bodies.addDefCtx(newDef);
        var paramNames = _.map(getParamIdentifiers(params), function (param) {
            var freshName = fresh();
            var renamed = param.rename(param, freshName);
            context.env.set(renamed, context.phase, new VarTransform(renamed));
            return {
                freshName: freshName,
                originalParam: param,
                renamedParam: renamed
            };
        });
        var bodyContext = makeExpanderContext(_.defaults({
            defscope: newDef,
            // paramscope is used to filter out var redeclarations
            paramscope: paramNames.map(function (p) {
                return p.renamedParam;
            })
        }, context));
        var // rename the function body for each of the parameters
        renamedBody = _.reduce(paramNames, function (accBody, p) {
            return accBody.rename(p.originalParam, p.freshName);
        }, bodies);
        renamedBody = renamedBody;
        var expandedResult = expandToTermTree(renamedBody.token.inner, bodyContext);
        var bodyTerms = expandedResult.terms;
        if (expandedResult.restStx) {
            // The expansion was halted prematurely. Just stop and
            // return what we have so far, along with the rest of the syntax
            renamedBody.token.inner = expandedResult.terms.concat(expandedResult.restStx);
            if (Array.isArray(term.body)) {
                term.body = renamedBody.token.inner;
            } else {
                term.body = renamedBody;
            }
            return term;
        }
        var renamedParams = _.map(paramNames, function (p) {
            return p.renamedParam;
        });
        var flatArgs;
        if (paramSingleIdent) {
            flatArgs = renamedParams[0];
        } else {
            var puncCtx = term.params || null;
            flatArgs = syn.makeDelim('()', joinSyntax(renamedParams, syn.makePunc(',', puncCtx)), puncCtx);
        }
        var expandedArgs = expand([flatArgs], bodyContext);
        assert(expandedArgs.length === 1, 'should only get back one result');
        if (// stitch up the function with all the renamings
            term.params) {
            term.params = expandedArgs[0];
        }
        bodyTerms = _.map(bodyTerms, function (bodyTerm) {
            if (// add the definition context to the result of
                // expansion (this makes sure that syntax objects
                // introduced by expansion have the def context)
                bodyTerm.isBlockTerm) {
                var // we need to expand blocks before adding the defctx since
                // blocks defer macro expansion.
                blockFinal = expandTermTreeToFinal(bodyTerm, expandedResult.context);
                return blockFinal.addDefCtx(newDef);
            } else {
                var termWithCtx = bodyTerm.addDefCtx(newDef);
                // finish expansion
                return expandTermTreeToFinal(termWithCtx, expandedResult.context);
            }
        });
        if (term.isModuleTerm) {
            bodyTerms.forEach(function (bodyTerm) {
                if (bodyTerm.isExportNameTerm || bodyTerm.isExportDeclTerm || bodyTerm.isExportDefaultTerm) {
                    context.moduleRecord.addExport(bodyTerm);
                }
            });
        }
        renamedBody.token.inner = bodyTerms;
        if (Array.isArray(term.body)) {
            term.body = renamedBody.token.inner;
        } else {
            term.body = renamedBody;
        }
        // and continue expand the rest
        return term;
    }
    // the term is fine as is
    return term;
}
function expand(stx, context) {
    assert(context, 'must provide an expander context');
    var trees = expandToTermTree(stx, context);
    var terms = _.map(trees.terms, function (term) {
        return expandTermTreeToFinal(term, trees.context);
    });
    if (trees.restStx) {
        terms.push.apply(terms, trees.restStx);
    }
    return terms;
}
function makeExpanderContext(o) {
    o = o || {};
    var env = o.env || new Env();
    var store = o.store || new Env();
    return Object.create(Object.prototype, {
        filename: {
            value: o.filename,
            writable: false,
            enumerable: true,
            configurable: false
        },
        compileSuffix: {
            value: o.compileSuffix || '.jsc',
            writable: false,
            enumerable: true,
            configurable: false
        },
        env: {
            value: env,
            writable: false,
            enumerable: true,
            configurable: false
        },
        store: {
            value: store,
            writable: false,
            enumerable: true,
            configurable: false
        },
        defscope: {
            value: o.defscope,
            writable: false,
            enumerable: true,
            configurable: false
        },
        paramscope: {
            value: o.paramscope,
            writable: false,
            enumerable: true,
            configurable: false
        },
        templateMap: {
            value: o.templateMap || new StringMap(),
            writable: false,
            enumerable: true,
            configurable: false
        },
        patternMap: {
            value: o.patternMap || new StringMap(),
            writable: false,
            enumerable: true,
            configurable: false
        },
        mark: {
            value: o.mark,
            writable: false,
            enumerable: true,
            configurable: false
        },
        phase: {
            value: o.phase || 0,
            writable: false,
            enumerable: true,
            configurable: false
        },
        implicitImport: {
            value: o.implicitImport || new StringMap(),
            writable: false,
            enumerable: true,
            configurable: false
        },
        moduleRecord: {
            value: o.moduleRecord || {},
            writable: false,
            enumerable: true,
            configurable: false
        }
    });
}
function makeModuleExpanderContext(filename, templateMap, patternMap, phase, moduleRecord, compileSuffix) {
    return makeExpanderContext({
        filename: filename,
        templateMap: templateMap,
        patternMap: patternMap,
        phase: phase,
        moduleRecord: moduleRecord,
        compileSuffix: compileSuffix
    });
}
function makeTopLevelExpanderContext(options) {
    var filename = options && options.filename ? options.filename : '<anonymous module>';
    return makeExpanderContext({ filename: filename });
}
function resolvePath(name, parent) {
    var path = require('path');
    var resolveSync = require('resolve/lib/sync');
    var root = path.dirname(parent);
    var fs = require('fs');
    if (name[0] === '.') {
        name = path.resolve(root, name);
    }
    return resolveSync(name, {
        basedir: root,
        extensions: [
            '.js',
            '.sjs'
        ]
    });
}
function defaultImportStx(importPath, ctx) {
    var names = [
        'quoteSyntax',
        'syntax',
        '#',
        'syntaxCase',
        'macro',
        'withSyntax',
        'letstx',
        'macroclass',
        'operator'
    ];
    var importNames = names.map(function (name) {
        return syn.makeIdent(name, ctx);
    });
    var importForMacrosNames = names.map(function (name) {
        return syn.makeIdent(name, ctx);
    });
    var // import { names ... } from "importPath" for macros
    importForMacrosStmt = [
        syn.makeKeyword('import', ctx),
        syn.makeDelim('{}', joinSyntax(importForMacrosNames, syn.makePunc(',', ctx)), ctx),
        syn.makeIdent('from', ctx),
        syn.makeValue(importPath, ctx),
        syn.makeKeyword('for', ctx),
        syn.makeIdent('macros', ctx)
    ];
    var // import { names ... } from "importPath"
    importStmt = [
        syn.makeKeyword('import', ctx),
        syn.makeDelim('{}', joinSyntax(importNames, syn.makePunc(',', ctx)), ctx),
        syn.makeIdent('from', ctx),
        syn.makeValue(importPath, ctx)
    ];
    return importStmt.concat(importForMacrosStmt);
}
function createModule(name, body) {
    var language = 'base';
    var modBody = body;
    if (body && body[0] && body[1] && body[2] && unwrapSyntax(body[0]) === '#' && unwrapSyntax(body[1]) === 'lang' && body[2].isStringLiteral()) {
        language = unwrapSyntax(body[2]);
        // consume optional semicolon
        modBody = body[3] && body[3].token.value === ';' && body[3].isPunctuator() ? body.slice(4) : body.slice(3);
    }
    if (// insert the default import statements into the module body
        language !== 'base' && language !== 'js') {
        // "base" and "js" are currently special languages meaning don't
        // insert the default imports
        modBody = defaultImportStx(language, body[0]).concat(modBody);
    }
    return {
        record: new ModuleRecord(name, language),
        term: ModuleTerm.create(modBody)
    };
}
function loadModule(name) {
    var // node specific code
    fs = require('fs');
    return function (body) {
        return createModule(name, body);
    }(parser.read(fs.readFileSync(name, 'utf8')));
}
function invoke(modTerm, modRecord, phase, context) {
    if (modRecord.language === 'base') {
        var // base modules can just use the normal require pipeline
        exported = require(modRecord.name);
        Object.keys(exported).forEach(function (exp) {
            var // create new bindings in the context
            freshName = fresh();
            var expName = syn.makeIdent(exp, null);
            var renamed = expName.rename(expName, freshName);
            modRecord.exportEntries.push(new ExportEntry(null, renamed, renamed));
            context.env.set(renamed, phase, { value: exported[exp] });
        });
    } else {
        // recursively invoke any imports in this module at this
        // phase and update the context
        modRecord.importedModules.forEach(function (impPath) {
            var importMod = loadImport(impPath, context);
            var impEntries = modRecord.getImportsForModule(impPath);
            if (_.any(impEntries, function (entry) {
                    return entry.forPhase === 0;
                })) {
                context = invoke(importMod.term, importMod.record, phase, context);
            }
        });
        var // turn the module into text so we can eval it
        code = function (terms) {
            return codegen.generate(parser.parse(flatten(_.flatten(terms.map(function (term) {
                return term.destruct(context, {
                    stripCompileTerm: true,
                    stripModuleTerm: true
                });
            })))));
        }(modTerm.body);
        var global = { console: console };
        // eval but with a fresh heap
        vm.runInNewContext(code, global);
        // update the exports with the runtime values
        modRecord.exportEntries.forEach(function (entry) {
            var // we have to get the value with the localName
            expName = resolve(entry.localName, phase);
            var expVal = global[expName];
            // and set it as the export name
            context.env.set(entry.exportName, phase, { value: expVal });
        });
    }
    return context;
}
function visit(modTerm, modRecord, phase, context) {
    var defctx = [];
    if (// don't need to visit base modules since they do not support macros
        modRecord.language === 'base') {
        return context;
    }
    // add a visiting definition context since we are binding
    // macros in the module scope
    modTerm.body = modTerm.body.map(function (term) {
        return term.addDefCtx(defctx);
    });
    // reset the exports
    modRecord.exportEntries = [];
    // for each of the imported modules, recursively visit and
    // invoke them at the appropriate phase and then bind the
    // imported names in this module
    modRecord.importedModules.forEach(function (impPath) {
        var // load the (possibly cached) module for this import
        importMod = loadImport(impPath, context);
        var // grab all the import statements for that module
        impEntries = modRecord.getImportsForModule(impPath);
        if (_.any(impEntries, function (entry) {
                return entry.forPhase === 0;
            })) {
            // importing for phase 0 just needs to visit (load
            // compiletime values)
            context = visit(importMod.term, importMod.record, phase, context);
        } else if (_.any(impEntries, function (entry) {
                return entry.forPhase === 1;
            })) {
            // importing for phase 1 needs to visit (load compiletime
            // values) and invoke (load runtime values for phase 1
            // code)
            context = invoke(importMod.term, importMod.record, phase + 1, context);
            context = visit(importMod.term, importMod.record, phase + 1, context);
        } else {
            // todo: arbitrary phase
            assert(false, 'not implemented yet');
        }
        modTerm.body = bindImportInMod(impEntries, modTerm.body, importMod.term, importMod.record, context, phase);
    });
    // go through the module and load any compiletime values in to the context
    modTerm.body.forEach(function (term) {
        var name;
        var macroDefinition;
        var exportName;
        var entries;
        if (// add the exported names to the module record
            term.isExportNameTerm || term.isExportDeclTerm || term.isExportDefaultTerm) {
            entries = modRecord.addExport(term);
        }
        if (term.isMacroTerm) {
            macroDefinition = loadMacroDef(term.body, context, phase + 1);
            context.env.set(term.name[0], phase, {
                fn: macroDefinition,
                isOp: false,
                builtin: builtinMode,
                fullName: term.name
            });
        }
        if (term.isLetMacroTerm) {
            macroDefinition = loadMacroDef(term.body, context, phase + 1);
            // compilation collapses multi-token let macro names into single identifier
            context.env.set(term.name[0], phase, {
                fn: macroDefinition,
                isOp: false,
                builtin: builtinMode,
                fullName: term.name[0].props.fullName
            });
        }
        if (term.isOperatorDefinitionTerm) {
            var opDefinition = loadMacroDef(term.body, context, phase + 1);
            var nameStx = makeMultiToken(term.name);
            addToDefinitionCtx([nameStx], defctx, false, []);
            var opObj = getSyntaxTransform(nameStx, context, phase);
            if (!opObj) {
                opObj = {
                    isOp: true,
                    builtin: builtinMode,
                    fullName: term.name
                };
            }
            assert(unwrapSyntax(term.type) === 'binary' || unwrapSyntax(term.type) === 'unary', 'operator must either be binary or unary');
            opObj[unwrapSyntax(term.type)] = {
                fn: opDefinition,
                prec: term.prec.token.value,
                assoc: term.assoc ? term.assoc.token.value : null
            };
            context.env.set(nameStx, phase, opObj);
        }
    });
    return context;
}
function mapCommaSep(l, f) {
    return l.map(function (stx, idx) {
        if (idx % 2 !== 0 && (!stx.isPunctuator() || stx.token.value !== ',')) {
            throwSyntaxError('import', 'expecting a comma separated list', stx);
        } else if (idx % 2 !== 0) {
            return stx;
        } else {
            return f(stx);
        }
    });
}
function filterModuleCommaSep(stx) {
    return stx.filter(function (stx$2, idx) {
        if (idx % 2 !== 0 && (!stx$2.isPunctuator() || stx$2.token.value !== ',')) {
            throwSyntaxError('import', 'expecting a comma separated list', stx$2);
        } else if (idx % 2 !== 0) {
            return false;
        } else {
            return true;
        }
    });
}
function loadImport(path, context) {
    var modFullPath = resolvePath(path, context.filename);
    if (!availableModules.has(modFullPath)) {
        var // load it
        modToImport = function (mod) {
            return expandModule(mod.term, modFullPath, context.templateMap, context.patternMap, mod.record, context.compileSuffix);
        }(loadModule(modFullPath));
        var modPair = {
            term: modToImport.mod,
            record: modToImport.context.moduleRecord
        };
        availableModules.set(modFullPath, modPair);
        return modPair;
    }
    return availableModules.get(modFullPath);
}
function bindImportInMod(impEntries, stx, modTerm, modRecord, context, phase) {
    var // first collect the import names and their associated bindings
    renamedNames = impEntries.map(function (entry) {
        var isBase = modRecord.language === 'base';
        var inExports = _.find(modRecord.exportEntries, function (expEntry) {
            if (entry.importName.isDelimiter()) {
                return expEntry.exportName.isDelimiter() && syntaxInnerValuesEq(entry.importName, expEntry.exportName);
            }
            return unwrapSyntax(expEntry.exportName) === unwrapSyntax(entry.importName);
        });
        if (!(inExports || isBase)) {
            console.log(modRecord.exportEntries);
            throwSyntaxError('compile', 'the imported name `' + unwrapSyntax(entry.importName) + '` was not exported from the module', entry.importName);
        }
        var exportName, trans, nameStr;
        if (entry.localName.isDelimiter()) {
            nameStr = entry.localName.token.inner.map(unwrapSyntax).join('');
        } else {
            nameStr = unwrapSyntax(entry.localName);
        }
        if (!inExports) {
            // case when importing from a non ES6
            // module but not for macros so the module
            // was not invoked and thus nothing in the
            // context for this name
            trans = null;
        } else if (Array.isArray(inExports.exportName)) {
            assert(false, 'needs to be a delimiter');
        } else if (inExports.exportName.isDelimiter()) {
            exportName = inExports.exportName.token.inner;
            trans = getSyntaxTransform(exportName, context, phase);
        } else {
            exportName = inExports.exportName;
            trans = getSyntaxTransform(exportName, context, phase);
        }
        var newParam = syn.makeIdent(nameStr, entry.localName);
        var newName = fresh();
        var renamedParam = newParam.imported(newParam, newName, phase);
        // the localName for the import needs to be the newly renamed ident
        entry.localName = renamedParam;
        return {
            original: newParam,
            renamed: renamedParam,
            name: newName,
            trans: trans,
            entry: entry
        };
    });
    // set the new bindings in the context
    renamedNames.forEach(function (name) {
        context.env.set(name.renamed, phase, name.trans);
        if (// setup a reverse map from each import name to
            // the import term but only for runtime values
            name.trans === null || name.trans && name.trans.value) {
            var resolvedName = resolve(name.renamed, phase);
            var origName = resolve(name.original, phase);
            context.implicitImport.set(resolvedName, name.entry);
        }
    });
    return stx.map(function (stx$2) {
        return renamedNames.reduce(function (acc, name) {
            return acc.imported(name.original, name.name, phase);
        }, stx$2);
    });
}
// (ModuleTerm, Str, Map, Map, ModuleRecord) -> {
//     context: ExpanderContext,
//     mod: ModuleTerm
// }
function expandModule(mod, filename, templateMap, patternMap, moduleRecord, compileSuffix) {
    var // create a new expander context for this module
    context = makeModuleExpanderContext(filename, templateMap, patternMap, 0, moduleRecord, compileSuffix);
    return {
        context: context,
        mod: expandTermTreeToFinal(mod, context)
    };
}
function isCompileName(stx, context) {
    if (stx.isDelimiter()) {
        return !hasSyntaxTransform(stx.token.inner, context, 0);
    } else {
        return !hasSyntaxTransform(stx, context, 0);
    }
}
function filterCompileNames(stx, context) {
    assert(stx.isDelimiter(), 'must be a delimter');
    var runtimeNames = function (names) {
        return names.filter(function (name) {
            return isCompileName(name, context);
        });
    }(filterModuleCommaSep(stx.token.inner));
    var newInner = runtimeNames.reduce(function (acc, name, idx, orig) {
        acc.push(name);
        if (orig.length - 1 !== idx) {
            // don't add trailing comma
            acc.push(syn.makePunc(',', name));
        }
        return acc;
    }, []);
    return syn.makeDelim('{}', newInner, stx);
}
function flattenModule(modTerm, modRecord, context) {
    var // filter the imports to just the imports and names that are
    // actually available at runtime
    imports = modRecord.getRuntimeImportEntries().filter(function (entry) {
        return isCompileName(entry.localName, context);
    });
    var exports$2 = modRecord.exportEntries.filter(function (entry) {
        return isCompileName(entry.localName, context);
    });
    var // filter out all of the import and export statements
    output = modTerm.body.reduce(function (acc, term) {
        if (term.isExportNameTerm || term.isExportDeclTerm || term.isExportDefaultTerm || term.isImportTerm || term.isImportForMacrosTerm) {
            return acc;
        }
        return acc.concat(term.destruct(context, { stripCompileTerm: true }));
    }, []);
    output = function (output$2) {
        return output$2.map(function (stx) {
            var name = resolve(stx, 0);
            if (// collect the implicit imports (those imports that
                // must be included because a macro expanded to a reference
                // to an import from some other module)
                context.implicitImport.has(name)) {
                var implicit = context.implicitImport.get(name);
                if (!// don't double add the import
                    _.find(imports, function (imp) {
                        return imp === implicit;
                    })) {
                    imports.push(implicit);
                }
            }
            return stx;
        });
    }(flatten(output));
    var // flatten everything
    flatImports = imports.reduce(function (acc, entry) {
        entry.moduleRequest = entry.moduleRequest.clone();
        entry.moduleRequest.token.value += context.compileSuffix;
        return acc.concat(flatten(entry.toTerm().destruct(context).concat(syn.makePunc(';', entry.moduleRequest))));
    }, []);
    return {
        imports: imports.map(function (entry) {
            return entry.toTerm();
        }),
        body: flatImports.concat(output)
    };
}
function flattenImports(imports, mod, context) {
    return imports.reduce(function (acc, imp) {
        var modFullPath = resolvePath(unwrapSyntax(imp.from), context.filename);
        if (availableModules.has(modFullPath)) {
            var modPair = availableModules.get(modFullPath);
            var flattened = flattenModule(modPair.term, modPair.record, context);
            acc.push({
                path: modFullPath,
                code: flattened.body
            });
            acc = acc.concat(flattenImports(flattened.imports, mod, context));
            return acc;
        } else {
            assert(false, 'module was unexpectedly not available for compilation' + modFullPath);
        }
    }, []);
}
function compileModule(stx, options) {
    var fs = require('fs');
    options = options || {};
    var filename = options && typeof options.filename !== 'undefined' ? fs.realpathSync(options.filename) : '(anonymous module)';
    maxExpands = Infinity;
    expandCount = 0;
    var mod = createModule(filename, stx);
    var // the template and pattern maps are global for every module
    templateMap = new StringMap();
    var patternMap = new StringMap();
    availableModules = new StringMap();
    var expanded = expandModule(mod.term, filename, templateMap, patternMap, mod.record, options.compileSuffix);
    var flattened = flattenModule(expanded.mod, expanded.context.moduleRecord, expanded.context);
    var compiledModules = flattenImports(flattened.imports, expanded.mod, expanded.context);
    return [{
            path: filename,
            code: flattened.body
        }].concat(compiledModules);
}
function flatten(stxs) {
    var acc = [], accLen = 0;
    var stack = [], frame;
    var depth = 0;
    var index = -1;
    var count = stxs.length;
    var stx, tok, openParen, closeParen;
    flattening:
        while (depth > -1) {
            while (++index < count) {
                if ((stx = stxs[index]) && stx && (tok = stx.token) && stx.isDelimiter()) {
                    openParen = syntaxFromToken({
                        type: parser.Token.Punctuator,
                        value: tok.value[0],
                        range: tok.startRange,
                        sm_range: typeof tok.sm_startRange == 'undefined' ? tok.startRange : tok.sm_startRange,
                        lineNumber: tok.startLineNumber,
                        sm_lineNumber: typeof tok.sm_startLineNumber == 'undefined' ? tok.startLineNumber : tok.sm_startLineNumber,
                        lineStart: tok.startLineStart,
                        sm_lineStart: typeof tok.sm_startLineStart == 'undefined' ? tok.startLineStart : tok.sm_startLineStart
                    }, stx);
                    closeParen = syntaxFromToken({
                        type: parser.Token.Punctuator,
                        value: tok.value[1],
                        range: tok.endRange,
                        sm_range: typeof tok.sm_endRange == 'undefined' ? tok.endRange : tok.sm_endRange,
                        lineNumber: tok.endLineNumber,
                        sm_lineNumber: typeof tok.sm_endLineNumber == 'undefined' ? tok.endLineNumber : tok.sm_endLineNumber,
                        lineStart: tok.endLineStart,
                        sm_lineStart: typeof tok.sm_endLineStart == 'undefined' ? tok.endLineStart : tok.sm_endLineStart
                    }, stx);
                    if (tok.leadingComments) {
                        openParen.token.leadingComments = tok.leadingComments;
                    }
                    if (tok.trailingComments) {
                        openParen.token.trailingComments = tok.trailingComments;
                    }
                    acc[accLen++] = openParen;
                    stack[depth++] = [
                        tok,
                        closeParen,
                        stxs,
                        index
                    ];
                    stxs = stx.token.inner;
                    index = -1;
                    count = stxs.length;
                    continue;
                }
                tok.sm_lineNumber = typeof tok.sm_lineNumber != 'undefined' ? tok.sm_lineNumber : tok.lineNumber;
                tok.sm_lineStart = typeof tok.sm_lineStart != 'undefined' ? tok.sm_lineStart : tok.lineStart;
                tok.sm_range = typeof tok.sm_range != 'undefined' ? tok.sm_range : tok.range;
                acc[accLen++] = stx;
            }
            if (--depth > -1) {
                frame = stack[depth];
                tok = frame[0];
                closeParen = frame[1];
                acc[accLen++] = closeParen;
                tok.sm_lineNumber = typeof tok.sm_lineNumber != 'undefined' ? tok.sm_lineNumber : tok.lineNumber;
                tok.sm_lineStart = typeof tok.sm_lineStart != 'undefined' ? tok.sm_lineStart : tok.lineStart;
                tok.sm_range = typeof tok.sm_range != 'undefined' ? tok.sm_range : tok.range;
                stxs = frame[2];
                index = frame[3];
                count = stxs.length;
                continue flattening;
            }
        }
    return acc;
}
exports.StringMap = StringMap;
exports.enforest = enforest;
exports.compileModule = compileModule;
exports.getCompiletimeValue = getCompiletimeValue;
exports.hasCompiletimeValue = hasCompiletimeValue;
exports.getSyntaxTransform = getSyntaxTransform;
exports.hasSyntaxTransform = hasSyntaxTransform;
exports.resolve = resolve;
exports.get_expression = get_expression;
exports.makeExpanderContext = makeExpanderContext;
exports.ExprTerm = ExprTerm;
exports.VariableStatementTerm = VariableStatementTerm;
exports.tokensToSyntax = syn.tokensToSyntax;
exports.syntaxToTokens = syn.syntaxToTokens;
},{"./data/env":1,"./data/stringMap":2,"./data/termTree":3,"./data/transforms":4,"./mod/exportEntry":7,"./mod/importEntry":8,"./mod/moduleRecord":9,"./parser":10,"./patterns":11,"./scopedEval":12,"./stx/resolve":13,"./syntax":15,"assert":26,"escodegen":16,"fs":25,"immutable":34,"path":28,"resolve/lib/sync":39,"underscore":50,"vm":32}],7:[function(require,module,exports){
'use strict';
var assert = require('assert'), syn = require('../syntax'), _ = require('underscore');
var throwSyntaxError = syn.throwSyntaxError;
function ExportEntry(term, exportName, localName) {
    this._term = term;
    this.moduleRequest = null;
    this.exportName = exportName;
    this.localName = localName;
}
function makeExportEntries(exp) {
    assert(exp.isExportNameTerm || exp.isExportDefaultTerm || exp.isExportDeclTerm, 'expecting an export term');
    var res = [];
    if (exp.isExportNameTerm) {
        assert(exp.name.isDelimiter(), 'expecting a delimiter token');
        var names = exp.name.token.inner;
        for (var i = 0; i < names.length; i++) {
            if (names[i] && names[i + 1] && names[i + 1].token.value === 'as') {
                res.push(new ExportEntry(exp, names[i + 2], names[i]));
                // walk past the `as <name>` tokens and the comma
                i += 3;
            } else if (names[i]) {
                res.push(new ExportEntry(exp, names[i], names[i]));
                // walk past the comma
                i++;
            }
        }
    } else if (exp.isExportDefaultTerm) {
        var localName;
        if (exp.decl.isIdTerm) {
            localName = exp.decl.id;
        } else if (exp.decl.isNamedFunTerm) {
            localName = exp.decl.name;
        } else if (exp.decl.isMacroTerm || exp.decl.isLetMacroTerm) {
            localName = syn.makeDelim('()', exp.decl.name, exp.decl.name[0]);
        } else if (exp.decl.isExprTerm) {
            localName = syn.makeIdent('*default*', exp.defaultkw);
        } else {
            throwSyntaxError('export', 'export form is not supported', exp.decl);
        }
        res.push(new ExportEntry(exp, exp.defaultkw.rename(exp.defaultkw, syn.fresh()), localName));
    } else if (exp.isExportDeclTerm) {
        if (exp.decl.isVariableStatementTerm || exp.decl.isConstStatementTerm || exp.decl.isLetStatementTerm) {
            exp.decl.decls.forEach(function (decl) {
                res.push(new ExportEntry(exp, decl.ident, decl.ident));
            });
        } else if (exp.decl.isNamedFunTerm) {
            res.push(new ExportEntry(exp, exp.decl.name, exp.decl.name));
        } else if (exp.decl.isMacroTerm || exp.decl.isLetMacroTerm) {
            var macName = syn.makeDelim('()', exp.decl.name, exp.decl.name[0]);
            res.push(new ExportEntry(exp, macName, macName));
        } else {
            throwSyntaxError('export', 'export form is not supported', exp.decl);
        }
    } else {
        assert(false, 'not implemented yet');
    }
    return res;
}
exports.makeExportEntries = makeExportEntries;
exports.ExportEntry = ExportEntry;
},{"../syntax":15,"assert":26,"underscore":50}],8:[function(require,module,exports){
'use strict';
var assert = require('assert'), syn = require('../syntax'), _ = require('underscore'), NamedImportTerm = require('../data/termTree').NamedImportTerm, DefaultImportTerm = require('../data/termTree').DefaultImportTerm, NamespaceImportTerm = require('../data/termTree').NamespaceImportTerm;
function ImportEntry(term, importName, localName) {
    this._term = term;
    this.moduleRequest = term.from;
    this.importName = importName;
    this.localName = localName;
    if (term.isImportTerm) {
        this.forPhase = 0;
    } else if (term.isImportForMacrosTerm) {
        this.forPhase = 1;
    } else {
        assert(false, 'not implemented yet');
    }
}
ImportEntry.prototype.toTerm = function () {
    var term = _.clone(this._term);
    if (syn.unwrapSyntax(this.importName) === '*') {
        term.clause = [NamespaceImportTerm.create(this.importName, syn.makeIdent('as', this.importName), this.localName)];
    } else if (syn.unwrapSyntax(this.importName) === 'default') {
        term.clause = [DefaultImportTerm.create(this.localName)];
    } else {
        var innerTokens;
        if (this.importName.token.value === this.localName.token.value) {
            innerTokens = [this.localName];
        } else {
            innerTokens = [
                this.importName,
                syn.makeIdent('as', this.importName),
                this.localName
            ];
        }
        term.clause = [NamedImportTerm.create(syn.makeDelim('{}', innerTokens, null))];
    }
    return term;
};
function makeImportEntries(imp) {
    assert(imp.isImportTerm || imp.isImportForMacrosTerm, 'expecting an import term');
    var res = [];
    imp.clause.forEach(function (clause) {
        if (clause.isNamedImportTerm) {
            assert(clause.names.isDelimiter(), 'expecting a delimiter token');
            var names = clause.names.token.inner;
            for (var i = 0; i < names.length; i++) {
                if (names[i] && names[i + 1] && names[i + 1].token.value === 'as') {
                    res.push(new ImportEntry(imp, names[i], names[i + 2]));
                    // walk past the `as <name>` tokens and comma
                    i += 3;
                } else if (names[i]) {
                    res.push(new ImportEntry(imp, names[i], names[i]));
                    // walk past the comma
                    i++;
                }
            }
        } else if (clause.isDefaultImportTerm) {
            res.push(new ImportEntry(imp, syn.makeKeyword('default', clause.name), clause.name));
        } else if (clause.isNamespaceImportTerm) {
            res.push(new ImportEntry(imp, clause.star, clause.name));
        } else if (!clause.isPunctuator()) {
            assert(false, 'not implemented yet');
        }
    });
    return res;
}
exports.makeImportEntries = makeImportEntries;
exports.ImportEntry = ImportEntry;
},{"../data/termTree":3,"../syntax":15,"assert":26,"underscore":50}],9:[function(require,module,exports){
'use strict';
var makeImportEntries = require('./importEntry').makeImportEntries;
var makeExportEntries = require('./exportEntry').makeExportEntries;
function ModuleRecord(name, language) {
    this.name = name;
    this.language = language;
    // array of the module names this module imports
    this.importedModules = [];
    // array of each import entry
    this.importEntries = [];
    // array of each export entry
    this.exportEntries = [];
}
// add the import statement to the module record returning an array of
// import entries derived from the import term
ModuleRecord.prototype.addImport = function (imp) {
    var entries = makeImportEntries(imp);
    this.importEntries = this.importEntries.concat(entries);
    this.importedModules.push(imp.from.token.value);
    return entries;
};
// add the export statement to the module record returning an array of
// export entries derived from the import term
ModuleRecord.prototype.addExport = function (exp) {
    var entries = makeExportEntries(exp);
    this.exportEntries = this.exportEntries.concat(entries);
    return entries;
};
// returns an array of the import entries for the given module path
ModuleRecord.prototype.getImportsForModule = function (impPath) {
    return this.importEntries.filter(function (entry) {
        return entry.moduleRequest.token.value === impPath;
    });
};
ModuleRecord.prototype.getRuntimeImportEntries = function () {
    return this.importEntries.filter(function (entry) {
        return entry.forPhase === 0;
    });
};
exports.ModuleRecord = ModuleRecord;
},{"./exportEntry":7,"./importEntry":8}],10:[function(require,module,exports){
/*
  Copyright (C) 2013 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2013 Thaddee Tyl <thaddee.tyl@gmail.com>
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>
  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/*global esprima:true, require: true, define:true, exports:true, window: true,
throwError: true, generateStatement: true, peek: true,
parseAssignmentExpression: true, parseBlock: true,
parseClassExpression: true, parseClassDeclaration: true, parseExpression: true,
parseForStatement: true,
parseFunctionDeclaration: true, parseFunctionExpression: true,
parseFunctionSourceElements: true, parseVariableIdentifier: true,
parseImportSpecifier: true,
parseLeftHandSideExpression: true, parseParams: true, validateParam: true,
parseSpreadOrAssignmentExpression: true,
parseStatement: true, parseSourceElement: true, parseModuleBlock: true, parseConciseBody: true,
parseYieldExpression: true
*/
'use strict';
var expander = require('./expander');
var Token, TokenName, FnExprTokens, Syntax, PropertyKind, Messages, Regex, SyntaxTreeDelegate, ClassPropertyType, source, strict, index, lineNumber, lineStart, sm_lineNumber, sm_lineStart, sm_range, sm_index, length, delegate, tokenStream, streamIndex, lookahead, lookaheadIndex, state, phase, extra;
Token = {
    BooleanLiteral: 1,
    EOF: 2,
    Identifier: 3,
    Keyword: 4,
    NullLiteral: 5,
    NumericLiteral: 6,
    Punctuator: 7,
    StringLiteral: 8,
    RegularExpression: 9,
    Template: 10,
    Delimiter: 11
};
TokenName = {};
TokenName[Token.BooleanLiteral] = 'Boolean';
TokenName[Token.EOF] = '<end>';
TokenName[Token.Identifier] = 'Identifier';
TokenName[Token.Keyword] = 'Keyword';
TokenName[Token.NullLiteral] = 'Null';
TokenName[Token.NumericLiteral] = 'Numeric';
TokenName[Token.Punctuator] = 'Punctuator';
TokenName[Token.StringLiteral] = 'String';
TokenName[Token.RegularExpression] = 'RegularExpression';
TokenName[Token.Delimiter] = 'Delimiter';
// A function following one of those tokens is an expression.
FnExprTokens = [
    '(',
    '{',
    '[',
    'in',
    'typeof',
    'instanceof',
    'new',
    'return',
    'case',
    'delete',
    'throw',
    'void',
    // assignment operators
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '<<=',
    '>>=',
    '>>>=',
    '&=',
    '|=',
    '^=',
    ',',
    // binary/unary operators
    '+',
    '-',
    '*',
    '/',
    '%',
    '++',
    '--',
    '<<',
    '>>',
    '>>>',
    '&',
    '|',
    '^',
    '!',
    '~',
    '&&',
    '||',
    '?',
    ':',
    '===',
    '==',
    '>=',
    '<=',
    '<',
    '>',
    '!=',
    '!=='
];
Syntax = {
    ArrayExpression: 'ArrayExpression',
    ArrayPattern: 'ArrayPattern',
    ArrowFunctionExpression: 'ArrowFunctionExpression',
    AssignmentExpression: 'AssignmentExpression',
    BinaryExpression: 'BinaryExpression',
    BlockStatement: 'BlockStatement',
    BreakStatement: 'BreakStatement',
    CallExpression: 'CallExpression',
    CatchClause: 'CatchClause',
    ClassBody: 'ClassBody',
    ClassDeclaration: 'ClassDeclaration',
    ClassExpression: 'ClassExpression',
    ComprehensionBlock: 'ComprehensionBlock',
    ComprehensionExpression: 'ComprehensionExpression',
    ConditionalExpression: 'ConditionalExpression',
    ContinueStatement: 'ContinueStatement',
    DebuggerStatement: 'DebuggerStatement',
    DoWhileStatement: 'DoWhileStatement',
    EmptyStatement: 'EmptyStatement',
    ExportDeclaration: 'ExportDeclaration',
    ExportBatchSpecifier: 'ExportBatchSpecifier',
    ExportSpecifier: 'ExportSpecifier',
    ExpressionStatement: 'ExpressionStatement',
    ForInStatement: 'ForInStatement',
    ForOfStatement: 'ForOfStatement',
    ForStatement: 'ForStatement',
    FunctionDeclaration: 'FunctionDeclaration',
    FunctionExpression: 'FunctionExpression',
    Identifier: 'Identifier',
    IfStatement: 'IfStatement',
    ImportDeclaration: 'ImportDeclaration',
    ImportSpecifier: 'ImportSpecifier',
    LabeledStatement: 'LabeledStatement',
    Literal: 'Literal',
    LogicalExpression: 'LogicalExpression',
    MemberExpression: 'MemberExpression',
    MethodDefinition: 'MethodDefinition',
    ModuleDeclaration: 'ModuleDeclaration',
    NewExpression: 'NewExpression',
    ObjectExpression: 'ObjectExpression',
    ObjectPattern: 'ObjectPattern',
    Program: 'Program',
    Property: 'Property',
    ReturnStatement: 'ReturnStatement',
    SequenceExpression: 'SequenceExpression',
    SpreadElement: 'SpreadElement',
    SwitchCase: 'SwitchCase',
    SwitchStatement: 'SwitchStatement',
    TaggedTemplateExpression: 'TaggedTemplateExpression',
    TemplateElement: 'TemplateElement',
    TemplateLiteral: 'TemplateLiteral',
    ThisExpression: 'ThisExpression',
    ThrowStatement: 'ThrowStatement',
    TryStatement: 'TryStatement',
    UnaryExpression: 'UnaryExpression',
    UpdateExpression: 'UpdateExpression',
    VariableDeclaration: 'VariableDeclaration',
    VariableDeclarator: 'VariableDeclarator',
    WhileStatement: 'WhileStatement',
    WithStatement: 'WithStatement',
    YieldExpression: 'YieldExpression'
};
PropertyKind = {
    Data: 1,
    Get: 2,
    Set: 4
};
ClassPropertyType = {
    'static': 'static',
    prototype: 'prototype'
};
// Error messages should be identical to V8.
Messages = {
    UnexpectedToken: 'Unexpected token %0',
    UnexpectedNumber: 'Unexpected number',
    UnexpectedString: 'Unexpected string',
    UnexpectedIdentifier: 'Unexpected identifier',
    UnexpectedReserved: 'Unexpected reserved word',
    UnexpectedTemplate: 'Unexpected quasi %0',
    UnexpectedEOS: 'Unexpected end of input',
    NewlineAfterThrow: 'Illegal newline after throw',
    InvalidRegExp: 'Invalid regular expression',
    UnterminatedRegExp: 'Invalid regular expression: missing /',
    InvalidLHSInAssignment: 'Invalid left-hand side in assignment',
    InvalidLHSInFormalsList: 'Invalid left-hand side in formals list',
    InvalidLHSInForIn: 'Invalid left-hand side in for-in',
    MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
    NoCatchOrFinally: 'Missing catch or finally after try',
    UnknownLabel: 'Undefined label \'%0\'',
    Redeclaration: '%0 \'%1\' has already been declared',
    IllegalContinue: 'Illegal continue statement',
    IllegalBreak: 'Illegal break statement',
    IllegalDuplicateClassProperty: 'Illegal duplicate property in class definition',
    IllegalReturn: 'Illegal return statement',
    IllegalYield: 'Illegal yield expression',
    IllegalSpread: 'Illegal spread element',
    StrictModeWith: 'Strict mode code may not include a with statement',
    StrictCatchVariable: 'Catch variable may not be eval or arguments in strict mode',
    StrictVarName: 'Variable name may not be eval or arguments in strict mode',
    StrictParamName: 'Parameter name eval or arguments is not allowed in strict mode',
    StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
    ParameterAfterRestParameter: 'Rest parameter must be final parameter of an argument list',
    DefaultRestParameter: 'Rest parameter can not have a default value',
    ElementAfterSpreadElement: 'Spread must be the final element of an element list',
    ObjectPatternAsRestParameter: 'Invalid rest parameter',
    ObjectPatternAsSpread: 'Invalid spread argument',
    StrictFunctionName: 'Function name may not be eval or arguments in strict mode',
    StrictOctalLiteral: 'Octal literals are not allowed in strict mode.',
    StrictDelete: 'Delete of an unqualified identifier in strict mode.',
    StrictDuplicateProperty: 'Duplicate data property in object literal not allowed in strict mode',
    AccessorDataProperty: 'Object literal may not have data and accessor property with the same name',
    AccessorGetSet: 'Object literal may not have multiple get/set accessors with the same name',
    StrictLHSAssignment: 'Assignment to eval or arguments is not allowed in strict mode',
    StrictLHSPostfix: 'Postfix increment/decrement may not have eval or arguments operand in strict mode',
    StrictLHSPrefix: 'Prefix increment/decrement may not have eval or arguments operand in strict mode',
    StrictReservedWord: 'Use of future reserved word in strict mode',
    NewlineAfterModule: 'Illegal newline after module',
    NoFromAfterImport: 'Missing from after import',
    InvalidModuleSpecifier: 'Invalid module specifier',
    NestedModule: 'Module declaration can not be nested',
    NoUnintializedConst: 'Const must be initialized',
    ComprehensionRequiresBlock: 'Comprehension must have at least one block',
    ComprehensionError: 'Comprehension Error',
    EachNotAllowed: 'Each is not supported',
    UnmatchedDelimiter: 'Unmatched Delimiter'
};
// See also tools/generate-unicode-regex.py.
Regex = {
    NonAsciiIdentifierStart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]'),
    NonAsciiIdentifierPart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0\u08A2-\u08AC\u08E4-\u08FE\u0900-\u0963\u0966-\u096F\u0971-\u0977\u0979-\u097F\u0981-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C82\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191C\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1D00-\u1DE6\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA697\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7B\uAA80-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE26\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]')
};
function assert(condition, message) {
    if (!condition) {
        throw new Error('ASSERT: ' + message);
    }
}
function isIn(el, list) {
    return list.indexOf(el) !== -1;
}
function isDecimalDigit(ch) {
    return ch >= 48 && ch <= 57;
}
function isHexDigit(ch) {
    return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
}
function isOctalDigit(ch) {
    return '01234567'.indexOf(ch) >= 0;
}
function isWhiteSpace(ch) {
    return ch === 32 || // space
    ch === 9 || // tab
    ch === 11 || ch === 12 || ch === 160 || ch >= 5760 && '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(String.fromCharCode(ch)) > 0;
}
function isLineTerminator(ch) {
    return ch === 10 || ch === 13 || ch === 8232 || ch === 8233;
}
function isIdentifierStart(ch) {
    return ch === 36 || ch === 95 || // $ (dollar) and _ (underscore)
    ch >= 65 && ch <= 90 || // A..Z
    ch >= 97 && ch <= 122 || // a..z
    ch === 92 || // \ (backslash)
    ch >= 128 && Regex.NonAsciiIdentifierStart.test(String.fromCharCode(ch));
}
function isIdentifierPart(ch) {
    return ch === 36 || ch === 95 || // $ (dollar) and _ (underscore)
    ch >= 65 && ch <= 90 || // A..Z
    ch >= 97 && ch <= 122 || // a..z
    ch >= 48 && ch <= 57 || // 0..9
    ch === 92 || // \ (backslash)
    ch >= 128 && Regex.NonAsciiIdentifierPart.test(String.fromCharCode(ch));
}
function isFutureReservedWord(id) {
    switch (id) {
    case 'class':
    case 'enum':
    case 'export':
    case 'extends':
    case 'import':
    case 'super':
        return true;
    default:
        return false;
    }
}
function isStrictModeReservedWord(id) {
    switch (id) {
    case 'implements':
    case 'interface':
    case 'package':
    case 'private':
    case 'protected':
    case 'public':
    case 'static':
    case 'yield':
    case 'let':
        return true;
    default:
        return false;
    }
}
function isRestrictedWord(id) {
    return id === 'eval' || id === 'arguments';
}
function isKeyword(id) {
    if (strict && isStrictModeReservedWord(id)) {
        return true;
    }
    switch (// 'const' is specialized as Keyword in V8.
        // 'yield' is only treated as a keyword in strict mode.
        // 'let' is for compatiblity with SpiderMonkey and ES.next.
        // Some others are from future reserved words.
        id.length) {
    case 2:
        return id === 'if' || id === 'in' || id === 'do';
    case 3:
        return id === 'var' || id === 'for' || id === 'new' || id === 'try' || id === 'let';
    case 4:
        return id === 'this' || id === 'else' || id === 'case' || id === 'void' || id === 'with' || id === 'enum';
    case 5:
        return id === 'while' || id === 'break' || id === 'catch' || id === 'throw' || id === 'const' || id === 'class' || id === 'super';
    case 6:
        return id === 'return' || id === 'typeof' || id === 'delete' || id === 'switch' || id === 'export' || id === 'import';
    case 7:
        return id === 'default' || id === 'finally' || id === 'extends';
    case 8:
        return id === 'function' || id === 'continue' || id === 'debugger';
    case 10:
        return id === 'instanceof';
    default:
        return false;
    }
}
function skipComment() {
    var ch, blockComment, lineComment;
    blockComment = false;
    lineComment = false;
    while (index < length) {
        ch = source.charCodeAt(index);
        if (lineComment) {
            ++index;
            if (isLineTerminator(ch)) {
                lineComment = false;
                if (ch === 13 && source.charCodeAt(index) === 10) {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
            }
        } else if (blockComment) {
            if (isLineTerminator(ch)) {
                if (ch === 13 && source.charCodeAt(index + 1) === 10) {
                    ++index;
                }
                ++lineNumber;
                ++index;
                lineStart = index;
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
            } else {
                ch = source.charCodeAt(index++);
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
                if (// Block comment ends with '*/' (char #42, char #47).
                    ch === 42) {
                    ch = source.charCodeAt(index);
                    if (ch === 47) {
                        ++index;
                        blockComment = false;
                    }
                }
            }
        } else if (ch === 47) {
            ch = source.charCodeAt(index + 1);
            if (// Line comment starts with '//' (char #47, char #47).
                ch === 47) {
                index += 2;
                lineComment = true;
            } else if (ch === 42) {
                // Block comment starts with '/*' (char #47, char #42).
                index += 2;
                blockComment = true;
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
            } else {
                break;
            }
        } else if (isWhiteSpace(ch)) {
            ++index;
        } else if (isLineTerminator(ch)) {
            ++index;
            if (ch === 13 && source.charCodeAt(index) === 10) {
                ++index;
            }
            ++lineNumber;
            lineStart = index;
        } else {
            break;
        }
    }
}
function scanHexEscape(prefix) {
    var i, len, ch, code = 0;
    len = prefix === 'u' ? 4 : 2;
    for (i = 0; i < len; ++i) {
        if (index < length && isHexDigit(source[index])) {
            ch = source[index++];
            code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
        } else {
            return '';
        }
    }
    return String.fromCharCode(code);
}
function scanUnicodeCodePointEscape() {
    var ch, code, cu1, cu2;
    ch = source[index];
    code = 0;
    if (// At least, one hex digit is required.
        ch === '}') {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    while (index < length) {
        ch = source[index++];
        if (!isHexDigit(ch)) {
            break;
        }
        code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
    }
    if (code > 1114111 || ch !== '}') {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    if (// UTF-16 Encoding
        code <= 65535) {
        return String.fromCharCode(code);
    }
    cu1 = (code - 65536 >> 10) + 55296;
    cu2 = (code - 65536 & 1023) + 56320;
    return String.fromCharCode(cu1, cu2);
}
function getEscapedIdentifier() {
    var ch, id;
    ch = source.charCodeAt(index++);
    id = String.fromCharCode(ch);
    if (// '\u' (char #92, char #117) denotes an escaped character.
        ch === 92) {
        if (source.charCodeAt(index) !== 117) {
            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
        }
        ++index;
        ch = scanHexEscape('u');
        if (!ch || ch === '\\' || !isIdentifierStart(ch.charCodeAt(0))) {
            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
        }
        id = ch;
    }
    while (index < length) {
        ch = source.charCodeAt(index);
        if (!isIdentifierPart(ch)) {
            break;
        }
        ++index;
        id += String.fromCharCode(ch);
        if (// '\u' (char #92, char #117) denotes an escaped character.
            ch === 92) {
            id = id.substr(0, id.length - 1);
            if (source.charCodeAt(index) !== 117) {
                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
            }
            ++index;
            ch = scanHexEscape('u');
            if (!ch || ch === '\\' || !isIdentifierPart(ch.charCodeAt(0))) {
                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
            }
            id += ch;
        }
    }
    return id;
}
function getIdentifier() {
    var start, ch;
    start = index++;
    while (index < length) {
        ch = source.charCodeAt(index);
        if (ch === 92) {
            // Blackslash (char #92) marks Unicode escape sequence.
            index = start;
            return getEscapedIdentifier();
        }
        if (isIdentifierPart(ch)) {
            ++index;
        } else {
            break;
        }
    }
    return source.slice(start, index);
}
function scanIdentifier() {
    var start, id, type;
    start = index;
    // Backslash (char #92) starts an escaped character.
    id = source.charCodeAt(index) === 92 ? getEscapedIdentifier() : getIdentifier();
    if (// There is no keyword or literal with only one character.
        // Thus, it must be an identifier.
        id.length === 1) {
        type = Token.Identifier;
    } else if (isKeyword(id)) {
        type = Token.Keyword;
    } else if (id === 'null') {
        type = Token.NullLiteral;
    } else if (id === 'true' || id === 'false') {
        type = Token.BooleanLiteral;
    } else {
        type = Token.Identifier;
    }
    return {
        type: type,
        value: id,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanPunctuator() {
    var start = index, code = source.charCodeAt(index), code2, ch1 = source[index], ch2, ch3, ch4;
    switch (code) {
    // Check for most common single-character punctuators.
    case 40:
    // ( open bracket
    case 41:
    // ) close bracket
    case 59:
    // ; semicolon
    case 44:
    // , comma
    case 123:
    // { open curly brace
    case 125:
    // } close curly brace
    case 91:
    // [
    case 93:
    // ]
    case 58:
    // :
    case 63:
    case // ?
        126:
        // ~
        ++index;
        if (extra.tokenize) {
            if (code === 40) {
                extra.openParenToken = extra.tokens.length;
            } else if (code === 123) {
                extra.openCurlyToken = extra.tokens.length;
            }
        }
        return {
            type: Token.Punctuator,
            value: String.fromCharCode(code),
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    default:
        code2 = source.charCodeAt(index + 1);
        if (// '=' (char #61) marks an assignment or comparison operator.
            code2 === 61) {
            switch (code) {
            case 37:
            // %
            case 38:
            // &
            case 42:
            // *:
            case 43:
            // +
            case 45:
            // -
            case 47:
            // /
            case 60:
            // <
            case 62:
            // >
            case 94:
            case // ^
                124:
                // |
                index += 2;
                return {
                    type: Token.Punctuator,
                    value: String.fromCharCode(code) + String.fromCharCode(code2),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [
                        start,
                        index
                    ]
                };
            case 33:
            case // !
                61:
                // =
                index += 2;
                if (// !== and ===
                    source.charCodeAt(index) === 61) {
                    ++index;
                }
                return {
                    type: Token.Punctuator,
                    value: source.slice(start, index),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [
                        start,
                        index
                    ]
                };
            default:
                break;
            }
        }
        break;
    }
    // Peek more characters.
    ch2 = source[index + 1];
    ch3 = source[index + 2];
    ch4 = source[index + 3];
    if (// 4-character punctuator: >>>=
        ch1 === '>' && ch2 === '>' && ch3 === '>') {
        if (ch4 === '=') {
            index += 4;
            return {
                type: Token.Punctuator,
                value: '>>>=',
                lineNumber: lineNumber,
                lineStart: lineStart,
                range: [
                    start,
                    index
                ]
            };
        }
    }
    if (// 3-character punctuators: === !== >>> <<= >>=
        ch1 === '>' && ch2 === '>' && ch3 === '>') {
        index += 3;
        return {
            type: Token.Punctuator,
            value: '>>>',
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (ch1 === '<' && ch2 === '<' && ch3 === '=') {
        index += 3;
        return {
            type: Token.Punctuator,
            value: '<<=',
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (ch1 === '>' && ch2 === '>' && ch3 === '=') {
        index += 3;
        return {
            type: Token.Punctuator,
            value: '>>=',
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (ch1 === '.' && ch2 === '.' && ch3 === '.') {
        index += 3;
        return {
            type: Token.Punctuator,
            value: '...',
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (// Other 2-character punctuators: ++ -- << >> && ||
        ch1 === ch2 && '+-<>&|'.indexOf(ch1) >= 0) {
        index += 2;
        return {
            type: Token.Punctuator,
            value: ch1 + ch2,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (ch1 === '=' && ch2 === '>') {
        index += 2;
        return {
            type: Token.Punctuator,
            value: '=>',
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if ('<>=!+-*%&|^/'.indexOf(ch1) >= 0) {
        ++index;
        return {
            type: Token.Punctuator,
            value: ch1,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    if (ch1 === '.') {
        ++index;
        return {
            type: Token.Punctuator,
            value: ch1,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
}
function scanHexLiteral(start) {
    var number = '';
    while (index < length) {
        if (!isHexDigit(source[index])) {
            break;
        }
        number += source[index++];
    }
    if (number.length === 0) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    if (isIdentifierStart(source.charCodeAt(index))) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    return {
        type: Token.NumericLiteral,
        value: parseInt('0x' + number, 16),
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanOctalLiteral(prefix, start) {
    var number, octal;
    if (isOctalDigit(prefix)) {
        octal = true;
        number = '0' + source[index++];
    } else {
        octal = false;
        ++index;
        number = '';
    }
    while (index < length) {
        if (!isOctalDigit(source[index])) {
            break;
        }
        number += source[index++];
    }
    if (!octal && number.length === 0) {
        // only 0o or 0O
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    if (isIdentifierStart(source.charCodeAt(index)) || isDecimalDigit(source.charCodeAt(index))) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    return {
        type: Token.NumericLiteral,
        value: parseInt(number, 8),
        octal: octal,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanNumericLiteral() {
    var number, start, ch, octal;
    ch = source[index];
    assert(isDecimalDigit(ch.charCodeAt(0)) || ch === '.', 'Numeric literal must start with a decimal digit or a decimal point');
    start = index;
    number = '';
    if (ch !== '.') {
        number = source[index++];
        ch = source[index];
        if (// Hex number starts with '0x'.
            // Octal number starts with '0'.
            // Octal number in ES6 starts with '0o'.
            // Binary number in ES6 starts with '0b'.
            number === '0') {
            if (ch === 'x' || ch === 'X') {
                ++index;
                return scanHexLiteral(start);
            }
            if (ch === 'b' || ch === 'B') {
                ++index;
                number = '';
                while (index < length) {
                    ch = source[index];
                    if (ch !== '0' && ch !== '1') {
                        break;
                    }
                    number += source[index++];
                }
                if (number.length === 0) {
                    // only 0b or 0B
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
                if (index < length) {
                    ch = source.charCodeAt(index);
                    if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                    }
                }
                return {
                    type: Token.NumericLiteral,
                    value: parseInt(number, 2),
                    lineNumber: lineNumber,
                    lineStart: lineStart,
                    range: [
                        start,
                        index
                    ]
                };
            }
            if (ch === 'o' || ch === 'O' || isOctalDigit(ch)) {
                return scanOctalLiteral(ch, start);
            }
            if (// decimal number starts with '0' such as '09' is illegal.
                ch && isDecimalDigit(ch.charCodeAt(0))) {
                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
            }
        }
        while (isDecimalDigit(source.charCodeAt(index))) {
            number += source[index++];
        }
        ch = source[index];
    }
    if (ch === '.') {
        number += source[index++];
        while (isDecimalDigit(source.charCodeAt(index))) {
            number += source[index++];
        }
        ch = source[index];
    }
    if (ch === 'e' || ch === 'E') {
        number += source[index++];
        ch = source[index];
        if (ch === '+' || ch === '-') {
            number += source[index++];
        }
        if (isDecimalDigit(source.charCodeAt(index))) {
            while (isDecimalDigit(source.charCodeAt(index))) {
                number += source[index++];
            }
        } else {
            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
        }
    }
    if (isIdentifierStart(source.charCodeAt(index))) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    return {
        type: Token.NumericLiteral,
        value: parseFloat(number),
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanStringLiteral() {
    var str = '', quote, start, ch, code, unescaped, restore, octal = false;
    quote = source[index];
    assert(quote === '\'' || quote === '"', 'String literal must starts with a quote');
    start = index;
    ++index;
    while (index < length) {
        ch = source[index++];
        if (ch === quote) {
            quote = '';
            break;
        } else if (ch === '\\') {
            ch = source[index++];
            if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
                switch (ch) {
                case 'n':
                    str += '\n';
                    break;
                case 'r':
                    str += '\r';
                    break;
                case 't':
                    str += '\t';
                    break;
                case 'u':
                case 'x':
                    if (source[index] === '{') {
                        ++index;
                        str += scanUnicodeCodePointEscape();
                    } else {
                        restore = index;
                        unescaped = scanHexEscape(ch);
                        if (unescaped) {
                            str += unescaped;
                        } else {
                            index = restore;
                            str += ch;
                        }
                    }
                    break;
                case 'b':
                    str += '\b';
                    break;
                case 'f':
                    str += '\f';
                    break;
                case 'v':
                    str += '\x0B';
                    break;
                default:
                    if (isOctalDigit(ch)) {
                        code = '01234567'.indexOf(ch);
                        if (// \0 is not octal escape sequence
                            code !== 0) {
                            octal = true;
                        }
                        if (index < length && isOctalDigit(source[index])) {
                            octal = true;
                            code = code * 8 + '01234567'.indexOf(source[index++]);
                            if (// 3 digits are only allowed when string starts
                                // with 0, 1, 2, 3
                                '0123'.indexOf(ch) >= 0 && index < length && isOctalDigit(source[index])) {
                                code = code * 8 + '01234567'.indexOf(source[index++]);
                            }
                        }
                        str += String.fromCharCode(code);
                    } else {
                        str += ch;
                    }
                    break;
                }
            } else {
                ++lineNumber;
                if (ch === '\r' && source[index] === '\n') {
                    ++index;
                }
                lineStart = index;
            }
        } else if (isLineTerminator(ch.charCodeAt(0))) {
            break;
        } else {
            str += ch;
        }
    }
    if (quote !== '') {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    return {
        type: Token.StringLiteral,
        value: str,
        octal: octal,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanTemplate() {
    var cooked = '', ch, start, terminated, tail, restore, unescaped, code, octal;
    terminated = false;
    tail = false;
    start = index;
    ++index;
    while (index < length) {
        ch = source[index++];
        if (ch === '`') {
            tail = true;
            terminated = true;
            break;
        } else if (ch === '$') {
            if (source[index] === '{') {
                ++index;
                terminated = true;
                break;
            }
            cooked += ch;
        } else if (ch === '\\') {
            ch = source[index++];
            if (!isLineTerminator(ch.charCodeAt(0))) {
                switch (ch) {
                case 'n':
                    cooked += '\n';
                    break;
                case 'r':
                    cooked += '\r';
                    break;
                case 't':
                    cooked += '\t';
                    break;
                case 'u':
                case 'x':
                    if (source[index] === '{') {
                        ++index;
                        cooked += scanUnicodeCodePointEscape();
                    } else {
                        restore = index;
                        unescaped = scanHexEscape(ch);
                        if (unescaped) {
                            cooked += unescaped;
                        } else {
                            index = restore;
                            cooked += ch;
                        }
                    }
                    break;
                case 'b':
                    cooked += '\b';
                    break;
                case 'f':
                    cooked += '\f';
                    break;
                case 'v':
                    cooked += '\x0B';
                    break;
                default:
                    if (isOctalDigit(ch)) {
                        code = '01234567'.indexOf(ch);
                        if (// \0 is not octal escape sequence
                            code !== 0) {
                            octal = true;
                        }
                        if (index < length && isOctalDigit(source[index])) {
                            octal = true;
                            code = code * 8 + '01234567'.indexOf(source[index++]);
                            if (// 3 digits are only allowed when string starts
                                // with 0, 1, 2, 3
                                '0123'.indexOf(ch) >= 0 && index < length && isOctalDigit(source[index])) {
                                code = code * 8 + '01234567'.indexOf(source[index++]);
                            }
                        }
                        cooked += String.fromCharCode(code);
                    } else {
                        cooked += ch;
                    }
                    break;
                }
            } else {
                ++lineNumber;
                if (ch === '\r' && source[index] === '\n') {
                    ++index;
                }
                lineStart = index;
            }
        } else if (isLineTerminator(ch.charCodeAt(0))) {
            ++lineNumber;
            if (ch === '\r' && source[index] === '\n') {
                ++index;
            }
            lineStart = index;
            cooked += '\n';
        } else {
            cooked += ch;
        }
    }
    if (!terminated) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    return {
        type: Token.Template,
        value: {
            cooked: cooked,
            raw: source.slice(start + 1, index - (tail ? 1 : 2))
        },
        tail: tail,
        octal: octal,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            start,
            index
        ]
    };
}
function scanTemplateElement(option) {
    var startsWith, template;
    lookahead = null;
    skipComment();
    startsWith = option.head ? '`' : '}';
    if (source[index] !== startsWith) {
        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
    }
    template = scanTemplate();
    peek();
    return template;
}
function scanRegExp() {
    var str, ch, start, pattern, flags, value, classMarker = false, restore, terminated = false;
    lookahead = null;
    skipComment();
    start = index;
    ch = source[index];
    assert(ch === '/', 'Regular expression literal must start with a slash');
    str = source[index++];
    while (index < length) {
        ch = source[index++];
        str += ch;
        if (classMarker) {
            if (ch === ']') {
                classMarker = false;
            }
        } else {
            if (ch === '\\') {
                ch = source[index++];
                if (// ECMA-262 7.8.5
                    isLineTerminator(ch.charCodeAt(0))) {
                    throwError({}, Messages.UnterminatedRegExp);
                }
                str += ch;
            } else if (ch === '/') {
                terminated = true;
                break;
            } else if (ch === '[') {
                classMarker = true;
            } else if (isLineTerminator(ch.charCodeAt(0))) {
                throwError({}, Messages.UnterminatedRegExp);
            }
        }
    }
    if (!terminated) {
        throwError({}, Messages.UnterminatedRegExp);
    }
    // Exclude leading and trailing slash.
    pattern = str.substr(1, str.length - 2);
    flags = '';
    while (index < length) {
        ch = source[index];
        if (!isIdentifierPart(ch.charCodeAt(0))) {
            break;
        }
        ++index;
        if (ch === '\\' && index < length) {
            ch = source[index];
            if (ch === 'u') {
                ++index;
                restore = index;
                ch = scanHexEscape('u');
                if (ch) {
                    flags += ch;
                    for (str += '\\u'; restore < index; ++restore) {
                        str += source[restore];
                    }
                } else {
                    index = restore;
                    flags += 'u';
                    str += '\\u';
                }
            } else {
                str += '\\';
            }
        } else {
            flags += ch;
            str += ch;
        }
    }
    try {
        value = new RegExp(pattern, flags);
    } catch (e) {
        throwError({}, Messages.InvalidRegExp);
    }
    if (// peek();
        extra.tokenize) {
        return {
            type: Token.RegularExpression,
            value: value,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                start,
                index
            ]
        };
    }
    return {
        type: Token.RegularExpression,
        literal: str,
        value: value,
        range: [
            start,
            index
        ]
    };
}
function isIdentifierName(token) {
    return token.type === Token.Identifier || token.type === Token.Keyword || token.type === Token.BooleanLiteral || token.type === Token.NullLiteral;
}
function advanceSlash() {
    var prevToken, checkToken;
    // Using the following algorithm:
    // https://github.com/mozilla/sweet.js/wiki/design
    prevToken = extra.tokens[extra.tokens.length - 1];
    if (!prevToken) {
        // Nothing before that: it cannot be a division.
        return scanRegExp();
    }
    if (prevToken.type === 'Punctuator') {
        if (prevToken.value === ')') {
            checkToken = extra.tokens[extra.openParenToken - 1];
            if (checkToken && checkToken.type === 'Keyword' && (checkToken.value === 'if' || checkToken.value === 'while' || checkToken.value === 'for' || checkToken.value === 'with')) {
                return scanRegExp();
            }
            return scanPunctuator();
        }
        if (prevToken.value === '}') {
            if (// Dividing a function by anything makes little sense,
                // but we have to check for that.
                extra.tokens[extra.openCurlyToken - 3] && extra.tokens[extra.openCurlyToken - 3].type === 'Keyword') {
                // Anonymous function.
                checkToken = extra.tokens[extra.openCurlyToken - 4];
                if (!checkToken) {
                    return scanPunctuator();
                }
            } else if (extra.tokens[extra.openCurlyToken - 4] && extra.tokens[extra.openCurlyToken - 4].type === 'Keyword') {
                // Named function.
                checkToken = extra.tokens[extra.openCurlyToken - 5];
                if (!checkToken) {
                    return scanRegExp();
                }
            } else {
                return scanPunctuator();
            }
            if (// checkToken determines whether the function is
                // a declaration or an expression.
                FnExprTokens.indexOf(checkToken.value) >= 0) {
                // It is an expression.
                return scanPunctuator();
            }
            // It is a declaration.
            return scanRegExp();
        }
        return scanRegExp();
    }
    if (prevToken.type === 'Keyword') {
        return scanRegExp();
    }
    return scanPunctuator();
}
function advance() {
    var ch;
    skipComment();
    if (index >= length) {
        return {
            type: Token.EOF,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                index,
                index
            ]
        };
    }
    ch = source.charCodeAt(index);
    if (// Very common: ( and ) and ;
        ch === 40 || ch === 41 || ch === 58) {
        return scanPunctuator();
    }
    if (// String literal starts with single quote (#39) or double quote (#34).
        ch === 39 || ch === 34) {
        return scanStringLiteral();
    }
    if (ch === 96) {
        return scanTemplate();
    }
    if (isIdentifierStart(ch)) {
        return scanIdentifier();
    }
    if (// # and @ are allowed for sweet.js
        ch === 35 || ch === 64) {
        ++index;
        return {
            type: Token.Punctuator,
            value: String.fromCharCode(ch),
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                index - 1,
                index
            ]
        };
    }
    if (// Dot (.) char #46 can also start a floating-point number, hence the need
        // to check the next character.
        ch === 46) {
        if (isDecimalDigit(source.charCodeAt(index + 1))) {
            return scanNumericLiteral();
        }
        return scanPunctuator();
    }
    if (isDecimalDigit(ch)) {
        return scanNumericLiteral();
    }
    if (// Slash (/) char #47 can also start a regex.
        extra.tokenize && ch === 47) {
        return advanceSlash();
    }
    return scanPunctuator();
}
function lex() {
    var token;
    token = lookahead;
    streamIndex = lookaheadIndex;
    lineNumber = token.lineNumber;
    lineStart = token.lineStart;
    sm_lineNumber = lookahead.sm_lineNumber;
    sm_lineStart = lookahead.sm_lineStart;
    sm_range = lookahead.sm_range;
    sm_index = lookahead.sm_range[0];
    lookahead = tokenStream[++streamIndex].token;
    lookaheadIndex = streamIndex;
    index = lookahead.range[0];
    if (token.leadingComments) {
        extra.comments = extra.comments.concat(token.leadingComments);
        extra.trailingComments = extra.trailingComments.concat(token.leadingComments);
        extra.leadingComments = extra.leadingComments.concat(token.leadingComments);
    }
    return token;
}
function peek() {
    lookaheadIndex = streamIndex + 1;
    if (lookaheadIndex >= length) {
        lookahead = {
            type: Token.EOF,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                index,
                index
            ]
        };
        return;
    }
    lookahead = tokenStream[lookaheadIndex].token;
    index = lookahead.range[0];
}
function lookahead2() {
    var adv, pos, line, start, result;
    if (streamIndex + 1 >= length || streamIndex + 2 >= length) {
        return {
            type: Token.EOF,
            lineNumber: lineNumber,
            lineStart: lineStart,
            range: [
                index,
                index
            ]
        };
    }
    if (// Scan for the next immediate token.
        lookahead === null) {
        lookaheadIndex = streamIndex + 1;
        lookahead = tokenStream[lookaheadIndex].token;
        index = lookahead.range[0];
    }
    result = tokenStream[lookaheadIndex + 1].token;
    return result;
}
function markerCreate() {
    var sm_index$2 = lookahead ? lookahead.sm_range[0] : 0;
    var sm_lineStart$2 = lookahead ? lookahead.sm_lineStart : 0;
    var sm_lineNumber$2 = lookahead ? lookahead.sm_lineNumber : 1;
    if (!extra.loc && !extra.range) {
        return undefined;
    }
    return {
        offset: sm_index$2,
        line: sm_lineNumber$2,
        col: sm_index$2 - sm_lineStart$2
    };
}
function processComment(node) {
    var lastChild, trailingComments, bottomRight = extra.bottomRightStack, last = bottomRight[bottomRight.length - 1];
    if (node.type === Syntax.Program) {
        if (node.body.length > 0) {
            return;
        }
    }
    if (extra.trailingComments.length > 0) {
        if (extra.trailingComments[0].range[0] >= node.range[1]) {
            trailingComments = extra.trailingComments;
            extra.trailingComments = [];
        } else {
            extra.trailingComments.length = 0;
        }
    } else {
        if (last && last.trailingComments && last.trailingComments[0].range[0] >= node.range[1]) {
            trailingComments = last.trailingComments;
            delete last.trailingComments;
        }
    }
    if (// Eating the stack.
        last) {
        while (last && last.range[0] >= node.range[0]) {
            lastChild = last;
            last = bottomRight.pop();
        }
    }
    if (lastChild) {
        if (lastChild.leadingComments && lastChild.leadingComments[lastChild.leadingComments.length - 1].range[1] <= node.range[0]) {
            node.leadingComments = lastChild.leadingComments;
            delete lastChild.leadingComments;
        }
    } else if (extra.leadingComments.length > 0 && extra.leadingComments[extra.leadingComments.length - 1].range[1] <= node.range[0]) {
        node.leadingComments = extra.leadingComments;
        extra.leadingComments = [];
    }
    if (trailingComments) {
        node.trailingComments = trailingComments;
    }
    bottomRight.push(node);
}
function markerApply(marker, node) {
    if (extra.range) {
        node.range = [
            marker.offset,
            sm_index
        ];
    }
    if (extra.loc) {
        node.loc = {
            start: {
                line: marker.line,
                column: marker.col
            },
            end: {
                line: sm_lineNumber,
                column: sm_index - sm_lineStart
            }
        };
        node = delegate.postProcess(node);
    }
    if (extra.attachComment) {
        processComment(node);
    }
    return node;
}
SyntaxTreeDelegate = {
    name: 'SyntaxTree',
    postProcess: function (node) {
        return node;
    },
    createArrayExpression: function (elements) {
        return {
            type: Syntax.ArrayExpression,
            elements: elements
        };
    },
    createAssignmentExpression: function (operator, left, right) {
        return {
            type: Syntax.AssignmentExpression,
            operator: operator,
            left: left,
            right: right
        };
    },
    createBinaryExpression: function (operator, left, right) {
        var type = operator === '||' || operator === '&&' ? Syntax.LogicalExpression : Syntax.BinaryExpression;
        return {
            type: type,
            operator: operator,
            left: left,
            right: right
        };
    },
    createBlockStatement: function (body) {
        return {
            type: Syntax.BlockStatement,
            body: body
        };
    },
    createBreakStatement: function (label) {
        return {
            type: Syntax.BreakStatement,
            label: label
        };
    },
    createCallExpression: function (callee, args) {
        return {
            type: Syntax.CallExpression,
            callee: callee,
            'arguments': args
        };
    },
    createCatchClause: function (param, body) {
        return {
            type: Syntax.CatchClause,
            param: param,
            body: body
        };
    },
    createConditionalExpression: function (test, consequent, alternate) {
        return {
            type: Syntax.ConditionalExpression,
            test: test,
            consequent: consequent,
            alternate: alternate
        };
    },
    createContinueStatement: function (label) {
        return {
            type: Syntax.ContinueStatement,
            label: label
        };
    },
    createDebuggerStatement: function () {
        return { type: Syntax.DebuggerStatement };
    },
    createDoWhileStatement: function (body, test) {
        return {
            type: Syntax.DoWhileStatement,
            body: body,
            test: test
        };
    },
    createEmptyStatement: function () {
        return { type: Syntax.EmptyStatement };
    },
    createExpressionStatement: function (expression) {
        return {
            type: Syntax.ExpressionStatement,
            expression: expression
        };
    },
    createForStatement: function (init, test, update, body) {
        return {
            type: Syntax.ForStatement,
            init: init,
            test: test,
            update: update,
            body: body
        };
    },
    createForInStatement: function (left, right, body) {
        return {
            type: Syntax.ForInStatement,
            left: left,
            right: right,
            body: body,
            each: false
        };
    },
    createForOfStatement: function (left, right, body) {
        return {
            type: Syntax.ForOfStatement,
            left: left,
            right: right,
            body: body
        };
    },
    createFunctionDeclaration: function (id, params, defaults, body, rest, generator, expression) {
        return {
            type: Syntax.FunctionDeclaration,
            id: id,
            params: params,
            defaults: defaults,
            body: body,
            rest: rest,
            generator: generator,
            expression: expression
        };
    },
    createFunctionExpression: function (id, params, defaults, body, rest, generator, expression) {
        return {
            type: Syntax.FunctionExpression,
            id: id,
            params: params,
            defaults: defaults,
            body: body,
            rest: rest,
            generator: generator,
            expression: expression
        };
    },
    createIdentifier: function (name) {
        return {
            type: Syntax.Identifier,
            name: name
        };
    },
    createIfStatement: function (test, consequent, alternate) {
        return {
            type: Syntax.IfStatement,
            test: test,
            consequent: consequent,
            alternate: alternate
        };
    },
    createLabeledStatement: function (label, body) {
        return {
            type: Syntax.LabeledStatement,
            label: label,
            body: body
        };
    },
    createLiteral: function (token) {
        return {
            type: Syntax.Literal,
            value: token.value,
            raw: String(token.value)
        };
    },
    createMemberExpression: function (accessor, object, property) {
        return {
            type: Syntax.MemberExpression,
            computed: accessor === '[',
            object: object,
            property: property
        };
    },
    createNewExpression: function (callee, args) {
        return {
            type: Syntax.NewExpression,
            callee: callee,
            'arguments': args
        };
    },
    createObjectExpression: function (properties) {
        return {
            type: Syntax.ObjectExpression,
            properties: properties
        };
    },
    createPostfixExpression: function (operator, argument) {
        return {
            type: Syntax.UpdateExpression,
            operator: operator,
            argument: argument,
            prefix: false
        };
    },
    createProgram: function (body) {
        return {
            type: Syntax.Program,
            body: body
        };
    },
    createProperty: function (kind, key, value, method, shorthand, computed) {
        return {
            type: Syntax.Property,
            key: key,
            value: value,
            kind: kind,
            method: method,
            shorthand: shorthand,
            computed: computed
        };
    },
    createReturnStatement: function (argument) {
        return {
            type: Syntax.ReturnStatement,
            argument: argument
        };
    },
    createSequenceExpression: function (expressions) {
        return {
            type: Syntax.SequenceExpression,
            expressions: expressions
        };
    },
    createSwitchCase: function (test, consequent) {
        return {
            type: Syntax.SwitchCase,
            test: test,
            consequent: consequent
        };
    },
    createSwitchStatement: function (discriminant, cases) {
        return {
            type: Syntax.SwitchStatement,
            discriminant: discriminant,
            cases: cases
        };
    },
    createThisExpression: function () {
        return { type: Syntax.ThisExpression };
    },
    createThrowStatement: function (argument) {
        return {
            type: Syntax.ThrowStatement,
            argument: argument
        };
    },
    createTryStatement: function (block, guardedHandlers, handlers, finalizer) {
        return {
            type: Syntax.TryStatement,
            block: block,
            guardedHandlers: guardedHandlers,
            handlers: handlers,
            finalizer: finalizer
        };
    },
    createUnaryExpression: function (operator, argument) {
        if (operator === '++' || operator === '--') {
            return {
                type: Syntax.UpdateExpression,
                operator: operator,
                argument: argument,
                prefix: true
            };
        }
        return {
            type: Syntax.UnaryExpression,
            operator: operator,
            argument: argument,
            prefix: true
        };
    },
    createVariableDeclaration: function (declarations, kind) {
        return {
            type: Syntax.VariableDeclaration,
            declarations: declarations,
            kind: kind
        };
    },
    createVariableDeclarator: function (id, init) {
        return {
            type: Syntax.VariableDeclarator,
            id: id,
            init: init
        };
    },
    createWhileStatement: function (test, body) {
        return {
            type: Syntax.WhileStatement,
            test: test,
            body: body
        };
    },
    createWithStatement: function (object, body) {
        return {
            type: Syntax.WithStatement,
            object: object,
            body: body
        };
    },
    createTemplateElement: function (value, tail) {
        return {
            type: Syntax.TemplateElement,
            value: value,
            tail: tail
        };
    },
    createTemplateLiteral: function (quasis, expressions) {
        return {
            type: Syntax.TemplateLiteral,
            quasis: quasis,
            expressions: expressions
        };
    },
    createSpreadElement: function (argument) {
        return {
            type: Syntax.SpreadElement,
            argument: argument
        };
    },
    createTaggedTemplateExpression: function (tag, quasi) {
        return {
            type: Syntax.TaggedTemplateExpression,
            tag: tag,
            quasi: quasi
        };
    },
    createArrowFunctionExpression: function (params, defaults, body, rest, expression) {
        return {
            type: Syntax.ArrowFunctionExpression,
            id: null,
            params: params,
            defaults: defaults,
            body: body,
            rest: rest,
            generator: false,
            expression: expression
        };
    },
    createMethodDefinition: function (propertyType, kind, key, value) {
        return {
            type: Syntax.MethodDefinition,
            key: key,
            value: value,
            kind: kind,
            'static': propertyType === ClassPropertyType.static
        };
    },
    createClassBody: function (body) {
        return {
            type: Syntax.ClassBody,
            body: body
        };
    },
    createClassExpression: function (id, superClass, body) {
        return {
            type: Syntax.ClassExpression,
            id: id,
            superClass: superClass,
            body: body
        };
    },
    createClassDeclaration: function (id, superClass, body) {
        return {
            type: Syntax.ClassDeclaration,
            id: id,
            superClass: superClass,
            body: body
        };
    },
    createExportSpecifier: function (id, name) {
        return {
            type: Syntax.ExportSpecifier,
            id: id,
            name: name
        };
    },
    createExportBatchSpecifier: function () {
        return { type: Syntax.ExportBatchSpecifier };
    },
    createExportDeclaration: function (declaration, specifiers, source$2) {
        return {
            type: Syntax.ExportDeclaration,
            declaration: declaration,
            specifiers: specifiers,
            source: source$2
        };
    },
    createImportSpecifier: function (id, name) {
        return {
            type: Syntax.ImportSpecifier,
            id: id,
            name: name
        };
    },
    createImportDeclaration: function (specifiers, kind, source$2) {
        return {
            type: Syntax.ImportDeclaration,
            specifiers: specifiers,
            kind: kind,
            source: source$2
        };
    },
    createYieldExpression: function (argument, delegate$2) {
        return {
            type: Syntax.YieldExpression,
            argument: argument,
            delegate: delegate$2
        };
    },
    createModuleDeclaration: function (id, source$2, body) {
        return {
            type: Syntax.ModuleDeclaration,
            id: id,
            source: source$2,
            body: body
        };
    },
    createComprehensionExpression: function (filter, blocks, body) {
        return {
            type: Syntax.ComprehensionExpression,
            filter: filter,
            blocks: blocks,
            body: body
        };
    }
};
function peekLineTerminator() {
    return lookahead.lineNumber !== lineNumber;
}
function throwError(token, messageFormat) {
    var error, args = Array.prototype.slice.call(arguments, 2), msg = messageFormat.replace(/%(\d)/g, function (whole, index$2) {
            assert(index$2 < args.length, 'Message reference must be in range');
            return args[index$2];
        });
    var startIndex = streamIndex > 3 ? streamIndex - 3 : 0;
    var toks = '', tailingMsg = '';
    if (tokenStream) {
        toks = tokenStream.slice(startIndex, streamIndex + 3).map(function (stx) {
            return stx.token.value;
        }).join(' ');
        tailingMsg = '\n[... ' + toks + ' ...]';
    }
    if (typeof token.lineNumber === 'number') {
        error = new Error('Line ' + token.lineNumber + ': ' + msg + tailingMsg);
        error.index = token.range[0];
        error.lineNumber = token.lineNumber;
        error.column = token.range[0] - lineStart + 1;
    } else {
        error = new Error('Line ' + lineNumber + ': ' + msg + tailingMsg);
        error.index = index;
        error.lineNumber = lineNumber;
        error.column = index - lineStart + 1;
    }
    error.description = msg;
    throw error;
}
function throwErrorTolerant() {
    try {
        throwError.apply(null, arguments);
    } catch (e) {
        if (extra.errors) {
            extra.errors.push(e);
        } else {
            throw e;
        }
    }
}
function throwUnexpected(token) {
    if (token.type === Token.EOF) {
        throwError(token, Messages.UnexpectedEOS);
    }
    if (token.type === Token.NumericLiteral) {
        throwError(token, Messages.UnexpectedNumber);
    }
    if (token.type === Token.StringLiteral) {
        throwError(token, Messages.UnexpectedString);
    }
    if (token.type === Token.Identifier) {
        throwError(token, Messages.UnexpectedIdentifier);
    }
    if (token.type === Token.Keyword) {
        if (isFutureReservedWord(token.value)) {
        } else if (strict && isStrictModeReservedWord(token.value)) {
            throwErrorTolerant(token, Messages.StrictReservedWord);
            return;
        }
        throwError(token, Messages.UnexpectedToken, token.value);
    }
    if (token.type === Token.Template) {
        throwError(token, Messages.UnexpectedTemplate, token.value.raw);
    }
    // BooleanLiteral, NullLiteral, or Punctuator.
    throwError(token, Messages.UnexpectedToken, token.value);
}
function expect(value) {
    var token = lex();
    if (token.type !== Token.Punctuator || token.value !== value) {
        throwUnexpected(token);
    }
}
function expectKeyword(keyword) {
    var token = lex();
    if (token.type !== Token.Keyword || token.value !== keyword) {
        throwUnexpected(token);
    }
}
function match(value) {
    return lookahead.type === Token.Punctuator && lookahead.value === value;
}
function matchKeyword(keyword) {
    return lookahead.type === Token.Keyword && lookahead.value === keyword;
}
function matchContextualKeyword(keyword) {
    return lookahead.type === Token.Identifier && lookahead.value === keyword;
}
function matchAssign() {
    var op;
    if (lookahead.type !== Token.Punctuator) {
        return false;
    }
    op = lookahead.value;
    return op === '=' || op === '*=' || op === '/=' || op === '%=' || op === '+=' || op === '-=' || op === '<<=' || op === '>>=' || op === '>>>=' || op === '&=' || op === '^=' || op === '|=';
}
function consumeSemicolon() {
    var line, ch;
    ch = lookahead.value ? String(lookahead.value).charCodeAt(0) : -1;
    if (// Catch the very common case first: immediately a semicolon (char #59).
        ch === 59) {
        lex();
        return;
    }
    if (lookahead.lineNumber !== lineNumber) {
        return;
    }
    if (match(';')) {
        lex();
        return;
    }
    if (lookahead.type !== Token.EOF && !match('}')) {
        throwUnexpected(lookahead);
    }
}
function isLeftHandSide(expr) {
    return expr.type === Syntax.Identifier || expr.type === Syntax.MemberExpression;
}
function isAssignableLeftHandSide(expr) {
    return isLeftHandSide(expr) || expr.type === Syntax.ObjectPattern || expr.type === Syntax.ArrayPattern;
}
function parseArrayInitialiser() {
    var elements = [], blocks = [], filter = null, tmp, possiblecomprehension = true, body, marker = markerCreate();
    expect('[');
    while (!match(']')) {
        if (lookahead.value === 'for' && lookahead.type === Token.Keyword) {
            if (!possiblecomprehension) {
                throwError({}, Messages.ComprehensionError);
            }
            matchKeyword('for');
            tmp = parseForStatement({ ignoreBody: true });
            tmp.of = tmp.type === Syntax.ForOfStatement;
            tmp.type = Syntax.ComprehensionBlock;
            if (tmp.left.kind) {
                // can't be let or const
                throwError({}, Messages.ComprehensionError);
            }
            blocks.push(tmp);
        } else if (lookahead.value === 'if' && lookahead.type === Token.Keyword) {
            if (!possiblecomprehension) {
                throwError({}, Messages.ComprehensionError);
            }
            expectKeyword('if');
            expect('(');
            filter = parseExpression();
            expect(')');
        } else if (lookahead.value === ',' && lookahead.type === Token.Punctuator) {
            possiblecomprehension = false;
            // no longer allowed.
            lex();
            elements.push(null);
        } else {
            tmp = parseSpreadOrAssignmentExpression();
            elements.push(tmp);
            if (tmp && tmp.type === Syntax.SpreadElement) {
                if (!match(']')) {
                    throwError({}, Messages.ElementAfterSpreadElement);
                }
            } else if (!(match(']') || matchKeyword('for') || matchKeyword('if'))) {
                expect(',');
                // this lexes.
                possiblecomprehension = false;
            }
        }
    }
    expect(']');
    if (filter && !blocks.length) {
        throwError({}, Messages.ComprehensionRequiresBlock);
    }
    if (blocks.length) {
        if (elements.length !== 1) {
            throwError({}, Messages.ComprehensionError);
        }
        return markerApply(marker, delegate.createComprehensionExpression(filter, blocks, elements[0]));
    }
    return markerApply(marker, delegate.createArrayExpression(elements));
}
function parsePropertyFunction(options) {
    var previousStrict, previousYieldAllowed, params, defaults, body, marker = markerCreate();
    previousStrict = strict;
    previousYieldAllowed = state.yieldAllowed;
    state.yieldAllowed = options.generator;
    params = options.params || [];
    defaults = options.defaults || [];
    body = parseConciseBody();
    if (options.name && strict && isRestrictedWord(params[0].name)) {
        throwErrorTolerant(options.name, Messages.StrictParamName);
    }
    strict = previousStrict;
    state.yieldAllowed = previousYieldAllowed;
    return markerApply(marker, delegate.createFunctionExpression(null, params, defaults, body, options.rest || null, options.generator, body.type !== Syntax.BlockStatement));
}
function parsePropertyMethodFunction(options) {
    var previousStrict, tmp, method;
    previousStrict = strict;
    strict = true;
    tmp = parseParams();
    if (tmp.stricted) {
        throwErrorTolerant(tmp.stricted, tmp.message);
    }
    method = parsePropertyFunction({
        params: tmp.params,
        defaults: tmp.defaults,
        rest: tmp.rest,
        generator: options.generator
    });
    strict = previousStrict;
    return method;
}
function parseObjectPropertyKey() {
    var marker = markerCreate(), token = lex(), propertyKey, result;
    if (// Note: This function is called only from parseObjectProperty(), where
        // EOF and Punctuator tokens are already filtered out.
        token.type === Token.StringLiteral || token.type === Token.NumericLiteral) {
        if (strict && token.octal) {
            throwErrorTolerant(token, Messages.StrictOctalLiteral);
        }
        return markerApply(marker, delegate.createLiteral(token));
    }
    if (token.type === Token.Punctuator && token.value === '[') {
        // For computed properties we should skip the [ and ], and
        // capture in marker only the assignment expression itself.
        marker = markerCreate();
        propertyKey = parseAssignmentExpression();
        result = markerApply(marker, propertyKey);
        expect(']');
        return result;
    }
    return markerApply(marker, delegate.createIdentifier(token.value));
}
function parseObjectProperty() {
    var token, key, id, value, param, expr, computed, marker = markerCreate();
    token = lookahead;
    computed = token.value === '[' && token.type === Token.Punctuator;
    if (token.type === Token.Identifier || computed) {
        id = parseObjectPropertyKey();
        if (// Property Assignment: Getter and Setter.
            token.value === 'get' && !(match(':') || match('('))) {
            computed = lookahead.value === '[';
            key = parseObjectPropertyKey();
            expect('(');
            expect(')');
            return markerApply(marker, delegate.createProperty('get', key, parsePropertyFunction({ generator: false }), false, false, computed));
        }
        if (token.value === 'set' && !(match(':') || match('('))) {
            computed = lookahead.value === '[';
            key = parseObjectPropertyKey();
            expect('(');
            token = lookahead;
            param = [parseVariableIdentifier()];
            expect(')');
            return markerApply(marker, delegate.createProperty('set', key, parsePropertyFunction({
                params: param,
                generator: false,
                name: token
            }), false, false, computed));
        }
        if (match(':')) {
            lex();
            return markerApply(marker, delegate.createProperty('init', id, parseAssignmentExpression(), false, false, computed));
        }
        if (match('(')) {
            return markerApply(marker, delegate.createProperty('init', id, parsePropertyMethodFunction({ generator: false }), true, false, computed));
        }
        if (computed) {
            // Computed properties can only be used with full notation.
            throwUnexpected(lookahead);
        }
        return markerApply(marker, delegate.createProperty('init', id, id, false, true, false));
    }
    if (token.type === Token.EOF || token.type === Token.Punctuator) {
        if (!match('*')) {
            throwUnexpected(token);
        }
        lex();
        computed = lookahead.type === Token.Punctuator && lookahead.value === '[';
        id = parseObjectPropertyKey();
        if (!match('(')) {
            throwUnexpected(lex());
        }
        return markerApply(marker, delegate.createProperty('init', id, parsePropertyMethodFunction({ generator: true }), true, false, computed));
    }
    key = parseObjectPropertyKey();
    if (match(':')) {
        lex();
        return markerApply(marker, delegate.createProperty('init', key, parseAssignmentExpression(), false, false, false));
    }
    if (match('(')) {
        return markerApply(marker, delegate.createProperty('init', key, parsePropertyMethodFunction({ generator: false }), true, false, false));
    }
    throwUnexpected(lex());
}
function parseObjectInitialiser() {
    var properties = [], property, name, key, kind, map = {}, toString = String, marker = markerCreate();
    expect('{');
    while (!match('}')) {
        property = parseObjectProperty();
        if (property.key.type === Syntax.Identifier) {
            name = property.key.name;
        } else {
            name = toString(property.key.value);
        }
        kind = property.kind === 'init' ? PropertyKind.Data : property.kind === 'get' ? PropertyKind.Get : PropertyKind.Set;
        key = '$' + name;
        if (Object.prototype.hasOwnProperty.call(map, key)) {
            if (map[key] === PropertyKind.Data) {
                if (strict && kind === PropertyKind.Data) {
                    throwErrorTolerant({}, Messages.StrictDuplicateProperty);
                } else if (kind !== PropertyKind.Data) {
                    throwErrorTolerant({}, Messages.AccessorDataProperty);
                }
            } else {
                if (kind === PropertyKind.Data) {
                    throwErrorTolerant({}, Messages.AccessorDataProperty);
                } else if (map[key] & kind) {
                    throwErrorTolerant({}, Messages.AccessorGetSet);
                }
            }
            map[key] |= kind;
        } else {
            map[key] = kind;
        }
        properties.push(property);
        if (!match('}')) {
            expect(',');
        }
    }
    expect('}');
    return markerApply(marker, delegate.createObjectExpression(properties));
}
function parseTemplateElement(option) {
    var marker = markerCreate(), token = lex();
    if (strict && token.octal) {
        throwError(token, Messages.StrictOctalLiteral);
    }
    return markerApply(marker, delegate.createTemplateElement({
        raw: token.value.raw,
        cooked: token.value.cooked
    }, token.tail));
}
function parseTemplateLiteral() {
    var quasi, quasis, expressions, marker = markerCreate();
    quasi = parseTemplateElement({ head: true });
    quasis = [quasi];
    expressions = [];
    while (!quasi.tail) {
        expressions.push(parseExpression());
        quasi = parseTemplateElement({ head: false });
        quasis.push(quasi);
    }
    return markerApply(marker, delegate.createTemplateLiteral(quasis, expressions));
}
function parseGroupExpression() {
    var expr;
    expect('(');
    ++state.parenthesizedCount;
    expr = parseExpression();
    expect(')');
    return expr;
}
function parsePrimaryExpression() {
    var type, token, resolvedIdent, marker, expr;
    token = lookahead;
    type = lookahead.type;
    if (type === Token.Identifier) {
        marker = markerCreate();
        resolvedIdent = expander.resolve(tokenStream[lookaheadIndex], phase);
        lex();
        return markerApply(marker, delegate.createIdentifier(resolvedIdent));
    }
    if (type === Token.StringLiteral || type === Token.NumericLiteral) {
        if (strict && lookahead.octal) {
            throwErrorTolerant(lookahead, Messages.StrictOctalLiteral);
        }
        marker = markerCreate();
        return markerApply(marker, delegate.createLiteral(lex()));
    }
    if (type === Token.Keyword) {
        if (matchKeyword('this')) {
            marker = markerCreate();
            lex();
            return markerApply(marker, delegate.createThisExpression());
        }
        if (matchKeyword('function')) {
            return parseFunctionExpression();
        }
        if (matchKeyword('class')) {
            return parseClassExpression();
        }
        if (matchKeyword('super')) {
            marker = markerCreate();
            lex();
            return markerApply(marker, delegate.createIdentifier('super'));
        }
    }
    if (type === Token.BooleanLiteral) {
        marker = markerCreate();
        token = lex();
        if (typeof token.value !== 'boolean') {
            assert(token.value === 'true' || token.value === 'false', 'exporting either true or false as a string not: ' + token.value);
            token.value = token.value === 'true';
        }
        return markerApply(marker, delegate.createLiteral(token));
    }
    if (type === Token.NullLiteral) {
        marker = markerCreate();
        token = lex();
        token.value = null;
        return markerApply(marker, delegate.createLiteral(token));
    }
    if (match('[')) {
        return parseArrayInitialiser();
    }
    if (match('{')) {
        return parseObjectInitialiser();
    }
    if (match('(')) {
        return parseGroupExpression();
    }
    if (lookahead.type === Token.RegularExpression) {
        marker = markerCreate();
        return markerApply(marker, delegate.createLiteral(lex()));
    }
    if (type === Token.Template) {
        return parseTemplateLiteral();
    }
    throwUnexpected(lex());
}
function parseArguments() {
    var args = [], arg;
    expect('(');
    if (!match(')')) {
        while (streamIndex < length) {
            arg = parseSpreadOrAssignmentExpression();
            args.push(arg);
            if (match(')')) {
                break;
            } else if (arg.type === Syntax.SpreadElement) {
                throwError({}, Messages.ElementAfterSpreadElement);
            }
            expect(',');
        }
    }
    expect(')');
    return args;
}
function parseSpreadOrAssignmentExpression() {
    if (match('...')) {
        var marker = markerCreate();
        lex();
        return markerApply(marker, delegate.createSpreadElement(parseAssignmentExpression()));
    }
    return parseAssignmentExpression();
}
function parseNonComputedProperty(toResolve) {
    var marker = markerCreate(), resolvedIdent, token;
    if (toResolve) {
        resolvedIdent = expander.resolve(tokenStream[lookaheadIndex], phase);
    }
    token = lex();
    resolvedIdent = toResolve ? resolvedIdent : token.value;
    if (!isIdentifierName(token)) {
        throwUnexpected(token);
    }
    return markerApply(marker, delegate.createIdentifier(resolvedIdent));
}
function parseNonComputedMember() {
    expect('.');
    return parseNonComputedProperty();
}
function parseComputedMember() {
    var expr;
    expect('[');
    expr = parseExpression();
    expect(']');
    return expr;
}
function parseNewExpression() {
    var callee, args, marker = markerCreate();
    expectKeyword('new');
    callee = parseLeftHandSideExpression();
    args = match('(') ? parseArguments() : [];
    return markerApply(marker, delegate.createNewExpression(callee, args));
}
function parseLeftHandSideExpressionAllowCall() {
    var expr, args, marker = markerCreate();
    expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();
    while (match('.') || match('[') || match('(') || lookahead.type === Token.Template) {
        if (match('(')) {
            args = parseArguments();
            expr = markerApply(marker, delegate.createCallExpression(expr, args));
        } else if (match('[')) {
            expr = markerApply(marker, delegate.createMemberExpression('[', expr, parseComputedMember()));
        } else if (match('.')) {
            expr = markerApply(marker, delegate.createMemberExpression('.', expr, parseNonComputedMember()));
        } else {
            expr = markerApply(marker, delegate.createTaggedTemplateExpression(expr, parseTemplateLiteral()));
        }
    }
    return expr;
}
function parseLeftHandSideExpression() {
    var expr, marker = markerCreate();
    expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();
    while (match('.') || match('[') || lookahead.type === Token.Template) {
        if (match('[')) {
            expr = markerApply(marker, delegate.createMemberExpression('[', expr, parseComputedMember()));
        } else if (match('.')) {
            expr = markerApply(marker, delegate.createMemberExpression('.', expr, parseNonComputedMember()));
        } else {
            expr = markerApply(marker, delegate.createTaggedTemplateExpression(expr, parseTemplateLiteral()));
        }
    }
    return expr;
}
function parsePostfixExpression() {
    var marker = markerCreate(), expr = parseLeftHandSideExpressionAllowCall(), token;
    if (lookahead.type !== Token.Punctuator) {
        return expr;
    }
    if ((match('++') || match('--')) && !peekLineTerminator()) {
        if (// 11.3.1, 11.3.2
            strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
            throwErrorTolerant({}, Messages.StrictLHSPostfix);
        }
        if (!isLeftHandSide(expr)) {
            throwError({}, Messages.InvalidLHSInAssignment);
        }
        token = lex();
        expr = markerApply(marker, delegate.createPostfixExpression(token.value, expr));
    }
    return expr;
}
function parseUnaryExpression() {
    var marker, token, expr;
    if (lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword) {
        return parsePostfixExpression();
    }
    if (match('++') || match('--')) {
        marker = markerCreate();
        token = lex();
        expr = parseUnaryExpression();
        if (// 11.4.4, 11.4.5
            strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
            throwErrorTolerant({}, Messages.StrictLHSPrefix);
        }
        if (!isLeftHandSide(expr)) {
            throwError({}, Messages.InvalidLHSInAssignment);
        }
        return markerApply(marker, delegate.createUnaryExpression(token.value, expr));
    }
    if (match('+') || match('-') || match('~') || match('!')) {
        marker = markerCreate();
        token = lex();
        expr = parseUnaryExpression();
        return markerApply(marker, delegate.createUnaryExpression(token.value, expr));
    }
    if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
        marker = markerCreate();
        token = lex();
        expr = parseUnaryExpression();
        expr = markerApply(marker, delegate.createUnaryExpression(token.value, expr));
        if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
            throwErrorTolerant({}, Messages.StrictDelete);
        }
        return expr;
    }
    return parsePostfixExpression();
}
function binaryPrecedence(token, allowIn) {
    var prec = 0;
    if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
        return 0;
    }
    switch (token.value) {
    case '||':
        prec = 1;
        break;
    case '&&':
        prec = 2;
        break;
    case '|':
        prec = 3;
        break;
    case '^':
        prec = 4;
        break;
    case '&':
        prec = 5;
        break;
    case '==':
    case '!=':
    case '===':
    case '!==':
        prec = 6;
        break;
    case '<':
    case '>':
    case '<=':
    case '>=':
    case 'instanceof':
        prec = 7;
        break;
    case 'in':
        prec = allowIn ? 7 : 0;
        break;
    case '<<':
    case '>>':
    case '>>>':
        prec = 8;
        break;
    case '+':
    case '-':
        prec = 9;
        break;
    case '*':
    case '/':
    case '%':
        prec = 11;
        break;
    default:
        break;
    }
    return prec;
}
function parseBinaryExpression() {
    var expr, token, prec, previousAllowIn, stack, right, operator, left, i, marker, markers;
    previousAllowIn = state.allowIn;
    state.allowIn = true;
    marker = markerCreate();
    left = parseUnaryExpression();
    token = lookahead;
    prec = binaryPrecedence(token, previousAllowIn);
    if (prec === 0) {
        return left;
    }
    token.prec = prec;
    lex();
    markers = [
        marker,
        markerCreate()
    ];
    right = parseUnaryExpression();
    stack = [
        left,
        token,
        right
    ];
    while ((prec = binaryPrecedence(lookahead, previousAllowIn)) > 0) {
        while (// Reduce: make a binary expression from the three topmost entries.
            stack.length > 2 && prec <= stack[stack.length - 2].prec) {
            right = stack.pop();
            operator = stack.pop().value;
            left = stack.pop();
            expr = delegate.createBinaryExpression(operator, left, right);
            markers.pop();
            marker = markers.pop();
            markerApply(marker, expr);
            stack.push(expr);
            markers.push(marker);
        }
        // Shift.
        token = lex();
        token.prec = prec;
        stack.push(token);
        markers.push(markerCreate());
        expr = parseUnaryExpression();
        stack.push(expr);
    }
    state.allowIn = previousAllowIn;
    // Final reduce to clean-up the stack.
    i = stack.length - 1;
    expr = stack[i];
    markers.pop();
    while (i > 1) {
        expr = delegate.createBinaryExpression(stack[i - 1].value, stack[i - 2], expr);
        i -= 2;
        marker = markers.pop();
        markerApply(marker, expr);
    }
    return expr;
}
function parseConditionalExpression() {
    var expr, previousAllowIn, consequent, alternate, marker = markerCreate();
    expr = parseBinaryExpression();
    if (match('?')) {
        lex();
        previousAllowIn = state.allowIn;
        state.allowIn = true;
        consequent = parseAssignmentExpression();
        state.allowIn = previousAllowIn;
        expect(':');
        alternate = parseAssignmentExpression();
        expr = markerApply(marker, delegate.createConditionalExpression(expr, consequent, alternate));
    }
    return expr;
}
function reinterpretAsAssignmentBindingPattern(expr) {
    var i, len, property, element;
    if (expr.type === Syntax.ObjectExpression) {
        expr.type = Syntax.ObjectPattern;
        for (i = 0, len = expr.properties.length; i < len; i += 1) {
            property = expr.properties[i];
            if (property.kind !== 'init') {
                throwError({}, Messages.InvalidLHSInAssignment);
            }
            reinterpretAsAssignmentBindingPattern(property.value);
        }
    } else if (expr.type === Syntax.ArrayExpression) {
        expr.type = Syntax.ArrayPattern;
        for (i = 0, len = expr.elements.length; i < len; i += 1) {
            element = expr.elements[i];
            if (element) {
                reinterpretAsAssignmentBindingPattern(element);
            }
        }
    } else if (expr.type === Syntax.Identifier) {
        if (isRestrictedWord(expr.name)) {
            throwError({}, Messages.InvalidLHSInAssignment);
        }
    } else if (expr.type === Syntax.SpreadElement) {
        reinterpretAsAssignmentBindingPattern(expr.argument);
        if (expr.argument.type === Syntax.ObjectPattern) {
            throwError({}, Messages.ObjectPatternAsSpread);
        }
    } else {
        if (expr.type !== Syntax.MemberExpression && expr.type !== Syntax.CallExpression && expr.type !== Syntax.NewExpression) {
            throwError({}, Messages.InvalidLHSInAssignment);
        }
    }
}
function reinterpretAsDestructuredParameter(options, expr) {
    var i, len, property, element;
    if (expr.type === Syntax.ObjectExpression) {
        expr.type = Syntax.ObjectPattern;
        for (i = 0, len = expr.properties.length; i < len; i += 1) {
            property = expr.properties[i];
            if (property.kind !== 'init') {
                throwError({}, Messages.InvalidLHSInFormalsList);
            }
            reinterpretAsDestructuredParameter(options, property.value);
        }
    } else if (expr.type === Syntax.ArrayExpression) {
        expr.type = Syntax.ArrayPattern;
        for (i = 0, len = expr.elements.length; i < len; i += 1) {
            element = expr.elements[i];
            if (element) {
                reinterpretAsDestructuredParameter(options, element);
            }
        }
    } else if (expr.type === Syntax.Identifier) {
        validateParam(options, expr, expr.name);
    } else {
        if (expr.type !== Syntax.MemberExpression) {
            throwError({}, Messages.InvalidLHSInFormalsList);
        }
    }
}
function reinterpretAsCoverFormalsList(expressions) {
    var i, len, param, params, defaults, defaultCount, options, rest;
    params = [];
    defaults = [];
    defaultCount = 0;
    rest = null;
    options = { paramSet: {} };
    for (i = 0, len = expressions.length; i < len; i += 1) {
        param = expressions[i];
        if (param.type === Syntax.Identifier) {
            params.push(param);
            defaults.push(null);
            validateParam(options, param, param.name);
        } else if (param.type === Syntax.ObjectExpression || param.type === Syntax.ArrayExpression) {
            reinterpretAsDestructuredParameter(options, param);
            params.push(param);
            defaults.push(null);
        } else if (param.type === Syntax.SpreadElement) {
            assert(i === len - 1, 'It is guaranteed that SpreadElement is last element by parseExpression');
            reinterpretAsDestructuredParameter(options, param.argument);
            rest = param.argument;
        } else if (param.type === Syntax.AssignmentExpression) {
            params.push(param.left);
            defaults.push(param.right);
            ++defaultCount;
            validateParam(options, param.left, param.left.name);
        } else {
            return null;
        }
    }
    if (options.message === Messages.StrictParamDupe) {
        throwError(strict ? options.stricted : options.firstRestricted, options.message);
    }
    if (defaultCount === 0) {
        defaults = [];
    }
    return {
        params: params,
        defaults: defaults,
        rest: rest,
        stricted: options.stricted,
        firstRestricted: options.firstRestricted,
        message: options.message
    };
}
function parseArrowFunctionExpression(options, marker) {
    var previousStrict, previousYieldAllowed, body;
    expect('=>');
    previousStrict = strict;
    previousYieldAllowed = state.yieldAllowed;
    state.yieldAllowed = false;
    body = parseConciseBody();
    if (strict && options.firstRestricted) {
        throwError(options.firstRestricted, options.message);
    }
    if (strict && options.stricted) {
        throwErrorTolerant(options.stricted, options.message);
    }
    strict = previousStrict;
    state.yieldAllowed = previousYieldAllowed;
    return markerApply(marker, delegate.createArrowFunctionExpression(options.params, options.defaults, body, options.rest, body.type !== Syntax.BlockStatement));
}
function parseAssignmentExpression() {
    var marker, expr, token, params, oldParenthesizedCount;
    if (// Note that 'yield' is treated as a keyword in strict mode, but a
        // contextual keyword (identifier) in non-strict mode, so we need
        // to use matchKeyword and matchContextualKeyword appropriately.
        state.yieldAllowed && matchContextualKeyword('yield') || strict && matchKeyword('yield')) {
        return parseYieldExpression();
    }
    oldParenthesizedCount = state.parenthesizedCount;
    marker = markerCreate();
    if (match('(')) {
        token = lookahead2();
        if (token.type === Token.Punctuator && token.value === ')' || token.value === '...') {
            params = parseParams();
            if (!match('=>')) {
                throwUnexpected(lex());
            }
            return parseArrowFunctionExpression(params, marker);
        }
    }
    token = lookahead;
    expr = parseConditionalExpression();
    if (match('=>') && (state.parenthesizedCount === oldParenthesizedCount || state.parenthesizedCount === oldParenthesizedCount + 1)) {
        if (expr.type === Syntax.Identifier) {
            params = reinterpretAsCoverFormalsList([expr]);
        } else if (expr.type === Syntax.SequenceExpression) {
            params = reinterpretAsCoverFormalsList(expr.expressions);
        }
        if (params) {
            return parseArrowFunctionExpression(params, marker);
        }
    }
    if (matchAssign()) {
        if (// 11.13.1
            strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
            throwErrorTolerant(token, Messages.StrictLHSAssignment);
        }
        if (// ES.next draf 11.13 Runtime Semantics step 1
            match('=') && (expr.type === Syntax.ObjectExpression || expr.type === Syntax.ArrayExpression)) {
            reinterpretAsAssignmentBindingPattern(expr);
        } else if (!isLeftHandSide(expr)) {
            throwError({}, Messages.InvalidLHSInAssignment);
        }
        expr = markerApply(marker, delegate.createAssignmentExpression(lex().value, expr, parseAssignmentExpression()));
    }
    return expr;
}
function parseExpression() {
    var marker, expr, expressions, sequence, coverFormalsList, spreadFound, oldParenthesizedCount;
    oldParenthesizedCount = state.parenthesizedCount;
    marker = markerCreate();
    expr = parseAssignmentExpression();
    expressions = [expr];
    if (match(',')) {
        while (streamIndex < length) {
            if (!match(',')) {
                break;
            }
            lex();
            expr = parseSpreadOrAssignmentExpression();
            expressions.push(expr);
            if (expr.type === Syntax.SpreadElement) {
                spreadFound = true;
                if (!match(')')) {
                    throwError({}, Messages.ElementAfterSpreadElement);
                }
                break;
            }
        }
        sequence = markerApply(marker, delegate.createSequenceExpression(expressions));
    }
    if (match('=>')) {
        if (// Do not allow nested parentheses on the LHS of the =>.
            state.parenthesizedCount === oldParenthesizedCount || state.parenthesizedCount === oldParenthesizedCount + 1) {
            expr = expr.type === Syntax.SequenceExpression ? expr.expressions : expressions;
            coverFormalsList = reinterpretAsCoverFormalsList(expr);
            if (coverFormalsList) {
                return parseArrowFunctionExpression(coverFormalsList, marker);
            }
        }
        throwUnexpected(lex());
    }
    if (spreadFound && lookahead2().value !== '=>') {
        throwError({}, Messages.IllegalSpread);
    }
    return sequence || expr;
}
function parseStatementList() {
    var list = [], statement;
    while (streamIndex < length) {
        if (match('}')) {
            break;
        }
        statement = parseSourceElement();
        if (typeof statement === 'undefined') {
            break;
        }
        list.push(statement);
    }
    return list;
}
function parseBlock() {
    var block, marker = markerCreate();
    expect('{');
    block = parseStatementList();
    expect('}');
    return markerApply(marker, delegate.createBlockStatement(block));
}
function parseVariableIdentifier() {
    var token = lookahead, resolvedIdent, marker = markerCreate();
    if (token.type !== Token.Identifier) {
        throwUnexpected(token);
    }
    resolvedIdent = expander.resolve(tokenStream[lookaheadIndex], phase);
    lex();
    return markerApply(marker, delegate.createIdentifier(resolvedIdent));
}
function parseVariableDeclaration(kind) {
    var id, marker = markerCreate(), init = null;
    if (match('{')) {
        id = parseObjectInitialiser();
        reinterpretAsAssignmentBindingPattern(id);
    } else if (match('[')) {
        id = parseArrayInitialiser();
        reinterpretAsAssignmentBindingPattern(id);
    } else {
        id = state.allowKeyword ? parseNonComputedProperty() : parseVariableIdentifier();
        if (// 12.2.1
            strict && isRestrictedWord(id.name)) {
            throwErrorTolerant({}, Messages.StrictVarName);
        }
    }
    if (kind === 'const') {
        if (!match('=')) {
            throwError({}, Messages.NoUnintializedConst);
        }
        expect('=');
        init = parseAssignmentExpression();
    } else if (match('=')) {
        lex();
        init = parseAssignmentExpression();
    }
    return markerApply(marker, delegate.createVariableDeclarator(id, init));
}
function parseVariableDeclarationList(kind) {
    var list = [];
    do {
        list.push(parseVariableDeclaration(kind));
        if (!match(',')) {
            break;
        }
        lex();
    } while (streamIndex < length);
    return list;
}
function parseVariableStatement() {
    var declarations, marker = markerCreate();
    expectKeyword('var');
    declarations = parseVariableDeclarationList();
    consumeSemicolon();
    return markerApply(marker, delegate.createVariableDeclaration(declarations, 'var'));
}
function parseConstLetDeclaration(kind) {
    var declarations, marker = markerCreate();
    expectKeyword(kind);
    declarations = parseVariableDeclarationList(kind);
    consumeSemicolon();
    return markerApply(marker, delegate.createVariableDeclaration(declarations, kind));
}
function parseModuleDeclaration() {
    var id, src, body, marker = markerCreate();
    lex();
    if (// 'module'
        peekLineTerminator()) {
        throwError({}, Messages.NewlineAfterModule);
    }
    switch (lookahead.type) {
    case Token.StringLiteral:
        id = parsePrimaryExpression();
        body = parseModuleBlock();
        src = null;
        break;
    case Token.Identifier:
        id = parseVariableIdentifier();
        body = null;
        if (!matchContextualKeyword('from')) {
            throwUnexpected(lex());
        }
        lex();
        src = parsePrimaryExpression();
        if (src.type !== Syntax.Literal) {
            throwError({}, Messages.InvalidModuleSpecifier);
        }
        break;
    }
    consumeSemicolon();
    return markerApply(marker, delegate.createModuleDeclaration(id, src, body));
}
function parseExportBatchSpecifier() {
    var marker = markerCreate();
    expect('*');
    return markerApply(marker, delegate.createExportBatchSpecifier());
}
function parseExportSpecifier() {
    var id, name = null, marker = markerCreate();
    id = parseVariableIdentifier();
    if (matchContextualKeyword('as')) {
        lex();
        name = parseNonComputedProperty();
    }
    return markerApply(marker, delegate.createExportSpecifier(id, name));
}
function parseExportDeclaration() {
    var previousAllowKeyword, decl, def, src, specifiers, marker = markerCreate();
    expectKeyword('export');
    if (lookahead.type === Token.Keyword) {
        switch (lookahead.value) {
        case 'let':
        case 'const':
        case 'var':
        case 'class':
        case 'function':
            return markerApply(marker, delegate.createExportDeclaration(parseSourceElement(), null, null));
        }
    }
    if (isIdentifierName(lookahead)) {
        previousAllowKeyword = state.allowKeyword;
        state.allowKeyword = true;
        decl = parseVariableDeclarationList('let');
        state.allowKeyword = previousAllowKeyword;
        return markerApply(marker, delegate.createExportDeclaration(decl, null, null));
    }
    specifiers = [];
    src = null;
    if (match('*')) {
        specifiers.push(parseExportBatchSpecifier());
    } else {
        expect('{');
        do {
            specifiers.push(parseExportSpecifier());
        } while (match(',') && lex());
        expect('}');
    }
    if (matchContextualKeyword('from')) {
        lex();
        src = parsePrimaryExpression();
        if (src.type !== Syntax.Literal) {
            throwError({}, Messages.InvalidModuleSpecifier);
        }
    }
    consumeSemicolon();
    return markerApply(marker, delegate.createExportDeclaration(null, specifiers, src));
}
function parseImportDeclaration() {
    var specifiers, kind, src, marker = markerCreate();
    expectKeyword('import');
    specifiers = [];
    if (isIdentifierName(lookahead)) {
        kind = 'default';
        specifiers.push(parseImportSpecifier());
        if (!matchContextualKeyword('from')) {
            throwError({}, Messages.NoFromAfterImport);
        }
        lex();
    } else if (match('{')) {
        kind = 'named';
        lex();
        do {
            specifiers.push(parseImportSpecifier());
        } while (match(',') && lex());
        expect('}');
        if (!matchContextualKeyword('from')) {
            throwError({}, Messages.NoFromAfterImport);
        }
        lex();
    }
    src = parsePrimaryExpression();
    if (src.type !== Syntax.Literal) {
        throwError({}, Messages.InvalidModuleSpecifier);
    }
    consumeSemicolon();
    return markerApply(marker, delegate.createImportDeclaration(specifiers, kind, src));
}
function parseImportSpecifier() {
    var id, name = null, marker = markerCreate();
    id = parseNonComputedProperty(true);
    if (matchContextualKeyword('as')) {
        lex();
        name = parseVariableIdentifier();
    }
    return markerApply(marker, delegate.createImportSpecifier(id, name));
}
function parseEmptyStatement() {
    var marker = markerCreate();
    expect(';');
    return markerApply(marker, delegate.createEmptyStatement());
}
function parseExpressionStatement() {
    var marker = markerCreate(), expr = parseExpression();
    consumeSemicolon();
    return markerApply(marker, delegate.createExpressionStatement(expr));
}
function parseIfStatement() {
    var test, consequent, alternate, marker = markerCreate();
    expectKeyword('if');
    expect('(');
    test = parseExpression();
    expect(')');
    consequent = parseStatement();
    if (matchKeyword('else')) {
        lex();
        alternate = parseStatement();
    } else {
        alternate = null;
    }
    return markerApply(marker, delegate.createIfStatement(test, consequent, alternate));
}
function parseDoWhileStatement() {
    var body, test, oldInIteration, marker = markerCreate();
    expectKeyword('do');
    oldInIteration = state.inIteration;
    state.inIteration = true;
    body = parseStatement();
    state.inIteration = oldInIteration;
    expectKeyword('while');
    expect('(');
    test = parseExpression();
    expect(')');
    if (match(';')) {
        lex();
    }
    return markerApply(marker, delegate.createDoWhileStatement(body, test));
}
function parseWhileStatement() {
    var test, body, oldInIteration, marker = markerCreate();
    expectKeyword('while');
    expect('(');
    test = parseExpression();
    expect(')');
    oldInIteration = state.inIteration;
    state.inIteration = true;
    body = parseStatement();
    state.inIteration = oldInIteration;
    return markerApply(marker, delegate.createWhileStatement(test, body));
}
function parseForVariableDeclaration() {
    var marker = markerCreate(), token = lex(), declarations = parseVariableDeclarationList();
    return markerApply(marker, delegate.createVariableDeclaration(declarations, token.value));
}
function parseForStatement(opts) {
    var init, test, update, left, right, body, operator, oldInIteration, marker = markerCreate();
    init = test = update = null;
    expectKeyword('for');
    if (// http://wiki.ecmascript.org/doku.php?id=proposals:iterators_and_generators&s=each
        matchContextualKeyword('each')) {
        throwError({}, Messages.EachNotAllowed);
    }
    expect('(');
    if (match(';')) {
        lex();
    } else {
        if (matchKeyword('var') || matchKeyword('let') || matchKeyword('const')) {
            state.allowIn = false;
            init = parseForVariableDeclaration();
            state.allowIn = true;
            if (init.declarations.length === 1) {
                if (matchKeyword('in') || matchContextualKeyword('of')) {
                    operator = lookahead;
                    if (!((operator.value === 'in' || init.kind !== 'var') && init.declarations[0].init)) {
                        lex();
                        left = init;
                        right = parseExpression();
                        init = null;
                    }
                }
            }
        } else {
            state.allowIn = false;
            init = parseExpression();
            state.allowIn = true;
            if (matchContextualKeyword('of')) {
                operator = lex();
                left = init;
                right = parseExpression();
                init = null;
            } else if (matchKeyword('in')) {
                if (// LeftHandSideExpression
                    !isAssignableLeftHandSide(init)) {
                    throwError({}, Messages.InvalidLHSInForIn);
                }
                operator = lex();
                left = init;
                right = parseExpression();
                init = null;
            }
        }
        if (typeof left === 'undefined') {
            expect(';');
        }
    }
    if (typeof left === 'undefined') {
        if (!match(';')) {
            test = parseExpression();
        }
        expect(';');
        if (!match(')')) {
            update = parseExpression();
        }
    }
    expect(')');
    oldInIteration = state.inIteration;
    state.inIteration = true;
    if (!(opts !== undefined && opts.ignoreBody)) {
        body = parseStatement();
    }
    state.inIteration = oldInIteration;
    if (typeof left === 'undefined') {
        return markerApply(marker, delegate.createForStatement(init, test, update, body));
    }
    if (operator.value === 'in') {
        return markerApply(marker, delegate.createForInStatement(left, right, body));
    }
    return markerApply(marker, delegate.createForOfStatement(left, right, body));
}
function parseContinueStatement() {
    var label = null, key, marker = markerCreate();
    expectKeyword('continue');
    if (// Optimize the most common form: 'continue;'.
        lookahead.value.charCodeAt(0) === 59) {
        lex();
        if (!state.inIteration) {
            throwError({}, Messages.IllegalContinue);
        }
        return markerApply(marker, delegate.createContinueStatement(null));
    }
    if (peekLineTerminator()) {
        if (!state.inIteration) {
            throwError({}, Messages.IllegalContinue);
        }
        return markerApply(marker, delegate.createContinueStatement(null));
    }
    if (lookahead.type === Token.Identifier) {
        label = parseVariableIdentifier();
        key = '$' + label.name;
        if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
            throwError({}, Messages.UnknownLabel, label.name);
        }
    }
    consumeSemicolon();
    if (label === null && !state.inIteration) {
        throwError({}, Messages.IllegalContinue);
    }
    return markerApply(marker, delegate.createContinueStatement(label));
}
function parseBreakStatement() {
    var label = null, key, marker = markerCreate();
    expectKeyword('break');
    if (// Catch the very common case first: immediately a semicolon (char #59).
        lookahead.value.charCodeAt(0) === 59) {
        lex();
        if (!(state.inIteration || state.inSwitch)) {
            throwError({}, Messages.IllegalBreak);
        }
        return markerApply(marker, delegate.createBreakStatement(null));
    }
    if (peekLineTerminator()) {
        if (!(state.inIteration || state.inSwitch)) {
            throwError({}, Messages.IllegalBreak);
        }
        return markerApply(marker, delegate.createBreakStatement(null));
    }
    if (lookahead.type === Token.Identifier) {
        label = parseVariableIdentifier();
        key = '$' + label.name;
        if (!Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
            throwError({}, Messages.UnknownLabel, label.name);
        }
    }
    consumeSemicolon();
    if (label === null && !(state.inIteration || state.inSwitch)) {
        throwError({}, Messages.IllegalBreak);
    }
    return markerApply(marker, delegate.createBreakStatement(label));
}
function parseReturnStatement() {
    var argument = null, marker = markerCreate();
    expectKeyword('return');
    if (!state.inFunctionBody) {
        throwErrorTolerant({}, Messages.IllegalReturn);
    }
    if (// 'return' followed by a space and an identifier is very common.
        isIdentifierStart(String(lookahead.value).charCodeAt(0))) {
        argument = parseExpression();
        consumeSemicolon();
        return markerApply(marker, delegate.createReturnStatement(argument));
    }
    if (peekLineTerminator()) {
        return markerApply(marker, delegate.createReturnStatement(null));
    }
    if (!match(';')) {
        if (!match('}') && lookahead.type !== Token.EOF) {
            argument = parseExpression();
        }
    }
    consumeSemicolon();
    return markerApply(marker, delegate.createReturnStatement(argument));
}
function parseWithStatement() {
    var object, body, marker = markerCreate();
    if (strict) {
        throwErrorTolerant({}, Messages.StrictModeWith);
    }
    expectKeyword('with');
    expect('(');
    object = parseExpression();
    expect(')');
    body = parseStatement();
    return markerApply(marker, delegate.createWithStatement(object, body));
}
function parseSwitchCase() {
    var test, consequent = [], sourceElement, marker = markerCreate();
    if (matchKeyword('default')) {
        lex();
        test = null;
    } else {
        expectKeyword('case');
        test = parseExpression();
    }
    expect(':');
    while (streamIndex < length) {
        if (match('}') || matchKeyword('default') || matchKeyword('case')) {
            break;
        }
        sourceElement = parseSourceElement();
        if (typeof sourceElement === 'undefined') {
            break;
        }
        consequent.push(sourceElement);
    }
    return markerApply(marker, delegate.createSwitchCase(test, consequent));
}
function parseSwitchStatement() {
    var discriminant, cases, clause, oldInSwitch, defaultFound, marker = markerCreate();
    expectKeyword('switch');
    expect('(');
    discriminant = parseExpression();
    expect(')');
    expect('{');
    cases = [];
    if (match('}')) {
        lex();
        return markerApply(marker, delegate.createSwitchStatement(discriminant, cases));
    }
    oldInSwitch = state.inSwitch;
    state.inSwitch = true;
    defaultFound = false;
    while (streamIndex < length) {
        if (match('}')) {
            break;
        }
        clause = parseSwitchCase();
        if (clause.test === null) {
            if (defaultFound) {
                throwError({}, Messages.MultipleDefaultsInSwitch);
            }
            defaultFound = true;
        }
        cases.push(clause);
    }
    state.inSwitch = oldInSwitch;
    expect('}');
    return markerApply(marker, delegate.createSwitchStatement(discriminant, cases));
}
function parseThrowStatement() {
    var argument, marker = markerCreate();
    expectKeyword('throw');
    if (peekLineTerminator()) {
        throwError({}, Messages.NewlineAfterThrow);
    }
    argument = parseExpression();
    consumeSemicolon();
    return markerApply(marker, delegate.createThrowStatement(argument));
}
function parseCatchClause() {
    var param, body, marker = markerCreate();
    expectKeyword('catch');
    expect('(');
    if (match(')')) {
        throwUnexpected(lookahead);
    }
    param = parseExpression();
    if (// 12.14.1
        strict && param.type === Syntax.Identifier && isRestrictedWord(param.name)) {
        throwErrorTolerant({}, Messages.StrictCatchVariable);
    }
    expect(')');
    body = parseBlock();
    return markerApply(marker, delegate.createCatchClause(param, body));
}
function parseTryStatement() {
    var block, handlers = [], finalizer = null, marker = markerCreate();
    expectKeyword('try');
    block = parseBlock();
    if (matchKeyword('catch')) {
        handlers.push(parseCatchClause());
    }
    if (matchKeyword('finally')) {
        lex();
        finalizer = parseBlock();
    }
    if (handlers.length === 0 && !finalizer) {
        throwError({}, Messages.NoCatchOrFinally);
    }
    return markerApply(marker, delegate.createTryStatement(block, [], handlers, finalizer));
}
function parseDebuggerStatement() {
    var marker = markerCreate();
    expectKeyword('debugger');
    consumeSemicolon();
    return markerApply(marker, delegate.createDebuggerStatement());
}
function parseStatement() {
    var type = lookahead.type, marker, expr, labeledBody, key;
    if (type === Token.EOF) {
        throwUnexpected(lookahead);
    }
    if (type === Token.Punctuator) {
        switch (lookahead.value) {
        case ';':
            return parseEmptyStatement();
        case '{':
            return parseBlock();
        case '(':
            return parseExpressionStatement();
        default:
            break;
        }
    }
    if (type === Token.Keyword) {
        switch (lookahead.value) {
        case 'break':
            return parseBreakStatement();
        case 'continue':
            return parseContinueStatement();
        case 'debugger':
            return parseDebuggerStatement();
        case 'do':
            return parseDoWhileStatement();
        case 'for':
            return parseForStatement();
        case 'function':
            return parseFunctionDeclaration();
        case 'class':
            return parseClassDeclaration();
        case 'if':
            return parseIfStatement();
        case 'return':
            return parseReturnStatement();
        case 'switch':
            return parseSwitchStatement();
        case 'throw':
            return parseThrowStatement();
        case 'try':
            return parseTryStatement();
        case 'var':
            return parseVariableStatement();
        case 'while':
            return parseWhileStatement();
        case 'with':
            return parseWithStatement();
        default:
            break;
        }
    }
    marker = markerCreate();
    expr = parseExpression();
    if (// 12.12 Labelled Statements
        expr.type === Syntax.Identifier && match(':')) {
        lex();
        key = '$' + expr.name;
        if (Object.prototype.hasOwnProperty.call(state.labelSet, key)) {
            throwError({}, Messages.Redeclaration, 'Label', expr.name);
        }
        state.labelSet[key] = true;
        labeledBody = parseStatement();
        delete state.labelSet[key];
        return markerApply(marker, delegate.createLabeledStatement(expr, labeledBody));
    }
    consumeSemicolon();
    return markerApply(marker, delegate.createExpressionStatement(expr));
}
function parseConciseBody() {
    if (match('{')) {
        return parseFunctionSourceElements();
    }
    return parseAssignmentExpression();
}
function parseFunctionSourceElements() {
    var sourceElement, sourceElements = [], token, directive, firstRestricted, oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody, oldParenthesizedCount, marker = markerCreate();
    expect('{');
    while (streamIndex < length) {
        if (lookahead.type !== Token.StringLiteral) {
            break;
        }
        token = lookahead;
        sourceElement = parseSourceElement();
        sourceElements.push(sourceElement);
        if (sourceElement.expression.type !== Syntax.Literal) {
            // this is not directive
            break;
        }
        directive = token.value;
        if (directive === 'use strict') {
            strict = true;
            if (firstRestricted) {
                throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
            }
        } else {
            if (!firstRestricted && token.octal) {
                firstRestricted = token;
            }
        }
    }
    oldLabelSet = state.labelSet;
    oldInIteration = state.inIteration;
    oldInSwitch = state.inSwitch;
    oldInFunctionBody = state.inFunctionBody;
    oldParenthesizedCount = state.parenthesizedCount;
    state.labelSet = {};
    state.inIteration = false;
    state.inSwitch = false;
    state.inFunctionBody = true;
    state.parenthesizedCount = 0;
    while (streamIndex < length) {
        if (match('}')) {
            break;
        }
        sourceElement = parseSourceElement();
        if (typeof sourceElement === 'undefined') {
            break;
        }
        sourceElements.push(sourceElement);
    }
    expect('}');
    state.labelSet = oldLabelSet;
    state.inIteration = oldInIteration;
    state.inSwitch = oldInSwitch;
    state.inFunctionBody = oldInFunctionBody;
    state.parenthesizedCount = oldParenthesizedCount;
    return markerApply(marker, delegate.createBlockStatement(sourceElements));
}
function validateParam(options, param, name) {
    var key = '$' + name;
    if (strict) {
        if (isRestrictedWord(name)) {
            options.stricted = param;
            options.message = Messages.StrictParamName;
        }
        if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
            options.stricted = param;
            options.message = Messages.StrictParamDupe;
        }
    } else if (!options.firstRestricted) {
        if (isRestrictedWord(name)) {
            options.firstRestricted = param;
            options.message = Messages.StrictParamName;
        } else if (isStrictModeReservedWord(name)) {
            options.firstRestricted = param;
            options.message = Messages.StrictReservedWord;
        } else if (Object.prototype.hasOwnProperty.call(options.paramSet, key)) {
            options.firstRestricted = param;
            options.message = Messages.StrictParamDupe;
        }
    }
    options.paramSet[key] = true;
}
function parseParam(options) {
    var token, rest, param, def;
    token = lookahead;
    if (token.value === '...') {
        token = lex();
        rest = true;
    }
    if (match('[')) {
        param = parseArrayInitialiser();
        reinterpretAsDestructuredParameter(options, param);
    } else if (match('{')) {
        if (rest) {
            throwError({}, Messages.ObjectPatternAsRestParameter);
        }
        param = parseObjectInitialiser();
        reinterpretAsDestructuredParameter(options, param);
    } else {
        param = parseVariableIdentifier();
        validateParam(options, token, token.value);
    }
    if (match('=')) {
        if (rest) {
            throwErrorTolerant(lookahead, Messages.DefaultRestParameter);
        }
        lex();
        def = parseAssignmentExpression();
        ++options.defaultCount;
    }
    if (rest) {
        if (!match(')')) {
            throwError({}, Messages.ParameterAfterRestParameter);
        }
        options.rest = param;
        return false;
    }
    options.params.push(param);
    options.defaults.push(def);
    return !match(')');
}
function parseParams(firstRestricted) {
    var options;
    options = {
        params: [],
        defaultCount: 0,
        defaults: [],
        rest: null,
        firstRestricted: firstRestricted
    };
    expect('(');
    if (!match(')')) {
        options.paramSet = {};
        while (streamIndex < length) {
            if (!parseParam(options)) {
                break;
            }
            expect(',');
        }
    }
    expect(')');
    if (options.defaultCount === 0) {
        options.defaults = [];
    }
    return options;
}
function parseFunctionDeclaration() {
    var id, body, token, tmp, firstRestricted, message, previousStrict, previousYieldAllowed, generator, marker = markerCreate();
    expectKeyword('function');
    generator = false;
    if (match('*')) {
        lex();
        generator = true;
    }
    token = lookahead;
    id = parseVariableIdentifier();
    if (strict) {
        if (isRestrictedWord(token.value)) {
            throwErrorTolerant(token, Messages.StrictFunctionName);
        }
    } else {
        if (isRestrictedWord(token.value)) {
            firstRestricted = token;
            message = Messages.StrictFunctionName;
        } else if (isStrictModeReservedWord(token.value)) {
            firstRestricted = token;
            message = Messages.StrictReservedWord;
        }
    }
    tmp = parseParams(firstRestricted);
    firstRestricted = tmp.firstRestricted;
    if (tmp.message) {
        message = tmp.message;
    }
    previousStrict = strict;
    previousYieldAllowed = state.yieldAllowed;
    state.yieldAllowed = generator;
    body = parseFunctionSourceElements();
    if (strict && firstRestricted) {
        throwError(firstRestricted, message);
    }
    if (strict && tmp.stricted) {
        throwErrorTolerant(tmp.stricted, message);
    }
    strict = previousStrict;
    state.yieldAllowed = previousYieldAllowed;
    return markerApply(marker, delegate.createFunctionDeclaration(id, tmp.params, tmp.defaults, body, tmp.rest, generator, false));
}
function parseFunctionExpression() {
    var token, id = null, firstRestricted, message, tmp, body, previousStrict, previousYieldAllowed, generator, marker = markerCreate();
    expectKeyword('function');
    generator = false;
    if (match('*')) {
        lex();
        generator = true;
    }
    if (!match('(')) {
        token = lookahead;
        id = parseVariableIdentifier();
        if (strict) {
            if (isRestrictedWord(token.value)) {
                throwErrorTolerant(token, Messages.StrictFunctionName);
            }
        } else {
            if (isRestrictedWord(token.value)) {
                firstRestricted = token;
                message = Messages.StrictFunctionName;
            } else if (isStrictModeReservedWord(token.value)) {
                firstRestricted = token;
                message = Messages.StrictReservedWord;
            }
        }
    }
    tmp = parseParams(firstRestricted);
    firstRestricted = tmp.firstRestricted;
    if (tmp.message) {
        message = tmp.message;
    }
    previousStrict = strict;
    previousYieldAllowed = state.yieldAllowed;
    state.yieldAllowed = generator;
    body = parseFunctionSourceElements();
    if (strict && firstRestricted) {
        throwError(firstRestricted, message);
    }
    if (strict && tmp.stricted) {
        throwErrorTolerant(tmp.stricted, message);
    }
    strict = previousStrict;
    state.yieldAllowed = previousYieldAllowed;
    return markerApply(marker, delegate.createFunctionExpression(id, tmp.params, tmp.defaults, body, tmp.rest, generator, false));
}
function parseYieldExpression() {
    var yieldToken, delegateFlag, expr, marker = markerCreate();
    yieldToken = lex();
    assert(yieldToken.value === 'yield', 'Called parseYieldExpression with non-yield lookahead.');
    if (!state.yieldAllowed) {
        throwErrorTolerant({}, Messages.IllegalYield);
    }
    delegateFlag = false;
    if (match('*')) {
        lex();
        delegateFlag = true;
    }
    expr = parseAssignmentExpression();
    return markerApply(marker, delegate.createYieldExpression(expr, delegateFlag));
}
function parseMethodDefinition(existingPropNames) {
    var token, key, param, propType, isValidDuplicateProp = false, marker = markerCreate();
    if (lookahead.value === 'static') {
        propType = ClassPropertyType.static;
        lex();
    } else {
        propType = ClassPropertyType.prototype;
    }
    if (match('*')) {
        lex();
        return markerApply(marker, delegate.createMethodDefinition(propType, '', parseObjectPropertyKey(), parsePropertyMethodFunction({ generator: true })));
    }
    token = lookahead;
    key = parseObjectPropertyKey();
    if (token.value === 'get' && !match('(')) {
        key = parseObjectPropertyKey();
        if (// It is a syntax error if any other properties have a name
            // duplicating this one unless they are a setter
            existingPropNames[propType].hasOwnProperty(key.name)) {
            isValidDuplicateProp = // There isn't already a getter for this prop
            existingPropNames[propType][key.name].get === undefined && // There isn't already a data prop by this name
            existingPropNames[propType][key.name].data === undefined && // The only existing prop by this name is a setter
            existingPropNames[propType][key.name].set !== undefined;
            if (!isValidDuplicateProp) {
                throwError(key, Messages.IllegalDuplicateClassProperty);
            }
        } else {
            existingPropNames[propType][key.name] = {};
        }
        existingPropNames[propType][key.name].get = true;
        expect('(');
        expect(')');
        return markerApply(marker, delegate.createMethodDefinition(propType, 'get', key, parsePropertyFunction({ generator: false })));
    }
    if (token.value === 'set' && !match('(')) {
        key = parseObjectPropertyKey();
        if (// It is a syntax error if any other properties have a name
            // duplicating this one unless they are a getter
            existingPropNames[propType].hasOwnProperty(key.name)) {
            isValidDuplicateProp = // There isn't already a setter for this prop
            existingPropNames[propType][key.name].set === undefined && // There isn't already a data prop by this name
            existingPropNames[propType][key.name].data === undefined && // The only existing prop by this name is a getter
            existingPropNames[propType][key.name].get !== undefined;
            if (!isValidDuplicateProp) {
                throwError(key, Messages.IllegalDuplicateClassProperty);
            }
        } else {
            existingPropNames[propType][key.name] = {};
        }
        existingPropNames[propType][key.name].set = true;
        expect('(');
        token = lookahead;
        param = [parseVariableIdentifier()];
        expect(')');
        return markerApply(marker, delegate.createMethodDefinition(propType, 'set', key, parsePropertyFunction({
            params: param,
            generator: false,
            name: token
        })));
    }
    if (// It is a syntax error if any other properties have the same name as a
        // non-getter, non-setter method
        existingPropNames[propType].hasOwnProperty(key.name)) {
        throwError(key, Messages.IllegalDuplicateClassProperty);
    } else {
        existingPropNames[propType][key.name] = {};
    }
    existingPropNames[propType][key.name].data = true;
    return markerApply(marker, delegate.createMethodDefinition(propType, '', key, parsePropertyMethodFunction({ generator: false })));
}
function parseClassElement(existingProps) {
    if (match(';')) {
        lex();
        return;
    }
    return parseMethodDefinition(existingProps);
}
function parseClassBody() {
    var classElement, classElements = [], existingProps = {}, marker = markerCreate();
    existingProps[ClassPropertyType.static] = {};
    existingProps[ClassPropertyType.prototype] = {};
    expect('{');
    while (streamIndex < length) {
        if (match('}')) {
            break;
        }
        classElement = parseClassElement(existingProps);
        if (typeof classElement !== 'undefined') {
            classElements.push(classElement);
        }
    }
    expect('}');
    return markerApply(marker, delegate.createClassBody(classElements));
}
function parseClassExpression() {
    var id, previousYieldAllowed, superClass = null, marker = markerCreate();
    expectKeyword('class');
    if (!matchKeyword('extends') && !match('{')) {
        id = parseVariableIdentifier();
    }
    if (matchKeyword('extends')) {
        expectKeyword('extends');
        previousYieldAllowed = state.yieldAllowed;
        state.yieldAllowed = false;
        superClass = parseAssignmentExpression();
        state.yieldAllowed = previousYieldAllowed;
    }
    return markerApply(marker, delegate.createClassExpression(id, superClass, parseClassBody()));
}
function parseClassDeclaration() {
    var id, previousYieldAllowed, superClass = null, marker = markerCreate();
    expectKeyword('class');
    id = parseVariableIdentifier();
    if (matchKeyword('extends')) {
        expectKeyword('extends');
        previousYieldAllowed = state.yieldAllowed;
        state.yieldAllowed = false;
        superClass = parseAssignmentExpression();
        state.yieldAllowed = previousYieldAllowed;
    }
    return markerApply(marker, delegate.createClassDeclaration(id, superClass, parseClassBody()));
}
function matchModuleDeclaration() {
    var id;
    if (matchContextualKeyword('module')) {
        id = lookahead2();
        return id.type === Token.StringLiteral || id.type === Token.Identifier;
    }
    return false;
}
function parseSourceElement() {
    if (lookahead.type === Token.Keyword) {
        switch (lookahead.value) {
        case 'const':
        case 'let':
            return parseConstLetDeclaration(lookahead.value);
        case 'function':
            return parseFunctionDeclaration();
        case 'export':
            return parseExportDeclaration();
        case 'import':
            return parseImportDeclaration();
        default:
            return parseStatement();
        }
    }
    if (matchModuleDeclaration()) {
        throwError({}, Messages.NestedModule);
    }
    if (lookahead.type !== Token.EOF) {
        return parseStatement();
    }
}
function parseProgramElement() {
    if (lookahead.type === Token.Keyword) {
        switch (lookahead.value) {
        case 'export':
            return parseExportDeclaration();
        case 'import':
            return parseImportDeclaration();
        }
    }
    if (matchModuleDeclaration()) {
        return parseModuleDeclaration();
    }
    return parseSourceElement();
}
function parseProgramElements() {
    var sourceElement, sourceElements = [], token, directive, firstRestricted;
    while (streamIndex < length) {
        token = lookahead;
        if (token.type !== Token.StringLiteral) {
            break;
        }
        sourceElement = parseProgramElement();
        sourceElements.push(sourceElement);
        if (sourceElement.expression.type !== Syntax.Literal) {
            // this is not directive
            break;
        }
        directive = token.value;
        if (directive === 'use strict') {
            strict = true;
            if (firstRestricted) {
                throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
            }
        } else {
            if (!firstRestricted && token.octal) {
                firstRestricted = token;
            }
        }
    }
    while (streamIndex < length) {
        sourceElement = parseProgramElement();
        if (typeof sourceElement === 'undefined') {
            break;
        }
        sourceElements.push(sourceElement);
    }
    return sourceElements;
}
function parseModuleElement() {
    return parseSourceElement();
}
function parseModuleElements() {
    var list = [], statement;
    while (streamIndex < length) {
        if (match('}')) {
            break;
        }
        statement = parseModuleElement();
        if (typeof statement === 'undefined') {
            break;
        }
        list.push(statement);
    }
    return list;
}
function parseModuleBlock() {
    var block, marker = markerCreate();
    expect('{');
    block = parseModuleElements();
    expect('}');
    return markerApply(marker, delegate.createBlockStatement(block));
}
function parseProgram() {
    var body, marker = markerCreate();
    strict = false;
    peek();
    body = parseProgramElements();
    return markerApply(marker, delegate.createProgram(body));
}
function addComment(type, value, start, end, loc) {
    var comment;
    assert(typeof start === 'number', 'Comment must have valid position');
    if (// Because the way the actual token is scanned, often the comments
        // (if any) are skipped twice during the lexical analysis.
        // Thus, we need to skip adding a comment if the comment array already
        // handled it.
        state.lastCommentStart >= start) {
        return;
    }
    state.lastCommentStart = start;
    comment = {
        type: type,
        value: value
    };
    if (extra.range) {
        comment.range = [
            start,
            end
        ];
    }
    if (extra.loc) {
        comment.loc = loc;
    }
    extra.comments.push(comment);
    if (extra.attachComment) {
        extra.leadingComments.push(comment);
        extra.trailingComments.push(comment);
    }
}
function scanComment() {
    var comment, ch, loc, start, blockComment, lineComment;
    comment = '';
    blockComment = false;
    lineComment = false;
    while (index < length) {
        ch = source[index];
        if (lineComment) {
            ch = source[index++];
            if (isLineTerminator(ch.charCodeAt(0))) {
                loc.end = {
                    line: lineNumber,
                    column: index - lineStart - 1
                };
                lineComment = false;
                addComment('Line', comment, start, index - 1, loc);
                if (ch === '\r' && source[index] === '\n') {
                    ++index;
                }
                ++lineNumber;
                lineStart = index;
                comment = '';
            } else if (index >= length) {
                lineComment = false;
                comment += ch;
                loc.end = {
                    line: lineNumber,
                    column: length - lineStart
                };
                addComment('Line', comment, start, length, loc);
            } else {
                comment += ch;
            }
        } else if (blockComment) {
            if (isLineTerminator(ch.charCodeAt(0))) {
                if (ch === '\r' && source[index + 1] === '\n') {
                    ++index;
                    comment += '\r\n';
                } else {
                    comment += ch;
                }
                ++lineNumber;
                ++index;
                lineStart = index;
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
            } else {
                ch = source[index++];
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
                comment += ch;
                if (ch === '*') {
                    ch = source[index];
                    if (ch === '/') {
                        comment = comment.substr(0, comment.length - 1);
                        blockComment = false;
                        ++index;
                        loc.end = {
                            line: lineNumber,
                            column: index - lineStart
                        };
                        addComment('Block', comment, start, index, loc);
                        comment = '';
                    }
                }
            }
        } else if (ch === '/') {
            ch = source[index + 1];
            if (ch === '/') {
                loc = {
                    start: {
                        line: lineNumber,
                        column: index - lineStart
                    }
                };
                start = index;
                index += 2;
                lineComment = true;
                if (index >= length) {
                    loc.end = {
                        line: lineNumber,
                        column: index - lineStart
                    };
                    lineComment = false;
                    addComment('Line', comment, start, index, loc);
                }
            } else if (ch === '*') {
                start = index;
                index += 2;
                blockComment = true;
                loc = {
                    start: {
                        line: lineNumber,
                        column: index - lineStart - 2
                    }
                };
                if (index >= length) {
                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
                }
            } else {
                break;
            }
        } else if (isWhiteSpace(ch.charCodeAt(0))) {
            ++index;
        } else if (isLineTerminator(ch.charCodeAt(0))) {
            ++index;
            if (ch === '\r' && source[index] === '\n') {
                ++index;
            }
            ++lineNumber;
            lineStart = index;
        } else {
            break;
        }
    }
}
function collectToken() {
    var start, loc, token, range, value;
    skipComment();
    start = index;
    loc = {
        start: {
            line: lineNumber,
            column: index - lineStart
        }
    };
    token = extra.advance();
    loc.end = {
        line: lineNumber,
        column: index - lineStart
    };
    if (token.type !== Token.EOF) {
        range = [
            token.range[0],
            token.range[1]
        ];
        value = source.slice(token.range[0], token.range[1]);
        extra.tokens.push({
            type: TokenName[token.type],
            value: value,
            range: range,
            loc: loc
        });
    }
    return token;
}
function collectRegex() {
    var pos, loc, regex, token;
    skipComment();
    pos = index;
    loc = {
        start: {
            line: lineNumber,
            column: index - lineStart
        }
    };
    regex = extra.scanRegExp();
    loc.end = {
        line: lineNumber,
        column: index - lineStart
    };
    if (!extra.tokenize) {
        if (// Pop the previous token, which is likely '/' or '/='
            extra.tokens.length > 0) {
            token = extra.tokens[extra.tokens.length - 1];
            if (token.range[0] === pos && token.type === 'Punctuator') {
                if (token.value === '/' || token.value === '/=') {
                    extra.tokens.pop();
                }
            }
        }
        extra.tokens.push({
            type: 'RegularExpression',
            value: regex.literal,
            range: [
                pos,
                index
            ],
            loc: loc
        });
    }
    return regex;
}
function filterTokenLocation() {
    var i, entry, token, tokens = [];
    for (i = 0; i < extra.tokens.length; ++i) {
        entry = extra.tokens[i];
        token = {
            type: entry.type,
            value: entry.value
        };
        if (extra.range) {
            token.range = entry.range;
        }
        if (extra.loc) {
            token.loc = entry.loc;
        }
        tokens.push(token);
    }
    extra.tokens = tokens;
}
function patch() {
    if (extra.comments) {
        extra.skipComment = skipComment;
        skipComment = scanComment;
    }
    if (typeof extra.tokens !== 'undefined') {
        extra.advance = advance;
        extra.scanRegExp = scanRegExp;
        advance = collectToken;
        scanRegExp = collectRegex;
    }
}
function unpatch() {
    if (typeof extra.skipComment === 'function') {
        skipComment = extra.skipComment;
    }
    if (typeof extra.scanRegExp === 'function') {
        advance = extra.advance;
        scanRegExp = extra.scanRegExp;
    }
}
function extend(object, properties) {
    var entry, result = {};
    for (entry in object) {
        if (object.hasOwnProperty(entry)) {
            result[entry] = object[entry];
        }
    }
    for (entry in properties) {
        if (properties.hasOwnProperty(entry)) {
            result[entry] = properties[entry];
        }
    }
    return result;
}
function tokenize(code, options) {
    var toString, token, tokens;
    toString = String;
    if (typeof code !== 'string' && !(code instanceof String)) {
        code = toString(code);
    }
    delegate = SyntaxTreeDelegate;
    source = code;
    index = 0;
    lineNumber = source.length > 0 ? 1 : 0;
    lineStart = 0;
    length = source.length;
    lookahead = null;
    state = {
        allowKeyword: true,
        allowIn: true,
        labelSet: {},
        inFunctionBody: false,
        inIteration: false,
        inSwitch: false,
        lastCommentStart: -1
    };
    extra = {};
    // Options matching.
    options = options || {};
    // Of course we collect tokens here.
    options.tokens = true;
    extra.tokens = [];
    extra.tokenize = true;
    // The following two fields are necessary to compute the Regex tokens.
    extra.openParenToken = -1;
    extra.openCurlyToken = -1;
    extra.range = typeof options.range === 'boolean' && options.range;
    extra.loc = typeof options.loc === 'boolean' && options.loc;
    if (typeof options.comment === 'boolean' && options.comment) {
        extra.comments = [];
    }
    if (typeof options.tolerant === 'boolean' && options.tolerant) {
        extra.errors = [];
    }
    if (length > 0) {
        if (typeof source[0] === 'undefined') {
            if (// Try first to convert to a string. This is good as fast path
                // for old IE which understands string indexing for string
                // literals only and not for string object.
                code instanceof String) {
                source = code.valueOf();
            }
        }
    }
    patch();
    try {
        peek();
        if (lookahead.type === Token.EOF) {
            return extra.tokens;
        }
        token = lex();
        while (lookahead.type !== Token.EOF) {
            try {
                token = lex();
            } catch (lexError) {
                token = lookahead;
                if (extra.errors) {
                    extra.errors.push(lexError);
                    // We have to break on the first error
                    // to avoid infinite loops.
                    break;
                } else {
                    throw lexError;
                }
            }
        }
        filterTokenLocation();
        tokens = extra.tokens;
        if (typeof extra.comments !== 'undefined') {
            tokens.comments = extra.comments;
        }
        if (typeof extra.errors !== 'undefined') {
            tokens.errors = extra.errors;
        }
    } catch (e) {
        throw e;
    } finally {
        unpatch();
        extra = {};
    }
    return tokens;
}
function blockAllowed(toks, start, inExprDelim, parentIsBlock) {
    var assignOps = [
        '=',
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '<<=',
        '>>=',
        '>>>=',
        '&=',
        '|=',
        '^=',
        ','
    ];
    var binaryOps = [
        '+',
        '-',
        '*',
        '/',
        '%',
        '<<',
        '>>',
        '>>>',
        '&',
        '|',
        '^',
        '&&',
        '||',
        '?',
        ':',
        '===',
        '==',
        '>=',
        '<=',
        '<',
        '>',
        '!=',
        '!==',
        'instanceof'
    ];
    var unaryOps = [
        '++',
        '--',
        '~',
        '!',
        'delete',
        'void',
        'typeof',
        'yield',
        'throw',
        'new'
    ];
    function back(n) {
        var idx = toks.length - n > 0 ? toks.length - n : 0;
        return toks[idx];
    }
    if (inExprDelim && toks.length - (start + 2) <= 0) {
        // ... ({...} ...)
        return false;
    } else if (back(start + 2).value === ':' && parentIsBlock) {
        // ...{a:{b:{...}}}
        return true;
    } else if (isIn(back(start + 2).value, unaryOps.concat(binaryOps).concat(assignOps))) {
        // ... + {...}
        return false;
    } else if (back(start + 2).value === 'return') {
        var // ASI makes `{}` a block in:
        //
        //    return
        //    { ... }
        //
        // otherwise an object literal, so it's an
        // expression and thus / is divide
        currLineNumber = typeof back(start + 1).startLineNumber !== 'undefined' ? back(start + 1).startLineNumber : back(start + 1).lineNumber;
        if (back(start + 2).lineNumber !== currLineNumber) {
            return true;
        } else {
            return false;
        }
    } else if (isIn(back(start + 2).value, [
            'void',
            'typeof',
            'in',
            'case',
            'delete'
        ])) {
        // ... in {}
        return false;
    } else {
        return true;
    }
}
var // Readtables
readtables = {
    currentReadtable: {},
    // A readtable is invoked within `readToken`, but it can
    // return multiple tokens. We need to "queue" the stream of
    // tokens so that subsequent calls to `readToken` gets the
    // rest of the stream.
    queued: [],
    // A readtable can only override punctuators
    punctuators: ';,.:!?~=%&*+-/<>^|#@',
    has: function (ch) {
        return readtables.currentReadtable[ch] && readtables.punctuators.indexOf(ch) !== -1;
    },
    getQueued: function () {
        return readtables.queued.length ? readtables.queued.shift() : null;
    },
    peekQueued: function (lookahead$2) {
        lookahead$2 = lookahead$2 ? lookahead$2 : 1;
        return readtables.queued.length ? readtables.queued[lookahead$2 - 1] : null;
    },
    invoke: function (ch, toks) {
        var prevState = snapshotParserState();
        var newStream = readtables.currentReadtable[ch](ch, readtables.readerAPI, toks, source, index);
        if (!newStream) {
            // Reset the state
            restoreParserState(prevState);
            return null;
        } else if (!Array.isArray(newStream)) {
            newStream = [newStream];
        }
        this.queued = this.queued.concat(newStream);
        return this.getQueued();
    }
};
function snapshotParserState() {
    return {
        index: index,
        lineNumber: lineNumber,
        lineStart: lineStart
    };
}
function restoreParserState(prevState) {
    index = prevState.index;
    lineNumber = prevState.lineNumber;
    lineStart = prevState.lineStart;
}
function suppressReadError(func) {
    var prevState = snapshotParserState();
    try {
        return func();
    } catch (e) {
        if (!(e instanceof SyntaxError) && !(e instanceof TypeError)) {
            restoreParserState(prevState);
            return null;
        }
        throw e;
    }
}
function makeIdentifier(value, opts) {
    opts = opts || {};
    var type = Token.Identifier;
    if (isKeyword(value)) {
        type = Token.Keyword;
    } else if (value === 'null') {
        type = Token.NullLiteral;
    } else if (value === 'true' || value === 'false') {
        type = Token.BooleanLiteral;
    }
    return {
        type: type,
        value: value,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            opts.start || index,
            index
        ]
    };
}
function makePunctuator(value, opts) {
    opts = opts || {};
    return {
        type: Token.Punctuator,
        value: value,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            opts.start || index,
            index
        ]
    };
}
function makeStringLiteral(value, opts) {
    opts = opts || {};
    return {
        type: Token.StringLiteral,
        value: value,
        octal: !!opts.octal,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            opts.start || index,
            index
        ]
    };
}
function makeNumericLiteral(value, opts) {
    opts = opts || {};
    return {
        type: Token.NumericLiteral,
        value: value,
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            opts.start || index,
            index
        ]
    };
}
function makeRegExp(value, opts) {
    opts = opts || {};
    return {
        type: Token.RegularExpression,
        value: value,
        literal: value.toString(),
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            opts.start || index,
            index
        ]
    };
}
function makeDelimiter(value, inner) {
    var current = {
        lineNumber: lineNumber,
        lineStart: lineStart,
        range: [
            index,
            index
        ]
    };
    var firstTok = inner.length ? inner[0] : current;
    var lastTok = inner.length ? inner[inner.length - 1] : current;
    return {
        type: Token.Delimiter,
        value: value,
        inner: inner,
        startLineNumber: firstTok.lineNumber,
        startLineStart: firstTok.lineStart,
        startRange: firstTok.range,
        endLineNumber: lastTok.lineNumber,
        endLineStart: lastTok.lineStart,
        endRange: lastTok.range
    };
}
var // Since an actual parser object doesn't exist and we want to
// introduce our own API anyway, we create a special reader object
// for reader extensions
readerAPI = {
    Token: Token,
    get source() {
        return source;
    },
    get index() {
        return index;
    },
    set index(x) {
        index = x;
    },
    get length() {
        return length;
    },
    set length(x) {
        length = x;
    },
    get lineNumber() {
        return lineNumber;
    },
    set lineNumber(x) {
        lineNumber = x;
    },
    get lineStart() {
        return lineStart;
    },
    set lineStart(x) {
        lineStart = x;
    },
    get extra() {
        return extra;
    },
    isIdentifierStart: isIdentifierStart,
    isIdentifierPart: isIdentifierPart,
    isLineTerminator: isLineTerminator,
    readIdentifier: scanIdentifier,
    readPunctuator: scanPunctuator,
    readStringLiteral: scanStringLiteral,
    readNumericLiteral: scanNumericLiteral,
    readRegExp: scanRegExp,
    readToken: function () {
        return readToken([], false, false);
    },
    readDelimiter: function () {
        return readDelim([], false, false);
    },
    skipComment: scanComment,
    makeIdentifier: makeIdentifier,
    makePunctuator: makePunctuator,
    makeStringLiteral: makeStringLiteral,
    makeNumericLiteral: makeNumericLiteral,
    makeRegExp: makeRegExp,
    makeDelimiter: makeDelimiter,
    suppressReadError: suppressReadError,
    peekQueued: readtables.peekQueued,
    getQueued: readtables.getQueued
};
readtables.readerAPI = readerAPI;
function readToken(toks, inExprDelim, parentIsBlock) {
    var delimiters = [
        '(',
        '{',
        '['
    ];
    var parenIdents = [
        'if',
        'while',
        'for',
        'with'
    ];
    var last = toks.length - 1;
    var comments, commentsLen = extra.comments.length;
    function back(n) {
        var idx = toks.length - n > 0 ? toks.length - n : 0;
        return toks[idx];
    }
    function attachComments(token) {
        if (comments) {
            token.leadingComments = comments;
        }
        return token;
    }
    function _advance() {
        return attachComments(advance());
    }
    function _scanRegExp() {
        return attachComments(scanRegExp());
    }
    skipComment();
    var ch = source[index];
    if (extra.comments.length > commentsLen) {
        comments = extra.comments.slice(commentsLen);
    }
    if (isIn(source[index], delimiters)) {
        return attachComments(readDelim(toks, inExprDelim, parentIsBlock));
    }
    // Check if we should get the token from the readtable
    var readtableToken;
    if ((readtableToken = readtables.getQueued()) || readtables.has(ch) && (readtableToken = readtables.invoke(ch, toks))) {
        return readtableToken;
    }
    if (ch === '/') {
        var prev = back(1);
        if (prev) {
            if (prev.value === '()') {
                if (isIn(back(2).value, parenIdents)) {
                    // ... if (...) / ...
                    return _scanRegExp();
                }
                // ... (...) / ...
                return _advance();
            }
            if (prev.value === '{}') {
                if (blockAllowed(toks, 0, inExprDelim, parentIsBlock)) {
                    if (back(2).value === '()') {
                        if (// named function
                            back(4).value === 'function') {
                            if (!blockAllowed(toks, 3, inExprDelim, parentIsBlock)) {
                                // new function foo (...) {...} / ...
                                return _advance();
                            }
                            if (toks.length - 5 <= 0 && inExprDelim) {
                                // (function foo (...) {...} /...)
                                // [function foo (...) {...} /...]
                                return _advance();
                            }
                        }
                        if (// unnamed function
                            back(3).value === 'function') {
                            if (!blockAllowed(toks, 2, inExprDelim, parentIsBlock)) {
                                // new function (...) {...} / ...
                                return _advance();
                            }
                            if (toks.length - 4 <= 0 && inExprDelim) {
                                // (function (...) {...} /...)
                                // [function (...) {...} /...]
                                return _advance();
                            }
                        }
                    }
                    // ...; {...} /...
                    return _scanRegExp();
                } else {
                    // ... + {...} / ...
                    return _advance();
                }
            }
            if (prev.type === Token.Punctuator) {
                // ... + /...
                return _scanRegExp();
            }
            if (isKeyword(prev.value) && prev.value !== 'this' && prev.value !== 'let' && prev.value !== 'export') {
                // typeof /...
                return _scanRegExp();
            }
            return _advance();
        }
        return _scanRegExp();
    }
    return _advance();
}
function readDelim(toks, inExprDelim, parentIsBlock) {
    var startDelim = advance(), matchDelim = {
            '(': ')',
            '{': '}',
            '[': ']'
        }, inner = [];
    var delimiters = [
        '(',
        '{',
        '['
    ];
    assert(delimiters.indexOf(startDelim.value) !== -1, 'Need to begin at the delimiter');
    var token = startDelim;
    var startLineNumber = token.lineNumber;
    var startLineStart = token.lineStart;
    var startRange = token.range;
    var delimToken = {};
    delimToken.type = Token.Delimiter;
    delimToken.value = startDelim.value + matchDelim[startDelim.value];
    delimToken.startLineNumber = startLineNumber;
    delimToken.startLineStart = startLineStart;
    delimToken.startRange = startRange;
    var delimIsBlock = false;
    if (startDelim.value === '{') {
        delimIsBlock = blockAllowed(toks.concat(delimToken), 0, inExprDelim, parentIsBlock);
    }
    while (index <= length) {
        token = readToken(inner, startDelim.value === '(' || startDelim.value === '[', delimIsBlock);
        if (token.type === Token.Punctuator && token.value === matchDelim[startDelim.value]) {
            if (token.leadingComments) {
                delimToken.trailingComments = token.leadingComments;
            }
            break;
        } else if (token.type === Token.EOF) {
            throwError({}, Messages.UnexpectedEOS);
        } else {
            inner.push(token);
        }
    }
    if (// at the end of the stream but the very last char wasn't the closing delimiter
        index >= length && matchDelim[startDelim.value] !== source[length - 1]) {
        throwError({}, Messages.UnexpectedEOS);
    }
    var endLineNumber = token.lineNumber;
    var endLineStart = token.lineStart;
    var endRange = token.range;
    delimToken.inner = inner;
    delimToken.endLineNumber = endLineNumber;
    delimToken.endLineStart = endLineStart;
    delimToken.endRange = endRange;
    return delimToken;
}
function setReadtable(readtable, syn) {
    readtables.currentReadtable = readtable;
    if (syn) {
        readtables.readerAPI.throwSyntaxError = function (name, message, tok) {
            var sx = syn.syntaxFromToken(tok);
            var err = new syn.MacroSyntaxError(name, message, sx);
            throw new SyntaxError(syn.printSyntaxError(source, err));
        };
    }
}
function currentReadtable() {
    return readtables.currentReadtable;
}
function read(code) {
    var token, tokenTree = [];
    extra = {};
    extra.comments = [];
    extra.range = true;
    extra.loc = true;
    patch();
    source = code;
    index = 0;
    lineNumber = source.length > 0 ? 1 : 0;
    lineStart = 0;
    length = source.length;
    state = {
        allowIn: true,
        labelSet: {},
        lastParenthesized: null,
        inFunctionBody: false,
        inIteration: false,
        inSwitch: false
    };
    while (index < length || readtables.peekQueued()) {
        tokenTree.push(readToken(tokenTree, false, false));
    }
    var last = tokenTree[tokenTree.length - 1];
    if (last && last.type !== Token.EOF) {
        tokenTree.push({
            type: Token.EOF,
            value: '',
            lineNumber: last.lineNumber,
            lineStart: last.lineStart,
            range: [
                index,
                index
            ]
        });
    }
    return expander.tokensToSyntax(tokenTree);
}
function parse(code, options) {
    var program, toString;
    extra = {};
    if (// given an array of tokens instead of a string
        Array.isArray(code)) {
        tokenStream = code;
        length = tokenStream.length;
        lineNumber = tokenStream.length > 0 ? 1 : 0;
        source = undefined;
    } else {
        toString = String;
        if (typeof code !== 'string' && !(code instanceof String)) {
            code = toString(code);
        }
        source = code;
        length = source.length;
        lineNumber = source.length > 0 ? 1 : 0;
    }
    delegate = SyntaxTreeDelegate;
    streamIndex = -1;
    index = 0;
    lineStart = 0;
    sm_lineStart = 0;
    sm_lineNumber = lineNumber;
    sm_index = 0;
    sm_range = [
        0,
        0
    ];
    lookahead = null;
    phase = options && typeof options.phase !== 'undefined' ? options.phase : 0;
    state = {
        allowKeyword: false,
        allowIn: true,
        labelSet: {},
        parenthesizedCount: 0,
        inFunctionBody: false,
        inIteration: false,
        inSwitch: false,
        yieldAllowed: false
    };
    extra.attachComment = true;
    extra.range = true;
    extra.comments = [];
    extra.bottomRightStack = [];
    extra.trailingComments = [];
    extra.leadingComments = [];
    if (typeof options !== 'undefined') {
        extra.range = typeof options.range === 'boolean' && options.range;
        extra.loc = typeof options.loc === 'boolean' && options.loc;
        extra.attachComment = typeof options.attachComment === 'boolean' && options.attachComment;
        if (extra.loc && options.source !== null && options.source !== undefined) {
            delegate = extend(delegate, {
                'postProcess': function (node) {
                    node.loc.source = toString(options.source);
                    return node;
                }
            });
        }
        if (typeof options.tokens === 'boolean' && options.tokens) {
            extra.tokens = [];
        }
        if (typeof options.comment === 'boolean' && options.comment) {
            extra.comments = [];
        }
        if (typeof options.tolerant === 'boolean' && options.tolerant) {
            extra.errors = [];
        }
    }
    if (length > 0) {
        if (source && typeof source[0] === 'undefined') {
            if (// Try first to convert to a string. This is good as fast path
                // for old IE which understands string indexing for string
                // literals only and not for string object.
                code instanceof String) {
                source = code.valueOf();
            }
        }
    }
    extra.loc = true;
    extra.errors = [];
    patch();
    try {
        program = parseProgram();
        if (typeof extra.comments !== 'undefined') {
            program.comments = extra.comments;
        }
        if (typeof extra.tokens !== 'undefined') {
            filterTokenLocation();
            program.tokens = extra.tokens;
        }
        if (typeof extra.errors !== 'undefined') {
            program.errors = extra.errors;
        }
    } catch (e) {
        throw e;
    } finally {
        unpatch();
        extra = {};
    }
    return program;
}
exports.tokenize = tokenize;
exports.read = read;
exports.Token = Token;
exports.setReadtable = setReadtable;
exports.currentReadtable = currentReadtable;
exports.parse = parse;
// Deep copy.
exports.Syntax = function () {
    var name, types = {};
    if (typeof Object.create === 'function') {
        types = Object.create(null);
    }
    for (name in Syntax) {
        if (Syntax.hasOwnProperty(name)) {
            types[name] = Syntax[name];
        }
    }
    if (typeof Object.freeze === 'function') {
        Object.freeze(types);
    }
    return types;
}();
},{"./expander":6}],11:[function(require,module,exports){
/*global require: true, exports:true
*/
'use strict';
var _ = require('underscore'), parser = require('./parser'), expander = require('./expander'), syntax = require('./syntax'), assert = require('assert');
var get_expression = expander.get_expression;
var syntaxFromToken = syntax.syntaxFromToken;
var makePunc = syntax.makePunc;
var makeIdent = syntax.makeIdent;
var makeDelim = syntax.makeDelim;
var joinSyntax = syntax.joinSyntax;
var joinSyntaxArray = syntax.joinSyntaxArray;
var cloneSyntax = syntax.cloneSyntax;
var cloneSyntaxArray = syntax.cloneSyntaxArray;
var throwSyntaxError = syntax.throwSyntaxError;
var push = Array.prototype.push;
function freeVarsInPattern(pattern) {
    var fv = [];
    _.each(pattern, function (pat) {
        if (isPatternVar(pat)) {
            fv.push(pat.token.value);
        } else if (pat.token.type === parser.Token.Delimiter) {
            push.apply(fv, freeVarsInPattern(pat.token.inner));
        }
    });
    return fv;
}
function typeIsLiteral(type) {
    return type === parser.Token.NullLiteral || type === parser.Token.NumericLiteral || type === parser.Token.StringLiteral || type === parser.Token.RegexLiteral || type === parser.Token.BooleanLiteral;
}
function containsPatternVar(patterns) {
    return _.any(patterns, function (pat) {
        if (pat.token.type === parser.Token.Delimiter) {
            return containsPatternVar(pat.token.inner);
        }
        return isPatternVar(pat);
    });
}
function delimIsSeparator(delim) {
    return delim && delim.token && delim.token.type === parser.Token.Delimiter && delim.token.value === '()' && delim.token.inner.length === 1 && delim.token.inner[0].token.type !== parser.Token.Delimiter && !containsPatternVar(delim.token.inner);
}
function isPatternVar(stx) {
    return stx.token.value[0] === '$' && stx.token.value !== '$';
}
function joinRepeatedMatch(tojoin, punc) {
    return _.reduce(_.rest(tojoin, 1), function (acc, join) {
        if (punc === ' ') {
            return acc.concat(cloneSyntaxArray(join.match));
        }
        return acc.concat(cloneSyntax(punc), cloneSyntaxArray(join.match));
    }, cloneSyntaxArray(_.first(tojoin).match));
}
function takeLineContext(from, to) {
    return _.map(to, function (stx) {
        return takeLine(from, stx);
    });
}
function takeLine(from, to) {
    var next;
    if (to.token.type === parser.Token.Delimiter) {
        var sm_startLineNumber = typeof to.token.sm_startLineNumber !== 'undefined' ? to.token.sm_startLineNumber : to.token.startLineNumber;
        var sm_endLineNumber = typeof to.token.sm_endLineNumber !== 'undefined' ? to.token.sm_endLineNumber : to.token.endLineNumber;
        var sm_startLineStart = typeof to.token.sm_startLineStart !== 'undefined' ? to.token.sm_startLineStart : to.token.startLineStart;
        var sm_endLineStart = typeof to.token.sm_endLineStart !== 'undefined' ? to.token.sm_endLineStart : to.token.endLineStart;
        var sm_startRange = typeof to.token.sm_startRange !== 'undefined' ? to.token.sm_startRange : to.token.startRange;
        var sm_endRange = typeof to.token.sm_endRange !== 'undefined' ? to.token.sm_endRange : to.token.endRange;
        if (from.token.type === parser.Token.Delimiter) {
            next = syntaxFromToken({
                type: parser.Token.Delimiter,
                value: to.token.value,
                inner: takeLineContext(from, to.token.inner),
                startRange: from.token.startRange,
                endRange: from.token.endRange,
                startLineNumber: from.token.startLineNumber,
                startLineStart: from.token.startLineStart,
                endLineNumber: from.token.endLineNumber,
                endLineStart: from.token.endLineStart,
                sm_startLineNumber: sm_startLineNumber,
                sm_endLineNumber: sm_endLineNumber,
                sm_startLineStart: sm_startLineStart,
                sm_endLineStart: sm_endLineStart,
                sm_startRange: sm_startRange,
                sm_endRange: sm_endRange
            }, to);
        } else {
            next = syntaxFromToken({
                type: parser.Token.Delimiter,
                value: to.token.value,
                inner: takeLineContext(from, to.token.inner),
                startRange: from.token.range,
                endRange: from.token.range,
                startLineNumber: from.token.lineNumber,
                startLineStart: from.token.lineStart,
                endLineNumber: from.token.lineNumber,
                endLineStart: from.token.lineStart,
                sm_startLineNumber: sm_startLineNumber,
                sm_endLineNumber: sm_endLineNumber,
                sm_startLineStart: sm_startLineStart,
                sm_endLineStart: sm_endLineStart,
                sm_startRange: sm_startRange,
                sm_endRange: sm_endRange
            }, to);
        }
    } else {
        var sm_lineNumber = typeof to.token.sm_lineNumber !== 'undefined' ? to.token.sm_lineNumber : to.token.lineNumber;
        var sm_lineStart = typeof to.token.sm_lineStart !== 'undefined' ? to.token.sm_lineStart : to.token.lineStart;
        var sm_range = typeof to.token.sm_range !== 'undefined' ? to.token.sm_range : to.token.range;
        if (from.token.type === parser.Token.Delimiter) {
            next = syntaxFromToken({
                value: to.token.value,
                type: to.token.type,
                lineNumber: from.token.startLineNumber,
                lineStart: from.token.startLineStart,
                range: from.token.startRange,
                sm_lineNumber: sm_lineNumber,
                sm_lineStart: sm_lineStart,
                sm_range: sm_range
            }, to);
        } else {
            next = syntaxFromToken({
                value: to.token.value,
                type: to.token.type,
                lineNumber: from.token.lineNumber,
                lineStart: from.token.lineStart,
                range: from.token.range,
                sm_lineNumber: sm_lineNumber,
                sm_lineStart: sm_lineStart,
                sm_range: sm_range
            }, to);
        }
    }
    if (to.token.leadingComments) {
        next.token.leadingComments = to.token.leadingComments;
    }
    if (to.token.trailingComments) {
        next.token.trailingComments = to.token.trailingComments;
    }
    return next;
}
function reversePattern(patterns) {
    var len = patterns.length;
    var pat;
    return _.reduceRight(patterns, function (acc, pat$2) {
        if (pat$2.class === 'pattern_group' || pat$2.class === 'named_group') {
            pat$2.inner = reversePattern(pat$2.inner);
        }
        if (pat$2.repeat) {
            pat$2.leading = !pat$2.leading;
        }
        acc.push(pat$2);
        return acc;
    }, []);
}
function loadLiteralGroup(patterns) {
    return patterns.map(function (patStx) {
        var pat = patternToObject(patStx);
        if (pat.inner) {
            pat.inner = loadLiteralGroup(pat.inner);
        } else {
            pat.class = 'pattern_literal';
        }
        return pat;
    });
}
function patternToObject(pat) {
    var obj = {
        type: pat.token.type,
        value: pat.token.value
    };
    if (pat.token.inner) {
        obj.inner = pat.token.inner;
    }
    return obj;
}
function isPrimaryClass(name) {
    return [
        'expr',
        'lit',
        'ident',
        'token',
        'invoke',
        'invokeRec'
    ].indexOf(name) > -1;
}
function loadPattern(patterns, reverse) {
    var patts = [];
    for (var i = 0; i < patterns.length; i++) {
        var tok1 = patterns[i];
        var tok2 = patterns[i + 1];
        var tok3 = patterns[i + 2];
        var tok4 = patterns[i + 3];
        var last = patts[patts.length - 1];
        var patt;
        assert(tok1, 'Expecting syntax object');
        if (// Repeaters
            tok1.token.type === parser.Token.Delimiter && tok1.token.value === '()' && tok2 && tok2.token.type === parser.Token.Punctuator && tok2.token.value === '...' && last) {
            assert(tok1.token.inner.length === 1, 'currently assuming all separators are a single token');
            i += 1;
            last.repeat = true;
            last.separator = tok1.token.inner[0];
            continue;
        } else if (tok1.token.type === parser.Token.Punctuator && tok1.token.value === '...' && last) {
            last.repeat = true;
            last.separator = ' ';
            continue;
        } else if (isPatternVar(tok1)) {
            patt = patternToObject(tok1);
            if (tok2 && tok2.token.type === parser.Token.Punctuator && tok2.token.value === ':' && tok3 && (tok3.token.type === parser.Token.Identifier || tok3.token.type === parser.Token.Delimiter && (tok3.token.value === '[]' || tok3.token.value === '()'))) {
                i += 2;
                if (tok3.token.value === '[]') {
                    patt.class = 'named_group';
                    patt.inner = loadLiteralGroup(tok3.token.inner);
                } else if (tok3.token.value === '()') {
                    patt.class = 'named_group';
                    patt.inner = loadPattern(tok3.token.inner);
                } else if (isPrimaryClass(tok3.token.value)) {
                    patt.class = tok3.token.value;
                    if (patt.class === 'invokeRec' || patt.class === 'invoke') {
                        i += 1;
                        if (tok4.token.value === '()' && tok4.token.inner.length) {
                            patt.macroName = tok4.token.inner;
                        } else {
                            throwSyntaxError(patt.class, 'Expected macro parameter', tok3);
                        }
                    }
                } else {
                    patt.class = 'invoke';
                    patt.macroName = [tok3];
                }
            } else {
                patt.class = 'token';
            }
        } else if (tok1.token.type === parser.Token.Identifier && tok1.token.value === '$' && tok2.token.type === parser.Token.Delimiter) {
            i += 1;
            patt = patternToObject(tok2);
            patt.class = 'pattern_group';
            if (patt.value === '[]') {
                patt.inner = loadLiteralGroup(patt.inner);
            } else {
                patt.inner = loadPattern(tok2.token.inner);
            }
        } else if (tok1.token.type === parser.Token.Identifier && tok1.token.value === '_') {
            patt = patternToObject(tok1);
            patt.class = 'wildcard';
        } else {
            patt = patternToObject(tok1);
            patt.class = 'pattern_literal';
            if (patt.inner) {
                patt.inner = loadPattern(tok1.token.inner);
            }
        }
        if (// Macro classes aren't allowed in lookbehind because we wouldn't
            // know where to insert the macro, and you can't use a L->R macro
            // to match R->L.
            reverse && patt.macroName) {
            throwSyntaxError(patt.class, 'Not allowed in top-level lookbehind', patt.macroName[0]);
        }
        patts.push(patt);
    }
    return reverse ? reversePattern(patts) : patts;
}
function cachedTermMatch(stx, term) {
    var res = [];
    var i = 0;
    while (stx[i] && stx[i].term === term) {
        res.unshift(stx[i]);
        i++;
    }
    return {
        result: term,
        destructed: res,
        rest: stx.slice(res.length)
    };
}
function expandWithMacro(macroName, stx, context, rec) {
    var name = macroName.map(syntax.unwrapSyntax).join('');
    var ident = syntax.makeIdent(name, macroName[0]);
    var macroObj = expander.getSyntaxTransform(ident, context, context.phase);
    var newContext = expander.makeExpanderContext(context);
    if (!macroObj) {
        throwSyntaxError('invoke', 'Macro not in scope', macroName[0]);
    }
    var next = macroName.slice(-1).concat(stx);
    var rest, result, rt, patternEnv;
    while (macroObj && next) {
        try {
            rt = macroObj.fn(next, newContext, [], []);
            result = rt.result;
            rest = rt.rest;
            patternEnv = rt.patterns;
        } catch (e) {
            if (e instanceof syntax.SyntaxCaseError) {
                result = null;
                rest = stx;
                break;
            } else {
                throw e;
            }
        }
        if (rec && result.length >= 1) {
            var nextMacro = expander.getSyntaxTransform(result, context, context.phase);
            if (nextMacro) {
                macroObj = nextMacro;
                next = result.concat(rest);
            } else {
                break;
            }
        } else {
            break;
        }
    }
    return {
        result: result,
        rest: rest,
        patternEnv: patternEnv
    };
}
function matchPatternClass(patternObj, stx, context) {
    var result, rest, match, patternEnv;
    if (// pattern has no parse class
        patternObj.class === 'token' && stx[0] && stx[0].token.type !== parser.Token.EOF) {
        result = [stx[0]];
        rest = stx.slice(1);
    } else if (patternObj.class === 'lit' && stx[0] && typeIsLiteral(stx[0].token.type)) {
        result = [stx[0]];
        rest = stx.slice(1);
    } else if (patternObj.class === 'ident' && stx[0] && stx[0].token.type === parser.Token.Identifier) {
        result = [stx[0]];
        rest = stx.slice(1);
    } else if (stx.length > 0 && patternObj.class === 'VariableStatement') {
        match = stx[0].term ? cachedTermMatch(stx, stx[0].term) : expander.enforest(stx, expander.makeExpanderContext(context));
        if (match.result && match.result.isVariableStatementTerm) {
            result = match.destructed || match.result.destruct(context);
            rest = match.rest;
        } else {
            result = null;
            rest = stx;
        }
    } else if (stx.length > 0 && patternObj.class === 'expr') {
        match = expander.get_expression(stx, expander.makeExpanderContext(context));
        if (match.result === null || !match.result.isExprTerm) {
            result = null;
            rest = stx;
        } else {
            result = match.destructed || match.result.destruct(context);
            result = [syntax.makeDelim('()', result, result[0])];
            rest = match.rest;
        }
    } else if (stx.length > 0 && (patternObj.class === 'invoke' || patternObj.class === 'invokeRec')) {
        match = expandWithMacro(patternObj.macroName, stx, context, patternObj.class === 'invokeRec');
        result = match.result;
        rest = match.result ? match.rest : stx;
        patternEnv = match.patternEnv;
    } else {
        result = null;
        rest = stx;
    }
    return {
        result: result,
        rest: rest,
        patternEnv: patternEnv
    };
}
function matchPatterns(patterns, stx, context, topLevel) {
    // topLevel lets us know if the patterns are on the top level or nested inside
    // a delimiter:
    //     case $topLevel (,) ... => { }
    //     case ($nested (,) ...) => { }
    // This matters for how we deal with trailing unmatched syntax when the pattern
    // has an ellipses:
    //     m 1,2,3 foo
    // should match 1,2,3 and leave foo alone but:
    //     m (1,2,3 foo)
    // should fail to match entirely.
    topLevel = topLevel || false;
    // note that there are two environments floating around,
    // one is the mapping of identifiers to macro definitions (env)
    // and the other is the pattern environment (patternEnv) that maps
    // patterns in a macro case to syntax.
    var result = [];
    var patternEnv = {};
    var match;
    var pattern;
    var rest = stx;
    var success = true;
    var inLeading;
    patternLoop:
        for (var i = 0; i < patterns.length; i++) {
            if (success === false) {
                break;
            }
            pattern = patterns[i];
            inLeading = false;
            do {
                if (// handles cases where patterns trail a repeated pattern like `$x ... ;`
                    pattern.repeat && i + 1 < patterns.length) {
                    var restMatch = matchPatterns(patterns.slice(i + 1), rest, context, topLevel);
                    if (restMatch.success) {
                        // match the repeat pattern on the empty array to fill in its
                        // pattern variable in the environment
                        match = matchPattern(pattern, [], context, patternEnv, topLevel);
                        patternEnv = _.extend(restMatch.patternEnv, match.patternEnv);
                        rest = restMatch.rest;
                        break patternLoop;
                    }
                }
                if (pattern.repeat && pattern.leading && pattern.separator !== ' ') {
                    if (rest[0].token.value === pattern.separator.token.value) {
                        if (!inLeading) {
                            inLeading = true;
                        }
                        rest = rest.slice(1);
                    } else {
                        if (// If we are in a leading repeat, the separator is required.
                            inLeading) {
                            success = false;
                            break;
                        }
                    }
                }
                match = matchPattern(pattern, rest, context, patternEnv, topLevel);
                if (!match.success && pattern.repeat) {
                    // a repeat can match zero tokens and still be a
                    // "success" so break out of the inner loop and
                    // try the next pattern
                    break;
                }
                if (!match.success) {
                    success = false;
                    break;
                }
                rest = match.rest;
                patternEnv = match.patternEnv;
                if (success && !(topLevel || pattern.repeat)) {
                    if (// the very last pattern matched, inside a
                        // delimiter, not a repeat, *and* there are more
                        // unmatched bits of syntax
                        i == patterns.length - 1 && rest.length !== 0) {
                        success = false;
                        break;
                    }
                }
                if (pattern.repeat && !pattern.leading && success) {
                    if (// if (i < patterns.length - 1 && rest.length > 0) {
                        //     var restMatch = matchPatterns(patterns.slice(i+1), rest, env, topLevel);
                        //     if (restMatch.success) {
                        //         patternEnv = _.extend(patternEnv, restMatch.patternEnv);
                        //         rest = restMatch.rest;
                        //         break patternLoop;
                        //     }
                        // }
                        pattern.separator === ' ') {
                        // no separator specified (using the empty string for this)
                        // so keep going
                        continue;
                    } else if (rest[0] && rest[0].token.value === pattern.separator.token.value) {
                        // more tokens and the next token matches the separator
                        rest = rest.slice(1);
                    } else if (pattern.separator !== ' ' && rest.length > 0 && i === patterns.length - 1 && topLevel === false) {
                        // separator is specified, there is a next token, the
                        // next token doesn't match the separator, there are
                        // no more patterns, and this is a top level pattern
                        // so the match has failed
                        success = false;
                        break;
                    } else {
                        break;
                    }
                }
            } while (pattern.repeat && success && rest.length > 0);
        }
    if (// If we are in a delimiter and we haven't matched all the syntax, it
        // was a failed match.
        !topLevel && rest.length) {
        success = false;
    }
    var result;
    if (success) {
        result = rest.length ? stx.slice(0, -rest.length) : stx;
    } else {
        result = [];
    }
    return {
        success: success,
        result: result,
        rest: rest,
        patternEnv: patternEnv
    };
}
function matchPattern(pattern, stx, context, patternEnv, topLevel) {
    var subMatch;
    var match, matchEnv;
    var rest;
    var success;
    if (typeof pattern.inner !== 'undefined') {
        if (pattern.class === 'pattern_group') {
            // pattern groups don't match the delimiters
            subMatch = matchPatterns(pattern.inner, stx, context, true);
            rest = subMatch.rest;
            success = subMatch.success;
        } else if (pattern.class === 'named_group') {
            subMatch = matchPatterns(pattern.inner, stx, context, true);
            rest = subMatch.rest;
            success = subMatch.success;
            if (success) {
                var namedMatch = {};
                namedMatch[pattern.value] = {
                    level: 0,
                    match: subMatch.result,
                    topLevel: topLevel
                };
                subMatch.patternEnv = loadPatternEnv(namedMatch, subMatch.patternEnv, topLevel, false, pattern.value);
            }
        } else if (stx[0] && stx[0].token.type === parser.Token.Delimiter && stx[0].token.value === pattern.value) {
            if (pattern.inner.length === 0 && stx[0].token.inner.length !== 0) {
                return {
                    success: false,
                    rest: stx,
                    patternEnv: patternEnv
                };
            }
            subMatch = matchPatterns(pattern.inner, stx[0].token.inner, context, false);
            rest = stx.slice(1);
            success = subMatch.success;
        } else {
            subMatch = matchPatterns(pattern.inner, [], context, false);
            success = false;
        }
        if (success) {
            patternEnv = loadPatternEnv(patternEnv, subMatch.patternEnv, topLevel, pattern.repeat);
        } else if (pattern.repeat) {
            patternEnv = initPatternEnv(patternEnv, subMatch.patternEnv, topLevel);
        }
    } else {
        if (pattern.class === 'wildcard') {
            success = true;
            rest = stx.slice(1);
        } else if (pattern.class === 'pattern_literal') {
            if (// match the literal but don't update the pattern environment
                stx[0] && pattern.value === stx[0].token.value) {
                success = true;
                rest = stx.slice(1);
            } else {
                success = false;
                rest = stx;
            }
        } else {
            match = matchPatternClass(pattern, stx, context);
            success = match.result !== null;
            rest = match.rest;
            matchEnv = {
                level: 0,
                match: match.result,
                topLevel: topLevel
            };
            if (// push the match onto this value's slot in the environment
                pattern.repeat) {
                if (patternEnv[pattern.value] && success) {
                    patternEnv[pattern.value].match.push(matchEnv);
                } else if (patternEnv[pattern.value] === undefined) {
                    // initialize if necessary
                    patternEnv[pattern.value] = {
                        level: 1,
                        match: [matchEnv],
                        topLevel: topLevel
                    };
                }
            } else {
                patternEnv[pattern.value] = matchEnv;
            }
            patternEnv = loadPatternEnv(patternEnv, match.patternEnv, topLevel, pattern.repeat, pattern.value);
        }
    }
    return {
        success: success,
        rest: rest,
        patternEnv: patternEnv
    };
}
function initPatternEnv(toEnv, fromEnv, topLevel) {
    _.forEach(fromEnv, function (patternVal, patternKey) {
        if (!toEnv[patternKey]) {
            toEnv[patternKey] = {
                level: patternVal.level + 1,
                match: [patternVal],
                topLevel: topLevel
            };
        }
    });
    return toEnv;
}
function loadPatternEnv(toEnv, fromEnv, topLevel, repeat, prefix) {
    prefix = prefix || '';
    _.forEach(fromEnv, function (patternVal, patternKey) {
        var patternName = prefix + patternKey;
        if (repeat) {
            var nextLevel = patternVal.level + 1;
            if (toEnv[patternName]) {
                toEnv[patternName].level = nextLevel;
                toEnv[patternName].match.push(patternVal);
            } else {
                toEnv[patternName] = {
                    level: nextLevel,
                    match: [patternVal],
                    topLevel: topLevel
                };
            }
        } else {
            toEnv[patternName] = patternVal;
        }
    });
    return toEnv;
}
function matchLookbehind(patterns, stx, terms, context) {
    var success, patternEnv, prevStx, prevTerms;
    if (// No lookbehind, noop.
        !patterns.length) {
        success = true;
        patternEnv = {};
        prevStx = stx;
        prevTerms = terms;
    } else {
        var match = matchPatterns(patterns, stx, context, true);
        var last = match.result[match.result.length - 1];
        success = match.success;
        patternEnv = match.patternEnv;
        if (success) {
            if (match.rest.length) {
                if (last && last.term && last.term === match.rest[0].term) {
                    // The term tree was split, so its a failed match;
                    success = false;
                } else {
                    prevStx = match.rest;
                    for (var
                            // Find where to slice the prevTerms to match up with
                            // the state of prevStx.
                            i = 0, len = terms.length; i < len; i++) {
                        if (terms[i] === prevStx[0].term) {
                            prevTerms = terms.slice(i);
                            break;
                        }
                    }
                    assert(prevTerms, 'No matching previous term found');
                }
            } else {
                prevTerms = [];
                prevStx = [];
            }
        }
    }
    // We need to reverse the matches for any top level repeaters because
    // they match in reverse, and thus put their results in backwards.
    _.forEach(patternEnv, function (val, key) {
        if (val.level && val.match && val.topLevel) {
            val.match.reverse();
        }
    });
    return {
        success: success,
        patternEnv: patternEnv,
        prevStx: prevStx,
        prevTerms: prevTerms
    };
}
function hasMatch(m) {
    if (m.level === 0) {
        return m.match.length > 0;
    }
    return !!m.match;
}
function transcribe(macroBody, macroNameStx, env) {
    return _.chain(macroBody).reduce(function (acc, bodyStx, idx, original) {
        var // first find the ellipses and mark the syntax objects
        // (note that this step does not eagerly go into delimiter bodies)
        last = original[idx - 1];
        var next = original[idx + 1];
        var nextNext = original[idx + 2];
        if (// drop `...`
            bodyStx.token.value === '...') {
            return acc;
        }
        if (// drop `(<separator)` when followed by an ellipse
            delimIsSeparator(bodyStx) && next && next.token.value === '...') {
            return acc;
        }
        if (// skip the $ in $(...)
            bodyStx.token.value === '$' && next && next.token.type === parser.Token.Delimiter && next.token.value === '()') {
            return acc;
        }
        if (// mark $[...] as a literal
            bodyStx.token.value === '$' && next && next.token.type === parser.Token.Delimiter && next.token.value === '[]') {
            next.literal = true;
            return acc;
        }
        if (bodyStx.token.type === parser.Token.Delimiter && bodyStx.token.value === '()' && last && last.token.value === '$') {
            bodyStx.group = true;
        }
        if (// literal [] delimiters have their bodies just
            // directly passed along
            bodyStx.literal === true) {
            assert(bodyStx.token.type === parser.Token.Delimiter, 'expecting a literal to be surrounded by []');
            return acc.concat(bodyStx.token.inner);
        }
        if (next && next.token.value === '...') {
            bodyStx.repeat = true;
            bodyStx.separator = ' ';
        } else if (delimIsSeparator(next) && nextNext && nextNext.token.value === '...') {
            bodyStx.repeat = true;
            bodyStx.separator = next.token.inner[0];
        }
        acc.push(bodyStx);
        return acc;
    }, []).reduce(function (acc, bodyStx, idx) {
        if (// then do the actual transcription
            bodyStx.repeat) {
            if (bodyStx.token.type === parser.Token.Delimiter) {
                var fv = _.filter(freeVarsInPattern(bodyStx.token.inner), function (pat) {
                    // ignore "patterns"
                    // that aren't in the
                    // environment (treat
                    // them like literals)
                    return env.hasOwnProperty(pat);
                });
                var restrictedEnv = [];
                var nonScalar = _.find(fv, function (pat) {
                    return env[pat].level > 0;
                });
                assert(typeof nonScalar !== 'undefined', 'must have a least one non-scalar in repeat');
                var repeatLength = env[nonScalar].match.length;
                var sameLength = _.all(fv, function (pat) {
                    return env[pat].level === 0 || env[pat].match.length === repeatLength;
                });
                assert(sameLength, 'all non-scalars must have the same length');
                // create a list of envs restricted to the free vars
                _.each(_.range(repeatLength), function (idx$2) {
                    var renv = {};
                    _.each(fv, function (pat) {
                        if (env[pat].level === 0) {
                            // copy scalars over
                            renv[pat] = env[pat];
                        } else {
                            // grab the match at this index
                            renv[pat] = env[pat].match[idx$2];
                        }
                    });
                    var allHaveMatch = Object.keys(renv).every(function (pat) {
                        return hasMatch(renv[pat]);
                    });
                    if (allHaveMatch) {
                        restrictedEnv.push(renv);
                    }
                });
                var transcribed = _.map(restrictedEnv, function (renv) {
                    if (bodyStx.group) {
                        return transcribe(bodyStx.token.inner, macroNameStx, renv);
                    } else {
                        var newBody$2 = syntaxFromToken(_.clone(bodyStx.token), bodyStx);
                        newBody$2.token.inner = transcribe(bodyStx.token.inner, macroNameStx, renv);
                        return newBody$2;
                    }
                });
                var joined;
                if (bodyStx.group) {
                    joined = joinSyntaxArray(transcribed, bodyStx.separator);
                } else {
                    joined = joinSyntax(transcribed, bodyStx.separator);
                }
                push.apply(acc, joined);
                return acc;
            }
            if (!env[bodyStx.token.value]) {
                throwSyntaxError('patterns', 'The pattern variable is not bound for the template', bodyStx);
            } else if (env[bodyStx.token.value].level !== 1) {
                throwSyntaxError('patterns', 'Ellipses level does not match in the template', bodyStx);
            }
            push.apply(acc, joinRepeatedMatch(env[bodyStx.token.value].match, bodyStx.separator));
            return acc;
        } else {
            if (bodyStx.token.type === parser.Token.Delimiter) {
                var newBody = syntaxFromToken(_.clone(bodyStx.token), macroBody);
                newBody.token.inner = transcribe(bodyStx.token.inner, macroNameStx, env);
                acc.push(newBody);
                return acc;
            }
            if (isPatternVar(bodyStx) && Object.prototype.hasOwnProperty.bind(env)(bodyStx.token.value)) {
                if (!env[bodyStx.token.value]) {
                    throwSyntaxError('patterns', 'The pattern variable is not bound for the template', bodyStx);
                } else if (env[bodyStx.token.value].level !== 0) {
                    throwSyntaxError('patterns', 'Ellipses level does not match in the template', bodyStx);
                }
                push.apply(acc, takeLineContext(bodyStx, env[bodyStx.token.value].match));
                return acc;
            }
            acc.push(syntaxFromToken(_.clone(bodyStx.token), bodyStx));
            return acc;
        }
    }, []).value();
}
function cloneMatch(oldMatch) {
    var newMatch = {
        success: oldMatch.success,
        rest: oldMatch.rest,
        patternEnv: {}
    };
    for (var pat in oldMatch.patternEnv) {
        if (oldMatch.patternEnv.hasOwnProperty(pat)) {
            newMatch.patternEnv[pat] = oldMatch.patternEnv[pat];
        }
    }
    return newMatch;
}
function makeIdentityRule(pattern, isInfix, context) {
    var inf = [];
    var pat = [];
    var stx = [];
    if (isInfix) {
        for (var i = 0; i < pattern.length; i++) {
            if (pattern[i].token.type === parser.Token.Punctuator && pattern[i].token.value === '|') {
                pat.push(makeIdent('$inf', context), makePunc(':', context), makeDelim('()', inf, context), pattern[0], makeIdent('$id', context), makePunc(':', context), makeDelim('()', pat.slice(i + 1), context));
                stx.push(makeIdent('$inf', context), makeIdent('$id', context));
                break;
            }
            inf.push(pattern[i]);
        }
    } else {
        pat.push(makeIdent('$id', context), makePunc(':', context), makeDelim('()', pattern, context));
        stx.push(makeIdent('$id', context));
    }
    return {
        pattern: pat,
        body: stx
    };
}
exports.loadPattern = loadPattern;
exports.matchPatterns = matchPatterns;
exports.matchLookbehind = matchLookbehind;
exports.transcribe = transcribe;
exports.matchPatternClass = matchPatternClass;
exports.takeLineContext = takeLineContext;
exports.takeLine = takeLine;
exports.typeIsLiteral = typeIsLiteral;
exports.cloneMatch = cloneMatch;
exports.makeIdentityRule = makeIdentityRule;
},{"./expander":6,"./parser":10,"./syntax":15,"assert":26,"underscore":50}],12:[function(require,module,exports){
// thou shalt not macro expand me...all kinds of hygiene hackary
// with strings and `with`.


(function (root, factory) {
    if (typeof exports === 'object') {
        // CommonJS
        factory(exports);
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['exports'], factory);
    }
}(this, function(exports) {

    exports.scopedEval = function(source, global) {
        return eval('(function() { with(global) { return ' + source + ' } }).call(global, global);');
    };

}));


},{}],13:[function(require,module,exports){
'use strict';
var syn = require('../syntax'), assert = require('assert'), _ = require('underscore');
var Rename = syn.Rename;
var Mark = syn.Mark;
var Def = syn.Def;
var Imported = syn.Imported;
function remdup(mark, mlist) {
    if (mark === _.first(mlist)) {
        return _.rest(mlist, 1);
    }
    return [mark].concat(mlist);
}
function marksof(ctx, stopName, originalName) {
    while (ctx) {
        if (ctx.constructor === Mark) {
            return remdup(ctx.mark, marksof(ctx.context, stopName, originalName));
        }
        if (ctx.constructor === Def) {
            ctx = ctx.context;
            continue;
        }
        if (ctx.constructor === Rename) {
            if (stopName === originalName + '$' + ctx.name) {
                return [];
            }
            ctx = ctx.context;
            continue;
        }
        if (ctx.constructor === Imported) {
            ctx = ctx.context;
            continue;
        }
        assert(false, 'Unknown context type');
    }
    return [];
}
function resolve(stx, phase) {
    assert(phase !== undefined, 'must pass in phase');
    return resolveCtx(stx.token.value, stx.context, [], [], {}, phase);
}
function resolveCtx(originalName, ctx, stop_spine, stop_branch, cache, phase) {
    if (!ctx) {
        return originalName;
    }
    var key = ctx.instNum;
    return cache[key] || (cache[key] = resolveCtxFull(originalName, ctx, stop_spine, stop_branch, cache, phase));
}
function resolveCtxFull(originalName, ctx, stop_spine, stop_branch, cache, phase) {
    while (true) {
        if (!ctx) {
            return originalName;
        }
        if (ctx.constructor === Mark) {
            ctx = ctx.context;
            continue;
        }
        if (ctx.constructor === Def) {
            if (stop_spine.indexOf(ctx.defctx) !== -1) {
                ctx = ctx.context;
                continue;
            } else {
                stop_branch = unionEl(stop_branch, ctx.defctx);
                ctx = renames(ctx.defctx, ctx.context, originalName);
                continue;
            }
        }
        if (ctx.constructor === Rename) {
            if (originalName === ctx.id.token.value) {
                var idName = resolveCtx(ctx.id.token.value, ctx.id.context, stop_branch, stop_branch, cache, 0);
                var subName = resolveCtx(originalName, ctx.context, unionEl(stop_spine, ctx.def), stop_branch, cache, 0);
                if (idName === subName) {
                    var idMarks = marksof(ctx.id.context, originalName + '$' + ctx.name, originalName);
                    var subMarks = marksof(ctx.context, originalName + '$' + ctx.name, originalName);
                    if (arraysEqual(idMarks, subMarks)) {
                        return originalName + '$' + ctx.name;
                    }
                }
            }
            ctx = ctx.context;
            continue;
        }
        if (ctx.constructor === Imported) {
            if (phase === ctx.phase) {
                if (originalName === ctx.id.token.value) {
                    return originalName + '$' + ctx.name;
                }
            }
            ctx = ctx.context;
            continue;
        }
        assert(false, 'Unknown context type');
    }
}
function arraysEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
function renames(defctx, oldctx, originalName) {
    var acc = oldctx;
    for (var i = 0; i < defctx.length; i++) {
        if (defctx[i].id.token.value === originalName) {
            acc = new Rename(defctx[i].id, defctx[i].name, acc, defctx);
        }
    }
    return acc;
}
function unionEl(arr, el) {
    if (arr.indexOf(el) === -1) {
        var res = arr.slice(0);
        res.push(el);
        return res;
    }
    return arr;
}
exports.resolve = resolve;
exports.marksof = marksof;
exports.arraysEqual = arraysEqual;
},{"../syntax":15,"assert":26,"underscore":50}],14:[function(require,module,exports){
(function (process,__filename){
var /*
  Copyright (C) 2012 Tim Disney <tim@disnet.me>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
    path = require('path'), resolveSync = require('resolve/lib/sync'), gen = require('escodegen'), _ = require('underscore'), parser = require('./parser'), expander = require('./expander'), syn = require('./syntax'), escope = require('escope');
var stxcaseCtx;
var moduleCache = {};
var cwd = process.cwd();
var requireModule = function (id, filename) {
    var basedir = filename ? path.dirname(filename) : cwd;
    var key = basedir + id;
    if (!moduleCache[key]) {
        moduleCache[key] = require(resolveSync(id, { basedir: basedir }));
    }
    return moduleCache[key];
};
// Alow require('./example') for an example.sjs file.
require.extensions && (require.extensions['.sjs'] = function (module, filename) {
    var content = require('fs').readFileSync(filename, 'utf8');
    module._compile(gen.generate(exports.parse(content, exports.loadedMacros)), filename);
});
function expandSyntax(stx, modules, options) {
    if (!stxcaseCtx) {
        var fs$2 = require('fs');
        var lib = path.join(path.dirname(fs$2.realpathSync(__filename)), '../macros');
        var stxcaseModule = fs$2.readFileSync(lib + '/stxcase.js', 'utf8');
        stxcaseCtx = expander.expandModule(parser.read(stxcaseModule));
    }
    var isSyntax = syn.isSyntax(stx);
    options = options || {};
    options.flatten = false;
    if (!isSyntax) {
        stx = syn.tokensToSyntax(stx);
    }
    try {
        var result = expander.expand(stx, [stxcaseCtx].concat(modules), options);
        return isSyntax ? result : syn.syntaxToTokens(result);
    } catch (err) {
        if (err instanceof syn.MacroSyntaxError) {
            throw new SyntaxError(syn.printSyntaxError(source, err));
        } else {
            throw err;
        }
    }
}
function expand(code, options) {
    var toString = String;
    if (typeof code !== 'string' && !(code instanceof String)) {
        code = toString(code);
    }
    var source$2 = code;
    if (source$2.length > 0) {
        if (typeof source$2[0] === 'undefined') {
            if (// Try first to convert to a string. This is good as fast path
                // for old IE which understands string indexing for string
                // literals only and not for string object.
                code instanceof String) {
                source$2 = code.valueOf();
            }
            if (// Force accessing the characters via an array.
                typeof source$2[0] === 'undefined') {
                source$2 = stringToArray(code);
            }
        }
    }
    if (source$2 === '') {
        // old version of esprima doesn't play nice with the empty string
        // and loc/range info so until we can upgrade hack in a single space
        source$2 = ' ';
    }
    var tokenTree = parser.read(source$2);
    try {
        return expander.compileModule(tokenTree, options);
    } catch (err) {
        if (err instanceof syn.MacroSyntaxError) {
            throw new SyntaxError(syn.printSyntaxError(source$2, err));
        } else {
            throw err;
        }
    }
}
function parseExpanded(expanded, options) {
    return expanded.map(function (c) {
        var ast = parser.parse(c.code);
        if (options.readableNames) {
            ast = optimizeHygiene(ast);
        }
        return {
            path: c.path,
            code: ast
        };
    });
}
function parse(code, options) {
    options = options || {};
    var expanded = expand(code, options);
    return parseExpanded(expanded, options);
}
function compile(code, options) {
    options = options || { compileSuffix: '.jsc' };
    var expanded = expand(code, options);
    return parseExpanded(expanded, options).map(function (c) {
        var output;
        if (options.sourceMap) {
            output = gen.generate(c.code, _.extend({
                comment: true,
                sourceMap: options.filename,
                sourceMapWithCode: true
            }, options.escodegen));
            return {
                path: c.path,
                code: output.code,
                sourceMap: output.map.toString()
            };
        }
        return {
            path: c.path,
            code: gen.generate(c.code, _.extend({ comment: true }, options.escodegen))
        };
    });
}
var baseReadtable = Object.create({
    extend: function (obj) {
        var extended = Object.create(this);
        Object.keys(obj).forEach(function (ch) {
            extended[ch] = obj[ch];
        });
        return extended;
    }
});
parser.setReadtable(baseReadtable, syn);
function setReadtable(readtableModule) {
    var filename = resolveSync(readtableModule, { basedir: process.cwd() });
    var readtable = require(filename);
    parser.setReadtable(require(filename));
}
function currentReadtable() {
    return parser.currentReadtable();
}
function loadNodeModule(root, moduleName, options) {
    options = options || {};
    if (moduleName[0] === '.') {
        moduleName = path.resolve(root, moduleName);
    }
    var filename = resolveSync(moduleName, {
        basedir: root,
        extensions: [
            '.js',
            '.sjs'
        ]
    });
    return expandModule(fs.readFileSync(filename, 'utf8'), undefined, {
        filename: moduleName,
        requireModule: options.requireModule || requireModule
    });
}
function optimizeHygiene(ast) {
    var // escope hack: sweet doesn't rename global vars. We wrap in a closure
    // to create a 'static` scope for all of the vars sweet renamed.
    wrapper = parse('(function(){})()')[0].code;
    wrapper.body[0].expression.callee.body.body = ast.body;
    function sansUnique(name) {
        var match = name.match(/^(.+)\$[\d]+$/);
        return match ? match[1] : null;
    }
    function wouldShadow(name, scope) {
        while (scope) {
            if (scope.scrubbed && scope.scrubbed.has(name)) {
                return scope.scrubbed.get(name);
            }
            scope = scope.upper;
        }
        return 0;
    }
    var scopes = escope.analyze(wrapper).scopes;
    var globalScope;
    // The first pass over the scope collects any non-static references,
    // which means references from the global scope. We need to make these
    // verboten so we don't accidently mangle a name to match. This could
    // cause seriously hard to find bugs if you were just testing with
    // --readable-names on.
    scopes.forEach(function (scope) {
        scope.scrubbed = new expander.StringMap();
        if (// There aren't any references declared in the global scope since
            // we wrapped our input in a static closure.
            !scope.isStatic()) {
            globalScope = scope;
            return;
        }
        scope.references.forEach(function (ref) {
            if (!ref.isStatic()) {
                globalScope.scrubbed.set(ref.identifier.name, 1);
            }
        });
    });
    // The second pass mangles the names to get rid of the hygiene tag
    // wherever possible.
    scopes.forEach(function (scope) {
        if (// No need to rename things in the global scope.
            !scope.isStatic()) {
            return;
        }
        scope.variables.forEach(function (variable) {
            var name = sansUnique(variable.name);
            if (!name) {
                return;
            }
            var level = wouldShadow(name, scope);
            if (level) {
                scope.scrubbed.set(name, level + 1);
                name = name + '$' + (level + 1);
            } else {
                scope.scrubbed.set(name, 1);
            }
            variable.identifiers.forEach(function (i) {
                i.name = name;
            });
            variable.references.forEach(function (r) {
                r.identifier.name = name;
            });
        });
    });
    return ast;
}
var loadedMacros = [];
function loadMacro(relative_file) {
    loadedMacros.push(loadNodeModule(process.cwd(), relative_file));
}
exports.expand = expand;
exports.expandSyntax = expandSyntax;
exports.parse = parse;
exports.compile = compile;
exports.setReadtable = setReadtable;
exports.currentReadtable = currentReadtable;
// exports.loadModule = expandModule;
exports.loadNodeModule = loadNodeModule;
exports.loadedMacros = loadedMacros;
exports.loadMacro = loadMacro;
}).call(this,require('_process'),"/browser/src/sweet.js")
},{"./expander":6,"./parser":10,"./syntax":15,"_process":29,"escodegen":16,"escope":23,"fs":25,"path":28,"resolve/lib/sync":39,"underscore":50}],15:[function(require,module,exports){
// import @ from "contracts.js"
/*global require: true, exports:true
*/
'use strict';
var _ = require('underscore'), parser = require('./parser'), expander = require('./expander'), assert = require('assert');
// Keep an incrementing global counter so that a particular
// each new context object is assigned a unique "instance number"
// that it can be identified by. This helps with the memoization
// of the recursive resolveCtx implementation in expander.js.
// The memoization addresses issue #232.
var globalContextInstanceNumber = 1;
var nextFresh = 0;
function fresh() {
    return nextFresh++;
}
function Rename(id, name, ctx, defctx, phase) {
    defctx = defctx || null;
    this.id = id;
    this.name = name;
    this.context = ctx;
    this.def = defctx;
    this.instNum = globalContextInstanceNumber++;
    this.phase = phase;
}
function Mark(mark, ctx) {
    this.mark = mark;
    this.context = ctx;
    this.instNum = globalContextInstanceNumber++;
}
function Def(defctx, ctx) {
    this.defctx = defctx;
    this.context = ctx;
    this.instNum = globalContextInstanceNumber++;
}
function Imported(id, name, ctx, phase) {
    this.id = id;
    this.name = name;
    this.phase = phase;
    this.context = ctx;
    this.instNum = globalContextInstanceNumber++;
}
function Syntax(token, oldstx) {
    this.token = token;
    this.context = oldstx && oldstx.context ? oldstx.context : null;
    this.deferredContext = oldstx && oldstx.deferredContext ? oldstx.deferredContext : null;
    this.props = oldstx && oldstx.props ? oldstx.props : {};
}
Syntax.prototype = {
    // (Int) -> CSyntax
    // non mutating
    mark: function (newMark) {
        if (this.token.inner) {
            this.token.inner = this.token.inner.map(function (stx) {
                return stx.mark(newMark);
            });
            return syntaxFromToken(this.token, {
                context: new Mark(newMark, this.context),
                props: this.props
            });
        }
        return syntaxFromToken(this.token, {
            context: new Mark(newMark, this.context),
            props: this.props
        });
    },
    // (CSyntax or [...CSyntax], Str) -> CSyntax
    // non mutating
    rename: function (id, name, defctx, phase) {
        if (// defer renaming of delimiters
            this.token.inner) {
            this.token.inner = this.token.inner.map(function (stx) {
                return stx.rename(id, name, defctx, phase);
            });
            return syntaxFromToken(this.token, {
                context: new Rename(id, name, this.context, defctx, phase),
                props: this.props
            });
        }
        return syntaxFromToken(this.token, {
            context: new Rename(id, name, this.context, defctx, phase),
            props: this.props
        });
    },
    imported: function (id, name, phase) {
        if (this.token.inner) {
            this.token.inner = this.token.inner.map(function (stx) {
                return stx.imported(id, name, phase);
            });
            return syntaxFromToken(this.token, {
                context: new Imported(id, name, this.context, phase),
                props: this.props
            });
        }
        return syntaxFromToken(this.token, {
            context: new Imported(id, name, this.context, phase),
            props: this.props
        });
    },
    addDefCtx: function (defctx) {
        if (this.token.inner) {
            this.token.inner = this.token.inner.map(function (stx) {
                return stx.addDefCtx(defctx);
            });
            return syntaxFromToken(this.token, {
                context: new Def(defctx, this.context),
                props: this.props
            });
        }
        return syntaxFromToken(this.token, {
            context: new Def(defctx, this.context),
            props: this.props
        });
    },
    getDefCtx: function () {
        var ctx = this.context;
        while (ctx !== null) {
            if (ctx instanceof Def) {
                return ctx.defctx;
            }
            ctx = ctx.context;
        }
        return null;
    },
    toString: function () {
        var val = this.token.type === parser.Token.EOF ? 'EOF' : this.token.value;
        return '[Syntax: ' + val + ']';
    },
    clone: function () {
        var newTok = {};
        var keys = Object.keys(this.token);
        for (var i = 0, len = keys.length, key; i < len; i++) {
            key = keys[i];
            if (Array.isArray(this.token[key])) {
                if (key === 'inner') {
                    // need to clone the children of a delimiter
                    newTok[key] = this.token[key].reduce(function (acc, stx) {
                        acc.push(stx.clone());
                        return acc;
                    }, []);
                } else {
                    // don't need to deep copy normal arrays
                    newTok[key] = this.token[key].reduce(function (acc, el) {
                        acc.push(el);
                        return acc;
                    }, []);
                }
            } else {
                newTok[key] = this.token[key];
            }
        }
        return syntaxFromToken(newTok, this);
    },
    isIdentifier: function () {
        return this.token && this.token.type === parser.Token.Identifier;
    },
    isStringLiteral: function () {
        return this.token && this.token.type === parser.Token.StringLiteral;
    },
    isNumericLiteral: function () {
        return this.token && this.token.type === parser.Token.NumericLiteral;
    },
    isBooleanLiteral: function () {
        return this.token && this.token.type === parser.Token.BooleanLiteral;
    },
    isNullLiteral: function () {
        return this.token && this.token.type === parser.Token.NullLiteral;
    },
    isKeyword: function () {
        return this.token && this.token.type === parser.Token.Keyword;
    },
    isPunctuator: function () {
        return this.token && this.token.type === parser.Token.Punctuator;
    },
    isRegularExpression: function () {
        return this.token && this.token.type === parser.Token.RegularExpression;
    },
    isTemplate: function () {
        return this.token && this.token.type === parser.Token.Template;
    },
    isDelimiter: function () {
        return this.token && this.token.type === parser.Token.Delimiter;
    },
    isEOF: function () {
        return this.token && this.token.type === parser.Token.EOF;
    }
};
function syntaxFromToken(token, oldstx) {
    return new Syntax(token, oldstx);
}
function mkSyntax(stx, value, type, inner) {
    if (stx && Array.isArray(stx) && stx.length === 1) {
        stx = stx[0];
    } else if (stx && Array.isArray(stx)) {
        throwSyntaxError('mkSyntax', 'Expecting a syntax object or an array with a single syntax object');
    } else if (stx === undefined) {
        throwSyntaxError('mkSyntax', 'You must provide an old syntax object context (or null) when creating a new syntax object.');
    }
    if (type === parser.Token.Delimiter) {
        var startLineNumber, startLineStart, endLineNumber, endLineStart, startRange, endRange;
        if (!Array.isArray(inner)) {
            throwSyntaxError('mkSyntax', 'Must provide inner array of syntax objects when creating a delimiter');
        }
        if (stx && stx.token.type === parser.Token.Delimiter) {
            startLineNumber = stx.token.startLineNumber;
            startLineStart = stx.token.startLineStart;
            endLineNumber = stx.token.endLineNumber;
            endLineStart = stx.token.endLineStart;
            startRange = stx.token.startRange;
            endRange = stx.token.endRange;
        } else if (stx && stx.token) {
            startLineNumber = stx.token.lineNumber;
            startLineStart = stx.token.lineStart;
            endLineNumber = stx.token.lineNumber;
            endLineStart = stx.token.lineStart;
            startRange = stx.token.range;
            endRange = stx.token.range;
        }
        return syntaxFromToken({
            type: parser.Token.Delimiter,
            value: value,
            inner: inner,
            startLineStart: startLineStart,
            startLineNumber: startLineNumber,
            endLineStart: endLineStart,
            endLineNumber: endLineNumber,
            startRange: startRange,
            endRange: endRange
        }, stx);
    } else {
        var lineStart, lineNumber, range;
        if (stx && stx.token.type === parser.Token.Delimiter) {
            lineStart = stx.token.startLineStart;
            lineNumber = stx.token.startLineNumber;
            range = stx.token.startRange;
        } else if (stx && stx.token) {
            lineStart = stx.token.lineStart;
            lineNumber = stx.token.lineNumber;
            range = stx.token.range;
        }
        return syntaxFromToken({
            type: type,
            value: value,
            lineStart: lineStart,
            lineNumber: lineNumber,
            range: range
        }, stx);
    }
}
function makeValue(val, stx) {
    if (typeof val === 'boolean') {
        return mkSyntax(stx, val ? 'true' : 'false', parser.Token.BooleanLiteral);
    } else if (typeof val === 'number') {
        if (val !== val) {
            return makeDelim('()', [
                makeValue(0, stx),
                makePunc('/', stx),
                makeValue(0, stx)
            ], stx);
        }
        if (val < 0) {
            return makeDelim('()', [
                makePunc('-', stx),
                makeValue(Math.abs(val), stx)
            ], stx);
        } else {
            return mkSyntax(stx, val, parser.Token.NumericLiteral);
        }
    } else if (typeof val === 'string') {
        return mkSyntax(stx, val, parser.Token.StringLiteral);
    } else if (val === null) {
        return mkSyntax(stx, 'null', parser.Token.NullLiteral);
    } else {
        throwSyntaxError('makeValue', 'Cannot make value syntax object from: ' + val);
    }
}
function makeRegex(val, flags, stx) {
    var newstx = mkSyntax(stx, new RegExp(val, flags), parser.Token.RegularExpression);
    // regex tokens need the extra field literal on token
    newstx.token.literal = val;
    return newstx;
}
function makeIdent(val, stx) {
    return mkSyntax(stx, val, parser.Token.Identifier);
}
function makeKeyword(val, stx) {
    return mkSyntax(stx, val, parser.Token.Keyword);
}
function makePunc(val, stx) {
    return mkSyntax(stx, val, parser.Token.Punctuator);
}
function makeDelim(val, inner, stx) {
    return mkSyntax(stx, val, parser.Token.Delimiter, inner);
}
function unwrapSyntax(stx) {
    if (Array.isArray(stx) && stx.length === 1) {
        // pull stx out of single element arrays for convenience
        stx = stx[0];
    }
    if (stx.token) {
        if (stx.token.type === parser.Token.Delimiter) {
            return stx.token;
        } else {
            return stx.token.value;
        }
    } else {
        throw new Error('Not a syntax object: ' + stx);
    }
}
function syntaxToTokens(stx) {
    return _.map(stx, function (stx$2) {
        if (stx$2.token.inner) {
            stx$2.token.inner = syntaxToTokens(stx$2.token.inner);
        }
        return stx$2.token;
    });
}
function tokensToSyntax(tokens) {
    if (!_.isArray(tokens)) {
        tokens = [tokens];
    }
    return _.map(tokens, function (token) {
        if (token.inner) {
            token.inner = tokensToSyntax(token.inner);
        }
        return syntaxFromToken(token);
    });
}
function joinSyntax(tojoin, punc) {
    if (tojoin.length === 0) {
        return [];
    }
    if (punc === ' ') {
        return tojoin;
    }
    return _.reduce(_.rest(tojoin, 1), function (acc, join) {
        acc.push(cloneSyntax(punc), join);
        return acc;
    }, [_.first(tojoin)]);
}
function joinSyntaxArray(tojoin, punc) {
    if (tojoin.length === 0) {
        return [];
    }
    if (punc === ' ') {
        return _.flatten(tojoin, true);
    }
    return _.reduce(_.rest(tojoin, 1), function (acc, join) {
        acc.push(cloneSyntax(punc));
        Array.prototype.push.apply(acc, join);
        return acc;
    }, _.first(tojoin));
}
function cloneSyntax(stx) {
    return syntaxFromToken(_.clone(stx.token), stx);
}
function cloneSyntaxArray(arr) {
    return arr.map(function (stx) {
        var o = cloneSyntax(stx);
        if (o.token.type === parser.Token.Delimiter) {
            o.token.inner = cloneSyntaxArray(o.token.inner);
        }
        return o;
    });
}
function MacroSyntaxError(name, message, stx) {
    this.name = name;
    this.message = message;
    this.stx = stx;
}
function throwSyntaxError(name, message, stx) {
    if (stx && Array.isArray(stx)) {
        stx = stx[0];
    }
    throw new MacroSyntaxError(name, message, stx);
}
function SyntaxCaseError(message) {
    this.message = message;
}
function throwSyntaxCaseError(message) {
    throw new SyntaxCaseError(message);
}
function printSyntaxError(code, err) {
    if (!err.stx) {
        return '[' + err.name + '] ' + err.message;
    }
    var token = err.stx.token;
    var lineNumber = _.find([
        token.sm_startLineNumber,
        token.sm_lineNumber,
        token.startLineNumber,
        token.lineNumber
    ], _.isNumber);
    var lineStart = _.find([
        token.sm_startLineStart,
        token.sm_lineStart,
        token.startLineStart,
        token.lineStart
    ], _.isNumber);
    var start = (token.sm_startRange || token.sm_range || token.startRange || token.range)[0];
    var offset = start - lineStart;
    var line = '';
    var pre = lineNumber + ': ';
    var ch;
    while (ch = code.charAt(lineStart++)) {
        if (ch == '\r' || ch == '\n') {
            break;
        }
        line += ch;
    }
    return '[' + err.name + '] ' + err.message + '\n' + pre + line + '\n' + Array(offset + pre.length).join(' ') + ' ^';
}
function prettyPrint(stxarr, shouldResolve) {
    var indent = 0;
    var unparsedLines = stxarr.reduce(function (acc, stx) {
        var s = shouldResolve ? expander.resolve(stx) : stx.token.value;
        if (// skip the end of file token
            stx.token.type === parser.Token.EOF) {
            return acc;
        }
        if (stx.token.type === parser.Token.StringLiteral) {
            s = '"' + s + '"';
        }
        if (s == '{') {
            acc[0].str += ' ' + s;
            indent++;
            acc.unshift({
                indent: indent,
                str: ''
            });
        } else if (s == '}') {
            indent--;
            acc.unshift({
                indent: indent,
                str: s
            });
            acc.unshift({
                indent: indent,
                str: ''
            });
        } else if (s == ';') {
            acc[0].str += s;
            acc.unshift({
                indent: indent,
                str: ''
            });
        } else {
            acc[0].str += (acc[0].str ? ' ' : '') + s;
        }
        return acc;
    }, [{
            indent: 0,
            str: ''
        }]);
    return unparsedLines.reduce(function (acc, line) {
        var ind = '';
        while (ind.length < line.indent * 2) {
            ind += ' ';
        }
        return ind + line.str + '\n' + acc;
    }, '');
}
function adjustLineContext(stx, original, current) {
    if (// short circuit when the array is empty;
        stx.length === 0) {
        return stx;
    }
    current = current || {
        lastLineNumber: stx[0].token.lineNumber || stx[0].token.startLineNumber,
        lineNumber: original.token.lineNumber
    };
    return _.map(stx, function (stx$2) {
        if (stx$2.isDelimiter()) {
            // handle tokens with missing line info
            stx$2.token.startLineNumber = typeof stx$2.token.startLineNumber == 'undefined' ? original.token.lineNumber : stx$2.token.startLineNumber;
            stx$2.token.endLineNumber = typeof stx$2.token.endLineNumber == 'undefined' ? original.token.lineNumber : stx$2.token.endLineNumber;
            stx$2.token.startLineStart = typeof stx$2.token.startLineStart == 'undefined' ? original.token.lineStart : stx$2.token.startLineStart;
            stx$2.token.endLineStart = typeof stx$2.token.endLineStart == 'undefined' ? original.token.lineStart : stx$2.token.endLineStart;
            stx$2.token.startRange = typeof stx$2.token.startRange == 'undefined' ? original.token.range : stx$2.token.startRange;
            stx$2.token.endRange = typeof stx$2.token.endRange == 'undefined' ? original.token.range : stx$2.token.endRange;
            stx$2.token.sm_startLineNumber = typeof stx$2.token.sm_startLineNumber == 'undefined' ? stx$2.token.startLineNumber : stx$2.token.sm_startLineNumber;
            stx$2.token.sm_endLineNumber = typeof stx$2.token.sm_endLineNumber == 'undefined' ? stx$2.token.endLineNumber : stx$2.token.sm_endLineNumber;
            stx$2.token.sm_startLineStart = typeof stx$2.token.sm_startLineStart == 'undefined' ? stx$2.token.startLineStart : stx$2.token.sm_startLineStart;
            stx$2.token.sm_endLineStart = typeof stx$2.token.sm_endLineStart == 'undefined' ? stx$2.token.endLineStart : stx$2.token.sm_endLineStart;
            stx$2.token.sm_startRange = typeof stx$2.token.sm_startRange == 'undefined' ? stx$2.token.startRange : stx$2.token.sm_startRange;
            stx$2.token.sm_endRange = typeof stx$2.token.sm_endRange == 'undefined' ? stx$2.token.endRange : stx$2.token.sm_endRange;
            if (stx$2.token.startLineNumber !== current.lineNumber) {
                if (stx$2.token.startLineNumber !== current.lastLineNumber) {
                    current.lineNumber++;
                    current.lastLineNumber = stx$2.token.startLineNumber;
                    stx$2.token.startLineNumber = current.lineNumber;
                } else {
                    current.lastLineNumber = stx$2.token.startLineNumber;
                    stx$2.token.startLineNumber = current.lineNumber;
                }
            }
            return stx$2;
        }
        // handle tokens with missing line info
        stx$2.token.lineNumber = typeof stx$2.token.lineNumber == 'undefined' ? original.token.lineNumber : stx$2.token.lineNumber;
        stx$2.token.lineStart = typeof stx$2.token.lineStart == 'undefined' ? original.token.lineStart : stx$2.token.lineStart;
        stx$2.token.range = typeof stx$2.token.range == 'undefined' ? original.token.range : stx$2.token.range;
        // Only set the sourcemap line info once. Necessary because a single
        // syntax object can go through expansion multiple times. If at some point
        // we want to write an expansion stepper this might be a good place to store
        // intermediate expansion line info (ie push to a stack instead of
        // just write once).
        stx$2.token.sm_lineNumber = typeof stx$2.token.sm_lineNumber == 'undefined' ? stx$2.token.lineNumber : stx$2.token.sm_lineNumber;
        stx$2.token.sm_lineStart = typeof stx$2.token.sm_lineStart == 'undefined' ? stx$2.token.lineStart : stx$2.token.sm_lineStart;
        stx$2.token.sm_range = typeof stx$2.token.sm_range == 'undefined' ? stx$2.token.range.slice() : stx$2.token.sm_range;
        if (// move the line info to line up with the macro name
            // (line info starting from the macro name)
            stx$2.token.lineNumber !== current.lineNumber) {
            if (stx$2.token.lineNumber !== current.lastLineNumber) {
                current.lineNumber++;
                current.lastLineNumber = stx$2.token.lineNumber;
                stx$2.token.lineNumber = current.lineNumber;
            } else {
                current.lastLineNumber = stx$2.token.lineNumber;
                stx$2.token.lineNumber = current.lineNumber;
            }
        }
        return stx$2;
    });
}
exports.unwrapSyntax = unwrapSyntax;
exports.makeDelim = makeDelim;
exports.makePunc = makePunc;
exports.makeKeyword = makeKeyword;
exports.makeIdent = makeIdent;
exports.makeRegex = makeRegex;
exports.makeValue = makeValue;
exports.Rename = Rename;
exports.Mark = Mark;
exports.Def = Def;
exports.Imported = Imported;
exports.syntaxFromToken = syntaxFromToken;
exports.tokensToSyntax = tokensToSyntax;
exports.syntaxToTokens = syntaxToTokens;
exports.isSyntax = function (obj) {
    obj = Array.isArray(obj) ? obj[0] : obj;
    return obj instanceof Syntax;
};
exports.joinSyntax = joinSyntax;
exports.joinSyntaxArray = joinSyntaxArray;
exports.cloneSyntax = cloneSyntax;
exports.cloneSyntaxArray = cloneSyntaxArray;
exports.prettyPrint = prettyPrint;
exports.MacroSyntaxError = MacroSyntaxError;
exports.throwSyntaxError = throwSyntaxError;
exports.SyntaxCaseError = SyntaxCaseError;
exports.throwSyntaxCaseError = throwSyntaxCaseError;
exports.printSyntaxError = printSyntaxError;
exports.adjustLineContext = adjustLineContext;
exports.fresh = fresh;
},{"./expander":6,"./parser":10,"assert":26,"underscore":50}],16:[function(require,module,exports){
(function (global){
/*
  Copyright (C) 2012-2014 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2014 Ivan Nikulin <ifaaan@gmail.com>
  Copyright (C) 2012-2013 Michael Ficarra <escodegen.copyright@michael.ficarra.me>
  Copyright (C) 2012-2013 Mathias Bynens <mathias@qiwi.be>
  Copyright (C) 2013 Irakli Gozalishvili <rfobic@gmail.com>
  Copyright (C) 2012 Robert Gust-Bardon <donate@robert.gust-bardon.org>
  Copyright (C) 2012 John Freeman <jfreeman08@gmail.com>
  Copyright (C) 2011-2012 Ariya Hidayat <ariya.hidayat@gmail.com>
  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/*global exports:true, require:true, global:true*/
(function () {
    'use strict';

    var Syntax,
        Precedence,
        BinaryPrecedence,
        SourceNode,
        estraverse,
        esutils,
        isArray,
        base,
        indent,
        json,
        renumber,
        hexadecimal,
        quotes,
        escapeless,
        newline,
        space,
        parentheses,
        semicolons,
        safeConcatenation,
        directive,
        extra,
        parse,
        sourceMap,
        FORMAT_MINIFY,
        FORMAT_DEFAULTS;

    estraverse = require('estraverse');
    esutils = require('esutils');

    Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        ArrayPattern: 'ArrayPattern',
        ArrowFunctionExpression: 'ArrowFunctionExpression',
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ClassBody: 'ClassBody',
        ClassDeclaration: 'ClassDeclaration',
        ClassExpression: 'ClassExpression',
        ComprehensionBlock: 'ComprehensionBlock',
        ComprehensionExpression: 'ComprehensionExpression',
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DirectiveStatement: 'DirectiveStatement',
        DoWhileStatement: 'DoWhileStatement',
        DebuggerStatement: 'DebuggerStatement',
        EmptyStatement: 'EmptyStatement',
        ExportBatchSpecifier: 'ExportBatchSpecifier',
        ExportDeclaration: 'ExportDeclaration',
        ExportSpecifier: 'ExportSpecifier',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        ForOfStatement: 'ForOfStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        GeneratorExpression: 'GeneratorExpression',
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        ImportDeclaration: 'ImportDeclaration',
        ImportDefaultSpecifier: 'ImportDefaultSpecifier',
        ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
        ImportSpecifier: 'ImportSpecifier',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        MethodDefinition: 'MethodDefinition',
        ModuleSpecifier: 'ModuleSpecifier',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        ObjectPattern: 'ObjectPattern',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SpreadElement: 'SpreadElement',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        TaggedTemplateExpression: 'TaggedTemplateExpression',
        TemplateElement: 'TemplateElement',
        TemplateLiteral: 'TemplateLiteral',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement',
        YieldExpression: 'YieldExpression'
    };

    // Generation is done by generateExpression.
    function isExpression(node) {
        return CodeGenerator.Expression.hasOwnProperty(node.type);
    }

    // Generation is done by generateStatement.
    function isStatement(node) {
        return CodeGenerator.Statement.hasOwnProperty(node.type);
    }

    Precedence = {
        Sequence: 0,
        Yield: 1,
        Assignment: 1,
        Conditional: 2,
        ArrowFunction: 2,
        LogicalOR: 3,
        LogicalAND: 4,
        BitwiseOR: 5,
        BitwiseXOR: 6,
        BitwiseAND: 7,
        Equality: 8,
        Relational: 9,
        BitwiseSHIFT: 10,
        Additive: 11,
        Multiplicative: 12,
        Unary: 13,
        Postfix: 14,
        Call: 15,
        New: 16,
        TaggedTemplate: 17,
        Member: 18,
        Primary: 19
    };

    BinaryPrecedence = {
        '||': Precedence.LogicalOR,
        '&&': Precedence.LogicalAND,
        '|': Precedence.BitwiseOR,
        '^': Precedence.BitwiseXOR,
        '&': Precedence.BitwiseAND,
        '==': Precedence.Equality,
        '!=': Precedence.Equality,
        '===': Precedence.Equality,
        '!==': Precedence.Equality,
        'is': Precedence.Equality,
        'isnt': Precedence.Equality,
        '<': Precedence.Relational,
        '>': Precedence.Relational,
        '<=': Precedence.Relational,
        '>=': Precedence.Relational,
        'in': Precedence.Relational,
        'instanceof': Precedence.Relational,
        '<<': Precedence.BitwiseSHIFT,
        '>>': Precedence.BitwiseSHIFT,
        '>>>': Precedence.BitwiseSHIFT,
        '+': Precedence.Additive,
        '-': Precedence.Additive,
        '*': Precedence.Multiplicative,
        '%': Precedence.Multiplicative,
        '/': Precedence.Multiplicative
    };

    //Flags
    var F_ALLOW_IN = 1,
        F_ALLOW_CALL = 1 << 1,
        F_ALLOW_UNPARATH_NEW = 1 << 2,
        F_FUNC_BODY = 1 << 3,
        F_DIRECTIVE_CTX = 1 << 4,
        F_SEMICOLON_OPT = 1 << 5;

    //Expression flag sets
    //NOTE: Flag order:
    // F_ALLOW_IN
    // F_ALLOW_CALL
    // F_ALLOW_UNPARATH_NEW
    var E_FTT = F_ALLOW_CALL | F_ALLOW_UNPARATH_NEW,
        E_TTF = F_ALLOW_IN | F_ALLOW_CALL,
        E_TTT = F_ALLOW_IN | F_ALLOW_CALL | F_ALLOW_UNPARATH_NEW,
        E_TFF = F_ALLOW_IN,
        E_FFT = F_ALLOW_UNPARATH_NEW,
        E_TFT = F_ALLOW_IN | F_ALLOW_UNPARATH_NEW;

    //Statement flag sets
    //NOTE: Flag order:
    // F_ALLOW_IN
    // F_FUNC_BODY
    // F_DIRECTIVE_CTX
    // F_SEMICOLON_OPT
    var S_TFFF = F_ALLOW_IN,
        S_TFFT = F_ALLOW_IN | F_SEMICOLON_OPT,
        S_FFFF = 0x00,
        S_TFTF = F_ALLOW_IN | F_DIRECTIVE_CTX,
        S_TTFF = F_ALLOW_IN | F_FUNC_BODY;

    function getDefaultOptions() {
        // default options
        return {
            indent: null,
            base: null,
            parse: null,
            comment: false,
            format: {
                indent: {
                    style: '    ',
                    base: 0,
                    adjustMultilineComment: false
                },
                newline: '\n',
                space: ' ',
                json: false,
                renumber: false,
                hexadecimal: false,
                quotes: 'single',
                escapeless: false,
                compact: false,
                parentheses: true,
                semicolons: true,
                safeConcatenation: false
            },
            moz: {
                comprehensionExpressionStartsWithAssignment: false,
                starlessGenerator: false
            },
            sourceMap: null,
            sourceMapRoot: null,
            sourceMapWithCode: false,
            directive: false,
            raw: true,
            verbatim: null
        };
    }

    function stringRepeat(str, num) {
        var result = '';

        for (num |= 0; num > 0; num >>>= 1, str += str) {
            if (num & 1) {
                result += str;
            }
        }

        return result;
    }

    isArray = Array.isArray;
    if (!isArray) {
        isArray = function isArray(array) {
            return Object.prototype.toString.call(array) === '[object Array]';
        };
    }

    function hasLineTerminator(str) {
        return (/[\r\n]/g).test(str);
    }

    function endsWithLineTerminator(str) {
        var len = str.length;
        return len && esutils.code.isLineTerminator(str.charCodeAt(len - 1));
    }

    function merge(target, override) {
        var key;
        for (key in override) {
            if (override.hasOwnProperty(key)) {
                target[key] = override[key];
            }
        }
        return target;
    }

    function updateDeeply(target, override) {
        var key, val;

        function isHashObject(target) {
            return typeof target === 'object' && target instanceof Object && !(target instanceof RegExp);
        }

        for (key in override) {
            if (override.hasOwnProperty(key)) {
                val = override[key];
                if (isHashObject(val)) {
                    if (isHashObject(target[key])) {
                        updateDeeply(target[key], val);
                    } else {
                        target[key] = updateDeeply({}, val);
                    }
                } else {
                    target[key] = val;
                }
            }
        }
        return target;
    }

    function generateNumber(value) {
        var result, point, temp, exponent, pos;

        if (value !== value) {
            throw new Error('Numeric literal whose value is NaN');
        }
        if (value < 0 || (value === 0 && 1 / value < 0)) {
            throw new Error('Numeric literal whose value is negative');
        }

        if (value === 1 / 0) {
            return json ? 'null' : renumber ? '1e400' : '1e+400';
        }

        result = '' + value;
        if (!renumber || result.length < 3) {
            return result;
        }

        point = result.indexOf('.');
        if (!json && result.charCodeAt(0) === 0x30  /* 0 */ && point === 1) {
            point = 0;
            result = result.slice(1);
        }
        temp = result;
        result = result.replace('e+', 'e');
        exponent = 0;
        if ((pos = temp.indexOf('e')) > 0) {
            exponent = +temp.slice(pos + 1);
            temp = temp.slice(0, pos);
        }
        if (point >= 0) {
            exponent -= temp.length - point - 1;
            temp = +(temp.slice(0, point) + temp.slice(point + 1)) + '';
        }
        pos = 0;
        while (temp.charCodeAt(temp.length + pos - 1) === 0x30  /* 0 */) {
            --pos;
        }
        if (pos !== 0) {
            exponent -= pos;
            temp = temp.slice(0, pos);
        }
        if (exponent !== 0) {
            temp += 'e' + exponent;
        }
        if ((temp.length < result.length ||
                    (hexadecimal && value > 1e12 && Math.floor(value) === value && (temp = '0x' + value.toString(16)).length < result.length)) &&
                +temp === value) {
            result = temp;
        }

        return result;
    }

    // Generate valid RegExp expression.
    // This function is based on https://github.com/Constellation/iv Engine

    function escapeRegExpCharacter(ch, previousIsBackslash) {
        // not handling '\' and handling \u2028 or \u2029 to unicode escape sequence
        if ((ch & ~1) === 0x2028) {
            return (previousIsBackslash ? 'u' : '\\u') + ((ch === 0x2028) ? '2028' : '2029');
        } else if (ch === 10 || ch === 13) {  // \n, \r
            return (previousIsBackslash ? '' : '\\') + ((ch === 10) ? 'n' : 'r');
        }
        return String.fromCharCode(ch);
    }

    function generateRegExp(reg) {
        var match, result, flags, i, iz, ch, characterInBrack, previousIsBackslash;

        result = reg.toString();

        if (reg.source) {
            // extract flag from toString result
            match = result.match(/\/([^/]*)$/);
            if (!match) {
                return result;
            }

            flags = match[1];
            result = '';

            characterInBrack = false;
            previousIsBackslash = false;
            for (i = 0, iz = reg.source.length; i < iz; ++i) {
                ch = reg.source.charCodeAt(i);

                if (!previousIsBackslash) {
                    if (characterInBrack) {
                        if (ch === 93) {  // ]
                            characterInBrack = false;
                        }
                    } else {
                        if (ch === 47) {  // /
                            result += '\\';
                        } else if (ch === 91) {  // [
                            characterInBrack = true;
                        }
                    }
                    result += escapeRegExpCharacter(ch, previousIsBackslash);
                    previousIsBackslash = ch === 92;  // \
                } else {
                    // if new RegExp("\\\n') is provided, create /\n/
                    result += escapeRegExpCharacter(ch, previousIsBackslash);
                    // prevent like /\\[/]/
                    previousIsBackslash = false;
                }
            }

            return '/' + result + '/' + flags;
        }

        return result;
    }

    function escapeAllowedCharacter(code, next) {
        var hex;

        if (code === 0x08  /* \b */) {
            return '\\b';
        }

        if (code === 0x0C  /* \f */) {
            return '\\f';
        }

        if (code === 0x09  /* \t */) {
            return '\\t';
        }

        hex = code.toString(16).toUpperCase();
        if (json || code > 0xFF) {
            return '\\u' + '0000'.slice(hex.length) + hex;
        } else if (code === 0x0000 && !esutils.code.isDecimalDigit(next)) {
            return '\\0';
        } else if (code === 0x000B  /* \v */) { // '\v'
            return '\\x0B';
        } else {
            return '\\x' + '00'.slice(hex.length) + hex;
        }
    }

    function escapeDisallowedCharacter(code) {
        if (code === 0x5C  /* \ */) {
            return '\\\\';
        }

        if (code === 0x0A  /* \n */) {
            return '\\n';
        }

        if (code === 0x0D  /* \r */) {
            return '\\r';
        }

        if (code === 0x2028) {
            return '\\u2028';
        }

        if (code === 0x2029) {
            return '\\u2029';
        }

        throw new Error('Incorrectly classified character');
    }

    function escapeDirective(str) {
        var i, iz, code, quote;

        quote = quotes === 'double' ? '"' : '\'';
        for (i = 0, iz = str.length; i < iz; ++i) {
            code = str.charCodeAt(i);
            if (code === 0x27  /* ' */) {
                quote = '"';
                break;
            } else if (code === 0x22  /* " */) {
                quote = '\'';
                break;
            } else if (code === 0x5C  /* \ */) {
                ++i;
            }
        }

        return quote + str + quote;
    }

    function escapeString(str) {
        var result = '', i, len, code, singleQuotes = 0, doubleQuotes = 0, single, quote;

        for (i = 0, len = str.length; i < len; ++i) {
            code = str.charCodeAt(i);
            if (code === 0x27  /* ' */) {
                ++singleQuotes;
            } else if (code === 0x22  /* " */) {
                ++doubleQuotes;
            } else if (code === 0x2F  /* / */ && json) {
                result += '\\';
            } else if (esutils.code.isLineTerminator(code) || code === 0x5C  /* \ */) {
                result += escapeDisallowedCharacter(code);
                continue;
            } else if ((json && code < 0x20  /* SP */) || !(json || escapeless || (code >= 0x20  /* SP */ && code <= 0x7E  /* ~ */))) {
                result += escapeAllowedCharacter(code, str.charCodeAt(i + 1));
                continue;
            }
            result += String.fromCharCode(code);
        }

        single = !(quotes === 'double' || (quotes === 'auto' && doubleQuotes < singleQuotes));
        quote = single ? '\'' : '"';

        if (!(single ? singleQuotes : doubleQuotes)) {
            return quote + result + quote;
        }

        str = result;
        result = quote;

        for (i = 0, len = str.length; i < len; ++i) {
            code = str.charCodeAt(i);
            if ((code === 0x27  /* ' */ && single) || (code === 0x22  /* " */ && !single)) {
                result += '\\';
            }
            result += String.fromCharCode(code);
        }

        return result + quote;
    }

    /**
     * flatten an array to a string, where the array can contain
     * either strings or nested arrays
     */
    function flattenToString(arr) {
        var i, iz, elem, result = '';
        for (i = 0, iz = arr.length; i < iz; ++i) {
            elem = arr[i];
            result += isArray(elem) ? flattenToString(elem) : elem;
        }
        return result;
    }

    /**
     * convert generated to a SourceNode when source maps are enabled.
     */
    function toSourceNodeWhenNeeded(generated, node) {
        if (!sourceMap) {
            // with no source maps, generated is either an
            // array or a string.  if an array, flatten it.
            // if a string, just return it
            if (isArray(generated)) {
                return flattenToString(generated);
            } else {
                return generated;
            }
        }
        if (node == null) {
            if (generated instanceof SourceNode) {
                return generated;
            } else {
                node = {};
            }
        }
        if (node.loc == null) {
            return new SourceNode(null, null, sourceMap, generated, node.name || null);
        }
        return new SourceNode(node.loc.start.line, node.loc.start.column, (sourceMap === true ? node.loc.source || null : sourceMap), generated, node.name || null);
    }

    function noEmptySpace() {
        return (space) ? space : ' ';
    }

    function join(left, right) {
        var leftSource,
            rightSource,
            leftCharCode,
            rightCharCode;

        leftSource = toSourceNodeWhenNeeded(left).toString();
        if (leftSource.length === 0) {
            return [right];
        }

        rightSource = toSourceNodeWhenNeeded(right).toString();
        if (rightSource.length === 0) {
            return [left];
        }

        leftCharCode = leftSource.charCodeAt(leftSource.length - 1);
        rightCharCode = rightSource.charCodeAt(0);

        if ((leftCharCode === 0x2B  /* + */ || leftCharCode === 0x2D  /* - */) && leftCharCode === rightCharCode ||
            esutils.code.isIdentifierPart(leftCharCode) && esutils.code.isIdentifierPart(rightCharCode) ||
            leftCharCode === 0x2F  /* / */ && rightCharCode === 0x69  /* i */) { // infix word operators all start with `i`
            return [left, noEmptySpace(), right];
        } else if (esutils.code.isWhiteSpace(leftCharCode) || esutils.code.isLineTerminator(leftCharCode) ||
                esutils.code.isWhiteSpace(rightCharCode) || esutils.code.isLineTerminator(rightCharCode)) {
            return [left, right];
        }
        return [left, space, right];
    }

    function addIndent(stmt) {
        return [base, stmt];
    }

    function withIndent(fn) {
        var previousBase;
        previousBase = base;
        base += indent;
        fn(base);
        base = previousBase;
    }

    function calculateSpaces(str) {
        var i;
        for (i = str.length - 1; i >= 0; --i) {
            if (esutils.code.isLineTerminator(str.charCodeAt(i))) {
                break;
            }
        }
        return (str.length - 1) - i;
    }

    function adjustMultilineComment(value, specialBase) {
        var array, i, len, line, j, spaces, previousBase, sn;

        array = value.split(/\r\n|[\r\n]/);
        spaces = Number.MAX_VALUE;

        // first line doesn't have indentation
        for (i = 1, len = array.length; i < len; ++i) {
            line = array[i];
            j = 0;
            while (j < line.length && esutils.code.isWhiteSpace(line.charCodeAt(j))) {
                ++j;
            }
            if (spaces > j) {
                spaces = j;
            }
        }

        if (typeof specialBase !== 'undefined') {
            // pattern like
            // {
            //   var t = 20;  /*
            //                 * this is comment
            //                 */
            // }
            previousBase = base;
            if (array[1][spaces] === '*') {
                specialBase += ' ';
            }
            base = specialBase;
        } else {
            if (spaces & 1) {
                // /*
                //  *
                //  */
                // If spaces are odd number, above pattern is considered.
                // We waste 1 space.
                --spaces;
            }
            previousBase = base;
        }

        for (i = 1, len = array.length; i < len; ++i) {
            sn = toSourceNodeWhenNeeded(addIndent(array[i].slice(spaces)));
            array[i] = sourceMap ? sn.join('') : sn;
        }

        base = previousBase;

        return array.join('\n');
    }

    function generateComment(comment, specialBase) {
        if (comment.type === 'Line') {
            if (endsWithLineTerminator(comment.value)) {
                return '//' + comment.value;
            } else {
                // Always use LineTerminator
                return '//' + comment.value + '\n';
            }
        }
        if (extra.format.indent.adjustMultilineComment && /[\n\r]/.test(comment.value)) {
            return adjustMultilineComment('/*' + comment.value + '*/', specialBase);
        }
        return '/*' + comment.value + '*/';
    }

    function addComments(stmt, result) {
        var i, len, comment, save, tailingToStatement, specialBase, fragment;

        if (stmt.leadingComments && stmt.leadingComments.length > 0) {
            save = result;

            comment = stmt.leadingComments[0];
            result = [];
            if (safeConcatenation && stmt.type === Syntax.Program && stmt.body.length === 0) {
                result.push('\n');
            }
            result.push(generateComment(comment));
            if (!endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                result.push('\n');
            }

            for (i = 1, len = stmt.leadingComments.length; i < len; ++i) {
                comment = stmt.leadingComments[i];
                fragment = [generateComment(comment)];
                if (!endsWithLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                    fragment.push('\n');
                }
                result.push(addIndent(fragment));
            }

            result.push(addIndent(save));
        }

        if (stmt.trailingComments) {
            tailingToStatement = !endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString());
            specialBase = stringRepeat(' ', calculateSpaces(toSourceNodeWhenNeeded([base, result, indent]).toString()));
            for (i = 0, len = stmt.trailingComments.length; i < len; ++i) {
                comment = stmt.trailingComments[i];
                if (tailingToStatement) {
                    // We assume target like following script
                    //
                    // var t = 20;  /**
                    //               * This is comment of t
                    //               */
                    if (i === 0) {
                        // first case
                        result = [result, indent];
                    } else {
                        result = [result, specialBase];
                    }
                    result.push(generateComment(comment, specialBase));
                } else {
                    result = [result, addIndent(generateComment(comment))];
                }
                if (i !== len - 1 && !endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                    result = [result, '\n'];
                }
            }
        }

        return result;
    }

    function parenthesize(text, current, should) {
        if (current < should) {
            return ['(', text, ')'];
        }
        return text;
    }

    function generateVerbatimString(string) {
        var i, iz, result;
        result = string.split(/\r\n|\n/);
        for (i = 1, iz = result.length; i < iz; i++) {
            result[i] = newline + base + result[i];
        }
        return result;
    }

    function generateVerbatim(expr, precedence) {
        var verbatim, result, prec;
        verbatim = expr[extra.verbatim];

        if (typeof verbatim === 'string') {
            result = parenthesize(generateVerbatimString(verbatim), Precedence.Sequence, precedence);
        } else {
            // verbatim is object
            result = generateVerbatimString(verbatim.content);
            prec = (verbatim.precedence != null) ? verbatim.precedence : Precedence.Sequence;
            result = parenthesize(result, prec, precedence);
        }

        return toSourceNodeWhenNeeded(result, expr);
    }

    function CodeGenerator() {
    }

    // Helpers.

    CodeGenerator.prototype.maybeBlock = function(stmt, flags) {
        var result, noLeadingComment, that = this;

        noLeadingComment = !extra.comment || !stmt.leadingComments;

        if (stmt.type === Syntax.BlockStatement && noLeadingComment) {
            return [space, this.generateStatement(stmt, flags)];
        }

        if (stmt.type === Syntax.EmptyStatement && noLeadingComment) {
            return ';';
        }

        withIndent(function () {
            result = [
                newline,
                addIndent(that.generateStatement(stmt, flags))
            ];
        });

        return result;
    };

    CodeGenerator.prototype.maybeBlockSuffix = function (stmt, result) {
        var ends = endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString());
        if (stmt.type === Syntax.BlockStatement && (!extra.comment || !stmt.leadingComments) && !ends) {
            return [result, space];
        }
        if (ends) {
            return [result, base];
        }
        return [result, newline, base];
    };

    function generateIdentifier(node) {
        return toSourceNodeWhenNeeded(node.name, node);
    }

    CodeGenerator.prototype.generatePattern = function (node, precedence, flags) {
        if (node.type === Syntax.Identifier) {
            return generateIdentifier(node);
        }
        return this.generateExpression(node, precedence, flags);
    };

    CodeGenerator.prototype.generateFunctionParams = function (node) {
        var i, iz, result, hasDefault;

        hasDefault = false;

        if (node.type === Syntax.ArrowFunctionExpression &&
                !node.rest && (!node.defaults || node.defaults.length === 0) &&
                node.params.length === 1 && node.params[0].type === Syntax.Identifier) {
            // arg => { } case
            result = [generateIdentifier(node.params[0])];
        } else {
            result = ['('];
            if (node.defaults) {
                hasDefault = true;
            }
            for (i = 0, iz = node.params.length; i < iz; ++i) {
                if (hasDefault && node.defaults[i]) {
                    // Handle default values.
                    result.push(this.generateAssignment(node.params[i], node.defaults[i], '=', Precedence.Assignment, E_TTT));
                } else {
                    result.push(this.generatePattern(node.params[i], Precedence.Assignment, E_TTT));
                }
                if (i + 1 < iz) {
                    result.push(',' + space);
                }
            }

            if (node.rest) {
                if (node.params.length) {
                    result.push(',' + space);
                }
                result.push('...');
                result.push(generateIdentifier(node.rest));
            }

            result.push(')');
        }

        return result;
    };

    CodeGenerator.prototype.generateFunctionBody = function (node) {
        var result, expr;

        result = this.generateFunctionParams(node);

        if (node.type === Syntax.ArrowFunctionExpression) {
            result.push(space);
            result.push('=>');
        }

        if (node.expression) {
            result.push(space);
            expr = this.generateExpression(node.body, Precedence.Assignment, E_TTT);
            if (expr.toString().charAt(0) === '{') {
                expr = ['(', expr, ')'];
            }
            result.push(expr);
        } else {
            result.push(this.maybeBlock(node.body, S_TTFF));
        }

        return result;
    };

    CodeGenerator.prototype.generateIterationForStatement = function (operator, stmt, flags) {
        var result = ['for' + space + '('], that = this;
        withIndent(function () {
            if (stmt.left.type === Syntax.VariableDeclaration) {
                withIndent(function () {
                    result.push(stmt.left.kind + noEmptySpace());
                    result.push(that.generateStatement(stmt.left.declarations[0], S_FFFF));
                });
            } else {
                result.push(that.generateExpression(stmt.left, Precedence.Call, E_TTT));
            }

            result = join(result, operator);
            result = [join(
                result,
                that.generateExpression(stmt.right, Precedence.Sequence, E_TTT)
            ), ')'];
        });
        result.push(this.maybeBlock(stmt.body, flags));
        return result;
    };

    CodeGenerator.prototype.generatePropertyKey = function (expr, computed) {
        var result = [];

        if (computed) {
            result.push('[');
        }

        result.push(this.generateExpression(expr, Precedence.Sequence, E_TTT));
        if (computed) {
            result.push(']');
        }

        return result;
    };

    CodeGenerator.prototype.generateAssignment = function (left, right, operator, precedence, flags) {
        if (Precedence.Assignment < precedence) {
            flags |= F_ALLOW_IN;
        }

        return parenthesize(
            [
                this.generateExpression(left, Precedence.Call, flags),
                space + operator + space,
                this.generateExpression(right, Precedence.Assignment, flags)
            ],
            Precedence.Assignment,
            precedence
        );
    };

    CodeGenerator.prototype.semicolon = function (flags) {
        if (!semicolons && flags & F_SEMICOLON_OPT) {
            return '';
        }
        return ';';
    };

    // Statements.

    CodeGenerator.Statement = {

        BlockStatement: function (stmt, flags) {
            var result = ['{', newline], that = this;

            withIndent(function () {
                var i, iz, fragment, bodyFlags;
                bodyFlags = S_TFFF;
                if (flags & F_FUNC_BODY) {
                    bodyFlags |= F_DIRECTIVE_CTX;
                }
                for (i = 0, iz = stmt.body.length; i < iz; ++i) {
                    if (i === iz - 1) {
                        bodyFlags |= F_SEMICOLON_OPT;
                    }
                    fragment = addIndent(that.generateStatement(stmt.body[i], bodyFlags));
                    result.push(fragment);
                    if (!endsWithLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                        result.push(newline);
                    }
                }
            });

            result.push(addIndent('}'));
            return result;
        },

        BreakStatement: function (stmt, flags) {
            if (stmt.label) {
                return 'break ' + stmt.label.name + this.semicolon(flags);
            }
            return 'break' + this.semicolon(flags);
        },

        ContinueStatement: function (stmt, flags) {
            if (stmt.label) {
                return 'continue ' + stmt.label.name + this.semicolon(flags);
            }
            return 'continue' + this.semicolon(flags);
        },

        ClassBody: function (stmt, flags) {
            var result = [ '{', newline], that = this;

            withIndent(function (indent) {
                var i, iz;

                for (i = 0, iz = stmt.body.length; i < iz; ++i) {
                    result.push(indent);
                    result.push(that.generateExpression(stmt.body[i], Precedence.Sequence, E_TTT));
                    if (i + 1 < iz) {
                        result.push(newline);
                    }
                }
            });

            if (!endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                result.push(newline);
            }
            result.push(base);
            result.push('}');
            return result;
        },

        ClassDeclaration: function (stmt, flags) {
            var result, fragment;
            result  = ['class ' + stmt.id.name];
            if (stmt.superClass) {
                fragment = join('extends', this.generateExpression(stmt.superClass, Precedence.Assignment, E_TTT));
                result = join(result, fragment);
            }
            result.push(space);
            result.push(this.generateStatement(stmt.body, S_TFFT));
            return result;
        },

        DirectiveStatement: function (stmt, flags) {
            if (extra.raw && stmt.raw) {
                return stmt.raw + this.semicolon(flags);
            }
            return escapeDirective(stmt.directive) + this.semicolon(flags);
        },

        DoWhileStatement: function (stmt, flags) {
            // Because `do 42 while (cond)` is Syntax Error. We need semicolon.
            var result = join('do', this.maybeBlock(stmt.body, S_TFFF));
            result = this.maybeBlockSuffix(stmt.body, result);
            return join(result, [
                'while' + space + '(',
                this.generateExpression(stmt.test, Precedence.Sequence, E_TTT),
                ')' + this.semicolon(flags)
            ]);
        },

        CatchClause: function (stmt, flags) {
            var result, that = this;
            withIndent(function () {
                var guard;

                result = [
                    'catch' + space + '(',
                    that.generateExpression(stmt.param, Precedence.Sequence, E_TTT),
                    ')'
                ];

                if (stmt.guard) {
                    guard = that.generateExpression(stmt.guard, Precedence.Sequence, E_TTT);
                    result.splice(2, 0, ' if ', guard);
                }
            });
            result.push(this.maybeBlock(stmt.body, S_TFFF));
            return result;
        },

        DebuggerStatement: function (stmt, flags) {
            return 'debugger' + this.semicolon(flags);
        },

        EmptyStatement: function (stmt, flags) {
            return ';';
        },

        ExportDeclaration: function (stmt, flags) {
            var result = [ 'export' ], bodyFlags, that = this;

            bodyFlags = (flags & F_SEMICOLON_OPT) ? S_TFFT : S_TFFF;

            // export default HoistableDeclaration[Default]
            // export default AssignmentExpression[In] ;
            if (stmt['default']) {
                result = join(result, 'default');
                if (isStatement(stmt.declaration)) {
                    result = join(result, this.generateStatement(stmt.declaration, bodyFlags));
                } else {
                    result = join(result, this.generateExpression(stmt.declaration, Precedence.Assignment, E_TTT) + this.semicolon(flags));
                }
                return result;
            }

            // export VariableStatement
            // export Declaration[Default]
            if (stmt.declaration) {
                return join(result, this.generateStatement(stmt.declaration, bodyFlags));
            }

            // export * FromClause ;
            // export ExportClause[NoReference] FromClause ;
            // export ExportClause ;
            if (stmt.specifiers) {
                if (stmt.specifiers.length === 0) {
                    result = join(result, '{' + space + '}');
                } else if (stmt.specifiers[0].type === Syntax.ExportBatchSpecifier) {
                    result = join(result, this.generateExpression(stmt.specifiers[0], Precedence.Sequence, E_TTT));
                } else {
                    result = join(result, '{');
                    withIndent(function (indent) {
                        var i, iz;
                        result.push(newline);
                        for (i = 0, iz = stmt.specifiers.length; i < iz; ++i) {
                            result.push(indent);
                            result.push(that.generateExpression(stmt.specifiers[i], Precedence.Sequence, E_TTT));
                            if (i + 1 < iz) {
                                result.push(',' + newline);
                            }
                        }
                    });
                    if (!endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                        result.push(newline);
                    }
                    result.push(base + '}');
                }

                if (stmt.source) {
                    result = join(result, [
                        'from' + space,
                        // ModuleSpecifier
                        this.generateExpression(stmt.source, Precedence.Sequence, E_TTT),
                        this.semicolon(flags)
                    ]);
                } else {
                    result.push(this.semicolon(flags));
                }
            }
            return result;
        },

        ExpressionStatement: function (stmt, flags) {
            var result, fragment;

            result = [this.generateExpression(stmt.expression, Precedence.Sequence, E_TTT)];
            // 12.4 '{', 'function', 'class' is not allowed in this position.
            // wrap expression with parentheses
            fragment = toSourceNodeWhenNeeded(result).toString();
            if (fragment.charAt(0) === '{' ||  // ObjectExpression
                    (fragment.slice(0, 5) === 'class' && ' {'.indexOf(fragment.charAt(5)) >= 0) ||  // class
                    (fragment.slice(0, 8) === 'function' && '* ('.indexOf(fragment.charAt(8)) >= 0) ||  // function or generator
                    (directive && (flags & F_DIRECTIVE_CTX) && stmt.expression.type === Syntax.Literal && typeof stmt.expression.value === 'string')) {
                result = ['(', result, ')' + this.semicolon(flags)];
            } else {
                result.push(this.semicolon(flags));
            }
            return result;
        },

        ImportDeclaration: function (stmt, flags) {
            // ES6: 15.2.1 valid import declarations:
            //     - import ImportClause FromClause ;
            //     - import ModuleSpecifier ;
            var result, cursor, that = this;

            // If no ImportClause is present,
            // this should be `import ModuleSpecifier` so skip `from`
            // ModuleSpecifier is StringLiteral.
            if (stmt.specifiers.length === 0) {
                // import ModuleSpecifier ;
                return [
                    'import',
                    space,
                    // ModuleSpecifier
                    this.generateExpression(stmt.source, Precedence.Sequence, E_TTT),
                    this.semicolon(flags)
                ];
            }

            // import ImportClause FromClause ;
            result = [
                'import'
            ];
            cursor = 0;

            // ImportedBinding
            if (stmt.specifiers[cursor].type === Syntax.ImportDefaultSpecifier) {
                result = join(result, [
                        this.generateExpression(stmt.specifiers[cursor], Precedence.Sequence, E_TTT)
                ]);
                ++cursor;
            }

            if (stmt.specifiers[cursor]) {
                if (cursor !== 0) {
                    result.push(',');
                }

                if (stmt.specifiers[cursor].type === Syntax.ImportNamespaceSpecifier) {
                    // NameSpaceImport
                    result = join(result, [
                            space,
                            this.generateExpression(stmt.specifiers[cursor], Precedence.Sequence, E_TTT)
                    ]);
                } else {
                    // NamedImports
                    result.push(space + '{');

                    if ((stmt.specifiers.length - cursor) === 1) {
                        // import { ... } from "...";
                        result.push(space);
                        result.push(this.generateExpression(stmt.specifiers[cursor], Precedence.Sequence, E_TTT));
                        result.push(space + '}' + space);
                    } else {
                        // import {
                        //    ...,
                        //    ...,
                        // } from "...";
                        withIndent(function (indent) {
                            var i, iz;
                            result.push(newline);
                            for (i = cursor, iz = stmt.specifiers.length; i < iz; ++i) {
                                result.push(indent);
                                result.push(that.generateExpression(stmt.specifiers[i], Precedence.Sequence, E_TTT));
                                if (i + 1 < iz) {
                                    result.push(',' + newline);
                                }
                            }
                        });
                        if (!endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                            result.push(newline);
                        }
                        result.push(base + '}' + space);
                    }
                }
            }

            result = join(result, [
                'from' + space,
                // ModuleSpecifier
                this.generateExpression(stmt.source, Precedence.Sequence, E_TTT),
                this.semicolon(flags)
            ]);
            return result;
        },

        VariableDeclarator: function (stmt, flags) {
            var itemFlags = (flags & F_ALLOW_IN) ? E_TTT : E_FTT;
            if (stmt.init) {
                return [
                    this.generateExpression(stmt.id, Precedence.Assignment, itemFlags),
                    space,
                    '=',
                    space,
                    this.generateExpression(stmt.init, Precedence.Assignment, itemFlags)
                ];
            }
            return this.generatePattern(stmt.id, Precedence.Assignment, itemFlags);
        },

        VariableDeclaration: function (stmt, flags) {
            // VariableDeclarator is typed as Statement,
            // but joined with comma (not LineTerminator).
            // So if comment is attached to target node, we should specialize.
            var result, i, iz, node, bodyFlags, that = this;

            result = [ stmt.kind ];

            bodyFlags = (flags & F_ALLOW_IN) ? S_TFFF : S_FFFF;

            function block() {
                node = stmt.declarations[0];
                if (extra.comment && node.leadingComments) {
                    result.push('\n');
                    result.push(addIndent(that.generateStatement(node, bodyFlags)));
                } else {
                    result.push(noEmptySpace());
                    result.push(that.generateStatement(node, bodyFlags));
                }

                for (i = 1, iz = stmt.declarations.length; i < iz; ++i) {
                    node = stmt.declarations[i];
                    if (extra.comment && node.leadingComments) {
                        result.push(',' + newline);
                        result.push(addIndent(that.generateStatement(node, bodyFlags)));
                    } else {
                        result.push(',' + space);
                        result.push(that.generateStatement(node, bodyFlags));
                    }
                }
            }

            if (stmt.declarations.length > 1) {
                withIndent(block);
            } else {
                block();
            }

            result.push(this.semicolon(flags));

            return result;
        },

        ThrowStatement: function (stmt, flags) {
            return [join(
                'throw',
                this.generateExpression(stmt.argument, Precedence.Sequence, E_TTT)
            ), this.semicolon(flags)];
        },

        TryStatement: function (stmt, flags) {
            var result, i, iz, guardedHandlers;

            result = ['try', this.maybeBlock(stmt.block, S_TFFF)];
            result = this.maybeBlockSuffix(stmt.block, result);

            if (stmt.handlers) {
                // old interface
                for (i = 0, iz = stmt.handlers.length; i < iz; ++i) {
                    result = join(result, this.generateStatement(stmt.handlers[i], S_TFFF));
                    if (stmt.finalizer || i + 1 !== iz) {
                        result = this.maybeBlockSuffix(stmt.handlers[i].body, result);
                    }
                }
            } else {
                guardedHandlers = stmt.guardedHandlers || [];

                for (i = 0, iz = guardedHandlers.length; i < iz; ++i) {
                    result = join(result, this.generateStatement(guardedHandlers[i], S_TFFF));
                    if (stmt.finalizer || i + 1 !== iz) {
                        result = this.maybeBlockSuffix(guardedHandlers[i].body, result);
                    }
                }

                // new interface
                if (stmt.handler) {
                    if (isArray(stmt.handler)) {
                        for (i = 0, iz = stmt.handler.length; i < iz; ++i) {
                            result = join(result, this.generateStatement(stmt.handler[i], S_TFFF));
                            if (stmt.finalizer || i + 1 !== iz) {
                                result = this.maybeBlockSuffix(stmt.handler[i].body, result);
                            }
                        }
                    } else {
                        result = join(result, this.generateStatement(stmt.handler, S_TFFF));
                        if (stmt.finalizer) {
                            result = this.maybeBlockSuffix(stmt.handler.body, result);
                        }
                    }
                }
            }
            if (stmt.finalizer) {
                result = join(result, ['finally', this.maybeBlock(stmt.finalizer, S_TFFF)]);
            }
            return result;
        },

        SwitchStatement: function (stmt, flags) {
            var result, fragment, i, iz, bodyFlags, that = this;
            withIndent(function () {
                result = [
                    'switch' + space + '(',
                    that.generateExpression(stmt.discriminant, Precedence.Sequence, E_TTT),
                    ')' + space + '{' + newline
                ];
            });
            if (stmt.cases) {
                bodyFlags = S_TFFF;
                for (i = 0, iz = stmt.cases.length; i < iz; ++i) {
                    if (i === iz - 1) {
                        bodyFlags |= F_SEMICOLON_OPT;
                    }
                    fragment = addIndent(this.generateStatement(stmt.cases[i], bodyFlags));
                    result.push(fragment);
                    if (!endsWithLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                        result.push(newline);
                    }
                }
            }
            result.push(addIndent('}'));
            return result;
        },

        SwitchCase: function (stmt, flags) {
            var result, fragment, i, iz, bodyFlags, that = this;
            withIndent(function () {
                if (stmt.test) {
                    result = [
                        join('case', that.generateExpression(stmt.test, Precedence.Sequence, E_TTT)),
                        ':'
                    ];
                } else {
                    result = ['default:'];
                }

                i = 0;
                iz = stmt.consequent.length;
                if (iz && stmt.consequent[0].type === Syntax.BlockStatement) {
                    fragment = that.maybeBlock(stmt.consequent[0], S_TFFF);
                    result.push(fragment);
                    i = 1;
                }

                if (i !== iz && !endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                    result.push(newline);
                }

                bodyFlags = S_TFFF;
                for (; i < iz; ++i) {
                    if (i === iz - 1 && flags & F_SEMICOLON_OPT) {
                        bodyFlags |= F_SEMICOLON_OPT;
                    }
                    fragment = addIndent(that.generateStatement(stmt.consequent[i], bodyFlags));
                    result.push(fragment);
                    if (i + 1 !== iz && !endsWithLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                        result.push(newline);
                    }
                }
            });
            return result;
        },

        IfStatement: function (stmt, flags) {
            var result, bodyFlags, semicolonOptional, that = this;
            withIndent(function () {
                result = [
                    'if' + space + '(',
                    that.generateExpression(stmt.test, Precedence.Sequence, E_TTT),
                    ')'
                ];
            });
            semicolonOptional = flags & F_SEMICOLON_OPT;
            bodyFlags = S_TFFF;
            if (semicolonOptional) {
                bodyFlags |= F_SEMICOLON_OPT;
            }
            if (stmt.alternate) {
                result.push(this.maybeBlock(stmt.consequent, S_TFFF));
                result = this.maybeBlockSuffix(stmt.consequent, result);
                if (stmt.alternate.type === Syntax.IfStatement) {
                    result = join(result, ['else ', this.generateStatement(stmt.alternate, bodyFlags)]);
                } else {
                    result = join(result, join('else', this.maybeBlock(stmt.alternate, bodyFlags)));
                }
            } else {
                result.push(this.maybeBlock(stmt.consequent, bodyFlags));
            }
            return result;
        },

        ForStatement: function (stmt, flags) {
            var result, that = this;
            withIndent(function () {
                result = ['for' + space + '('];
                if (stmt.init) {
                    if (stmt.init.type === Syntax.VariableDeclaration) {
                        result.push(that.generateStatement(stmt.init, S_FFFF));
                    } else {
                        // F_ALLOW_IN becomes false.
                        result.push(that.generateExpression(stmt.init, Precedence.Sequence, E_FTT));
                        result.push(';');
                    }
                } else {
                    result.push(';');
                }

                if (stmt.test) {
                    result.push(space);
                    result.push(that.generateExpression(stmt.test, Precedence.Sequence, E_TTT));
                    result.push(';');
                } else {
                    result.push(';');
                }

                if (stmt.update) {
                    result.push(space);
                    result.push(that.generateExpression(stmt.update, Precedence.Sequence, E_TTT));
                    result.push(')');
                } else {
                    result.push(')');
                }
            });

            result.push(this.maybeBlock(stmt.body, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF));
            return result;
        },

        ForInStatement: function (stmt, flags) {
            return this.generateIterationForStatement('in', stmt, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF);
        },

        ForOfStatement: function (stmt, flags) {
            return this.generateIterationForStatement('of', stmt, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF);
        },

        LabeledStatement: function (stmt, flags) {
            return [stmt.label.name + ':', this.maybeBlock(stmt.body, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF)];
        },

        Program: function (stmt, flags) {
            var result, fragment, i, iz, bodyFlags;
            iz = stmt.body.length;
            result = [safeConcatenation && iz > 0 ? '\n' : ''];
            bodyFlags = S_TFTF;
            for (i = 0; i < iz; ++i) {
                if (!safeConcatenation && i === iz - 1) {
                    bodyFlags |= F_SEMICOLON_OPT;
                }
                fragment = addIndent(this.generateStatement(stmt.body[i], bodyFlags));
                result.push(fragment);
                if (i + 1 < iz && !endsWithLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                    result.push(newline);
                }
            }
            return result;
        },

        FunctionDeclaration: function (stmt, flags) {
            var isGenerator = stmt.generator && !extra.moz.starlessGenerator;
            return [
                (isGenerator ? 'function*' : 'function'),
                (isGenerator ? space : noEmptySpace()),
                generateIdentifier(stmt.id),
                this.generateFunctionBody(stmt)
            ];
        },

        ReturnStatement: function (stmt, flags) {
            if (stmt.argument) {
                return [join(
                    'return',
                    this.generateExpression(stmt.argument, Precedence.Sequence, E_TTT)
                ), this.semicolon(flags)];
            }
            return ['return' + this.semicolon(flags)];
        },

        WhileStatement: function (stmt, flags) {
            var result, that = this;
            withIndent(function () {
                result = [
                    'while' + space + '(',
                    that.generateExpression(stmt.test, Precedence.Sequence, E_TTT),
                    ')'
                ];
            });
            result.push(this.maybeBlock(stmt.body, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF));
            return result;
        },

        WithStatement: function (stmt, flags) {
            var result, that = this;
            withIndent(function () {
                result = [
                    'with' + space + '(',
                    that.generateExpression(stmt.object, Precedence.Sequence, E_TTT),
                    ')'
                ];
            });
            result.push(this.maybeBlock(stmt.body, flags & F_SEMICOLON_OPT ? S_TFFT : S_TFFF));
            return result;
        }

    };

    merge(CodeGenerator.prototype, CodeGenerator.Statement);

    // Expressions.

    CodeGenerator.Expression = {

        SequenceExpression: function (expr, precedence, flags) {
            var result, i, iz;
            if (Precedence.Sequence < precedence) {
                flags |= F_ALLOW_IN;
            }
            result = [];
            for (i = 0, iz = expr.expressions.length; i < iz; ++i) {
                result.push(this.generateExpression(expr.expressions[i], Precedence.Assignment, flags));
                if (i + 1 < iz) {
                    result.push(',' + space);
                }
            }
            return parenthesize(result, Precedence.Sequence, precedence);
        },

        AssignmentExpression: function (expr, precedence, flags) {
            return this.generateAssignment(expr.left, expr.right, expr.operator, precedence, flags);
        },

        ArrowFunctionExpression: function (expr, precedence, flags) {
            return parenthesize(this.generateFunctionBody(expr), Precedence.ArrowFunction, precedence);
        },

        ConditionalExpression: function (expr, precedence, flags) {
            if (Precedence.Conditional < precedence) {
                flags |= F_ALLOW_IN;
            }
            return parenthesize(
                [
                    this.generateExpression(expr.test, Precedence.LogicalOR, flags),
                    space + '?' + space,
                    this.generateExpression(expr.consequent, Precedence.Assignment, flags),
                    space + ':' + space,
                    this.generateExpression(expr.alternate, Precedence.Assignment, flags)
                ],
                Precedence.Conditional,
                precedence
            );
        },

        LogicalExpression: function (expr, precedence, flags) {
            return this.BinaryExpression(expr, precedence, flags);
        },

        BinaryExpression: function (expr, precedence, flags) {
            var result, currentPrecedence, fragment, leftSource;
            currentPrecedence = BinaryPrecedence[expr.operator];

            if (currentPrecedence < precedence) {
                flags |= F_ALLOW_IN;
            }

            fragment = this.generateExpression(expr.left, currentPrecedence, flags);

            leftSource = fragment.toString();

            if (leftSource.charCodeAt(leftSource.length - 1) === 0x2F /* / */ && esutils.code.isIdentifierPart(expr.operator.charCodeAt(0))) {
                result = [fragment, noEmptySpace(), expr.operator];
            } else {
                result = join(fragment, expr.operator);
            }

            fragment = this.generateExpression(expr.right, currentPrecedence + 1, flags);

            if (expr.operator === '/' && fragment.toString().charAt(0) === '/' ||
            expr.operator.slice(-1) === '<' && fragment.toString().slice(0, 3) === '!--') {
                // If '/' concats with '/' or `<` concats with `!--`, it is interpreted as comment start
                result.push(noEmptySpace());
                result.push(fragment);
            } else {
                result = join(result, fragment);
            }

            if (expr.operator === 'in' && !(flags & F_ALLOW_IN)) {
                return ['(', result, ')'];
            }
            return parenthesize(result, currentPrecedence, precedence);
        },

        CallExpression: function (expr, precedence, flags) {
            var result, i, iz;
            // F_ALLOW_UNPARATH_NEW becomes false.
            result = [this.generateExpression(expr.callee, Precedence.Call, E_TTF)];
            result.push('(');
            for (i = 0, iz = expr['arguments'].length; i < iz; ++i) {
                result.push(this.generateExpression(expr['arguments'][i], Precedence.Assignment, E_TTT));
                if (i + 1 < iz) {
                    result.push(',' + space);
                }
            }
            result.push(')');

            if (!(flags & F_ALLOW_CALL)) {
                return ['(', result, ')'];
            }
            return parenthesize(result, Precedence.Call, precedence);
        },

        NewExpression: function (expr, precedence, flags) {
            var result, length, i, iz, itemFlags;
            length = expr['arguments'].length;

            // F_ALLOW_CALL becomes false.
            // F_ALLOW_UNPARATH_NEW may become false.
            itemFlags = (flags & F_ALLOW_UNPARATH_NEW && !parentheses && length === 0) ? E_TFT : E_TFF;

            result = join(
                'new',
                this.generateExpression(expr.callee, Precedence.New, itemFlags)
            );

            if (!(flags & F_ALLOW_UNPARATH_NEW) || parentheses || length > 0) {
                result.push('(');
                for (i = 0, iz = length; i < iz; ++i) {
                    result.push(this.generateExpression(expr['arguments'][i], Precedence.Assignment, E_TTT));
                    if (i + 1 < iz) {
                        result.push(',' + space);
                    }
                }
                result.push(')');
            }

            return parenthesize(result, Precedence.New, precedence);
        },

        MemberExpression: function (expr, precedence, flags) {
            var result, fragment;

            // F_ALLOW_UNPARATH_NEW becomes false.
            result = [this.generateExpression(expr.object, Precedence.Call, (flags & F_ALLOW_CALL) ? E_TTF : E_TFF)];

            if (expr.computed) {
                result.push('[');
                result.push(this.generateExpression(expr.property, Precedence.Sequence, flags & F_ALLOW_CALL ? E_TTT : E_TFT));
                result.push(']');
            } else {
                if (expr.object.type === Syntax.Literal && typeof expr.object.value === 'number') {
                    fragment = toSourceNodeWhenNeeded(result).toString();
                    // When the following conditions are all true,
                    //   1. No floating point
                    //   2. Don't have exponents
                    //   3. The last character is a decimal digit
                    //   4. Not hexadecimal OR octal number literal
                    // we should add a floating point.
                    if (
                            fragment.indexOf('.') < 0 &&
                            !/[eExX]/.test(fragment) &&
                            esutils.code.isDecimalDigit(fragment.charCodeAt(fragment.length - 1)) &&
                            !(fragment.length >= 2 && fragment.charCodeAt(0) === 48)  // '0'
                            ) {
                        result.push('.');
                    }
                }
                result.push('.');
                result.push(generateIdentifier(expr.property));
            }

            return parenthesize(result, Precedence.Member, precedence);
        },

        UnaryExpression: function (expr, precedence, flags) {
            var result, fragment, rightCharCode, leftSource, leftCharCode;
            fragment = this.generateExpression(expr.argument, Precedence.Unary, E_TTT);

            if (space === '') {
                result = join(expr.operator, fragment);
            } else {
                result = [expr.operator];
                if (expr.operator.length > 2) {
                    // delete, void, typeof
                    // get `typeof []`, not `typeof[]`
                    result = join(result, fragment);
                } else {
                    // Prevent inserting spaces between operator and argument if it is unnecessary
                    // like, `!cond`
                    leftSource = toSourceNodeWhenNeeded(result).toString();
                    leftCharCode = leftSource.charCodeAt(leftSource.length - 1);
                    rightCharCode = fragment.toString().charCodeAt(0);

                    if (((leftCharCode === 0x2B  /* + */ || leftCharCode === 0x2D  /* - */) && leftCharCode === rightCharCode) ||
                            (esutils.code.isIdentifierPart(leftCharCode) && esutils.code.isIdentifierPart(rightCharCode))) {
                        result.push(noEmptySpace());
                        result.push(fragment);
                    } else {
                        result.push(fragment);
                    }
                }
            }
            return parenthesize(result, Precedence.Unary, precedence);
        },

        YieldExpression: function (expr, precedence, flags) {
            var result;
            if (expr.delegate) {
                result = 'yield*';
            } else {
                result = 'yield';
            }
            if (expr.argument) {
                result = join(
                    result,
                    this.generateExpression(expr.argument, Precedence.Yield, E_TTT)
                );
            }
            return parenthesize(result, Precedence.Yield, precedence);
        },

        UpdateExpression: function (expr, precedence, flags) {
            if (expr.prefix) {
                return parenthesize(
                    [
                        expr.operator,
                        this.generateExpression(expr.argument, Precedence.Unary, E_TTT)
                    ],
                    Precedence.Unary,
                    precedence
                );
            }
            return parenthesize(
                [
                    this.generateExpression(expr.argument, Precedence.Postfix, E_TTT),
                    expr.operator
                ],
                Precedence.Postfix,
                precedence
            );
        },

        FunctionExpression: function (expr, precedence, flags) {
            var result, isGenerator;
            isGenerator = expr.generator && !extra.moz.starlessGenerator;
            result = isGenerator ? 'function*' : 'function';

            if (expr.id) {
                return [result, (isGenerator) ? space : noEmptySpace(), generateIdentifier(expr.id), this.generateFunctionBody(expr)];
            }
            return [result + space, this.generateFunctionBody(expr)];
        },

        ExportBatchSpecifier: function (expr, precedence, flags) {
            return '*';
        },

        ArrayPattern: function (expr, precedence, flags) {
            return this.ArrayExpression(expr, precedence, flags);
        },

        ArrayExpression: function (expr, precedence, flags) {
            var result, multiline, that = this;
            if (!expr.elements.length) {
                return '[]';
            }
            multiline = expr.elements.length > 1;
            result = ['[', multiline ? newline : ''];
            withIndent(function (indent) {
                var i, iz;
                for (i = 0, iz = expr.elements.length; i < iz; ++i) {
                    if (!expr.elements[i]) {
                        if (multiline) {
                            result.push(indent);
                        }
                        if (i + 1 === iz) {
                            result.push(',');
                        }
                    } else {
                        result.push(multiline ? indent : '');
                        result.push(that.generateExpression(expr.elements[i], Precedence.Assignment, E_TTT));
                    }
                    if (i + 1 < iz) {
                        result.push(',' + (multiline ? newline : space));
                    }
                }
            });
            if (multiline && !endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                result.push(newline);
            }
            result.push(multiline ? base : '');
            result.push(']');
            return result;
        },

        ClassExpression: function (expr, precedence, flags) {
            var result, fragment;
            result = ['class'];
            if (expr.id) {
                result = join(result, this.generateExpression(expr.id, Precedence.Sequence, E_TTT));
            }
            if (expr.superClass) {
                fragment = join('extends', this.generateExpression(expr.superClass, Precedence.Assignment, E_TTT));
                result = join(result, fragment);
            }
            result.push(space);
            result.push(this.generateStatement(expr.body, S_TFFT));
            return result;
        },

        MethodDefinition: function (expr, precedence, flags) {
            var result, fragment;
            if (expr['static']) {
                result = ['static' + space];
            } else {
                result = [];
            }

            if (expr.kind === 'get' || expr.kind === 'set') {
                result = join(result, [
                    join(expr.kind, this.generatePropertyKey(expr.key, expr.computed)),
                    this.generateFunctionBody(expr.value)
                ]);
            } else {
                fragment = [
                    this.generatePropertyKey(expr.key, expr.computed),
                    this.generateFunctionBody(expr.value)
                ];
                if (expr.value.generator) {
                    result.push('*');
                    result.push(fragment);
                } else {
                    result = join(result, fragment);
                }
            }
            return result;
        },

        Property: function (expr, precedence, flags) {
            var result;
            if (expr.kind === 'get' || expr.kind === 'set') {
                return [
                    expr.kind, noEmptySpace(),
                    this.generatePropertyKey(expr.key, expr.computed),
                    this.generateFunctionBody(expr.value)
                ];
            }

            if (expr.shorthand) {
                return this.generatePropertyKey(expr.key, expr.computed);
            }

            if (expr.method) {
                result = [];
                if (expr.value.generator) {
                    result.push('*');
                }
                result.push(this.generatePropertyKey(expr.key, expr.computed));
                result.push(this.generateFunctionBody(expr.value));
                return result;
            }

            return [
                this.generatePropertyKey(expr.key, expr.computed),
                ':' + space,
                this.generateExpression(expr.value, Precedence.Assignment, E_TTT)
            ];
        },

        ObjectExpression: function (expr, precedence, flags) {
            var multiline, result, fragment, that = this;

            if (!expr.properties.length) {
                return '{}';
            }
            multiline = expr.properties.length > 1;

            withIndent(function () {
                fragment = that.generateExpression(expr.properties[0], Precedence.Sequence, E_TTT);
            });

            if (!multiline) {
                // issues 4
                // Do not transform from
                //   dejavu.Class.declare({
                //       method2: function () {}
                //   });
                // to
                //   dejavu.Class.declare({method2: function () {
                //       }});
                if (!hasLineTerminator(toSourceNodeWhenNeeded(fragment).toString())) {
                    return [ '{', space, fragment, space, '}' ];
                }
            }

            withIndent(function (indent) {
                var i, iz;
                result = [ '{', newline, indent, fragment ];

                if (multiline) {
                    result.push(',' + newline);
                    for (i = 1, iz = expr.properties.length; i < iz; ++i) {
                        result.push(indent);
                        result.push(that.generateExpression(expr.properties[i], Precedence.Sequence, E_TTT));
                        if (i + 1 < iz) {
                            result.push(',' + newline);
                        }
                    }
                }
            });

            if (!endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                result.push(newline);
            }
            result.push(base);
            result.push('}');
            return result;
        },

        ObjectPattern: function (expr, precedence, flags) {
            var result, i, iz, multiline, property, that = this;
            if (!expr.properties.length) {
                return '{}';
            }

            multiline = false;
            if (expr.properties.length === 1) {
                property = expr.properties[0];
                if (property.value.type !== Syntax.Identifier) {
                    multiline = true;
                }
            } else {
                for (i = 0, iz = expr.properties.length; i < iz; ++i) {
                    property = expr.properties[i];
                    if (!property.shorthand) {
                        multiline = true;
                        break;
                    }
                }
            }
            result = ['{', multiline ? newline : '' ];

            withIndent(function (indent) {
                var i, iz;
                for (i = 0, iz = expr.properties.length; i < iz; ++i) {
                    result.push(multiline ? indent : '');
                    result.push(that.generateExpression(expr.properties[i], Precedence.Sequence, E_TTT));
                    if (i + 1 < iz) {
                        result.push(',' + (multiline ? newline : space));
                    }
                }
            });

            if (multiline && !endsWithLineTerminator(toSourceNodeWhenNeeded(result).toString())) {
                result.push(newline);
            }
            result.push(multiline ? base : '');
            result.push('}');
            return result;
        },

        ThisExpression: function (expr, precedence, flags) {
            return 'this';
        },

        Identifier: function (expr, precedence, flags) {
            return generateIdentifier(expr);
        },

        ImportDefaultSpecifier: function (expr, precedence, flags) {
            return generateIdentifier(expr.id);
        },

        ImportNamespaceSpecifier: function (expr, precedence, flags) {
            var result = ['*'];
            if (expr.id) {
                result.push(space + 'as' + noEmptySpace() + generateIdentifier(expr.id));
            }
            return result;
        },

        ImportSpecifier: function (expr, precedence, flags) {
            return this.ExportSpecifier(expr, precedence, flags);
        },

        ExportSpecifier: function (expr, precedence, flags) {
            var result = [ expr.id.name ];
            if (expr.name) {
                result.push(noEmptySpace() + 'as' + noEmptySpace() + generateIdentifier(expr.name));
            }
            return result;
        },

        Literal: function (expr, precedence, flags) {
            var raw;
            if (expr.hasOwnProperty('raw') && parse && extra.raw) {
                try {
                    raw = parse(expr.raw).body[0].expression;
                    if (raw.type === Syntax.Literal) {
                        if (raw.value === expr.value) {
                            return expr.raw;
                        }
                    }
                } catch (e) {
                    // not use raw property
                }
            }

            if (expr.value === null) {
                return 'null';
            }

            if (typeof expr.value === 'string') {
                return escapeString(expr.value);
            }

            if (typeof expr.value === 'number') {
                return generateNumber(expr.value);
            }

            if (typeof expr.value === 'boolean') {
                return expr.value ? 'true' : 'false';
            }

            return generateRegExp(expr.value);
        },

        GeneratorExpression: function (expr, precedence, flags) {
            return this.ComprehensionExpression(expr, precedence, flags);
        },

        ComprehensionExpression: function (expr, precedence, flags) {
            // GeneratorExpression should be parenthesized with (...), ComprehensionExpression with [...]
            // Due to https://bugzilla.mozilla.org/show_bug.cgi?id=883468 position of expr.body can differ in Spidermonkey and ES6

            var result, i, iz, fragment, that = this;
            result = (expr.type === Syntax.GeneratorExpression) ? ['('] : ['['];

            if (extra.moz.comprehensionExpressionStartsWithAssignment) {
                fragment = this.generateExpression(expr.body, Precedence.Assignment, E_TTT);
                result.push(fragment);
            }

            if (expr.blocks) {
                withIndent(function () {
                    for (i = 0, iz = expr.blocks.length; i < iz; ++i) {
                        fragment = that.generateExpression(expr.blocks[i], Precedence.Sequence, E_TTT);
                        if (i > 0 || extra.moz.comprehensionExpressionStartsWithAssignment) {
                            result = join(result, fragment);
                        } else {
                            result.push(fragment);
                        }
                    }
                });
            }

            if (expr.filter) {
                result = join(result, 'if' + space);
                fragment = this.generateExpression(expr.filter, Precedence.Sequence, E_TTT);
                result = join(result, [ '(', fragment, ')' ]);
            }

            if (!extra.moz.comprehensionExpressionStartsWithAssignment) {
                fragment = this.generateExpression(expr.body, Precedence.Assignment, E_TTT);

                result = join(result, fragment);
            }

            result.push((expr.type === Syntax.GeneratorExpression) ? ')' : ']');
            return result;
        },

        ComprehensionBlock: function (expr, precedence, flags) {
            var fragment;
            if (expr.left.type === Syntax.VariableDeclaration) {
                fragment = [
                    expr.left.kind, noEmptySpace(),
                    this.generateStatement(expr.left.declarations[0], S_FFFF)
                ];
            } else {
                fragment = this.generateExpression(expr.left, Precedence.Call, E_TTT);
            }

            fragment = join(fragment, expr.of ? 'of' : 'in');
            fragment = join(fragment, this.generateExpression(expr.right, Precedence.Sequence, E_TTT));

            return [ 'for' + space + '(', fragment, ')' ];
        },

        SpreadElement: function (expr, precedence, flags) {
            return [
                '...',
                this.generateExpression(expr.argument, Precedence.Assignment, E_TTT)
            ];
        },

        TaggedTemplateExpression: function (expr, precedence, flags) {
            var itemFlags = E_TTF;
            if (!(flags & F_ALLOW_CALL)) {
                itemFlags = E_TFF;
            }
            var result = [
                this.generateExpression(expr.tag, Precedence.Call, itemFlags),
                this.generateExpression(expr.quasi, Precedence.Primary, E_FFT)
            ];
            return parenthesize(result, Precedence.TaggedTemplate, precedence);
        },

        TemplateElement: function (expr, precedence, flags) {
            // Don't use "cooked". Since tagged template can use raw template
            // representation. So if we do so, it breaks the script semantics.
            return expr.value.raw;
        },

        TemplateLiteral: function (expr, precedence, flags) {
            var result, i, iz;
            result = [ '`' ];
            for (i = 0, iz = expr.quasis.length; i < iz; ++i) {
                result.push(this.generateExpression(expr.quasis[i], Precedence.Primary, E_TTT));
                if (i + 1 < iz) {
                    result.push('${' + space);
                    result.push(this.generateExpression(expr.expressions[i], Precedence.Sequence, E_TTT));
                    result.push(space + '}');
                }
            }
            result.push('`');
            return result;
        },

        ModuleSpecifier: function (expr, precedence, flags) {
            return this.Literal(expr, precedence, flags);
        }

    };

    merge(CodeGenerator.prototype, CodeGenerator.Expression);

    CodeGenerator.prototype.generateExpression = function (expr, precedence, flags) {
        var result, type;

        type = expr.type || Syntax.Property;

        if (extra.verbatim && expr.hasOwnProperty(extra.verbatim)) {
            return generateVerbatim(expr, precedence);
        }

        result = this[type](expr, precedence, flags);


        if (extra.comment) {
            result = addComments(expr,result);
        }
        return toSourceNodeWhenNeeded(result, expr);
    };

    CodeGenerator.prototype.generateStatement = function (stmt, flags) {
        var result,
            fragment;

        result = this[stmt.type](stmt, flags);

        // Attach comments

        if (extra.comment) {
            result = addComments(stmt, result);
        }

        fragment = toSourceNodeWhenNeeded(result).toString();
        if (stmt.type === Syntax.Program && !safeConcatenation && newline === '' &&  fragment.charAt(fragment.length - 1) === '\n') {
            result = sourceMap ? toSourceNodeWhenNeeded(result).replaceRight(/\s+$/, '') : fragment.replace(/\s+$/, '');
        }

        return toSourceNodeWhenNeeded(result, stmt);
    };

    function generateInternal(node) {
        var codegen;

        codegen = new CodeGenerator();
        if (isStatement(node)) {
            return codegen.generateStatement(node, S_TFFF);
        }

        if (isExpression(node)) {
            return codegen.generateExpression(node, Precedence.Sequence, E_TTT);
        }

        throw new Error('Unknown node type: ' + node.type);
    }

    function generate(node, options) {
        var defaultOptions = getDefaultOptions(), result, pair;

        if (options != null) {
            // Obsolete options
            //
            //   `options.indent`
            //   `options.base`
            //
            // Instead of them, we can use `option.format.indent`.
            if (typeof options.indent === 'string') {
                defaultOptions.format.indent.style = options.indent;
            }
            if (typeof options.base === 'number') {
                defaultOptions.format.indent.base = options.base;
            }
            options = updateDeeply(defaultOptions, options);
            indent = options.format.indent.style;
            if (typeof options.base === 'string') {
                base = options.base;
            } else {
                base = stringRepeat(indent, options.format.indent.base);
            }
        } else {
            options = defaultOptions;
            indent = options.format.indent.style;
            base = stringRepeat(indent, options.format.indent.base);
        }
        json = options.format.json;
        renumber = options.format.renumber;
        hexadecimal = json ? false : options.format.hexadecimal;
        quotes = json ? 'double' : options.format.quotes;
        escapeless = options.format.escapeless;
        newline = options.format.newline;
        space = options.format.space;
        if (options.format.compact) {
            newline = space = indent = base = '';
        }
        parentheses = options.format.parentheses;
        semicolons = options.format.semicolons;
        safeConcatenation = options.format.safeConcatenation;
        directive = options.directive;
        parse = json ? null : options.parse;
        sourceMap = options.sourceMap;
        extra = options;

        if (sourceMap) {
            if (!exports.browser) {
                // We assume environment is node.js
                // And prevent from including source-map by browserify
                SourceNode = require('source-map').SourceNode;
            } else {
                SourceNode = global.sourceMap.SourceNode;
            }
        }

        result = generateInternal(node);

        if (!sourceMap) {
            pair = {code: result.toString(), map: null};
            return options.sourceMapWithCode ? pair : pair.code;
        }


        pair = result.toStringWithSourceMap({
            file: options.file,
            sourceRoot: options.sourceMapRoot
        });

        if (options.sourceContent) {
            pair.map.setSourceContent(options.sourceMap,
                                      options.sourceContent);
        }

        if (options.sourceMapWithCode) {
            return pair;
        }

        return pair.map.toString();
    }

    FORMAT_MINIFY = {
        indent: {
            style: '',
            base: 0
        },
        renumber: true,
        hexadecimal: true,
        quotes: 'auto',
        escapeless: true,
        compact: true,
        parentheses: false,
        semicolons: false
    };

    FORMAT_DEFAULTS = getDefaultOptions().format;

    exports.version = require('./package.json').version;
    exports.generate = generate;
    exports.attachComments = estraverse.attachComments;
    exports.Precedence = updateDeeply({}, Precedence);
    exports.browser = false;
    exports.FORMAT_MINIFY = FORMAT_MINIFY;
    exports.FORMAT_DEFAULTS = FORMAT_DEFAULTS;
}());
/* vim: set sw=4 ts=4 et tw=80 : */

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./package.json":22,"estraverse":17,"esutils":21,"source-map":40}],17:[function(require,module,exports){
/*
  Copyright (C) 2012-2013 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/*jslint vars:false, bitwise:true*/
/*jshint indent:4*/
/*global exports:true, define:true*/
(function (root, factory) {
    'use strict';

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // and plain browser loading,
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports !== 'undefined') {
        factory(exports);
    } else {
        factory((root.estraverse = {}));
    }
}(this, function (exports) {
    'use strict';

    var Syntax,
        isArray,
        VisitorOption,
        VisitorKeys,
        objectCreate,
        objectKeys,
        BREAK,
        SKIP,
        REMOVE;

    function ignoreJSHintError() { }

    isArray = Array.isArray;
    if (!isArray) {
        isArray = function isArray(array) {
            return Object.prototype.toString.call(array) === '[object Array]';
        };
    }

    function deepCopy(obj) {
        var ret = {}, key, val;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                val = obj[key];
                if (typeof val === 'object' && val !== null) {
                    ret[key] = deepCopy(val);
                } else {
                    ret[key] = val;
                }
            }
        }
        return ret;
    }

    function shallowCopy(obj) {
        var ret = {}, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                ret[key] = obj[key];
            }
        }
        return ret;
    }
    ignoreJSHintError(shallowCopy);

    // based on LLVM libc++ upper_bound / lower_bound
    // MIT License

    function upperBound(array, func) {
        var diff, len, i, current;

        len = array.length;
        i = 0;

        while (len) {
            diff = len >>> 1;
            current = i + diff;
            if (func(array[current])) {
                len = diff;
            } else {
                i = current + 1;
                len -= diff + 1;
            }
        }
        return i;
    }

    function lowerBound(array, func) {
        var diff, len, i, current;

        len = array.length;
        i = 0;

        while (len) {
            diff = len >>> 1;
            current = i + diff;
            if (func(array[current])) {
                i = current + 1;
                len -= diff + 1;
            } else {
                len = diff;
            }
        }
        return i;
    }
    ignoreJSHintError(lowerBound);

    objectCreate = Object.create || (function () {
        function F() { }

        return function (o) {
            F.prototype = o;
            return new F();
        };
    })();

    objectKeys = Object.keys || function (o) {
        var keys = [], key;
        for (key in o) {
            keys.push(key);
        }
        return keys;
    };

    function extend(to, from) {
        objectKeys(from).forEach(function (key) {
            to[key] = from[key];
        });
        return to;
    }

    Syntax = {
        AssignmentExpression: 'AssignmentExpression',
        ArrayExpression: 'ArrayExpression',
        ArrayPattern: 'ArrayPattern',
        ArrowFunctionExpression: 'ArrowFunctionExpression',
        AwaitExpression: 'AwaitExpression', // CAUTION: It's deferred to ES7.
        BlockStatement: 'BlockStatement',
        BinaryExpression: 'BinaryExpression',
        BreakStatement: 'BreakStatement',
        CallExpression: 'CallExpression',
        CatchClause: 'CatchClause',
        ClassBody: 'ClassBody',
        ClassDeclaration: 'ClassDeclaration',
        ClassExpression: 'ClassExpression',
        ComprehensionBlock: 'ComprehensionBlock',  // CAUTION: It's deferred to ES7.
        ComprehensionExpression: 'ComprehensionExpression',  // CAUTION: It's deferred to ES7.
        ConditionalExpression: 'ConditionalExpression',
        ContinueStatement: 'ContinueStatement',
        DebuggerStatement: 'DebuggerStatement',
        DirectiveStatement: 'DirectiveStatement',
        DoWhileStatement: 'DoWhileStatement',
        EmptyStatement: 'EmptyStatement',
        ExportBatchSpecifier: 'ExportBatchSpecifier',
        ExportDeclaration: 'ExportDeclaration',
        ExportSpecifier: 'ExportSpecifier',
        ExpressionStatement: 'ExpressionStatement',
        ForStatement: 'ForStatement',
        ForInStatement: 'ForInStatement',
        ForOfStatement: 'ForOfStatement',
        FunctionDeclaration: 'FunctionDeclaration',
        FunctionExpression: 'FunctionExpression',
        GeneratorExpression: 'GeneratorExpression',  // CAUTION: It's deferred to ES7.
        Identifier: 'Identifier',
        IfStatement: 'IfStatement',
        ImportDeclaration: 'ImportDeclaration',
        ImportDefaultSpecifier: 'ImportDefaultSpecifier',
        ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
        ImportSpecifier: 'ImportSpecifier',
        Literal: 'Literal',
        LabeledStatement: 'LabeledStatement',
        LogicalExpression: 'LogicalExpression',
        MemberExpression: 'MemberExpression',
        MethodDefinition: 'MethodDefinition',
        ModuleSpecifier: 'ModuleSpecifier',
        NewExpression: 'NewExpression',
        ObjectExpression: 'ObjectExpression',
        ObjectPattern: 'ObjectPattern',
        Program: 'Program',
        Property: 'Property',
        ReturnStatement: 'ReturnStatement',
        SequenceExpression: 'SequenceExpression',
        SpreadElement: 'SpreadElement',
        SwitchStatement: 'SwitchStatement',
        SwitchCase: 'SwitchCase',
        TaggedTemplateExpression: 'TaggedTemplateExpression',
        TemplateElement: 'TemplateElement',
        TemplateLiteral: 'TemplateLiteral',
        ThisExpression: 'ThisExpression',
        ThrowStatement: 'ThrowStatement',
        TryStatement: 'TryStatement',
        UnaryExpression: 'UnaryExpression',
        UpdateExpression: 'UpdateExpression',
        VariableDeclaration: 'VariableDeclaration',
        VariableDeclarator: 'VariableDeclarator',
        WhileStatement: 'WhileStatement',
        WithStatement: 'WithStatement',
        YieldExpression: 'YieldExpression'
    };

    VisitorKeys = {
        AssignmentExpression: ['left', 'right'],
        ArrayExpression: ['elements'],
        ArrayPattern: ['elements'],
        ArrowFunctionExpression: ['params', 'defaults', 'rest', 'body'],
        AwaitExpression: ['argument'], // CAUTION: It's deferred to ES7.
        BlockStatement: ['body'],
        BinaryExpression: ['left', 'right'],
        BreakStatement: ['label'],
        CallExpression: ['callee', 'arguments'],
        CatchClause: ['param', 'body'],
        ClassBody: ['body'],
        ClassDeclaration: ['id', 'body', 'superClass'],
        ClassExpression: ['id', 'body', 'superClass'],
        ComprehensionBlock: ['left', 'right'],  // CAUTION: It's deferred to ES7.
        ComprehensionExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
        ConditionalExpression: ['test', 'consequent', 'alternate'],
        ContinueStatement: ['label'],
        DebuggerStatement: [],
        DirectiveStatement: [],
        DoWhileStatement: ['body', 'test'],
        EmptyStatement: [],
        ExportBatchSpecifier: [],
        ExportDeclaration: ['declaration', 'specifiers', 'source'],
        ExportSpecifier: ['id', 'name'],
        ExpressionStatement: ['expression'],
        ForStatement: ['init', 'test', 'update', 'body'],
        ForInStatement: ['left', 'right', 'body'],
        ForOfStatement: ['left', 'right', 'body'],
        FunctionDeclaration: ['id', 'params', 'defaults', 'rest', 'body'],
        FunctionExpression: ['id', 'params', 'defaults', 'rest', 'body'],
        GeneratorExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
        Identifier: [],
        IfStatement: ['test', 'consequent', 'alternate'],
        ImportDeclaration: ['specifiers', 'source'],
        ImportDefaultSpecifier: ['id'],
        ImportNamespaceSpecifier: ['id'],
        ImportSpecifier: ['id', 'name'],
        Literal: [],
        LabeledStatement: ['label', 'body'],
        LogicalExpression: ['left', 'right'],
        MemberExpression: ['object', 'property'],
        MethodDefinition: ['key', 'value'],
        ModuleSpecifier: [],
        NewExpression: ['callee', 'arguments'],
        ObjectExpression: ['properties'],
        ObjectPattern: ['properties'],
        Program: ['body'],
        Property: ['key', 'value'],
        ReturnStatement: ['argument'],
        SequenceExpression: ['expressions'],
        SpreadElement: ['argument'],
        SwitchStatement: ['discriminant', 'cases'],
        SwitchCase: ['test', 'consequent'],
        TaggedTemplateExpression: ['tag', 'quasi'],
        TemplateElement: [],
        TemplateLiteral: ['quasis', 'expressions'],
        ThisExpression: [],
        ThrowStatement: ['argument'],
        TryStatement: ['block', 'handlers', 'handler', 'guardedHandlers', 'finalizer'],
        UnaryExpression: ['argument'],
        UpdateExpression: ['argument'],
        VariableDeclaration: ['declarations'],
        VariableDeclarator: ['id', 'init'],
        WhileStatement: ['test', 'body'],
        WithStatement: ['object', 'body'],
        YieldExpression: ['argument']
    };

    // unique id
    BREAK = {};
    SKIP = {};
    REMOVE = {};

    VisitorOption = {
        Break: BREAK,
        Skip: SKIP,
        Remove: REMOVE
    };

    function Reference(parent, key) {
        this.parent = parent;
        this.key = key;
    }

    Reference.prototype.replace = function replace(node) {
        this.parent[this.key] = node;
    };

    Reference.prototype.remove = function remove() {
        if (isArray(this.parent)) {
            this.parent.splice(this.key, 1);
            return true;
        } else {
            this.replace(null);
            return false;
        }
    };

    function Element(node, path, wrap, ref) {
        this.node = node;
        this.path = path;
        this.wrap = wrap;
        this.ref = ref;
    }

    function Controller() { }

    // API:
    // return property path array from root to current node
    Controller.prototype.path = function path() {
        var i, iz, j, jz, result, element;

        function addToPath(result, path) {
            if (isArray(path)) {
                for (j = 0, jz = path.length; j < jz; ++j) {
                    result.push(path[j]);
                }
            } else {
                result.push(path);
            }
        }

        // root node
        if (!this.__current.path) {
            return null;
        }

        // first node is sentinel, second node is root element
        result = [];
        for (i = 2, iz = this.__leavelist.length; i < iz; ++i) {
            element = this.__leavelist[i];
            addToPath(result, element.path);
        }
        addToPath(result, this.__current.path);
        return result;
    };

    // API:
    // return type of current node
    Controller.prototype.type = function () {
        var node = this.current();
        return node.type || this.__current.wrap;
    };

    // API:
    // return array of parent elements
    Controller.prototype.parents = function parents() {
        var i, iz, result;

        // first node is sentinel
        result = [];
        for (i = 1, iz = this.__leavelist.length; i < iz; ++i) {
            result.push(this.__leavelist[i].node);
        }

        return result;
    };

    // API:
    // return current node
    Controller.prototype.current = function current() {
        return this.__current.node;
    };

    Controller.prototype.__execute = function __execute(callback, element) {
        var previous, result;

        result = undefined;

        previous  = this.__current;
        this.__current = element;
        this.__state = null;
        if (callback) {
            result = callback.call(this, element.node, this.__leavelist[this.__leavelist.length - 1].node);
        }
        this.__current = previous;

        return result;
    };

    // API:
    // notify control skip / break
    Controller.prototype.notify = function notify(flag) {
        this.__state = flag;
    };

    // API:
    // skip child nodes of current node
    Controller.prototype.skip = function () {
        this.notify(SKIP);
    };

    // API:
    // break traversals
    Controller.prototype['break'] = function () {
        this.notify(BREAK);
    };

    // API:
    // remove node
    Controller.prototype.remove = function () {
        this.notify(REMOVE);
    };

    Controller.prototype.__initialize = function(root, visitor) {
        this.visitor = visitor;
        this.root = root;
        this.__worklist = [];
        this.__leavelist = [];
        this.__current = null;
        this.__state = null;
        this.__fallback = visitor.fallback === 'iteration';
        this.__keys = VisitorKeys;
        if (visitor.keys) {
            this.__keys = extend(objectCreate(this.__keys), visitor.keys);
        }
    };

    function isNode(node) {
        if (node == null) {
            return false;
        }
        return typeof node === 'object' && typeof node.type === 'string';
    }

    function isProperty(nodeType, key) {
        return (nodeType === Syntax.ObjectExpression || nodeType === Syntax.ObjectPattern) && 'properties' === key;
    }

    Controller.prototype.traverse = function traverse(root, visitor) {
        var worklist,
            leavelist,
            element,
            node,
            nodeType,
            ret,
            key,
            current,
            current2,
            candidates,
            candidate,
            sentinel;

        this.__initialize(root, visitor);

        sentinel = {};

        // reference
        worklist = this.__worklist;
        leavelist = this.__leavelist;

        // initialize
        worklist.push(new Element(root, null, null, null));
        leavelist.push(new Element(null, null, null, null));

        while (worklist.length) {
            element = worklist.pop();

            if (element === sentinel) {
                element = leavelist.pop();

                ret = this.__execute(visitor.leave, element);

                if (this.__state === BREAK || ret === BREAK) {
                    return;
                }
                continue;
            }

            if (element.node) {

                ret = this.__execute(visitor.enter, element);

                if (this.__state === BREAK || ret === BREAK) {
                    return;
                }

                worklist.push(sentinel);
                leavelist.push(element);

                if (this.__state === SKIP || ret === SKIP) {
                    continue;
                }

                node = element.node;
                nodeType = element.wrap || node.type;
                candidates = this.__keys[nodeType];
                if (!candidates) {
                    if (this.__fallback) {
                        candidates = objectKeys(node);
                    } else {
                        throw new Error('Unknown node type ' + nodeType + '.');
                    }
                }

                current = candidates.length;
                while ((current -= 1) >= 0) {
                    key = candidates[current];
                    candidate = node[key];
                    if (!candidate) {
                        continue;
                    }

                    if (isArray(candidate)) {
                        current2 = candidate.length;
                        while ((current2 -= 1) >= 0) {
                            if (!candidate[current2]) {
                                continue;
                            }
                            if (isProperty(nodeType, candidates[current])) {
                                element = new Element(candidate[current2], [key, current2], 'Property', null);
                            } else if (isNode(candidate[current2])) {
                                element = new Element(candidate[current2], [key, current2], null, null);
                            } else {
                                continue;
                            }
                            worklist.push(element);
                        }
                    } else if (isNode(candidate)) {
                        worklist.push(new Element(candidate, key, null, null));
                    }
                }
            }
        }
    };

    Controller.prototype.replace = function replace(root, visitor) {
        function removeElem(element) {
            var i,
                key,
                nextElem,
                parent;

            if (element.ref.remove()) {
                // When the reference is an element of an array.
                key = element.ref.key;
                parent = element.ref.parent;

                // If removed from array, then decrease following items' keys.
                i = worklist.length;
                while (i--) {
                    nextElem = worklist[i];
                    if (nextElem.ref && nextElem.ref.parent === parent) {
                        if  (nextElem.ref.key < key) {
                            break;
                        }
                        --nextElem.ref.key;
                    }
                }
            }
        }

        var worklist,
            leavelist,
            node,
            nodeType,
            target,
            element,
            current,
            current2,
            candidates,
            candidate,
            sentinel,
            outer,
            key;

        this.__initialize(root, visitor);

        sentinel = {};

        // reference
        worklist = this.__worklist;
        leavelist = this.__leavelist;

        // initialize
        outer = {
            root: root
        };
        element = new Element(root, null, null, new Reference(outer, 'root'));
        worklist.push(element);
        leavelist.push(element);

        while (worklist.length) {
            element = worklist.pop();

            if (element === sentinel) {
                element = leavelist.pop();

                target = this.__execute(visitor.leave, element);

                // node may be replaced with null,
                // so distinguish between undefined and null in this place
                if (target !== undefined && target !== BREAK && target !== SKIP && target !== REMOVE) {
                    // replace
                    element.ref.replace(target);
                }

                if (this.__state === REMOVE || target === REMOVE) {
                    removeElem(element);
                }

                if (this.__state === BREAK || target === BREAK) {
                    return outer.root;
                }
                continue;
            }

            target = this.__execute(visitor.enter, element);

            // node may be replaced with null,
            // so distinguish between undefined and null in this place
            if (target !== undefined && target !== BREAK && target !== SKIP && target !== REMOVE) {
                // replace
                element.ref.replace(target);
                element.node = target;
            }

            if (this.__state === REMOVE || target === REMOVE) {
                removeElem(element);
                element.node = null;
            }

            if (this.__state === BREAK || target === BREAK) {
                return outer.root;
            }

            // node may be null
            node = element.node;
            if (!node) {
                continue;
            }

            worklist.push(sentinel);
            leavelist.push(element);

            if (this.__state === SKIP || target === SKIP) {
                continue;
            }

            nodeType = element.wrap || node.type;
            candidates = this.__keys[nodeType];
            if (!candidates) {
                if (this.__fallback) {
                    candidates = objectKeys(node);
                } else {
                    throw new Error('Unknown node type ' + nodeType + '.');
                }
            }

            current = candidates.length;
            while ((current -= 1) >= 0) {
                key = candidates[current];
                candidate = node[key];
                if (!candidate) {
                    continue;
                }

                if (isArray(candidate)) {
                    current2 = candidate.length;
                    while ((current2 -= 1) >= 0) {
                        if (!candidate[current2]) {
                            continue;
                        }
                        if (isProperty(nodeType, candidates[current])) {
                            element = new Element(candidate[current2], [key, current2], 'Property', new Reference(candidate, current2));
                        } else if (isNode(candidate[current2])) {
                            element = new Element(candidate[current2], [key, current2], null, new Reference(candidate, current2));
                        } else {
                            continue;
                        }
                        worklist.push(element);
                    }
                } else if (isNode(candidate)) {
                    worklist.push(new Element(candidate, key, null, new Reference(node, key)));
                }
            }
        }

        return outer.root;
    };

    function traverse(root, visitor) {
        var controller = new Controller();
        return controller.traverse(root, visitor);
    }

    function replace(root, visitor) {
        var controller = new Controller();
        return controller.replace(root, visitor);
    }

    function extendCommentRange(comment, tokens) {
        var target;

        target = upperBound(tokens, function search(token) {
            return token.range[0] > comment.range[0];
        });

        comment.extendedRange = [comment.range[0], comment.range[1]];

        if (target !== tokens.length) {
            comment.extendedRange[1] = tokens[target].range[0];
        }

        target -= 1;
        if (target >= 0) {
            comment.extendedRange[0] = tokens[target].range[1];
        }

        return comment;
    }

    function attachComments(tree, providedComments, tokens) {
        // At first, we should calculate extended comment ranges.
        var comments = [], comment, len, i, cursor;

        if (!tree.range) {
            throw new Error('attachComments needs range information');
        }

        // tokens array is empty, we attach comments to tree as 'leadingComments'
        if (!tokens.length) {
            if (providedComments.length) {
                for (i = 0, len = providedComments.length; i < len; i += 1) {
                    comment = deepCopy(providedComments[i]);
                    comment.extendedRange = [0, tree.range[0]];
                    comments.push(comment);
                }
                tree.leadingComments = comments;
            }
            return tree;
        }

        for (i = 0, len = providedComments.length; i < len; i += 1) {
            comments.push(extendCommentRange(deepCopy(providedComments[i]), tokens));
        }

        // This is based on John Freeman's implementation.
        cursor = 0;
        traverse(tree, {
            enter: function (node) {
                var comment;

                while (cursor < comments.length) {
                    comment = comments[cursor];
                    if (comment.extendedRange[1] > node.range[0]) {
                        break;
                    }

                    if (comment.extendedRange[1] === node.range[0]) {
                        if (!node.leadingComments) {
                            node.leadingComments = [];
                        }
                        node.leadingComments.push(comment);
                        comments.splice(cursor, 1);
                    } else {
                        cursor += 1;
                    }
                }

                // already out of owned node
                if (cursor === comments.length) {
                    return VisitorOption.Break;
                }

                if (comments[cursor].extendedRange[0] > node.range[1]) {
                    return VisitorOption.Skip;
                }
            }
        });

        cursor = 0;
        traverse(tree, {
            leave: function (node) {
                var comment;

                while (cursor < comments.length) {
                    comment = comments[cursor];
                    if (node.range[1] < comment.extendedRange[0]) {
                        break;
                    }

                    if (node.range[1] === comment.extendedRange[0]) {
                        if (!node.trailingComments) {
                            node.trailingComments = [];
                        }
                        node.trailingComments.push(comment);
                        comments.splice(cursor, 1);
                    } else {
                        cursor += 1;
                    }
                }

                // already out of owned node
                if (cursor === comments.length) {
                    return VisitorOption.Break;
                }

                if (comments[cursor].extendedRange[0] > node.range[1]) {
                    return VisitorOption.Skip;
                }
            }
        });

        return tree;
    }

    exports.version = '1.8.1-dev';
    exports.Syntax = Syntax;
    exports.traverse = traverse;
    exports.replace = replace;
    exports.attachComments = attachComments;
    exports.VisitorKeys = VisitorKeys;
    exports.VisitorOption = VisitorOption;
    exports.Controller = Controller;
}));
/* vim: set sw=4 ts=4 et tw=80 : */

},{}],18:[function(require,module,exports){
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    function isExpression(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'ArrayExpression':
            case 'AssignmentExpression':
            case 'BinaryExpression':
            case 'CallExpression':
            case 'ConditionalExpression':
            case 'FunctionExpression':
            case 'Identifier':
            case 'Literal':
            case 'LogicalExpression':
            case 'MemberExpression':
            case 'NewExpression':
            case 'ObjectExpression':
            case 'SequenceExpression':
            case 'ThisExpression':
            case 'UnaryExpression':
            case 'UpdateExpression':
                return true;
        }
        return false;
    }

    function isIterationStatement(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'DoWhileStatement':
            case 'ForInStatement':
            case 'ForStatement':
            case 'WhileStatement':
                return true;
        }
        return false;
    }

    function isStatement(node) {
        if (node == null) { return false; }
        switch (node.type) {
            case 'BlockStatement':
            case 'BreakStatement':
            case 'ContinueStatement':
            case 'DebuggerStatement':
            case 'DoWhileStatement':
            case 'EmptyStatement':
            case 'ExpressionStatement':
            case 'ForInStatement':
            case 'ForStatement':
            case 'IfStatement':
            case 'LabeledStatement':
            case 'ReturnStatement':
            case 'SwitchStatement':
            case 'ThrowStatement':
            case 'TryStatement':
            case 'VariableDeclaration':
            case 'WhileStatement':
            case 'WithStatement':
                return true;
        }
        return false;
    }

    function isSourceElement(node) {
      return isStatement(node) || node != null && node.type === 'FunctionDeclaration';
    }

    function trailingStatement(node) {
        switch (node.type) {
        case 'IfStatement':
            if (node.alternate != null) {
                return node.alternate;
            }
            return node.consequent;

        case 'LabeledStatement':
        case 'ForStatement':
        case 'ForInStatement':
        case 'WhileStatement':
        case 'WithStatement':
            return node.body;
        }
        return null;
    }

    function isProblematicIfStatement(node) {
        var current;

        if (node.type !== 'IfStatement') {
            return false;
        }
        if (node.alternate == null) {
            return false;
        }
        current = node.consequent;
        do {
            if (current.type === 'IfStatement') {
                if (current.alternate == null)  {
                    return true;
                }
            }
            current = trailingStatement(current);
        } while (current);

        return false;
    }

    module.exports = {
        isExpression: isExpression,
        isStatement: isStatement,
        isIterationStatement: isIterationStatement,
        isSourceElement: isSourceElement,
        isProblematicIfStatement: isProblematicIfStatement,

        trailingStatement: trailingStatement
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */

},{}],19:[function(require,module,exports){
/*
  Copyright (C) 2013-2014 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2014 Ivan Nikulin <ifaaan@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    var Regex, NON_ASCII_WHITESPACES;

    // See `tools/generate-identifier-regex.js`.
    Regex = {
        NonAsciiIdentifierStart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0\u08A2-\u08AC\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097F\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D60\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191C\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19C1-\u19C7\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA697\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA80-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]'),
        NonAsciiIdentifierPart: new RegExp('[\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0\u08A2-\u08AC\u08E4-\u08FE\u0900-\u0963\u0966-\u096F\u0971-\u0977\u0979-\u097F\u0981-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58\u0C59\u0C60-\u0C63\u0C66-\u0C6F\u0C82\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D60-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1380-\u138F\u13A0-\u13F4\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F0\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191C\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19D9\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1D00-\u1DE6\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u2E2F\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099\u309A\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FCC\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA697\uA69F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA78E\uA790-\uA793\uA7A0-\uA7AA\uA7F8-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A\uAA7B\uAA80-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uABC0-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE26\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]')
    };

    function isDecimalDigit(ch) {
        return (ch >= 48 && ch <= 57);   // 0..9
    }

    function isHexDigit(ch) {
        return isDecimalDigit(ch) ||    // 0..9
            (97 <= ch && ch <= 102) ||  // a..f
            (65 <= ch && ch <= 70);     // A..F
    }

    function isOctalDigit(ch) {
        return (ch >= 48 && ch <= 55);   // 0..7
    }

    // 7.2 White Space

    NON_ASCII_WHITESPACES = [
        0x1680, 0x180E,
        0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
        0x202F, 0x205F,
        0x3000,
        0xFEFF
    ];

    function isWhiteSpace(ch) {
        return (ch === 0x20) || (ch === 0x09) || (ch === 0x0B) || (ch === 0x0C) || (ch === 0xA0) ||
            (ch >= 0x1680 && NON_ASCII_WHITESPACES.indexOf(ch) >= 0);
    }

    // 7.3 Line Terminators

    function isLineTerminator(ch) {
        return (ch === 0x0A) || (ch === 0x0D) || (ch === 0x2028) || (ch === 0x2029);
    }

    // 7.6 Identifier Names and Identifiers

    function isIdentifierStart(ch) {
        return (ch >= 97 && ch <= 122) ||     // a..z
            (ch >= 65 && ch <= 90) ||         // A..Z
            (ch === 36) || (ch === 95) ||     // $ (dollar) and _ (underscore)
            (ch === 92) ||                    // \ (backslash)
            ((ch >= 0x80) && Regex.NonAsciiIdentifierStart.test(String.fromCharCode(ch)));
    }

    function isIdentifierPart(ch) {
        return (ch >= 97 && ch <= 122) ||     // a..z
            (ch >= 65 && ch <= 90) ||         // A..Z
            (ch >= 48 && ch <= 57) ||         // 0..9
            (ch === 36) || (ch === 95) ||     // $ (dollar) and _ (underscore)
            (ch === 92) ||                    // \ (backslash)
            ((ch >= 0x80) && Regex.NonAsciiIdentifierPart.test(String.fromCharCode(ch)));
    }

    module.exports = {
        isDecimalDigit: isDecimalDigit,
        isHexDigit: isHexDigit,
        isOctalDigit: isOctalDigit,
        isWhiteSpace: isWhiteSpace,
        isLineTerminator: isLineTerminator,
        isIdentifierStart: isIdentifierStart,
        isIdentifierPart: isIdentifierPart
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */

},{}],20:[function(require,module,exports){
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

(function () {
    'use strict';

    var code = require('./code');

    function isStrictModeReservedWordES6(id) {
        switch (id) {
        case 'implements':
        case 'interface':
        case 'package':
        case 'private':
        case 'protected':
        case 'public':
        case 'static':
        case 'let':
            return true;
        default:
            return false;
        }
    }

    function isKeywordES5(id, strict) {
        // yield should not be treated as keyword under non-strict mode.
        if (!strict && id === 'yield') {
            return false;
        }
        return isKeywordES6(id, strict);
    }

    function isKeywordES6(id, strict) {
        if (strict && isStrictModeReservedWordES6(id)) {
            return true;
        }

        switch (id.length) {
        case 2:
            return (id === 'if') || (id === 'in') || (id === 'do');
        case 3:
            return (id === 'var') || (id === 'for') || (id === 'new') || (id === 'try');
        case 4:
            return (id === 'this') || (id === 'else') || (id === 'case') ||
                (id === 'void') || (id === 'with') || (id === 'enum');
        case 5:
            return (id === 'while') || (id === 'break') || (id === 'catch') ||
                (id === 'throw') || (id === 'const') || (id === 'yield') ||
                (id === 'class') || (id === 'super');
        case 6:
            return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
                (id === 'switch') || (id === 'export') || (id === 'import');
        case 7:
            return (id === 'default') || (id === 'finally') || (id === 'extends');
        case 8:
            return (id === 'function') || (id === 'continue') || (id === 'debugger');
        case 10:
            return (id === 'instanceof');
        default:
            return false;
        }
    }

    function isReservedWordES5(id, strict) {
        return id === 'null' || id === 'true' || id === 'false' || isKeywordES5(id, strict);
    }

    function isReservedWordES6(id, strict) {
        return id === 'null' || id === 'true' || id === 'false' || isKeywordES6(id, strict);
    }

    function isRestrictedWord(id) {
        return id === 'eval' || id === 'arguments';
    }

    function isIdentifierName(id) {
        var i, iz, ch;

        if (id.length === 0) {
            return false;
        }

        ch = id.charCodeAt(0);
        if (!code.isIdentifierStart(ch) || ch === 92) {  // \ (backslash)
            return false;
        }

        for (i = 1, iz = id.length; i < iz; ++i) {
            ch = id.charCodeAt(i);
            if (!code.isIdentifierPart(ch) || ch === 92) {  // \ (backslash)
                return false;
            }
        }
        return true;
    }

    function isIdentifierES5(id, strict) {
        return isIdentifierName(id) && !isReservedWordES5(id, strict);
    }

    function isIdentifierES6(id, strict) {
        return isIdentifierName(id) && !isReservedWordES6(id, strict);
    }

    module.exports = {
        isKeywordES5: isKeywordES5,
        isKeywordES6: isKeywordES6,
        isReservedWordES5: isReservedWordES5,
        isReservedWordES6: isReservedWordES6,
        isRestrictedWord: isRestrictedWord,
        isIdentifierName: isIdentifierName,
        isIdentifierES5: isIdentifierES5,
        isIdentifierES6: isIdentifierES6
    };
}());
/* vim: set sw=4 ts=4 et tw=80 : */

},{"./code":19}],21:[function(require,module,exports){
/*
  Copyright (C) 2013 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/


(function () {
    'use strict';

    exports.ast = require('./ast');
    exports.code = require('./code');
    exports.keyword = require('./keyword');
}());
/* vim: set sw=4 ts=4 et tw=80 : */

},{"./ast":18,"./code":19,"./keyword":20}],22:[function(require,module,exports){
module.exports={
  "name": "escodegen",
  "description": "ECMAScript code generator",
  "homepage": "http://github.com/estools/escodegen",
  "main": "escodegen.js",
  "bin": {
    "esgenerate": "./bin/esgenerate.js",
    "escodegen": "./bin/escodegen.js"
  },
  "files": [
    "LICENSE.BSD",
    "LICENSE.source-map",
    "README.md",
    "bin",
    "escodegen.js",
    "gulpfile.js",
    "package.json"
  ],
  "version": "1.4.3",
  "engines": {
    "node": ">=0.10.0"
  },
  "maintainers": [
    {
      "name": "Yusuke Suzuki",
      "email": "utatane.tea@gmail.com",
      "url": "http://github.com/Constellation"
    }
  ],
  "repository": {
    "type": "git",
    "url": "http://github.com/estools/escodegen.git"
  },
  "dependencies": {
    "estraverse": "^1.9.0",
    "esutils": "^1.1.6",
    "esprima": "^1.2.2",
    "optionator": "^0.4.0",
    "source-map": "~0.1.40"
  },
  "optionalDependencies": {
    "source-map": "~0.1.40"
  },
  "devDependencies": {
    "esprima-moz": "*",
    "semver": "^4.1.0",
    "bluebird": "^2.3.11",
    "chai": "^1.10.0",
    "gulp-mocha": "^2.0.0",
    "gulp-eslint": "^0.2.0",
    "gulp": "^3.8.10",
    "bower-registry-client": "^0.2.1",
    "commonjs-everywhere": "^0.9.7"
  },
  "licenses": [
    {
      "type": "BSD",
      "url": "http://github.com/estools/escodegen/raw/master/LICENSE.BSD"
    }
  ],
  "scripts": {
    "test": "gulp travis",
    "unit-test": "gulp test",
    "lint": "gulp lint",
    "release": "node tools/release.js",
    "build-min": "./node_modules/.bin/cjsify -ma path: tools/entry-point.js > escodegen.browser.min.js",
    "build": "./node_modules/.bin/cjsify -a path: tools/entry-point.js > escodegen.browser.js"
  },
  "readme": "## Escodegen\n[![npm version](https://badge.fury.io/js/escodegen.svg)](http://badge.fury.io/js/escodegen)\n[![Build Status](https://secure.travis-ci.org/estools/escodegen.svg)](http://travis-ci.org/estools/escodegen)\n[![Dependency Status](https://david-dm.org/estools/escodegen.svg)](https://david-dm.org/estools/escodegen)\n[![devDependency Status](https://david-dm.org/estools/escodegen/dev-status.svg)](https://david-dm.org/estools/escodegen#info=devDependencies)\n\nEscodegen ([escodegen](http://github.com/estools/escodegen)) is an\n[ECMAScript](http://www.ecma-international.org/publications/standards/Ecma-262.htm)\n(also popularly known as [JavaScript](http://en.wikipedia.org/wiki/JavaScript))\ncode generator from [Mozilla's Parser API](https://developer.mozilla.org/en/SpiderMonkey/Parser_API)\nAST. See the [online generator](https://estools.github.io/escodegen/demo/index.html)\nfor a demo.\n\n\n### Install\n\nEscodegen can be used in a web browser:\n\n    <script src=\"escodegen.browser.js\"></script>\n\nescodegen.browser.js can be found in tagged revisions on GitHub.\n\nOr in a Node.js application via npm:\n\n    npm install escodegen\n\n### Usage\n\nA simple example: the program\n\n    escodegen.generate({\n        type: 'BinaryExpression',\n        operator: '+',\n        left: { type: 'Literal', value: 40 },\n        right: { type: 'Literal', value: 2 }\n    });\n\nproduces the string `'40 + 2'`.\n\nSee the [API page](https://github.com/estools/escodegen/wiki/API) for\noptions. To run the tests, execute `npm test` in the root directory.\n\n### Building browser bundle / minified browser bundle\n\nAt first, execute `npm install` to install the all dev dependencies.\nAfter that,\n\n    npm run-script build\n\nwill generate `escodegen.browser.js`, which can be used in browser environments.\n\nAnd,\n\n    npm run-script build-min\n\nwill generate the minified file `escodegen.browser.min.js`.\n\n### License\n\n#### Escodegen\n\nCopyright (C) 2012 [Yusuke Suzuki](http://github.com/Constellation)\n (twitter: [@Constellation](http://twitter.com/Constellation)) and other contributors.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n\n  * Redistributions of source code must retain the above copyright\n    notice, this list of conditions and the following disclaimer.\n\n  * Redistributions in binary form must reproduce the above copyright\n    notice, this list of conditions and the following disclaimer in the\n    documentation and/or other materials provided with the distribution.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\"\nAND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE\nIMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE\nARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY\nDIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES\n(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;\nLOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND\nON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT\n(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF\nTHIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n\n#### source-map\n\nSourceNodeMocks has a limited interface of mozilla/source-map SourceNode implementations.\n\nCopyright (c) 2009-2011, Mozilla Foundation and contributors\nAll rights reserved.\n\nRedistribution and use in source and binary forms, with or without\nmodification, are permitted provided that the following conditions are met:\n\n* Redistributions of source code must retain the above copyright notice, this\n  list of conditions and the following disclaimer.\n\n* Redistributions in binary form must reproduce the above copyright notice,\n  this list of conditions and the following disclaimer in the documentation\n  and/or other materials provided with the distribution.\n\n* Neither the names of the Mozilla Foundation nor the names of project\n  contributors may be used to endorse or promote products derived from this\n  software without specific prior written permission.\n\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS \"AS IS\" AND\nANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED\nWARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE\nDISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE\nFOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL\nDAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR\nSERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER\nCAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,\nOR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE\nOF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.\n",
  "readmeFilename": "README.md",
  "bugs": {
    "url": "https://github.com/estools/escodegen/issues"
  },
  "_id": "escodegen@1.4.3",
  "_from": "escodegen@1.4.x"
}

},{}],23:[function(require,module,exports){
/*
  Copyright (C) 2012-2013 Yusuke Suzuki <utatane.tea@gmail.com>
  Copyright (C) 2013 Alex Seville <hi@alexanderseville.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

/**
 * Escope (<a href="http://github.com/Constellation/escope">escope</a>) is an <a
 * href="http://www.ecma-international.org/publications/standards/Ecma-262.htm">ECMAScript</a>
 * scope analyzer extracted from the <a
 * href="http://github.com/Constellation/esmangle">esmangle project</a/>.
 * <p>
 * <em>escope</em> finds lexical scopes in a source program, i.e. areas of that
 * program where different occurrences of the same identifier refer to the same
 * variable. With each scope the contained variables are collected, and each
 * identifier reference in code is linked to its corresponding variable (if
 * possible).
 * <p>
 * <em>escope</em> works on a syntax tree of the parsed source code which has
 * to adhere to the <a
 * href="https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API">
 * Mozilla Parser API</a>. E.g. <a href="http://esprima.org">esprima</a> is a parser
 * that produces such syntax trees.
 * <p>
 * The main interface is the {@link analyze} function.
 * @module
 */

/*jslint bitwise:true */
/*global exports:true, define:true, require:true*/
(function (factory, global) {
    'use strict';

    function namespace(str, obj) {
        var i, iz, names, name;
        names = str.split('.');
        for (i = 0, iz = names.length; i < iz; ++i) {
            name = names[i];
            if (obj.hasOwnProperty(name)) {
                obj = obj[name];
            } else {
                obj = (obj[name] = {});
            }
        }
        return obj;
    }

    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
    // and plain browser loading,
    if (typeof define === 'function' && define.amd) {
        define('escope', ['exports', 'estraverse'], function (exports, estraverse) {
            factory(exports, global, estraverse);
        });
    } else if (typeof exports !== 'undefined') {
        factory(exports, global, require('estraverse'));
    } else {
        factory(namespace('escope', global), global, global.estraverse);
    }
}(function (exports, global, estraverse) {
    'use strict';

    var Syntax,
        Map,
        currentScope,
        globalScope,
        scopes,
        options;

    Syntax = estraverse.Syntax;

    if (typeof global.Map !== 'undefined') {
        // ES6 Map
        Map = global.Map;
    } else {
        Map = function Map() {
            this.__data = {};
        };

        Map.prototype.get = function MapGet(key) {
            key = '$' + key;
            if (this.__data.hasOwnProperty(key)) {
                return this.__data[key];
            }
            return undefined;
        };

        Map.prototype.has = function MapHas(key) {
            key = '$' + key;
            return this.__data.hasOwnProperty(key);
        };

        Map.prototype.set = function MapSet(key, val) {
            key = '$' + key;
            this.__data[key] = val;
        };

        Map.prototype['delete'] = function MapDelete(key) {
            key = '$' + key;
            return delete this.__data[key];
        };
    }

    function assert(cond, text) {
        if (!cond) {
            throw new Error(text);
        }
    }

    function defaultOptions() {
        return {
            optimistic: false,
            directive: false
        };
    }

    function updateDeeply(target, override) {
        var key, val;

        function isHashObject(target) {
            return typeof target === 'object' && target instanceof Object && !(target instanceof RegExp);
        }

        for (key in override) {
            if (override.hasOwnProperty(key)) {
                val = override[key];
                if (isHashObject(val)) {
                    if (isHashObject(target[key])) {
                        updateDeeply(target[key], val);
                    } else {
                        target[key] = updateDeeply({}, val);
                    }
                } else {
                    target[key] = val;
                }
            }
        }
        return target;
    }

    /**
     * A Reference represents a single occurrence of an identifier in code.
     * @class Reference
     */
    function Reference(ident, scope, flag, writeExpr, maybeImplicitGlobal) {
        /** 
         * Identifier syntax node.
         * @member {esprima#Identifier} Reference#identifier 
         */
        this.identifier = ident;
        /** 
         * Reference to the enclosing Scope.
         * @member {Scope} Reference#from 
         */
        this.from = scope;
        /**
         * Whether the reference comes from a dynamic scope (such as 'eval',
         * 'with', etc.), and may be trapped by dynamic scopes.
         * @member {boolean} Reference#tainted
         */
        this.tainted = false;
        /** 
         * The variable this reference is resolved with.
         * @member {Variable} Reference#resolved 
         */
        this.resolved = null;
        /** 
         * The read-write mode of the reference. (Value is one of {@link
         * Reference.READ}, {@link Reference.RW}, {@link Reference.WRITE}).
         * @member {number} Reference#flag 
         * @private
         */
        this.flag = flag;
        if (this.isWrite()) {
            /** 
             * If reference is writeable, this is the tree being written to it.
             * @member {esprima#Node} Reference#writeExpr 
             */
            this.writeExpr = writeExpr;
        }
        /** 
         * Whether the Reference might refer to a global variable.
         * @member {boolean} Reference#__maybeImplicitGlobal 
         * @private
         */
        this.__maybeImplicitGlobal = maybeImplicitGlobal;
    }

    /** 
     * @constant Reference.READ 
     * @private
     */
    Reference.READ = 0x1;
    /** 
     * @constant Reference.WRITE 
     * @private
     */
    Reference.WRITE = 0x2;
    /** 
     * @constant Reference.RW 
     * @private
     */
    Reference.RW = 0x3;

    /**
     * Whether the reference is static.
     * @method Reference#isStatic
     * @return {boolean}
     */
    Reference.prototype.isStatic = function isStatic() {
        return !this.tainted && this.resolved && this.resolved.scope.isStatic();
    };

    /**
     * Whether the reference is writeable.
     * @method Reference#isWrite
     * @return {boolean}
     */
    Reference.prototype.isWrite = function isWrite() {
        return this.flag & Reference.WRITE;
    };

    /**
     * Whether the reference is readable.
     * @method Reference#isRead
     * @return {boolean}
     */
    Reference.prototype.isRead = function isRead() {
        return this.flag & Reference.READ;
    };

    /**
     * Whether the reference is read-only.
     * @method Reference#isReadOnly
     * @return {boolean}
     */
    Reference.prototype.isReadOnly = function isReadOnly() {
        return this.flag === Reference.READ;
    };

    /**
     * Whether the reference is write-only.
     * @method Reference#isWriteOnly
     * @return {boolean}
     */
    Reference.prototype.isWriteOnly = function isWriteOnly() {
        return this.flag === Reference.WRITE;
    };

    /**
     * Whether the reference is read-write.
     * @method Reference#isReadWrite
     * @return {boolean}
     */
    Reference.prototype.isReadWrite = function isReadWrite() {
        return this.flag === Reference.RW;
    };

    /**
     * A Variable represents a locally scoped identifier. These include arguments to
     * functions.
     * @class Variable
     */
    function Variable(name, scope) {
        /**  
         * The variable name, as given in the source code.
         * @member {String} Variable#name 
         */
        this.name = name;
        /**
         * List of defining occurrences of this variable (like in 'var ...'
         * statements or as parameter), as AST nodes.
         * @member {esprima.Identifier[]} Variable#identifiers
         */
        this.identifiers = [];
        /**
         * List of {@link Reference|references} of this variable (excluding parameter entries)
         * in its defining scope and all nested scopes. For defining
         * occurrences only see {@link Variable#defs}.
         * @member {Reference[]} Variable#references
         */
        this.references = [];

        /**
         * List of defining occurrences of this variable (like in 'var ...'
         * statements or as parameter), as custom objects.
         * @typedef {Object} DefEntry
         * @property {String} DefEntry.type - the type of the occurrence (e.g.
         *      "Parameter", "Variable", ...)
         * @property {esprima.Identifier} DefEntry.name - the identifier AST node of the occurrence
         * @property {esprima.Node} DefEntry.node - the enclosing node of the
         *      identifier
         * @property {esprima.Node} [DefEntry.parent] - the enclosing statement
         *      node of the identifier
         * @member {DefEntry[]} Variable#defs
         */
        this.defs = [];

        this.tainted = false;
        /**
         * Whether this is a stack variable.
         * @member {boolean} Variable#stack
         */
        this.stack = true;
        /** 
         * Reference to the enclosing Scope.
         * @member {Scope} Variable#scope 
         */
        this.scope = scope;
    }

    Variable.CatchClause = 'CatchClause';
    Variable.Parameter = 'Parameter';
    Variable.FunctionName = 'FunctionName';
    Variable.Variable = 'Variable';
    Variable.ImplicitGlobalVariable = 'ImplicitGlobalVariable';

    function isStrictScope(scope, block) {
        var body, i, iz, stmt, expr;

        // When upper scope is exists and strict, inner scope is also strict.
        if (scope.upper && scope.upper.isStrict) {
            return true;
        }

        if (scope.type === 'function') {
            body = block.body;
        } else if (scope.type === 'global') {
            body = block;
        } else {
            return false;
        }

        if (options.directive) {
            for (i = 0, iz = body.body.length; i < iz; ++i) {
                stmt = body.body[i];
                if (stmt.type !== 'DirectiveStatement') {
                    break;
                }
                if (stmt.raw === '"use strict"' || stmt.raw === '\'use strict\'') {
                    return true;
                }
            }
        } else {
            for (i = 0, iz = body.body.length; i < iz; ++i) {
                stmt = body.body[i];
                if (stmt.type !== Syntax.ExpressionStatement) {
                    break;
                }
                expr = stmt.expression;
                if (expr.type !== Syntax.Literal || typeof expr.value !== 'string') {
                    break;
                }
                if (expr.raw != null) {
                    if (expr.raw === '"use strict"' || expr.raw === '\'use strict\'') {
                        return true;
                    }
                } else {
                    if (expr.value === 'use strict') {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * @class Scope
     */
    function Scope(block, opt) {
        var variable, body;

        /**
         * One of 'catch', 'with', 'function' or 'global'.
         * @member {String} Scope#type
         */
        this.type =
            (block.type === Syntax.CatchClause) ? 'catch' :
            (block.type === Syntax.WithStatement) ? 'with' :
            (block.type === Syntax.Program) ? 'global' : 'function';
         /**
         * The scoped {@link Variable}s of this scope, as <code>{ Variable.name
         * : Variable }</code>.
         * @member {Map} Scope#set
         */
        this.set = new Map();
        /**
         * The tainted variables of this scope, as <code>{ Variable.name :
         * boolean }</code>.
         * @member {Map} Scope#taints */
        this.taints = new Map();
        /**
         * Generally, through the lexical scoping of JS you can always know
         * which variable an identifier in the source code refers to. There are
         * a few exceptions to this rule. With 'global' and 'with' scopes you
         * can only decide at runtime which variable a reference refers to.
         * Moreover, if 'eval()' is used in a scope, it might introduce new
         * bindings in this or its prarent scopes.
         * All those scopes are considered 'dynamic'.
         * @member {boolean} Scope#dynamic
         */
        this.dynamic = this.type === 'global' || this.type === 'with';
        /**
         * A reference to the scope-defining syntax node.
         * @member {esprima.Node} Scope#block
         */
        this.block = block;
         /**
         * The {@link Reference|references} that are not resolved with this scope.
         * @member {Reference[]} Scope#through
         */
        this.through = [];
         /**
         * The scoped {@link Variable}s of this scope. In the case of a
         * 'function' scope this includes the automatic argument <em>arguments</em> as
         * its first element, as well as all further formal arguments.
         * @member {Variable[]} Scope#variables
         */
        this.variables = [];
         /**
         * Any variable {@link Reference|reference} found in this scope. This
         * includes occurrences of local variables as well as variables from
         * parent scopes (including the global scope). For local variables
         * this also includes defining occurrences (like in a 'var' statement).
         * In a 'function' scope this does not include the occurrences of the
         * formal parameter in the parameter list.
         * @member {Reference[]} Scope#references
         */
        this.references = [];
         /**
         * List of {@link Reference}s that are left to be resolved (i.e. which
         * need to be linked to the variable they refer to). Used internally to
         * resolve bindings during scope analysis. On a finalized scope
         * analysis, all sopes have <em>left</em> value <strong>null</strong>.
         * @member {Reference[]} Scope#left
         */
        this.left = [];
         /**
         * For 'global' and 'function' scopes, this is a self-reference. For
         * other scope types this is the <em>variableScope</em> value of the
         * parent scope.
         * @member {Scope} Scope#variableScope
         */
        this.variableScope =
            (this.type === 'global' || this.type === 'function') ? this : currentScope.variableScope;
         /**
         * Whether this scope is created by a FunctionExpression.
         * @member {boolean} Scope#functionExpressionScope
         */
        this.functionExpressionScope = false;
         /**
         * Whether this is a scope that contains an 'eval()' invocation.
         * @member {boolean} Scope#directCallToEvalScope
         */
        this.directCallToEvalScope = false;
         /**
         * @member {boolean} Scope#thisFound
         */
        this.thisFound = false;
        body = this.type === 'function' ? block.body : block;
        if (opt.naming) {
            this.__define(block.id, {
                type: Variable.FunctionName,
                name: block.id,
                node: block
            });
            this.functionExpressionScope = true;
        } else {
            if (this.type === 'function') {
                variable = new Variable('arguments', this);
                this.taints.set('arguments', true);
                this.set.set('arguments', variable);
                this.variables.push(variable);
            }

            if (block.type === Syntax.FunctionExpression && block.id) {
                new Scope(block, { naming: true });
            }
        }

         /**
         * Reference to the parent {@link Scope|scope}.
         * @member {Scope} Scope#upper
         */
        this.upper = currentScope;
         /**
         * Whether 'use strict' is in effect in this scope.
         * @member {boolean} Scope#isStrict
         */
        this.isStrict = isStrictScope(this, block);

         /**
         * List of nested {@link Scope}s.
         * @member {Scope[]} Scope#childScopes
         */
        this.childScopes = [];
        if (currentScope) {
            currentScope.childScopes.push(this);
        }


        // RAII
        currentScope = this;
        if (this.type === 'global') {
            globalScope = this;
            globalScope.implicit = {
                set: new Map(),
                variables: []
            };
        }
        scopes.push(this);
    }

    Scope.prototype.__close = function __close() {
        var i, iz, ref, current, node, implicit;

        // Because if this is global environment, upper is null
        if (!this.dynamic || options.optimistic) {
            // static resolve
            for (i = 0, iz = this.left.length; i < iz; ++i) {
                ref = this.left[i];
                if (!this.__resolve(ref)) {
                    this.__delegateToUpperScope(ref);
                }
            }
        } else {
            // this is "global" / "with" / "function with eval" environment
            if (this.type === 'with') {
                for (i = 0, iz = this.left.length; i < iz; ++i) {
                    ref = this.left[i];
                    ref.tainted = true;
                    this.__delegateToUpperScope(ref);
                }
            } else {
                for (i = 0, iz = this.left.length; i < iz; ++i) {
                    // notify all names are through to global
                    ref = this.left[i];
                    current = this;
                    do {
                        current.through.push(ref);
                        current = current.upper;
                    } while (current);
                }
            }
        }

        if (this.type === 'global') {
            implicit = [];
            for (i = 0, iz = this.left.length; i < iz; ++i) {
                ref = this.left[i];
                if (ref.__maybeImplicitGlobal && !this.set.has(ref.identifier.name)) {
                    implicit.push(ref.__maybeImplicitGlobal);
                }
            }

            // create an implicit global variable from assignment expression
            for (i = 0, iz = implicit.length; i < iz; ++i) {
                node = implicit[i];
                this.__defineImplicit(node.left, {
                    type: Variable.ImplicitGlobalVariable,
                    name: node.left,
                    node: node
                });
            }
        }

        this.left = null;
        currentScope = this.upper;
    };

    Scope.prototype.__resolve = function __resolve(ref) {
        var variable, name;
        name = ref.identifier.name;
        if (this.set.has(name)) {
            variable = this.set.get(name);
            variable.references.push(ref);
            variable.stack = variable.stack && ref.from.variableScope === this.variableScope;
            if (ref.tainted) {
                variable.tainted = true;
                this.taints.set(variable.name, true);
            }
            ref.resolved = variable;
            return true;
        }
        return false;
    };

    Scope.prototype.__delegateToUpperScope = function __delegateToUpperScope(ref) {
        if (this.upper) {
            this.upper.left.push(ref);
        }
        this.through.push(ref);
    };

    Scope.prototype.__defineImplicit = function __defineImplicit(node, info) {
        var name, variable;
        if (node && node.type === Syntax.Identifier) {
            name = node.name;
            if (!this.implicit.set.has(name)) {
                variable = new Variable(name, this);
                variable.identifiers.push(node);
                variable.defs.push(info);
                this.implicit.set.set(name, variable);
                this.implicit.variables.push(variable);
            } else {
                variable = this.implicit.set.get(name);
                variable.identifiers.push(node);
                variable.defs.push(info);
            }
        }
    };

    Scope.prototype.__define = function __define(node, info) {
        var name, variable;
        if (node && node.type === Syntax.Identifier) {
            name = node.name;
            if (!this.set.has(name)) {
                variable = new Variable(name, this);
                variable.identifiers.push(node);
                variable.defs.push(info);
                this.set.set(name, variable);
                this.variables.push(variable);
            } else {
                variable = this.set.get(name);
                variable.identifiers.push(node);
                variable.defs.push(info);
            }
        }
    };

    Scope.prototype.__referencing = function __referencing(node, assign, writeExpr, maybeImplicitGlobal) {
        var ref;
        // because Array element may be null
        if (node && node.type === Syntax.Identifier) {
            ref = new Reference(node, this, assign || Reference.READ, writeExpr, maybeImplicitGlobal);
            this.references.push(ref);
            this.left.push(ref);
        }
    };

    Scope.prototype.__detectEval = function __detectEval() {
        var current;
        current = this;
        this.directCallToEvalScope = true;
        do {
            current.dynamic = true;
            current = current.upper;
        } while (current);
    };

    Scope.prototype.__detectThis = function __detectThis() {
        this.thisFound = true;
    };

    Scope.prototype.__isClosed = function isClosed() {
        return this.left === null;
    };

    // API Scope#resolve(name)
    // returns resolved reference
    Scope.prototype.resolve = function resolve(ident) {
        var ref, i, iz;
        assert(this.__isClosed(), 'scope should be closed');
        assert(ident.type === Syntax.Identifier, 'target should be identifier');
        for (i = 0, iz = this.references.length; i < iz; ++i) {
            ref = this.references[i];
            if (ref.identifier === ident) {
                return ref;
            }
        }
        return null;
    };

    // API Scope#isStatic
    // returns this scope is static
    Scope.prototype.isStatic = function isStatic() {
        return !this.dynamic;
    };

    // API Scope#isArgumentsMaterialized
    // return this scope has materialized arguments
    Scope.prototype.isArgumentsMaterialized = function isArgumentsMaterialized() {
        // TODO(Constellation)
        // We can more aggressive on this condition like this.
        //
        // function t() {
        //     // arguments of t is always hidden.
        //     function arguments() {
        //     }
        // }
        var variable;

        // This is not function scope
        if (this.type !== 'function') {
            return true;
        }

        if (!this.isStatic()) {
            return true;
        }

        variable = this.set.get('arguments');
        assert(variable, 'always have arguments variable');
        return variable.tainted || variable.references.length  !== 0;
    };

    // API Scope#isThisMaterialized
    // return this scope has materialized `this` reference
    Scope.prototype.isThisMaterialized = function isThisMaterialized() {
        // This is not function scope
        if (this.type !== 'function') {
            return true;
        }
        if (!this.isStatic()) {
            return true;
        }
        return this.thisFound;
    };

    Scope.mangledName = '__$escope$__';

    Scope.prototype.attach = function attach() {
        if (!this.functionExpressionScope) {
            this.block[Scope.mangledName] = this;
        }
    };

    Scope.prototype.detach = function detach() {
        if (!this.functionExpressionScope) {
            delete this.block[Scope.mangledName];
        }
    };

    Scope.prototype.isUsedName = function (name) {
        if (this.set.has(name)) {
            return true;
        }
        for (var i = 0, iz = this.through.length; i < iz; ++i) {
            if (this.through[i].identifier.name === name) {
                return true;
            }
        }
        return false;
    };

    /**
     * @class ScopeManager
     */
    function ScopeManager(scopes) {
        this.scopes = scopes;
        this.attached = false;
    }

    // Returns appropliate scope for this node
    ScopeManager.prototype.__get = function __get(node) {
        var i, iz, scope;
        if (this.attached) {
            return node[Scope.mangledName] || null;
        }
        if (Scope.isScopeRequired(node)) {
            for (i = 0, iz = this.scopes.length; i < iz; ++i) {
                scope = this.scopes[i];
                if (!scope.functionExpressionScope) {
                    if (scope.block === node) {
                        return scope;
                    }
                }
            }
        }
        return null;
    };

    ScopeManager.prototype.acquire = function acquire(node) {
        return this.__get(node);
    };

    ScopeManager.prototype.release = function release(node) {
        var scope = this.__get(node);
        if (scope) {
            scope = scope.upper;
            while (scope) {
                if (!scope.functionExpressionScope) {
                    return scope;
                }
                scope = scope.upper;
            }
        }
        return null;
    };

    ScopeManager.prototype.attach = function attach() {
        var i, iz;
        for (i = 0, iz = this.scopes.length; i < iz; ++i) {
            this.scopes[i].attach();
        }
        this.attached = true;
    };

    ScopeManager.prototype.detach = function detach() {
        var i, iz;
        for (i = 0, iz = this.scopes.length; i < iz; ++i) {
            this.scopes[i].detach();
        }
        this.attached = false;
    };

    Scope.isScopeRequired = function isScopeRequired(node) {
        return Scope.isVariableScopeRequired(node) || node.type === Syntax.WithStatement || node.type === Syntax.CatchClause;
    };

    Scope.isVariableScopeRequired = function isVariableScopeRequired(node) {
        return node.type === Syntax.Program || node.type === Syntax.FunctionExpression || node.type === Syntax.FunctionDeclaration;
    };

    /**
     * Main interface function. Takes an Esprima syntax tree and returns the
     * analyzed scopes.
     * @function analyze
     * @param {esprima.Tree} tree
     * @param {Object} providedOptions - Options that tailor the scope analysis
     * @param {boolean} [providedOptions.optimistic=false] - the optimistic flag
     * @param {boolean} [providedOptions.directive=false]- the directive flag
     * @param {boolean} [providedOptions.ignoreEval=false]- whether to check 'eval()' calls
     * @return {ScopeManager}
     */
    function analyze(tree, providedOptions) {
        var resultScopes;

        options = updateDeeply(defaultOptions(), providedOptions);
        resultScopes = scopes = [];
        currentScope = null;
        globalScope = null;

        // attach scope and collect / resolve names
        estraverse.traverse(tree, {
            enter: function enter(node) {
                var i, iz, decl;
                if (Scope.isScopeRequired(node)) {
                    new Scope(node, {});
                }

                switch (node.type) {
                case Syntax.AssignmentExpression:
                    if (node.operator === '=') {
                        currentScope.__referencing(node.left, Reference.WRITE, node.right, (!currentScope.isStrict && node.left.name != null) && node);
                    } else {
                        currentScope.__referencing(node.left, Reference.RW, node.right);
                    }
                    currentScope.__referencing(node.right);
                    break;

                case Syntax.ArrayExpression:
                    for (i = 0, iz = node.elements.length; i < iz; ++i) {
                        currentScope.__referencing(node.elements[i]);
                    }
                    break;

                case Syntax.BlockStatement:
                    break;

                case Syntax.BinaryExpression:
                    currentScope.__referencing(node.left);
                    currentScope.__referencing(node.right);
                    break;

                case Syntax.BreakStatement:
                    break;

                case Syntax.CallExpression:
                    currentScope.__referencing(node.callee);
                    for (i = 0, iz = node['arguments'].length; i < iz; ++i) {
                        currentScope.__referencing(node['arguments'][i]);
                    }

                    // check this is direct call to eval
                    if (!options.ignoreEval && node.callee.type === Syntax.Identifier && node.callee.name === 'eval') {
                        currentScope.variableScope.__detectEval();
                    }
                    break;

                case Syntax.CatchClause:
                    currentScope.__define(node.param, {
                        type: Variable.CatchClause,
                        name: node.param,
                        node: node
                    });
                    break;

                case Syntax.ConditionalExpression:
                    currentScope.__referencing(node.test);
                    currentScope.__referencing(node.consequent);
                    currentScope.__referencing(node.alternate);
                    break;

                case Syntax.ContinueStatement:
                    break;

                case Syntax.DirectiveStatement:
                    break;

                case Syntax.DoWhileStatement:
                    currentScope.__referencing(node.test);
                    break;

                case Syntax.DebuggerStatement:
                    break;

                case Syntax.EmptyStatement:
                    break;

                case Syntax.ExpressionStatement:
                    currentScope.__referencing(node.expression);
                    break;

                case Syntax.ForStatement:
                    currentScope.__referencing(node.init);
                    currentScope.__referencing(node.test);
                    currentScope.__referencing(node.update);
                    break;

                case Syntax.ForInStatement:
                    if (node.left.type === Syntax.VariableDeclaration) {
                        currentScope.__referencing(node.left.declarations[0].id, Reference.WRITE, null, false);
                    } else {
                        currentScope.__referencing(node.left, Reference.WRITE, null, (!currentScope.isStrict && node.left.name != null) && node);
                    }
                    currentScope.__referencing(node.right);
                    break;

                case Syntax.FunctionDeclaration:
                    // FunctionDeclaration name is defined in upper scope
                    currentScope.upper.__define(node.id, {
                        type: Variable.FunctionName,
                        name: node.id,
                        node: node
                    });
                    for (i = 0, iz = node.params.length; i < iz; ++i) {
                        currentScope.__define(node.params[i], {
                            type: Variable.Parameter,
                            name: node.params[i],
                            node: node,
                            index: i
                        });
                    }
                    break;

                case Syntax.FunctionExpression:
                    // id is defined in upper scope
                    for (i = 0, iz = node.params.length; i < iz; ++i) {
                        currentScope.__define(node.params[i], {
                            type: Variable.Parameter,
                            name: node.params[i],
                            node: node,
                            index: i
                        });
                    }
                    break;

                case Syntax.Identifier:
                    break;

                case Syntax.IfStatement:
                    currentScope.__referencing(node.test);
                    break;

                case Syntax.Literal:
                    break;

                case Syntax.LabeledStatement:
                    break;

                case Syntax.LogicalExpression:
                    currentScope.__referencing(node.left);
                    currentScope.__referencing(node.right);
                    break;

                case Syntax.MemberExpression:
                    currentScope.__referencing(node.object);
                    if (node.computed) {
                        currentScope.__referencing(node.property);
                    }
                    break;

                case Syntax.NewExpression:
                    currentScope.__referencing(node.callee);
                    for (i = 0, iz = node['arguments'].length; i < iz; ++i) {
                        currentScope.__referencing(node['arguments'][i]);
                    }
                    break;

                case Syntax.ObjectExpression:
                    break;

                case Syntax.Program:
                    break;

                case Syntax.Property:
                    currentScope.__referencing(node.value);
                    break;

                case Syntax.ReturnStatement:
                    currentScope.__referencing(node.argument);
                    break;

                case Syntax.SequenceExpression:
                    for (i = 0, iz = node.expressions.length; i < iz; ++i) {
                        currentScope.__referencing(node.expressions[i]);
                    }
                    break;

                case Syntax.SwitchStatement:
                    currentScope.__referencing(node.discriminant);
                    break;

                case Syntax.SwitchCase:
                    currentScope.__referencing(node.test);
                    break;

                case Syntax.ThisExpression:
                    currentScope.variableScope.__detectThis();
                    break;

                case Syntax.ThrowStatement:
                    currentScope.__referencing(node.argument);
                    break;

                case Syntax.TryStatement:
                    break;

                case Syntax.UnaryExpression:
                    currentScope.__referencing(node.argument);
                    break;

                case Syntax.UpdateExpression:
                    currentScope.__referencing(node.argument, Reference.RW, null);
                    break;

                case Syntax.VariableDeclaration:
                    for (i = 0, iz = node.declarations.length; i < iz; ++i) {
                        decl = node.declarations[i];
                        currentScope.variableScope.__define(decl.id, {
                            type: Variable.Variable,
                            name: decl.id,
                            node: decl,
                            index: i,
                            parent: node
                        });
                        if (decl.init) {
                            // initializer is found
                            currentScope.__referencing(decl.id, Reference.WRITE, decl.init, false);
                            currentScope.__referencing(decl.init);
                        }
                    }
                    break;

                case Syntax.VariableDeclarator:
                    break;

                case Syntax.WhileStatement:
                    currentScope.__referencing(node.test);
                    break;

                case Syntax.WithStatement:
                    // WithStatement object is referenced at upper scope
                    currentScope.upper.__referencing(node.object);
                    break;
                }
            },

            leave: function leave(node) {
                while (currentScope && node === currentScope.block) {
                    currentScope.__close();
                }
            }
        });

        assert(currentScope === null);
        globalScope = null;
        scopes = null;
        options = null;

        return new ScopeManager(resultScopes);
    }

    /** @name module:escope.version */
    exports.version = '1.0.1';
    /** @name module:escope.Reference */
    exports.Reference = Reference;
    /** @name module:escope.Variable */
    exports.Variable = Variable;
    /** @name module:escope.Scope */
    exports.Scope = Scope;
    /** @name module:escope.ScopeManager */
    exports.ScopeManager = ScopeManager;
    /** @name module:escope.analyze */
    exports.analyze = analyze;
}, this));
/* vim: set sw=4 ts=4 et tw=80 : */

},{"estraverse":24}],24:[function(require,module,exports){
module.exports=require(17)
},{"/Users/ptaylor/dev/sweet.js/node_modules/escodegen/node_modules/estraverse/estraverse.js":17}],25:[function(require,module,exports){

},{}],26:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":31}],27:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],28:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":29}],29:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],30:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],31:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":30,"_process":29,"inherits":27}],32:[function(require,module,exports){
var indexOf = require('indexof');

var Object_keys = function (obj) {
    if (Object.keys) return Object.keys(obj)
    else {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    }
};

var forEach = function (xs, fn) {
    if (xs.forEach) return xs.forEach(fn)
    else for (var i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};

var defineProp = (function() {
    try {
        Object.defineProperty({}, '_', {});
        return function(obj, name, value) {
            Object.defineProperty(obj, name, {
                writable: true,
                enumerable: false,
                configurable: true,
                value: value
            })
        };
    } catch(e) {
        return function(obj, name, value) {
            obj[name] = value;
        };
    }
}());

var globals = ['Array', 'Boolean', 'Date', 'Error', 'EvalError', 'Function',
'Infinity', 'JSON', 'Math', 'NaN', 'Number', 'Object', 'RangeError',
'ReferenceError', 'RegExp', 'String', 'SyntaxError', 'TypeError', 'URIError',
'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape'];

function Context() {}
Context.prototype = {};

var Script = exports.Script = function NodeScript (code) {
    if (!(this instanceof Script)) return new Script(code);
    this.code = code;
};

Script.prototype.runInContext = function (context) {
    if (!(context instanceof Context)) {
        throw new TypeError("needs a 'context' argument.");
    }
    
    var iframe = document.createElement('iframe');
    if (!iframe.style) iframe.style = {};
    iframe.style.display = 'none';
    
    document.body.appendChild(iframe);
    
    var win = iframe.contentWindow;
    var wEval = win.eval, wExecScript = win.execScript;

    if (!wEval && wExecScript) {
        // win.eval() magically appears when this is called in IE:
        wExecScript.call(win, 'null');
        wEval = win.eval;
    }
    
    forEach(Object_keys(context), function (key) {
        win[key] = context[key];
    });
    forEach(globals, function (key) {
        if (context[key]) {
            win[key] = context[key];
        }
    });
    
    var winKeys = Object_keys(win);

    var res = wEval.call(win, this.code);
    
    forEach(Object_keys(win), function (key) {
        // Avoid copying circular objects like `top` and `window` by only
        // updating existing context properties or new properties in the `win`
        // that was only introduced after the eval.
        if (key in context || indexOf(winKeys, key) === -1) {
            context[key] = win[key];
        }
    });

    forEach(globals, function (key) {
        if (!(key in context)) {
            defineProp(context, key, win[key]);
        }
    });
    
    document.body.removeChild(iframe);
    
    return res;
};

Script.prototype.runInThisContext = function () {
    return eval(this.code); // maybe...
};

Script.prototype.runInNewContext = function (context) {
    var ctx = Script.createContext(context);
    var res = this.runInContext(ctx);

    forEach(Object_keys(ctx), function (key) {
        context[key] = ctx[key];
    });

    return res;
};

forEach(Object_keys(Script.prototype), function (name) {
    exports[name] = Script[name] = function (code) {
        var s = Script(code);
        return s[name].apply(s, [].slice.call(arguments, 1));
    };
});

exports.createScript = function (code) {
    return exports.Script(code);
};

exports.createContext = Script.createContext = function (context) {
    var copy = new Context();
    if(typeof context === 'object') {
        forEach(Object_keys(context), function (key) {
            copy[key] = context[key];
        });
    }
    return copy;
};

},{"indexof":33}],33:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],34:[function(require,module,exports){
/**
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */
function universalModule() {
  var $Object = Object;

function createClass(ctor, methods, staticMethods, superClass) {
  var proto;
  if (superClass) {
    var superProto = superClass.prototype;
    proto = $Object.create(superProto);
  } else {
    proto = ctor.prototype;
  }
  $Object.keys(methods).forEach(function (key) {
    proto[key] = methods[key];
  });
  $Object.keys(staticMethods).forEach(function (key) {
    ctor[key] = staticMethods[key];
  });
  proto.constructor = ctor;
  ctor.prototype = proto;
  return ctor;
}

function superCall(self, proto, name, args) {
  return $Object.getPrototypeOf(proto)[name].apply(self, args);
}

function defaultSuperCall(self, proto, args) {
  superCall(self, proto, 'constructor', args);
}

var $traceurRuntime = {};
$traceurRuntime.createClass = createClass;
$traceurRuntime.superCall = superCall;
$traceurRuntime.defaultSuperCall = defaultSuperCall;
"use strict";
function is(valueA, valueB) {
  if (valueA === valueB || (valueA !== valueA && valueB !== valueB)) {
    return true;
  }
  if (!valueA || !valueB) {
    return false;
  }
  if (typeof valueA.valueOf === 'function' && typeof valueB.valueOf === 'function') {
    valueA = valueA.valueOf();
    valueB = valueB.valueOf();
  }
  return typeof valueA.equals === 'function' && typeof valueB.equals === 'function' ? valueA.equals(valueB) : valueA === valueB || (valueA !== valueA && valueB !== valueB);
}
function invariant(condition, error) {
  if (!condition)
    throw new Error(error);
}
var DELETE = 'delete';
var SHIFT = 5;
var SIZE = 1 << SHIFT;
var MASK = SIZE - 1;
var NOT_SET = {};
var CHANGE_LENGTH = {value: false};
var DID_ALTER = {value: false};
function MakeRef(ref) {
  ref.value = false;
  return ref;
}
function SetRef(ref) {
  ref && (ref.value = true);
}
function OwnerID() {}
function arrCopy(arr, offset) {
  offset = offset || 0;
  var len = Math.max(0, arr.length - offset);
  var newArr = new Array(len);
  for (var ii = 0; ii < len; ii++) {
    newArr[ii] = arr[ii + offset];
  }
  return newArr;
}
function assertNotInfinite(size) {
  invariant(size !== Infinity, 'Cannot perform this action with an infinite size.');
}
function ensureSize(iter) {
  if (iter.size === undefined) {
    iter.size = iter.__iterate(returnTrue);
  }
  return iter.size;
}
function wrapIndex(iter, index) {
  return index >= 0 ? (+index) : ensureSize(iter) + (+index);
}
function returnTrue() {
  return true;
}
function wholeSlice(begin, end, size) {
  return (begin === 0 || (size !== undefined && begin <= -size)) && (end === undefined || (size !== undefined && end >= size));
}
function resolveBegin(begin, size) {
  return resolveIndex(begin, size, 0);
}
function resolveEnd(end, size) {
  return resolveIndex(end, size, size);
}
function resolveIndex(index, size, defaultIndex) {
  return index === undefined ? defaultIndex : index < 0 ? Math.max(0, size + index) : size === undefined ? index : Math.min(size, index);
}
var imul = typeof Math.imul === 'function' && Math.imul(0xffffffff, 2) === -2 ? Math.imul : function imul(a, b) {
  a = a | 0;
  b = b | 0;
  var c = a & 0xffff;
  var d = b & 0xffff;
  return (c * d) + ((((a >>> 16) * d + c * (b >>> 16)) << 16) >>> 0) | 0;
};
function smi(i32) {
  return ((i32 >>> 1) & 0x40000000) | (i32 & 0xBFFFFFFF);
}
function hash(o) {
  if (o === false || o === null || o === undefined) {
    return 0;
  }
  if (typeof o.valueOf === 'function') {
    o = o.valueOf();
    if (o === false || o === null || o === undefined) {
      return 0;
    }
  }
  if (o === true) {
    return 1;
  }
  var type = typeof o;
  if (type === 'number') {
    var h = o | 0;
    while (o > 0xFFFFFFFF) {
      o /= 0xFFFFFFFF;
      h ^= o;
    }
    return smi(h);
  }
  if (type === 'string') {
    return o.length > STRING_HASH_CACHE_MIN_STRLEN ? cachedHashString(o) : hashString(o);
  }
  if (typeof o.hashCode === 'function') {
    return o.hashCode();
  }
  return hashJSObj(o);
}
function cachedHashString(string) {
  var hash = stringHashCache[string];
  if (hash === undefined) {
    hash = hashString(string);
    if (STRING_HASH_CACHE_SIZE === STRING_HASH_CACHE_MAX_SIZE) {
      STRING_HASH_CACHE_SIZE = 0;
      stringHashCache = {};
    }
    STRING_HASH_CACHE_SIZE++;
    stringHashCache[string] = hash;
  }
  return hash;
}
function hashString(string) {
  var hash = 0;
  for (var ii = 0; ii < string.length; ii++) {
    hash = 31 * hash + string.charCodeAt(ii) | 0;
  }
  return smi(hash);
}
function hashJSObj(obj) {
  var hash = weakMap && weakMap.get(obj);
  if (hash)
    return hash;
  hash = obj[UID_HASH_KEY];
  if (hash)
    return hash;
  if (!canDefineProperty) {
    hash = obj.propertyIsEnumerable && obj.propertyIsEnumerable[UID_HASH_KEY];
    if (hash)
      return hash;
    hash = getIENodeHash(obj);
    if (hash)
      return hash;
  }
  if (Object.isExtensible && !Object.isExtensible(obj)) {
    throw new Error('Non-extensible objects are not allowed as keys.');
  }
  hash = ++objHashUID;
  if (objHashUID & 0x40000000) {
    objHashUID = 0;
  }
  if (weakMap) {
    weakMap.set(obj, hash);
  } else if (canDefineProperty) {
    Object.defineProperty(obj, UID_HASH_KEY, {
      'enumerable': false,
      'configurable': false,
      'writable': false,
      'value': hash
    });
  } else if (obj.propertyIsEnumerable && obj.propertyIsEnumerable === obj.constructor.prototype.propertyIsEnumerable) {
    obj.propertyIsEnumerable = function() {
      return this.constructor.prototype.propertyIsEnumerable.apply(this, arguments);
    };
    obj.propertyIsEnumerable[UID_HASH_KEY] = hash;
  } else if (obj.nodeType) {
    obj[UID_HASH_KEY] = hash;
  } else {
    throw new Error('Unable to set a non-enumerable property on object.');
  }
  return hash;
}
var canDefineProperty = (function() {
  try {
    Object.defineProperty({}, 'x', {});
    return true;
  } catch (e) {
    return false;
  }
}());
function getIENodeHash(node) {
  if (node && node.nodeType > 0) {
    switch (node.nodeType) {
      case 1:
        return node.uniqueID;
      case 9:
        return node.documentElement && node.documentElement.uniqueID;
    }
  }
}
var weakMap = typeof WeakMap === 'function' && new WeakMap();
var objHashUID = 0;
var UID_HASH_KEY = '__immutablehash__';
if (typeof Symbol === 'function') {
  UID_HASH_KEY = Symbol(UID_HASH_KEY);
}
var STRING_HASH_CACHE_MIN_STRLEN = 16;
var STRING_HASH_CACHE_MAX_SIZE = 255;
var STRING_HASH_CACHE_SIZE = 0;
var stringHashCache = {};
var ITERATE_KEYS = 0;
var ITERATE_VALUES = 1;
var ITERATE_ENTRIES = 2;
var FAUX_ITERATOR_SYMBOL = '@@iterator';
var REAL_ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
var ITERATOR_SYMBOL = REAL_ITERATOR_SYMBOL || FAUX_ITERATOR_SYMBOL;
var Iterator = function Iterator(next) {
  this.next = next;
};
($traceurRuntime.createClass)(Iterator, {toString: function() {
    return '[Iterator]';
  }}, {});
Iterator.KEYS = ITERATE_KEYS;
Iterator.VALUES = ITERATE_VALUES;
Iterator.ENTRIES = ITERATE_ENTRIES;
var IteratorPrototype = Iterator.prototype;
IteratorPrototype.inspect = IteratorPrototype.toSource = function() {
  return this.toString();
};
IteratorPrototype[ITERATOR_SYMBOL] = function() {
  return this;
};
function iteratorValue(type, k, v, iteratorResult) {
  var value = type === 0 ? k : type === 1 ? v : [k, v];
  iteratorResult ? (iteratorResult.value = value) : (iteratorResult = {
    value: value,
    done: false
  });
  return iteratorResult;
}
function iteratorDone() {
  return {
    value: undefined,
    done: true
  };
}
function hasIterator(maybeIterable) {
  return !!_iteratorFn(maybeIterable);
}
function isIterator(maybeIterator) {
  return maybeIterator && typeof maybeIterator.next === 'function';
}
function getIterator(iterable) {
  var iteratorFn = _iteratorFn(iterable);
  return iteratorFn && iteratorFn.call(iterable);
}
function _iteratorFn(iterable) {
  var iteratorFn = iterable && ((REAL_ITERATOR_SYMBOL && iterable[REAL_ITERATOR_SYMBOL]) || iterable[FAUX_ITERATOR_SYMBOL]);
  if (typeof iteratorFn === 'function') {
    return iteratorFn;
  }
}
var Iterable = function Iterable(value) {
  return isIterable(value) ? value : Seq(value);
};
var $Iterable = Iterable;
($traceurRuntime.createClass)(Iterable, {
  toArray: function() {
    assertNotInfinite(this.size);
    var array = new Array(this.size || 0);
    this.valueSeq().__iterate((function(v, i) {
      array[i] = v;
    }));
    return array;
  },
  toIndexedSeq: function() {
    return new ToIndexedSequence(this);
  },
  toJS: function() {
    return this.toSeq().map((function(value) {
      return value && typeof value.toJS === 'function' ? value.toJS() : value;
    })).__toJS();
  },
  toKeyedSeq: function() {
    return new ToKeyedSequence(this, true);
  },
  toMap: function() {
    return Map(this.toKeyedSeq());
  },
  toObject: function() {
    assertNotInfinite(this.size);
    var object = {};
    this.__iterate((function(v, k) {
      object[k] = v;
    }));
    return object;
  },
  toOrderedMap: function() {
    return OrderedMap(this.toKeyedSeq());
  },
  toOrderedSet: function() {
    return OrderedSet(isKeyed(this) ? this.valueSeq() : this);
  },
  toSet: function() {
    return Set(isKeyed(this) ? this.valueSeq() : this);
  },
  toSetSeq: function() {
    return new ToSetSequence(this);
  },
  toSeq: function() {
    return isIndexed(this) ? this.toIndexedSeq() : isKeyed(this) ? this.toKeyedSeq() : this.toSetSeq();
  },
  toStack: function() {
    return Stack(isKeyed(this) ? this.valueSeq() : this);
  },
  toList: function() {
    return List(isKeyed(this) ? this.valueSeq() : this);
  },
  toString: function() {
    return '[Iterable]';
  },
  __toString: function(head, tail) {
    if (this.size === 0) {
      return head + tail;
    }
    return head + ' ' + this.toSeq().map(this.__toStringMapper).join(', ') + ' ' + tail;
  },
  concat: function() {
    for (var values = [],
        $__2 = 0; $__2 < arguments.length; $__2++)
      values[$__2] = arguments[$__2];
    return reify(this, concatFactory(this, values));
  },
  contains: function(searchValue) {
    return this.some((function(value) {
      return is(value, searchValue);
    }));
  },
  entries: function() {
    return this.__iterator(ITERATE_ENTRIES);
  },
  every: function(predicate, context) {
    assertNotInfinite(this.size);
    var returnValue = true;
    this.__iterate((function(v, k, c) {
      if (!predicate.call(context, v, k, c)) {
        returnValue = false;
        return false;
      }
    }));
    return returnValue;
  },
  filter: function(predicate, context) {
    return reify(this, filterFactory(this, predicate, context, true));
  },
  find: function(predicate, context, notSetValue) {
    var foundValue = notSetValue;
    this.__iterate((function(v, k, c) {
      if (predicate.call(context, v, k, c)) {
        foundValue = v;
        return false;
      }
    }));
    return foundValue;
  },
  forEach: function(sideEffect, context) {
    assertNotInfinite(this.size);
    return this.__iterate(context ? sideEffect.bind(context) : sideEffect);
  },
  join: function(separator) {
    assertNotInfinite(this.size);
    separator = separator !== undefined ? '' + separator : ',';
    var joined = '';
    var isFirst = true;
    this.__iterate((function(v) {
      isFirst ? (isFirst = false) : (joined += separator);
      joined += v !== null && v !== undefined ? v : '';
    }));
    return joined;
  },
  keys: function() {
    return this.__iterator(ITERATE_KEYS);
  },
  map: function(mapper, context) {
    return reify(this, mapFactory(this, mapper, context));
  },
  reduce: function(reducer, initialReduction, context) {
    assertNotInfinite(this.size);
    var reduction;
    var useFirst;
    if (arguments.length < 2) {
      useFirst = true;
    } else {
      reduction = initialReduction;
    }
    this.__iterate((function(v, k, c) {
      if (useFirst) {
        useFirst = false;
        reduction = v;
      } else {
        reduction = reducer.call(context, reduction, v, k, c);
      }
    }));
    return reduction;
  },
  reduceRight: function(reducer, initialReduction, context) {
    var reversed = this.toKeyedSeq().reverse();
    return reversed.reduce.apply(reversed, arguments);
  },
  reverse: function() {
    return reify(this, reverseFactory(this, true));
  },
  slice: function(begin, end) {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    var resolvedBegin = resolveBegin(begin, this.size);
    var resolvedEnd = resolveEnd(end, this.size);
    if (resolvedBegin !== resolvedBegin || resolvedEnd !== resolvedEnd) {
      return this.toSeq().cacheResult().slice(begin, end);
    }
    var skipped = resolvedBegin === 0 ? this : this.skip(resolvedBegin);
    return reify(this, resolvedEnd === undefined || resolvedEnd === this.size ? skipped : skipped.take(resolvedEnd - resolvedBegin));
  },
  some: function(predicate, context) {
    return !this.every(not(predicate), context);
  },
  sort: function(comparator) {
    return reify(this, sortFactory(this, comparator));
  },
  values: function() {
    return this.__iterator(ITERATE_VALUES);
  },
  butLast: function() {
    return this.slice(0, -1);
  },
  count: function(predicate, context) {
    return ensureSize(predicate ? this.toSeq().filter(predicate, context) : this);
  },
  countBy: function(grouper, context) {
    return countByFactory(this, grouper, context);
  },
  equals: function(other) {
    return deepEqual(this, other);
  },
  entrySeq: function() {
    var iterable = this;
    if (iterable._cache) {
      return new ArraySeq(iterable._cache);
    }
    var entriesSequence = iterable.toSeq().map(entryMapper).toIndexedSeq();
    entriesSequence.fromEntrySeq = (function() {
      return iterable.toSeq();
    });
    return entriesSequence;
  },
  filterNot: function(predicate, context) {
    return this.filter(not(predicate), context);
  },
  findLast: function(predicate, context, notSetValue) {
    return this.toKeyedSeq().reverse().find(predicate, context, notSetValue);
  },
  first: function() {
    return this.find(returnTrue);
  },
  flatMap: function(mapper, context) {
    return reify(this, flatMapFactory(this, mapper, context));
  },
  flatten: function(depth) {
    return reify(this, flattenFactory(this, depth, true));
  },
  fromEntrySeq: function() {
    return new FromEntriesSequence(this);
  },
  get: function(searchKey, notSetValue) {
    return this.find((function(_, key) {
      return is(key, searchKey);
    }), undefined, notSetValue);
  },
  getIn: function(searchKeyPath, notSetValue) {
    var nested = this;
    if (searchKeyPath) {
      var iter = getIterator(searchKeyPath) || getIterator($Iterable(searchKeyPath));
      var step;
      while (!(step = iter.next()).done) {
        var key = step.value;
        nested = nested && nested.get ? nested.get(key, NOT_SET) : NOT_SET;
        if (nested === NOT_SET) {
          return notSetValue;
        }
      }
    }
    return nested;
  },
  groupBy: function(grouper, context) {
    return groupByFactory(this, grouper, context);
  },
  has: function(searchKey) {
    return this.get(searchKey, NOT_SET) !== NOT_SET;
  },
  hasIn: function(searchKeyPath) {
    return this.getIn(searchKeyPath, NOT_SET) !== NOT_SET;
  },
  isSubset: function(iter) {
    iter = typeof iter.contains === 'function' ? iter : $Iterable(iter);
    return this.every((function(value) {
      return iter.contains(value);
    }));
  },
  isSuperset: function(iter) {
    return iter.isSubset(this);
  },
  keySeq: function() {
    return this.toSeq().map(keyMapper).toIndexedSeq();
  },
  last: function() {
    return this.toSeq().reverse().first();
  },
  max: function(comparator) {
    return maxFactory(this, comparator);
  },
  maxBy: function(mapper, comparator) {
    return maxFactory(this, comparator, mapper);
  },
  min: function(comparator) {
    return maxFactory(this, comparator ? neg(comparator) : defaultNegComparator);
  },
  minBy: function(mapper, comparator) {
    return maxFactory(this, comparator ? neg(comparator) : defaultNegComparator, mapper);
  },
  rest: function() {
    return this.slice(1);
  },
  skip: function(amount) {
    return reify(this, skipFactory(this, amount, true));
  },
  skipLast: function(amount) {
    return reify(this, this.toSeq().reverse().skip(amount).reverse());
  },
  skipWhile: function(predicate, context) {
    return reify(this, skipWhileFactory(this, predicate, context, true));
  },
  skipUntil: function(predicate, context) {
    return this.skipWhile(not(predicate), context);
  },
  sortBy: function(mapper, comparator) {
    return reify(this, sortFactory(this, comparator, mapper));
  },
  take: function(amount) {
    return reify(this, takeFactory(this, amount));
  },
  takeLast: function(amount) {
    return reify(this, this.toSeq().reverse().take(amount).reverse());
  },
  takeWhile: function(predicate, context) {
    return reify(this, takeWhileFactory(this, predicate, context));
  },
  takeUntil: function(predicate, context) {
    return this.takeWhile(not(predicate), context);
  },
  valueSeq: function() {
    return this.toIndexedSeq();
  },
  hashCode: function() {
    return this.__hash || (this.__hash = hashIterable(this));
  }
}, {});
var IS_ITERABLE_SENTINEL = '@@__IMMUTABLE_ITERABLE__@@';
var IS_KEYED_SENTINEL = '@@__IMMUTABLE_KEYED__@@';
var IS_INDEXED_SENTINEL = '@@__IMMUTABLE_INDEXED__@@';
var IS_ORDERED_SENTINEL = '@@__IMMUTABLE_ORDERED__@@';
var IterablePrototype = Iterable.prototype;
IterablePrototype[IS_ITERABLE_SENTINEL] = true;
IterablePrototype[ITERATOR_SYMBOL] = IterablePrototype.values;
IterablePrototype.toJSON = IterablePrototype.toJS;
IterablePrototype.__toJS = IterablePrototype.toArray;
IterablePrototype.__toStringMapper = quoteString;
IterablePrototype.inspect = IterablePrototype.toSource = function() {
  return this.toString();
};
IterablePrototype.chain = IterablePrototype.flatMap;
(function() {
  try {
    Object.defineProperty(IterablePrototype, 'length', {get: function() {
        if (!Iterable.noLengthWarning) {
          var stack;
          try {
            throw new Error();
          } catch (error) {
            stack = error.stack;
          }
          if (stack.indexOf('_wrapObject') === -1) {
            console && console.warn && console.warn('iterable.length has been deprecated, ' + 'use iterable.size or iterable.count(). ' + 'This warning will become a silent error in a future version. ' + stack);
            return this.size;
          }
        }
      }});
  } catch (e) {}
})();
var KeyedIterable = function KeyedIterable(value) {
  return isKeyed(value) ? value : KeyedSeq(value);
};
($traceurRuntime.createClass)(KeyedIterable, {
  flip: function() {
    return reify(this, flipFactory(this));
  },
  findKey: function(predicate, context) {
    var foundKey;
    this.__iterate((function(v, k, c) {
      if (predicate.call(context, v, k, c)) {
        foundKey = k;
        return false;
      }
    }));
    return foundKey;
  },
  findLastKey: function(predicate, context) {
    return this.toSeq().reverse().findKey(predicate, context);
  },
  keyOf: function(searchValue) {
    return this.findKey((function(value) {
      return is(value, searchValue);
    }));
  },
  lastKeyOf: function(searchValue) {
    return this.toSeq().reverse().keyOf(searchValue);
  },
  mapEntries: function(mapper, context) {
    var $__0 = this;
    var iterations = 0;
    return reify(this, this.toSeq().map((function(v, k) {
      return mapper.call(context, [k, v], iterations++, $__0);
    })).fromEntrySeq());
  },
  mapKeys: function(mapper, context) {
    var $__0 = this;
    return reify(this, this.toSeq().flip().map((function(k, v) {
      return mapper.call(context, k, v, $__0);
    })).flip());
  }
}, {}, Iterable);
var KeyedIterablePrototype = KeyedIterable.prototype;
KeyedIterablePrototype[IS_KEYED_SENTINEL] = true;
KeyedIterablePrototype[ITERATOR_SYMBOL] = IterablePrototype.entries;
KeyedIterablePrototype.__toJS = IterablePrototype.toObject;
KeyedIterablePrototype.__toStringMapper = (function(v, k) {
  return k + ': ' + quoteString(v);
});
var IndexedIterable = function IndexedIterable(value) {
  return isIndexed(value) ? value : IndexedSeq(value);
};
($traceurRuntime.createClass)(IndexedIterable, {
  toKeyedSeq: function() {
    return new ToKeyedSequence(this, false);
  },
  filter: function(predicate, context) {
    return reify(this, filterFactory(this, predicate, context, false));
  },
  findIndex: function(predicate, context) {
    var key = this.toKeyedSeq().findKey(predicate, context);
    return key === undefined ? -1 : key;
  },
  indexOf: function(searchValue) {
    var key = this.toKeyedSeq().keyOf(searchValue);
    return key === undefined ? -1 : key;
  },
  lastIndexOf: function(searchValue) {
    var key = this.toKeyedSeq().lastKeyOf(searchValue);
    return key === undefined ? -1 : key;
  },
  reverse: function() {
    return reify(this, reverseFactory(this, false));
  },
  splice: function(index, removeNum) {
    var numArgs = arguments.length;
    removeNum = Math.max(removeNum | 0, 0);
    if (numArgs === 0 || (numArgs === 2 && !removeNum)) {
      return this;
    }
    index = resolveBegin(index, this.size);
    var spliced = this.slice(0, index);
    return reify(this, numArgs === 1 ? spliced : spliced.concat(arrCopy(arguments, 2), this.slice(index + removeNum)));
  },
  findLastIndex: function(predicate, context) {
    var key = this.toKeyedSeq().findLastKey(predicate, context);
    return key === undefined ? -1 : key;
  },
  first: function() {
    return this.get(0);
  },
  flatten: function(depth) {
    return reify(this, flattenFactory(this, depth, false));
  },
  get: function(index, notSetValue) {
    index = wrapIndex(this, index);
    return (index < 0 || (this.size === Infinity || (this.size !== undefined && index > this.size))) ? notSetValue : this.find((function(_, key) {
      return key === index;
    }), undefined, notSetValue);
  },
  has: function(index) {
    index = wrapIndex(this, index);
    return index >= 0 && (this.size !== undefined ? this.size === Infinity || index < this.size : this.indexOf(index) !== -1);
  },
  interpose: function(separator) {
    return reify(this, interposeFactory(this, separator));
  },
  last: function() {
    return this.get(-1);
  },
  skip: function(amount) {
    var iter = this;
    var skipSeq = skipFactory(iter, amount, false);
    if (isSeq(iter) && skipSeq !== iter) {
      skipSeq.get = function(index, notSetValue) {
        index = wrapIndex(this, index);
        return index >= 0 ? iter.get(index + amount, notSetValue) : notSetValue;
      };
    }
    return reify(this, skipSeq);
  },
  skipWhile: function(predicate, context) {
    return reify(this, skipWhileFactory(this, predicate, context, false));
  },
  take: function(amount) {
    var iter = this;
    var takeSeq = takeFactory(iter, amount);
    if (isSeq(iter) && takeSeq !== iter) {
      takeSeq.get = function(index, notSetValue) {
        index = wrapIndex(this, index);
        return index >= 0 && index < amount ? iter.get(index, notSetValue) : notSetValue;
      };
    }
    return reify(this, takeSeq);
  }
}, {}, Iterable);
IndexedIterable.prototype[IS_INDEXED_SENTINEL] = true;
IndexedIterable.prototype[IS_ORDERED_SENTINEL] = true;
var SetIterable = function SetIterable(value) {
  return isIterable(value) && !isAssociative(value) ? value : SetSeq(value);
};
($traceurRuntime.createClass)(SetIterable, {
  get: function(value, notSetValue) {
    return this.has(value) ? value : notSetValue;
  },
  contains: function(value) {
    return this.has(value);
  },
  keySeq: function() {
    return this.valueSeq();
  }
}, {}, Iterable);
SetIterable.prototype.has = IterablePrototype.contains;
function isIterable(maybeIterable) {
  return !!(maybeIterable && maybeIterable[IS_ITERABLE_SENTINEL]);
}
function isKeyed(maybeKeyed) {
  return !!(maybeKeyed && maybeKeyed[IS_KEYED_SENTINEL]);
}
function isIndexed(maybeIndexed) {
  return !!(maybeIndexed && maybeIndexed[IS_INDEXED_SENTINEL]);
}
function isAssociative(maybeAssociative) {
  return isKeyed(maybeAssociative) || isIndexed(maybeAssociative);
}
function isOrdered(maybeOrdered) {
  return !!(maybeOrdered && maybeOrdered[IS_ORDERED_SENTINEL]);
}
Iterable.isIterable = isIterable;
Iterable.isKeyed = isKeyed;
Iterable.isIndexed = isIndexed;
Iterable.isAssociative = isAssociative;
Iterable.isOrdered = isOrdered;
Iterable.Keyed = KeyedIterable;
Iterable.Indexed = IndexedIterable;
Iterable.Set = SetIterable;
Iterable.Iterator = Iterator;
function keyMapper(v, k) {
  return k;
}
function entryMapper(v, k) {
  return [k, v];
}
function not(predicate) {
  return function() {
    return !predicate.apply(this, arguments);
  };
}
function neg(predicate) {
  return function() {
    return -predicate.apply(this, arguments);
  };
}
function quoteString(value) {
  return typeof value === 'string' ? JSON.stringify(value) : value;
}
function defaultNegComparator(a, b) {
  return a < b ? 1 : a > b ? -1 : 0;
}
function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!isIterable(b) || a.size !== undefined && b.size !== undefined && a.size !== b.size || a.__hash !== undefined && b.__hash !== undefined && a.__hash !== b.__hash || isKeyed(a) !== isKeyed(b) || isIndexed(a) !== isIndexed(b) || isOrdered(a) !== isOrdered(b)) {
    return false;
  }
  if (a.size === 0 && b.size === 0) {
    return true;
  }
  var notAssociative = !isAssociative(a);
  if (isOrdered(a)) {
    var entries = a.entries();
    return b.every((function(v, k) {
      var entry = entries.next().value;
      return entry && is(entry[1], v) && (notAssociative || is(entry[0], k));
    })) && entries.next().done;
  }
  var flipped = false;
  if (a.size === undefined) {
    if (b.size === undefined) {
      a.cacheResult();
    } else {
      flipped = true;
      var _ = a;
      a = b;
      b = _;
    }
  }
  var allEqual = true;
  var bSize = b.__iterate((function(v, k) {
    if (notAssociative ? !a.has(v) : flipped ? !is(v, a.get(k, NOT_SET)) : !is(a.get(k, NOT_SET), v)) {
      allEqual = false;
      return false;
    }
  }));
  return allEqual && a.size === bSize;
}
function hashIterable(iterable) {
  if (iterable.size === Infinity) {
    return 0;
  }
  var ordered = isOrdered(iterable);
  var keyed = isKeyed(iterable);
  var h = ordered ? 1 : 0;
  var size = iterable.__iterate(keyed ? ordered ? (function(v, k) {
    h = 31 * h + hashMerge(hash(v), hash(k)) | 0;
  }) : (function(v, k) {
    h = h + hashMerge(hash(v), hash(k)) | 0;
  }) : ordered ? (function(v) {
    h = 31 * h + hash(v) | 0;
  }) : (function(v) {
    h = h + hash(v) | 0;
  }));
  return murmurHashOfSize(size, h);
}
function murmurHashOfSize(size, h) {
  h = imul(h, 0xCC9E2D51);
  h = imul(h << 15 | h >>> -15, 0x1B873593);
  h = imul(h << 13 | h >>> -13, 5);
  h = (h + 0xE6546B64 | 0) ^ size;
  h = imul(h ^ h >>> 16, 0x85EBCA6B);
  h = imul(h ^ h >>> 13, 0xC2B2AE35);
  h = smi(h ^ h >>> 16);
  return h;
}
function hashMerge(a, b) {
  return a ^ b + 0x9E3779B9 + (a << 6) + (a >> 2) | 0;
}
function mixin(ctor, methods) {
  var proto = ctor.prototype;
  var keyCopier = (function(key) {
    proto[key] = methods[key];
  });
  Object.keys(methods).forEach(keyCopier);
  Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(methods).forEach(keyCopier);
  return ctor;
}
var Seq = function Seq(value) {
  return value === null || value === undefined ? emptySequence() : isIterable(value) ? value.toSeq() : seqFromValue(value);
};
var $Seq = Seq;
($traceurRuntime.createClass)(Seq, {
  toSeq: function() {
    return this;
  },
  toString: function() {
    return this.__toString('Seq {', '}');
  },
  cacheResult: function() {
    if (!this._cache && this.__iterateUncached) {
      this._cache = this.entrySeq().toArray();
      this.size = this._cache.length;
    }
    return this;
  },
  __iterate: function(fn, reverse) {
    return seqIterate(this, fn, reverse, true);
  },
  __iterator: function(type, reverse) {
    return seqIterator(this, type, reverse, true);
  }
}, {of: function() {
    return $Seq(arguments);
  }}, Iterable);
var KeyedSeq = function KeyedSeq(value) {
  return value === null || value === undefined ? emptySequence().toKeyedSeq() : isIterable(value) ? (isKeyed(value) ? value.toSeq() : value.fromEntrySeq()) : keyedSeqFromValue(value);
};
var $KeyedSeq = KeyedSeq;
($traceurRuntime.createClass)(KeyedSeq, {
  toKeyedSeq: function() {
    return this;
  },
  toSeq: function() {
    return this;
  }
}, {of: function() {
    return $KeyedSeq(arguments);
  }}, Seq);
mixin(KeyedSeq, KeyedIterable.prototype);
var IndexedSeq = function IndexedSeq(value) {
  return value === null || value === undefined ? emptySequence() : !isIterable(value) ? indexedSeqFromValue(value) : isKeyed(value) ? value.entrySeq() : value.toIndexedSeq();
};
var $IndexedSeq = IndexedSeq;
($traceurRuntime.createClass)(IndexedSeq, {
  toIndexedSeq: function() {
    return this;
  },
  toString: function() {
    return this.__toString('Seq [', ']');
  },
  __iterate: function(fn, reverse) {
    return seqIterate(this, fn, reverse, false);
  },
  __iterator: function(type, reverse) {
    return seqIterator(this, type, reverse, false);
  }
}, {of: function() {
    return $IndexedSeq(arguments);
  }}, Seq);
mixin(IndexedSeq, IndexedIterable.prototype);
var SetSeq = function SetSeq(value) {
  return (value === null || value === undefined ? emptySequence() : !isIterable(value) ? indexedSeqFromValue(value) : isKeyed(value) ? value.entrySeq() : value).toSetSeq();
};
var $SetSeq = SetSeq;
($traceurRuntime.createClass)(SetSeq, {toSetSeq: function() {
    return this;
  }}, {of: function() {
    return $SetSeq(arguments);
  }}, Seq);
mixin(SetSeq, SetIterable.prototype);
Seq.isSeq = isSeq;
Seq.Keyed = KeyedSeq;
Seq.Set = SetSeq;
Seq.Indexed = IndexedSeq;
var IS_SEQ_SENTINEL = '@@__IMMUTABLE_SEQ__@@';
Seq.prototype[IS_SEQ_SENTINEL] = true;
var ArraySeq = function ArraySeq(array) {
  this._array = array;
  this.size = array.length;
};
($traceurRuntime.createClass)(ArraySeq, {
  get: function(index, notSetValue) {
    return this.has(index) ? this._array[wrapIndex(this, index)] : notSetValue;
  },
  __iterate: function(fn, reverse) {
    var array = this._array;
    var maxIndex = array.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      if (fn(array[reverse ? maxIndex - ii : ii], ii, this) === false) {
        return ii + 1;
      }
    }
    return ii;
  },
  __iterator: function(type, reverse) {
    var array = this._array;
    var maxIndex = array.length - 1;
    var ii = 0;
    return new Iterator((function() {
      return ii > maxIndex ? iteratorDone() : iteratorValue(type, ii, array[reverse ? maxIndex - ii++ : ii++]);
    }));
  }
}, {}, IndexedSeq);
var ObjectSeq = function ObjectSeq(object) {
  var keys = Object.keys(object);
  this._object = object;
  this._keys = keys;
  this.size = keys.length;
};
($traceurRuntime.createClass)(ObjectSeq, {
  get: function(key, notSetValue) {
    if (notSetValue !== undefined && !this.has(key)) {
      return notSetValue;
    }
    return this._object[key];
  },
  has: function(key) {
    return this._object.hasOwnProperty(key);
  },
  __iterate: function(fn, reverse) {
    var object = this._object;
    var keys = this._keys;
    var maxIndex = keys.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      var key = keys[reverse ? maxIndex - ii : ii];
      if (fn(object[key], key, this) === false) {
        return ii + 1;
      }
    }
    return ii;
  },
  __iterator: function(type, reverse) {
    var object = this._object;
    var keys = this._keys;
    var maxIndex = keys.length - 1;
    var ii = 0;
    return new Iterator((function() {
      var key = keys[reverse ? maxIndex - ii : ii];
      return ii++ > maxIndex ? iteratorDone() : iteratorValue(type, key, object[key]);
    }));
  }
}, {}, KeyedSeq);
ObjectSeq.prototype[IS_ORDERED_SENTINEL] = true;
var IterableSeq = function IterableSeq(iterable) {
  this._iterable = iterable;
  this.size = iterable.length || iterable.size;
};
($traceurRuntime.createClass)(IterableSeq, {
  __iterateUncached: function(fn, reverse) {
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterable = this._iterable;
    var iterator = getIterator(iterable);
    var iterations = 0;
    if (isIterator(iterator)) {
      var step;
      while (!(step = iterator.next()).done) {
        if (fn(step.value, iterations++, this) === false) {
          break;
        }
      }
    }
    return iterations;
  },
  __iteratorUncached: function(type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterable = this._iterable;
    var iterator = getIterator(iterable);
    if (!isIterator(iterator)) {
      return new Iterator(iteratorDone);
    }
    var iterations = 0;
    return new Iterator((function() {
      var step = iterator.next();
      return step.done ? step : iteratorValue(type, iterations++, step.value);
    }));
  }
}, {}, IndexedSeq);
var IteratorSeq = function IteratorSeq(iterator) {
  this._iterator = iterator;
  this._iteratorCache = [];
};
($traceurRuntime.createClass)(IteratorSeq, {
  __iterateUncached: function(fn, reverse) {
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterator = this._iterator;
    var cache = this._iteratorCache;
    var iterations = 0;
    while (iterations < cache.length) {
      if (fn(cache[iterations], iterations++, this) === false) {
        return iterations;
      }
    }
    var step;
    while (!(step = iterator.next()).done) {
      var val = step.value;
      cache[iterations] = val;
      if (fn(val, iterations++, this) === false) {
        break;
      }
    }
    return iterations;
  },
  __iteratorUncached: function(type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = this._iterator;
    var cache = this._iteratorCache;
    var iterations = 0;
    return new Iterator((function() {
      if (iterations >= cache.length) {
        var step = iterator.next();
        if (step.done) {
          return step;
        }
        cache[iterations] = step.value;
      }
      return iteratorValue(type, iterations, cache[iterations++]);
    }));
  }
}, {}, IndexedSeq);
function isSeq(maybeSeq) {
  return !!(maybeSeq && maybeSeq[IS_SEQ_SENTINEL]);
}
var EMPTY_SEQ;
function emptySequence() {
  return EMPTY_SEQ || (EMPTY_SEQ = new ArraySeq([]));
}
function keyedSeqFromValue(value) {
  var seq = Array.isArray(value) ? new ArraySeq(value).fromEntrySeq() : isIterator(value) ? new IteratorSeq(value).fromEntrySeq() : hasIterator(value) ? new IterableSeq(value).fromEntrySeq() : typeof value === 'object' ? new ObjectSeq(value) : undefined;
  if (!seq) {
    throw new TypeError('Expected Array or iterable object of [k, v] entries, ' + 'or keyed object: ' + value);
  }
  return seq;
}
function indexedSeqFromValue(value) {
  var seq = maybeIndexedSeqFromValue(value);
  if (!seq) {
    throw new TypeError('Expected Array or iterable object of values: ' + value);
  }
  return seq;
}
function seqFromValue(value) {
  var seq = maybeIndexedSeqFromValue(value) || (typeof value === 'object' && new ObjectSeq(value));
  if (!seq) {
    throw new TypeError('Expected Array or iterable object of values, or keyed object: ' + value);
  }
  return seq;
}
function maybeIndexedSeqFromValue(value) {
  return (isArrayLike(value) ? new ArraySeq(value) : isIterator(value) ? new IteratorSeq(value) : hasIterator(value) ? new IterableSeq(value) : undefined);
}
function isArrayLike(value) {
  return value && typeof value.length === 'number';
}
function seqIterate(seq, fn, reverse, useKeys) {
  var cache = seq._cache;
  if (cache) {
    var maxIndex = cache.length - 1;
    for (var ii = 0; ii <= maxIndex; ii++) {
      var entry = cache[reverse ? maxIndex - ii : ii];
      if (fn(entry[1], useKeys ? entry[0] : ii, seq) === false) {
        return ii + 1;
      }
    }
    return ii;
  }
  return seq.__iterateUncached(fn, reverse);
}
function seqIterator(seq, type, reverse, useKeys) {
  var cache = seq._cache;
  if (cache) {
    var maxIndex = cache.length - 1;
    var ii = 0;
    return new Iterator((function() {
      var entry = cache[reverse ? maxIndex - ii : ii];
      return ii++ > maxIndex ? iteratorDone() : iteratorValue(type, useKeys ? entry[0] : ii - 1, entry[1]);
    }));
  }
  return seq.__iteratorUncached(type, reverse);
}
function fromJS(json, converter) {
  return converter ? _fromJSWith(converter, json, '', {'': json}) : _fromJSDefault(json);
}
function _fromJSWith(converter, json, key, parentJSON) {
  if (Array.isArray(json)) {
    return converter.call(parentJSON, key, IndexedSeq(json).map((function(v, k) {
      return _fromJSWith(converter, v, k, json);
    })));
  }
  if (isPlainObj(json)) {
    return converter.call(parentJSON, key, KeyedSeq(json).map((function(v, k) {
      return _fromJSWith(converter, v, k, json);
    })));
  }
  return json;
}
function _fromJSDefault(json) {
  if (Array.isArray(json)) {
    return IndexedSeq(json).map(_fromJSDefault).toList();
  }
  if (isPlainObj(json)) {
    return KeyedSeq(json).map(_fromJSDefault).toMap();
  }
  return json;
}
function isPlainObj(value) {
  return value && value.constructor === Object;
}
var Collection = function Collection() {
  throw TypeError('Abstract');
};
($traceurRuntime.createClass)(Collection, {}, {}, Iterable);
var KeyedCollection = function KeyedCollection() {
  $traceurRuntime.defaultSuperCall(this, $KeyedCollection.prototype, arguments);
};
var $KeyedCollection = KeyedCollection;
($traceurRuntime.createClass)(KeyedCollection, {}, {}, Collection);
mixin(KeyedCollection, KeyedIterable.prototype);
var IndexedCollection = function IndexedCollection() {
  $traceurRuntime.defaultSuperCall(this, $IndexedCollection.prototype, arguments);
};
var $IndexedCollection = IndexedCollection;
($traceurRuntime.createClass)(IndexedCollection, {}, {}, Collection);
mixin(IndexedCollection, IndexedIterable.prototype);
var SetCollection = function SetCollection() {
  $traceurRuntime.defaultSuperCall(this, $SetCollection.prototype, arguments);
};
var $SetCollection = SetCollection;
($traceurRuntime.createClass)(SetCollection, {}, {}, Collection);
mixin(SetCollection, SetIterable.prototype);
Collection.Keyed = KeyedCollection;
Collection.Indexed = IndexedCollection;
Collection.Set = SetCollection;
var Map = function Map(value) {
  return value === null || value === undefined ? emptyMap() : isMap(value) ? value : emptyMap().withMutations((function(map) {
    var iter = KeyedIterable(value);
    assertNotInfinite(iter.size);
    iter.forEach((function(v, k) {
      return map.set(k, v);
    }));
  }));
};
($traceurRuntime.createClass)(Map, {
  toString: function() {
    return this.__toString('Map {', '}');
  },
  get: function(k, notSetValue) {
    return this._root ? this._root.get(0, undefined, k, notSetValue) : notSetValue;
  },
  set: function(k, v) {
    return updateMap(this, k, v);
  },
  setIn: function(keyPath, v) {
    return this.updateIn(keyPath, NOT_SET, (function() {
      return v;
    }));
  },
  remove: function(k) {
    return updateMap(this, k, NOT_SET);
  },
  deleteIn: function(keyPath) {
    return this.updateIn(keyPath, (function() {
      return NOT_SET;
    }));
  },
  update: function(k, notSetValue, updater) {
    return arguments.length === 1 ? k(this) : this.updateIn([k], notSetValue, updater);
  },
  updateIn: function(keyPath, notSetValue, updater) {
    if (!updater) {
      updater = notSetValue;
      notSetValue = undefined;
    }
    var updatedValue = updateInDeepMap(this, getIterator(keyPath) || getIterator(Iterable(keyPath)), notSetValue, updater);
    return updatedValue === NOT_SET ? undefined : updatedValue;
  },
  clear: function() {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._root = null;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyMap();
  },
  merge: function() {
    return mergeIntoMapWith(this, undefined, arguments);
  },
  mergeWith: function(merger) {
    for (var iters = [],
        $__3 = 1; $__3 < arguments.length; $__3++)
      iters[$__3 - 1] = arguments[$__3];
    return mergeIntoMapWith(this, merger, iters);
  },
  mergeIn: function(keyPath) {
    for (var iters = [],
        $__4 = 1; $__4 < arguments.length; $__4++)
      iters[$__4 - 1] = arguments[$__4];
    return this.updateIn(keyPath, emptyMap(), (function(m) {
      return m.merge.apply(m, iters);
    }));
  },
  mergeDeep: function() {
    return mergeIntoMapWith(this, deepMerger(undefined), arguments);
  },
  mergeDeepWith: function(merger) {
    for (var iters = [],
        $__5 = 1; $__5 < arguments.length; $__5++)
      iters[$__5 - 1] = arguments[$__5];
    return mergeIntoMapWith(this, deepMerger(merger), iters);
  },
  mergeDeepIn: function(keyPath) {
    for (var iters = [],
        $__6 = 1; $__6 < arguments.length; $__6++)
      iters[$__6 - 1] = arguments[$__6];
    return this.updateIn(keyPath, emptyMap(), (function(m) {
      return m.mergeDeep.apply(m, iters);
    }));
  },
  sort: function(comparator) {
    return OrderedMap(sortFactory(this, comparator));
  },
  sortBy: function(mapper, comparator) {
    return OrderedMap(sortFactory(this, comparator, mapper));
  },
  withMutations: function(fn) {
    var mutable = this.asMutable();
    fn(mutable);
    return mutable.wasAltered() ? mutable.__ensureOwner(this.__ownerID) : this;
  },
  asMutable: function() {
    return this.__ownerID ? this : this.__ensureOwner(new OwnerID());
  },
  asImmutable: function() {
    return this.__ensureOwner();
  },
  wasAltered: function() {
    return this.__altered;
  },
  __iterator: function(type, reverse) {
    return new MapIterator(this, type, reverse);
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    var iterations = 0;
    this._root && this._root.iterate((function(entry) {
      iterations++;
      return fn(entry[1], entry[0], $__0);
    }), reverse);
    return iterations;
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeMap(this.size, this._root, ownerID, this.__hash);
  }
}, {}, KeyedCollection);
function isMap(maybeMap) {
  return !!(maybeMap && maybeMap[IS_MAP_SENTINEL]);
}
Map.isMap = isMap;
var IS_MAP_SENTINEL = '@@__IMMUTABLE_MAP__@@';
var MapPrototype = Map.prototype;
MapPrototype[IS_MAP_SENTINEL] = true;
MapPrototype[DELETE] = MapPrototype.remove;
MapPrototype.removeIn = MapPrototype.deleteIn;
var ArrayMapNode = function ArrayMapNode(ownerID, entries) {
  this.ownerID = ownerID;
  this.entries = entries;
};
var $ArrayMapNode = ArrayMapNode;
($traceurRuntime.createClass)(ArrayMapNode, {
  get: function(shift, keyHash, key, notSetValue) {
    var entries = this.entries;
    for (var ii = 0,
        len = entries.length; ii < len; ii++) {
      if (is(key, entries[ii][0])) {
        return entries[ii][1];
      }
    }
    return notSetValue;
  },
  update: function(ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
    var removed = value === NOT_SET;
    var entries = this.entries;
    var idx = 0;
    for (var len = entries.length; idx < len; idx++) {
      if (is(key, entries[idx][0])) {
        break;
      }
    }
    var exists = idx < len;
    if (exists ? entries[idx][1] === value : removed) {
      return this;
    }
    SetRef(didAlter);
    (removed || !exists) && SetRef(didChangeSize);
    if (removed && entries.length === 1) {
      return;
    }
    if (!exists && !removed && entries.length >= MAX_ARRAY_MAP_SIZE) {
      return createNodes(ownerID, entries, key, value);
    }
    var isEditable = ownerID && ownerID === this.ownerID;
    var newEntries = isEditable ? entries : arrCopy(entries);
    if (exists) {
      if (removed) {
        idx === len - 1 ? newEntries.pop() : (newEntries[idx] = newEntries.pop());
      } else {
        newEntries[idx] = [key, value];
      }
    } else {
      newEntries.push([key, value]);
    }
    if (isEditable) {
      this.entries = newEntries;
      return this;
    }
    return new $ArrayMapNode(ownerID, newEntries);
  }
}, {});
var BitmapIndexedNode = function BitmapIndexedNode(ownerID, bitmap, nodes) {
  this.ownerID = ownerID;
  this.bitmap = bitmap;
  this.nodes = nodes;
};
var $BitmapIndexedNode = BitmapIndexedNode;
($traceurRuntime.createClass)(BitmapIndexedNode, {
  get: function(shift, keyHash, key, notSetValue) {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    var bit = (1 << ((shift === 0 ? keyHash : keyHash >>> shift) & MASK));
    var bitmap = this.bitmap;
    return (bitmap & bit) === 0 ? notSetValue : this.nodes[popCount(bitmap & (bit - 1))].get(shift + SHIFT, keyHash, key, notSetValue);
  },
  update: function(ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    var keyHashFrag = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    var bit = 1 << keyHashFrag;
    var bitmap = this.bitmap;
    var exists = (bitmap & bit) !== 0;
    if (!exists && value === NOT_SET) {
      return this;
    }
    var idx = popCount(bitmap & (bit - 1));
    var nodes = this.nodes;
    var node = exists ? nodes[idx] : undefined;
    var newNode = updateNode(node, ownerID, shift + SHIFT, keyHash, key, value, didChangeSize, didAlter);
    if (newNode === node) {
      return this;
    }
    if (!exists && newNode && nodes.length >= MAX_BITMAP_INDEXED_SIZE) {
      return expandNodes(ownerID, nodes, bitmap, keyHashFrag, newNode);
    }
    if (exists && !newNode && nodes.length === 2 && isLeafNode(nodes[idx ^ 1])) {
      return nodes[idx ^ 1];
    }
    if (exists && newNode && nodes.length === 1 && isLeafNode(newNode)) {
      return newNode;
    }
    var isEditable = ownerID && ownerID === this.ownerID;
    var newBitmap = exists ? newNode ? bitmap : bitmap ^ bit : bitmap | bit;
    var newNodes = exists ? newNode ? setIn(nodes, idx, newNode, isEditable) : spliceOut(nodes, idx, isEditable) : spliceIn(nodes, idx, newNode, isEditable);
    if (isEditable) {
      this.bitmap = newBitmap;
      this.nodes = newNodes;
      return this;
    }
    return new $BitmapIndexedNode(ownerID, newBitmap, newNodes);
  }
}, {});
var HashArrayMapNode = function HashArrayMapNode(ownerID, count, nodes) {
  this.ownerID = ownerID;
  this.count = count;
  this.nodes = nodes;
};
var $HashArrayMapNode = HashArrayMapNode;
($traceurRuntime.createClass)(HashArrayMapNode, {
  get: function(shift, keyHash, key, notSetValue) {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    var node = this.nodes[idx];
    return node ? node.get(shift + SHIFT, keyHash, key, notSetValue) : notSetValue;
  },
  update: function(ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    var idx = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
    var removed = value === NOT_SET;
    var nodes = this.nodes;
    var node = nodes[idx];
    if (removed && !node) {
      return this;
    }
    var newNode = updateNode(node, ownerID, shift + SHIFT, keyHash, key, value, didChangeSize, didAlter);
    if (newNode === node) {
      return this;
    }
    var newCount = this.count;
    if (!node) {
      newCount++;
    } else if (!newNode) {
      newCount--;
      if (newCount < MIN_HASH_ARRAY_MAP_SIZE) {
        return packNodes(ownerID, nodes, newCount, idx);
      }
    }
    var isEditable = ownerID && ownerID === this.ownerID;
    var newNodes = setIn(nodes, idx, newNode, isEditable);
    if (isEditable) {
      this.count = newCount;
      this.nodes = newNodes;
      return this;
    }
    return new $HashArrayMapNode(ownerID, newCount, newNodes);
  }
}, {});
var HashCollisionNode = function HashCollisionNode(ownerID, keyHash, entries) {
  this.ownerID = ownerID;
  this.keyHash = keyHash;
  this.entries = entries;
};
var $HashCollisionNode = HashCollisionNode;
($traceurRuntime.createClass)(HashCollisionNode, {
  get: function(shift, keyHash, key, notSetValue) {
    var entries = this.entries;
    for (var ii = 0,
        len = entries.length; ii < len; ii++) {
      if (is(key, entries[ii][0])) {
        return entries[ii][1];
      }
    }
    return notSetValue;
  },
  update: function(ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
    if (keyHash === undefined) {
      keyHash = hash(key);
    }
    var removed = value === NOT_SET;
    if (keyHash !== this.keyHash) {
      if (removed) {
        return this;
      }
      SetRef(didAlter);
      SetRef(didChangeSize);
      return mergeIntoNode(this, ownerID, shift, keyHash, [key, value]);
    }
    var entries = this.entries;
    var idx = 0;
    for (var len = entries.length; idx < len; idx++) {
      if (is(key, entries[idx][0])) {
        break;
      }
    }
    var exists = idx < len;
    if (exists ? entries[idx][1] === value : removed) {
      return this;
    }
    SetRef(didAlter);
    (removed || !exists) && SetRef(didChangeSize);
    if (removed && len === 2) {
      return new ValueNode(ownerID, this.keyHash, entries[idx ^ 1]);
    }
    var isEditable = ownerID && ownerID === this.ownerID;
    var newEntries = isEditable ? entries : arrCopy(entries);
    if (exists) {
      if (removed) {
        idx === len - 1 ? newEntries.pop() : (newEntries[idx] = newEntries.pop());
      } else {
        newEntries[idx] = [key, value];
      }
    } else {
      newEntries.push([key, value]);
    }
    if (isEditable) {
      this.entries = newEntries;
      return this;
    }
    return new $HashCollisionNode(ownerID, this.keyHash, newEntries);
  }
}, {});
var ValueNode = function ValueNode(ownerID, keyHash, entry) {
  this.ownerID = ownerID;
  this.keyHash = keyHash;
  this.entry = entry;
};
var $ValueNode = ValueNode;
($traceurRuntime.createClass)(ValueNode, {
  get: function(shift, keyHash, key, notSetValue) {
    return is(key, this.entry[0]) ? this.entry[1] : notSetValue;
  },
  update: function(ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
    var removed = value === NOT_SET;
    var keyMatch = is(key, this.entry[0]);
    if (keyMatch ? value === this.entry[1] : removed) {
      return this;
    }
    SetRef(didAlter);
    if (removed) {
      SetRef(didChangeSize);
      return;
    }
    if (keyMatch) {
      if (ownerID && ownerID === this.ownerID) {
        this.entry[1] = value;
        return this;
      }
      return new $ValueNode(ownerID, this.keyHash, [key, value]);
    }
    SetRef(didChangeSize);
    return mergeIntoNode(this, ownerID, shift, hash(key), [key, value]);
  }
}, {});
ArrayMapNode.prototype.iterate = HashCollisionNode.prototype.iterate = function(fn, reverse) {
  var entries = this.entries;
  for (var ii = 0,
      maxIndex = entries.length - 1; ii <= maxIndex; ii++) {
    if (fn(entries[reverse ? maxIndex - ii : ii]) === false) {
      return false;
    }
  }
};
BitmapIndexedNode.prototype.iterate = HashArrayMapNode.prototype.iterate = function(fn, reverse) {
  var nodes = this.nodes;
  for (var ii = 0,
      maxIndex = nodes.length - 1; ii <= maxIndex; ii++) {
    var node = nodes[reverse ? maxIndex - ii : ii];
    if (node && node.iterate(fn, reverse) === false) {
      return false;
    }
  }
};
ValueNode.prototype.iterate = function(fn, reverse) {
  return fn(this.entry);
};
var MapIterator = function MapIterator(map, type, reverse) {
  this._type = type;
  this._reverse = reverse;
  this._stack = map._root && mapIteratorFrame(map._root);
};
($traceurRuntime.createClass)(MapIterator, {next: function() {
    var type = this._type;
    var stack = this._stack;
    while (stack) {
      var node = stack.node;
      var index = stack.index++;
      var maxIndex;
      if (node.entry) {
        if (index === 0) {
          return mapIteratorValue(type, node.entry);
        }
      } else if (node.entries) {
        maxIndex = node.entries.length - 1;
        if (index <= maxIndex) {
          return mapIteratorValue(type, node.entries[this._reverse ? maxIndex - index : index]);
        }
      } else {
        maxIndex = node.nodes.length - 1;
        if (index <= maxIndex) {
          var subNode = node.nodes[this._reverse ? maxIndex - index : index];
          if (subNode) {
            if (subNode.entry) {
              return mapIteratorValue(type, subNode.entry);
            }
            stack = this._stack = mapIteratorFrame(subNode, stack);
          }
          continue;
        }
      }
      stack = this._stack = this._stack.__prev;
    }
    return iteratorDone();
  }}, {}, Iterator);
function mapIteratorValue(type, entry) {
  return iteratorValue(type, entry[0], entry[1]);
}
function mapIteratorFrame(node, prev) {
  return {
    node: node,
    index: 0,
    __prev: prev
  };
}
function makeMap(size, root, ownerID, hash) {
  var map = Object.create(MapPrototype);
  map.size = size;
  map._root = root;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}
var EMPTY_MAP;
function emptyMap() {
  return EMPTY_MAP || (EMPTY_MAP = makeMap(0));
}
function updateMap(map, k, v) {
  var newRoot;
  var newSize;
  if (!map._root) {
    if (v === NOT_SET) {
      return map;
    }
    newSize = 1;
    newRoot = new ArrayMapNode(map.__ownerID, [[k, v]]);
  } else {
    var didChangeSize = MakeRef(CHANGE_LENGTH);
    var didAlter = MakeRef(DID_ALTER);
    newRoot = updateNode(map._root, map.__ownerID, 0, undefined, k, v, didChangeSize, didAlter);
    if (!didAlter.value) {
      return map;
    }
    newSize = map.size + (didChangeSize.value ? v === NOT_SET ? -1 : 1 : 0);
  }
  if (map.__ownerID) {
    map.size = newSize;
    map._root = newRoot;
    map.__hash = undefined;
    map.__altered = true;
    return map;
  }
  return newRoot ? makeMap(newSize, newRoot) : emptyMap();
}
function updateNode(node, ownerID, shift, keyHash, key, value, didChangeSize, didAlter) {
  if (!node) {
    if (value === NOT_SET) {
      return node;
    }
    SetRef(didAlter);
    SetRef(didChangeSize);
    return new ValueNode(ownerID, keyHash, [key, value]);
  }
  return node.update(ownerID, shift, keyHash, key, value, didChangeSize, didAlter);
}
function isLeafNode(node) {
  return node.constructor === ValueNode || node.constructor === HashCollisionNode;
}
function mergeIntoNode(node, ownerID, shift, keyHash, entry) {
  if (node.keyHash === keyHash) {
    return new HashCollisionNode(ownerID, keyHash, [node.entry, entry]);
  }
  var idx1 = (shift === 0 ? node.keyHash : node.keyHash >>> shift) & MASK;
  var idx2 = (shift === 0 ? keyHash : keyHash >>> shift) & MASK;
  var newNode;
  var nodes = idx1 === idx2 ? [mergeIntoNode(node, ownerID, shift + SHIFT, keyHash, entry)] : ((newNode = new ValueNode(ownerID, keyHash, entry)), idx1 < idx2 ? [node, newNode] : [newNode, node]);
  return new BitmapIndexedNode(ownerID, (1 << idx1) | (1 << idx2), nodes);
}
function createNodes(ownerID, entries, key, value) {
  if (!ownerID) {
    ownerID = new OwnerID();
  }
  var node = new ValueNode(ownerID, hash(key), [key, value]);
  for (var ii = 0; ii < entries.length; ii++) {
    var entry = entries[ii];
    node = node.update(ownerID, 0, undefined, entry[0], entry[1]);
  }
  return node;
}
function packNodes(ownerID, nodes, count, excluding) {
  var bitmap = 0;
  var packedII = 0;
  var packedNodes = new Array(count);
  for (var ii = 0,
      bit = 1,
      len = nodes.length; ii < len; ii++, bit <<= 1) {
    var node = nodes[ii];
    if (node !== undefined && ii !== excluding) {
      bitmap |= bit;
      packedNodes[packedII++] = node;
    }
  }
  return new BitmapIndexedNode(ownerID, bitmap, packedNodes);
}
function expandNodes(ownerID, nodes, bitmap, including, node) {
  var count = 0;
  var expandedNodes = new Array(SIZE);
  for (var ii = 0; bitmap !== 0; ii++, bitmap >>>= 1) {
    expandedNodes[ii] = bitmap & 1 ? nodes[count++] : undefined;
  }
  expandedNodes[including] = node;
  return new HashArrayMapNode(ownerID, count + 1, expandedNodes);
}
function mergeIntoMapWith(map, merger, iterables) {
  var iters = [];
  for (var ii = 0; ii < iterables.length; ii++) {
    var value = iterables[ii];
    var iter = KeyedIterable(value);
    if (!isIterable(value)) {
      iter = iter.map((function(v) {
        return fromJS(v);
      }));
    }
    iters.push(iter);
  }
  return mergeIntoCollectionWith(map, merger, iters);
}
function deepMerger(merger) {
  return (function(existing, value) {
    return existing && existing.mergeDeepWith && isIterable(value) ? existing.mergeDeepWith(merger, value) : merger ? merger(existing, value) : value;
  });
}
function mergeIntoCollectionWith(collection, merger, iters) {
  iters = iters.filter((function(x) {
    return x.size !== 0;
  }));
  if (iters.length === 0) {
    return collection;
  }
  if (collection.size === 0 && iters.length === 1) {
    return collection.constructor(iters[0]);
  }
  return collection.withMutations((function(collection) {
    var mergeIntoMap = merger ? (function(value, key) {
      collection.update(key, NOT_SET, (function(existing) {
        return existing === NOT_SET ? value : merger(existing, value);
      }));
    }) : (function(value, key) {
      collection.set(key, value);
    });
    for (var ii = 0; ii < iters.length; ii++) {
      iters[ii].forEach(mergeIntoMap);
    }
  }));
}
function updateInDeepMap(existing, keyPathIter, notSetValue, updater) {
  var isNotSet = existing === NOT_SET;
  var step = keyPathIter.next();
  if (step.done) {
    var existingValue = isNotSet ? notSetValue : existing;
    var newValue = updater(existingValue);
    return newValue === existingValue ? existing : newValue;
  }
  invariant(isNotSet || (existing && existing.set), 'invalid keyPath');
  var key = step.value;
  var nextExisting = isNotSet ? NOT_SET : existing.get(key, NOT_SET);
  var nextUpdated = updateInDeepMap(nextExisting, keyPathIter, notSetValue, updater);
  return nextUpdated === nextExisting ? existing : nextUpdated === NOT_SET ? existing.remove(key) : (isNotSet ? emptyMap() : existing).set(key, nextUpdated);
}
function popCount(x) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  x = x + (x >> 8);
  x = x + (x >> 16);
  return x & 0x7f;
}
function setIn(array, idx, val, canEdit) {
  var newArray = canEdit ? array : arrCopy(array);
  newArray[idx] = val;
  return newArray;
}
function spliceIn(array, idx, val, canEdit) {
  var newLen = array.length + 1;
  if (canEdit && idx + 1 === newLen) {
    array[idx] = val;
    return array;
  }
  var newArray = new Array(newLen);
  var after = 0;
  for (var ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      newArray[ii] = val;
      after = -1;
    } else {
      newArray[ii] = array[ii + after];
    }
  }
  return newArray;
}
function spliceOut(array, idx, canEdit) {
  var newLen = array.length - 1;
  if (canEdit && idx === newLen) {
    array.pop();
    return array;
  }
  var newArray = new Array(newLen);
  var after = 0;
  for (var ii = 0; ii < newLen; ii++) {
    if (ii === idx) {
      after = 1;
    }
    newArray[ii] = array[ii + after];
  }
  return newArray;
}
var MAX_ARRAY_MAP_SIZE = SIZE / 4;
var MAX_BITMAP_INDEXED_SIZE = SIZE / 2;
var MIN_HASH_ARRAY_MAP_SIZE = SIZE / 4;
var ToKeyedSequence = function ToKeyedSequence(indexed, useKeys) {
  this._iter = indexed;
  this._useKeys = useKeys;
  this.size = indexed.size;
};
($traceurRuntime.createClass)(ToKeyedSequence, {
  get: function(key, notSetValue) {
    return this._iter.get(key, notSetValue);
  },
  has: function(key) {
    return this._iter.has(key);
  },
  valueSeq: function() {
    return this._iter.valueSeq();
  },
  reverse: function() {
    var $__0 = this;
    var reversedSequence = reverseFactory(this, true);
    if (!this._useKeys) {
      reversedSequence.valueSeq = (function() {
        return $__0._iter.toSeq().reverse();
      });
    }
    return reversedSequence;
  },
  map: function(mapper, context) {
    var $__0 = this;
    var mappedSequence = mapFactory(this, mapper, context);
    if (!this._useKeys) {
      mappedSequence.valueSeq = (function() {
        return $__0._iter.toSeq().map(mapper, context);
      });
    }
    return mappedSequence;
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    var ii;
    return this._iter.__iterate(this._useKeys ? (function(v, k) {
      return fn(v, k, $__0);
    }) : ((ii = reverse ? resolveSize(this) : 0), (function(v) {
      return fn(v, reverse ? --ii : ii++, $__0);
    })), reverse);
  },
  __iterator: function(type, reverse) {
    if (this._useKeys) {
      return this._iter.__iterator(type, reverse);
    }
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    var ii = reverse ? resolveSize(this) : 0;
    return new Iterator((function() {
      var step = iterator.next();
      return step.done ? step : iteratorValue(type, reverse ? --ii : ii++, step.value, step);
    }));
  }
}, {}, KeyedSeq);
ToKeyedSequence.prototype[IS_ORDERED_SENTINEL] = true;
var ToIndexedSequence = function ToIndexedSequence(iter) {
  this._iter = iter;
  this.size = iter.size;
};
($traceurRuntime.createClass)(ToIndexedSequence, {
  contains: function(value) {
    return this._iter.contains(value);
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    var iterations = 0;
    return this._iter.__iterate((function(v) {
      return fn(v, iterations++, $__0);
    }), reverse);
  },
  __iterator: function(type, reverse) {
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    var iterations = 0;
    return new Iterator((function() {
      var step = iterator.next();
      return step.done ? step : iteratorValue(type, iterations++, step.value, step);
    }));
  }
}, {}, IndexedSeq);
var ToSetSequence = function ToSetSequence(iter) {
  this._iter = iter;
  this.size = iter.size;
};
($traceurRuntime.createClass)(ToSetSequence, {
  has: function(key) {
    return this._iter.contains(key);
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    return this._iter.__iterate((function(v) {
      return fn(v, v, $__0);
    }), reverse);
  },
  __iterator: function(type, reverse) {
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator((function() {
      var step = iterator.next();
      return step.done ? step : iteratorValue(type, step.value, step.value, step);
    }));
  }
}, {}, SetSeq);
var FromEntriesSequence = function FromEntriesSequence(entries) {
  this._iter = entries;
  this.size = entries.size;
};
($traceurRuntime.createClass)(FromEntriesSequence, {
  entrySeq: function() {
    return this._iter.toSeq();
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    return this._iter.__iterate((function(entry) {
      if (entry) {
        validateEntry(entry);
        return fn(entry[1], entry[0], $__0);
      }
    }), reverse);
  },
  __iterator: function(type, reverse) {
    var iterator = this._iter.__iterator(ITERATE_VALUES, reverse);
    return new Iterator((function() {
      while (true) {
        var step = iterator.next();
        if (step.done) {
          return step;
        }
        var entry = step.value;
        if (entry) {
          validateEntry(entry);
          return type === ITERATE_ENTRIES ? step : iteratorValue(type, entry[0], entry[1], step);
        }
      }
    }));
  }
}, {}, KeyedSeq);
ToIndexedSequence.prototype.cacheResult = ToKeyedSequence.prototype.cacheResult = ToSetSequence.prototype.cacheResult = FromEntriesSequence.prototype.cacheResult = cacheResultThrough;
function flipFactory(iterable) {
  var flipSequence = makeSequence(iterable);
  flipSequence._iter = iterable;
  flipSequence.size = iterable.size;
  flipSequence.flip = (function() {
    return iterable;
  });
  flipSequence.reverse = function() {
    var reversedSequence = iterable.reverse.apply(this);
    reversedSequence.flip = (function() {
      return iterable.reverse();
    });
    return reversedSequence;
  };
  flipSequence.has = (function(key) {
    return iterable.contains(key);
  });
  flipSequence.contains = (function(key) {
    return iterable.has(key);
  });
  flipSequence.cacheResult = cacheResultThrough;
  flipSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    return iterable.__iterate((function(v, k) {
      return fn(k, v, $__0) !== false;
    }), reverse);
  };
  flipSequence.__iteratorUncached = function(type, reverse) {
    if (type === ITERATE_ENTRIES) {
      var iterator = iterable.__iterator(type, reverse);
      return new Iterator((function() {
        var step = iterator.next();
        if (!step.done) {
          var k = step.value[0];
          step.value[0] = step.value[1];
          step.value[1] = k;
        }
        return step;
      }));
    }
    return iterable.__iterator(type === ITERATE_VALUES ? ITERATE_KEYS : ITERATE_VALUES, reverse);
  };
  return flipSequence;
}
function mapFactory(iterable, mapper, context) {
  var mappedSequence = makeSequence(iterable);
  mappedSequence.size = iterable.size;
  mappedSequence.has = (function(key) {
    return iterable.has(key);
  });
  mappedSequence.get = (function(key, notSetValue) {
    var v = iterable.get(key, NOT_SET);
    return v === NOT_SET ? notSetValue : mapper.call(context, v, key, iterable);
  });
  mappedSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    return iterable.__iterate((function(v, k, c) {
      return fn(mapper.call(context, v, k, c), k, $__0) !== false;
    }), reverse);
  };
  mappedSequence.__iteratorUncached = function(type, reverse) {
    var iterator = iterable.__iterator(ITERATE_ENTRIES, reverse);
    return new Iterator((function() {
      var step = iterator.next();
      if (step.done) {
        return step;
      }
      var entry = step.value;
      var key = entry[0];
      return iteratorValue(type, key, mapper.call(context, entry[1], key, iterable), step);
    }));
  };
  return mappedSequence;
}
function reverseFactory(iterable, useKeys) {
  var reversedSequence = makeSequence(iterable);
  reversedSequence._iter = iterable;
  reversedSequence.size = iterable.size;
  reversedSequence.reverse = (function() {
    return iterable;
  });
  if (iterable.flip) {
    reversedSequence.flip = function() {
      var flipSequence = flipFactory(iterable);
      flipSequence.reverse = (function() {
        return iterable.flip();
      });
      return flipSequence;
    };
  }
  reversedSequence.get = (function(key, notSetValue) {
    return iterable.get(useKeys ? key : -1 - key, notSetValue);
  });
  reversedSequence.has = (function(key) {
    return iterable.has(useKeys ? key : -1 - key);
  });
  reversedSequence.contains = (function(value) {
    return iterable.contains(value);
  });
  reversedSequence.cacheResult = cacheResultThrough;
  reversedSequence.__iterate = function(fn, reverse) {
    var $__0 = this;
    return iterable.__iterate((function(v, k) {
      return fn(v, k, $__0);
    }), !reverse);
  };
  reversedSequence.__iterator = (function(type, reverse) {
    return iterable.__iterator(type, !reverse);
  });
  return reversedSequence;
}
function filterFactory(iterable, predicate, context, useKeys) {
  var filterSequence = makeSequence(iterable);
  if (useKeys) {
    filterSequence.has = (function(key) {
      var v = iterable.get(key, NOT_SET);
      return v !== NOT_SET && !!predicate.call(context, v, key, iterable);
    });
    filterSequence.get = (function(key, notSetValue) {
      var v = iterable.get(key, NOT_SET);
      return v !== NOT_SET && predicate.call(context, v, key, iterable) ? v : notSetValue;
    });
  }
  filterSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    var iterations = 0;
    iterable.__iterate((function(v, k, c) {
      if (predicate.call(context, v, k, c)) {
        iterations++;
        return fn(v, useKeys ? k : iterations - 1, $__0);
      }
    }), reverse);
    return iterations;
  };
  filterSequence.__iteratorUncached = function(type, reverse) {
    var iterator = iterable.__iterator(ITERATE_ENTRIES, reverse);
    var iterations = 0;
    return new Iterator((function() {
      while (true) {
        var step = iterator.next();
        if (step.done) {
          return step;
        }
        var entry = step.value;
        var key = entry[0];
        var value = entry[1];
        if (predicate.call(context, value, key, iterable)) {
          return iteratorValue(type, useKeys ? key : iterations++, value, step);
        }
      }
    }));
  };
  return filterSequence;
}
function countByFactory(iterable, grouper, context) {
  var groups = Map().asMutable();
  iterable.__iterate((function(v, k) {
    groups.update(grouper.call(context, v, k, iterable), 0, (function(a) {
      return a + 1;
    }));
  }));
  return groups.asImmutable();
}
function groupByFactory(iterable, grouper, context) {
  var isKeyedIter = isKeyed(iterable);
  var groups = Map().asMutable();
  iterable.__iterate((function(v, k) {
    groups.update(grouper.call(context, v, k, iterable), (function(a) {
      return (a = a || [], a.push(isKeyedIter ? [k, v] : v), a);
    }));
  }));
  var coerce = iterableClass(iterable);
  return groups.map((function(arr) {
    return reify(iterable, coerce(arr));
  }));
}
function takeFactory(iterable, amount) {
  if (amount > iterable.size) {
    return iterable;
  }
  if (amount < 0) {
    amount = 0;
  }
  var takeSequence = makeSequence(iterable);
  takeSequence.size = iterable.size && Math.min(iterable.size, amount);
  takeSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    if (amount === 0) {
      return 0;
    }
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterations = 0;
    iterable.__iterate((function(v, k) {
      return ++iterations && fn(v, k, $__0) !== false && iterations < amount;
    }));
    return iterations;
  };
  takeSequence.__iteratorUncached = function(type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = amount && iterable.__iterator(type, reverse);
    var iterations = 0;
    return new Iterator((function() {
      if (iterations++ > amount) {
        return iteratorDone();
      }
      return iterator.next();
    }));
  };
  return takeSequence;
}
function takeWhileFactory(iterable, predicate, context) {
  var takeSequence = makeSequence(iterable);
  takeSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var iterations = 0;
    iterable.__iterate((function(v, k, c) {
      return predicate.call(context, v, k, c) && ++iterations && fn(v, k, $__0);
    }));
    return iterations;
  };
  takeSequence.__iteratorUncached = function(type, reverse) {
    var $__0 = this;
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = iterable.__iterator(ITERATE_ENTRIES, reverse);
    var iterating = true;
    return new Iterator((function() {
      if (!iterating) {
        return iteratorDone();
      }
      var step = iterator.next();
      if (step.done) {
        return step;
      }
      var entry = step.value;
      var k = entry[0];
      var v = entry[1];
      if (!predicate.call(context, v, k, $__0)) {
        iterating = false;
        return iteratorDone();
      }
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    }));
  };
  return takeSequence;
}
function skipFactory(iterable, amount, useKeys) {
  if (amount <= 0) {
    return iterable;
  }
  var skipSequence = makeSequence(iterable);
  skipSequence.size = iterable.size && Math.max(0, iterable.size - amount);
  skipSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var skipped = 0;
    var isSkipping = true;
    var iterations = 0;
    iterable.__iterate((function(v, k) {
      if (!(isSkipping && (isSkipping = skipped++ < amount))) {
        iterations++;
        return fn(v, useKeys ? k : iterations - 1, $__0);
      }
    }));
    return iterations;
  };
  skipSequence.__iteratorUncached = function(type, reverse) {
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = amount && iterable.__iterator(type, reverse);
    var skipped = 0;
    var iterations = 0;
    return new Iterator((function() {
      while (skipped < amount) {
        skipped++;
        iterator.next();
      }
      var step = iterator.next();
      if (useKeys || type === ITERATE_VALUES) {
        return step;
      } else if (type === ITERATE_KEYS) {
        return iteratorValue(type, iterations++, undefined, step);
      } else {
        return iteratorValue(type, iterations++, step.value[1], step);
      }
    }));
  };
  return skipSequence;
}
function skipWhileFactory(iterable, predicate, context, useKeys) {
  var skipSequence = makeSequence(iterable);
  skipSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    if (reverse) {
      return this.cacheResult().__iterate(fn, reverse);
    }
    var isSkipping = true;
    var iterations = 0;
    iterable.__iterate((function(v, k, c) {
      if (!(isSkipping && (isSkipping = predicate.call(context, v, k, c)))) {
        iterations++;
        return fn(v, useKeys ? k : iterations - 1, $__0);
      }
    }));
    return iterations;
  };
  skipSequence.__iteratorUncached = function(type, reverse) {
    var $__0 = this;
    if (reverse) {
      return this.cacheResult().__iterator(type, reverse);
    }
    var iterator = iterable.__iterator(ITERATE_ENTRIES, reverse);
    var skipping = true;
    var iterations = 0;
    return new Iterator((function() {
      var step,
          k,
          v;
      do {
        step = iterator.next();
        if (step.done) {
          if (useKeys || type === ITERATE_VALUES) {
            return step;
          } else if (type === ITERATE_KEYS) {
            return iteratorValue(type, iterations++, undefined, step);
          } else {
            return iteratorValue(type, iterations++, step.value[1], step);
          }
        }
        var entry = step.value;
        k = entry[0];
        v = entry[1];
        skipping && (skipping = predicate.call(context, v, k, $__0));
      } while (skipping);
      return type === ITERATE_ENTRIES ? step : iteratorValue(type, k, v, step);
    }));
  };
  return skipSequence;
}
function concatFactory(iterable, values) {
  var isKeyedIterable = isKeyed(iterable);
  var iters = [iterable].concat(values).map((function(v) {
    if (!isIterable(v)) {
      v = isKeyedIterable ? keyedSeqFromValue(v) : indexedSeqFromValue(Array.isArray(v) ? v : [v]);
    } else if (isKeyedIterable) {
      v = KeyedIterable(v);
    }
    return v;
  })).filter((function(v) {
    return v.size !== 0;
  }));
  if (iters.length === 0) {
    return iterable;
  }
  if (iters.length === 1) {
    var singleton = iters[0];
    if (singleton === iterable || isKeyedIterable && isKeyed(singleton) || isIndexed(iterable) && isIndexed(singleton)) {
      return singleton;
    }
  }
  var concatSeq = new ArraySeq(iters);
  if (isKeyedIterable) {
    concatSeq = concatSeq.toKeyedSeq();
  } else if (!isIndexed(iterable)) {
    concatSeq = concatSeq.toSetSeq();
  }
  concatSeq = concatSeq.flatten(true);
  concatSeq.size = iters.reduce((function(sum, seq) {
    if (sum !== undefined) {
      var size = seq.size;
      if (size !== undefined) {
        return sum + size;
      }
    }
  }), 0);
  return concatSeq;
}
function flattenFactory(iterable, depth, useKeys) {
  var flatSequence = makeSequence(iterable);
  flatSequence.__iterateUncached = function(fn, reverse) {
    var iterations = 0;
    var stopped = false;
    function flatDeep(iter, currentDepth) {
      var $__0 = this;
      iter.__iterate((function(v, k) {
        if ((!depth || currentDepth < depth) && isIterable(v)) {
          flatDeep(v, currentDepth + 1);
        } else if (fn(v, useKeys ? k : iterations++, $__0) === false) {
          stopped = true;
        }
        return !stopped;
      }), reverse);
    }
    flatDeep(iterable, 0);
    return iterations;
  };
  flatSequence.__iteratorUncached = function(type, reverse) {
    var iterator = iterable.__iterator(type, reverse);
    var stack = [];
    var iterations = 0;
    return new Iterator((function() {
      while (iterator) {
        var step = iterator.next();
        if (step.done !== false) {
          iterator = stack.pop();
          continue;
        }
        var v = step.value;
        if (type === ITERATE_ENTRIES) {
          v = v[1];
        }
        if ((!depth || stack.length < depth) && isIterable(v)) {
          stack.push(iterator);
          iterator = v.__iterator(type, reverse);
        } else {
          return useKeys ? step : iteratorValue(type, iterations++, v, step);
        }
      }
      return iteratorDone();
    }));
  };
  return flatSequence;
}
function flatMapFactory(iterable, mapper, context) {
  var coerce = iterableClass(iterable);
  return iterable.toSeq().map((function(v, k) {
    return coerce(mapper.call(context, v, k, iterable));
  })).flatten(true);
}
function interposeFactory(iterable, separator) {
  var interposedSequence = makeSequence(iterable);
  interposedSequence.size = iterable.size && iterable.size * 2 - 1;
  interposedSequence.__iterateUncached = function(fn, reverse) {
    var $__0 = this;
    var iterations = 0;
    iterable.__iterate((function(v, k) {
      return (!iterations || fn(separator, iterations++, $__0) !== false) && fn(v, iterations++, $__0) !== false;
    }), reverse);
    return iterations;
  };
  interposedSequence.__iteratorUncached = function(type, reverse) {
    var iterator = iterable.__iterator(ITERATE_VALUES, reverse);
    var iterations = 0;
    var step;
    return new Iterator((function() {
      if (!step || iterations % 2) {
        step = iterator.next();
        if (step.done) {
          return step;
        }
      }
      return iterations % 2 ? iteratorValue(type, iterations++, separator) : iteratorValue(type, iterations++, step.value, step);
    }));
  };
  return interposedSequence;
}
function sortFactory(iterable, comparator, mapper) {
  if (!comparator) {
    comparator = defaultComparator;
  }
  var isKeyedIterable = isKeyed(iterable);
  var index = 0;
  var entries = iterable.toSeq().map((function(v, k) {
    return [k, v, index++, mapper ? mapper(v, k, iterable) : v];
  })).toArray();
  entries.sort((function(a, b) {
    return comparator(a[3], b[3]) || a[2] - b[2];
  })).forEach(isKeyedIterable ? (function(v, i) {
    entries[i].length = 2;
  }) : (function(v, i) {
    entries[i] = v[1];
  }));
  return isKeyedIterable ? KeyedSeq(entries) : isIndexed(iterable) ? IndexedSeq(entries) : SetSeq(entries);
}
function maxFactory(iterable, comparator, mapper) {
  if (!comparator) {
    comparator = defaultComparator;
  }
  if (mapper) {
    var entry = iterable.toSeq().map((function(v, k) {
      return [v, mapper(v, k, iterable)];
    })).reduce((function(a, b) {
      return _maxCompare(comparator, a[1], b[1]) ? b : a;
    }));
    return entry && entry[0];
  } else {
    return iterable.reduce((function(a, b) {
      return _maxCompare(comparator, a, b) ? b : a;
    }));
  }
}
function _maxCompare(comparator, a, b) {
  var comp = comparator(b, a);
  return (comp === 0 && b !== a && (b === undefined || b === null || b !== b)) || comp > 0;
}
function reify(iter, seq) {
  return isSeq(iter) ? seq : iter.constructor(seq);
}
function validateEntry(entry) {
  if (entry !== Object(entry)) {
    throw new TypeError('Expected [K, V] tuple: ' + entry);
  }
}
function resolveSize(iter) {
  assertNotInfinite(iter.size);
  return ensureSize(iter);
}
function iterableClass(iterable) {
  return isKeyed(iterable) ? KeyedIterable : isIndexed(iterable) ? IndexedIterable : SetIterable;
}
function makeSequence(iterable) {
  return Object.create((isKeyed(iterable) ? KeyedSeq : isIndexed(iterable) ? IndexedSeq : SetSeq).prototype);
}
function cacheResultThrough() {
  if (this._iter.cacheResult) {
    this._iter.cacheResult();
    this.size = this._iter.size;
    return this;
  } else {
    return Seq.prototype.cacheResult.call(this);
  }
}
function defaultComparator(a, b) {
  return a > b ? 1 : a < b ? -1 : 0;
}
var List = function List(value) {
  var empty = emptyList();
  if (value === null || value === undefined) {
    return empty;
  }
  if (isList(value)) {
    return value;
  }
  var iter = IndexedIterable(value);
  var size = iter.size;
  if (size === 0) {
    return empty;
  }
  assertNotInfinite(size);
  if (size > 0 && size < SIZE) {
    return makeList(0, size, SHIFT, null, new VNode(iter.toArray()));
  }
  return empty.withMutations((function(list) {
    list.setSize(size);
    iter.forEach((function(v, i) {
      return list.set(i, v);
    }));
  }));
};
($traceurRuntime.createClass)(List, {
  toString: function() {
    return this.__toString('List [', ']');
  },
  get: function(index, notSetValue) {
    index = wrapIndex(this, index);
    if (index < 0 || index >= this.size) {
      return notSetValue;
    }
    index += this._origin;
    var node = listNodeFor(this, index);
    return node && node.array[index & MASK];
  },
  set: function(index, value) {
    return updateList(this, index, value);
  },
  remove: function(index) {
    return !this.has(index) ? this : index === 0 ? this.shift() : index === this.size - 1 ? this.pop() : this.splice(index, 1);
  },
  clear: function() {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = this._origin = this._capacity = 0;
      this._level = SHIFT;
      this._root = this._tail = null;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyList();
  },
  push: function() {
    var values = arguments;
    var oldSize = this.size;
    return this.withMutations((function(list) {
      setListBounds(list, 0, oldSize + values.length);
      for (var ii = 0; ii < values.length; ii++) {
        list.set(oldSize + ii, values[ii]);
      }
    }));
  },
  pop: function() {
    return setListBounds(this, 0, -1);
  },
  unshift: function() {
    var values = arguments;
    return this.withMutations((function(list) {
      setListBounds(list, -values.length);
      for (var ii = 0; ii < values.length; ii++) {
        list.set(ii, values[ii]);
      }
    }));
  },
  shift: function() {
    return setListBounds(this, 1);
  },
  merge: function() {
    return mergeIntoListWith(this, undefined, arguments);
  },
  mergeWith: function(merger) {
    for (var iters = [],
        $__7 = 1; $__7 < arguments.length; $__7++)
      iters[$__7 - 1] = arguments[$__7];
    return mergeIntoListWith(this, merger, iters);
  },
  mergeDeep: function() {
    return mergeIntoListWith(this, deepMerger(undefined), arguments);
  },
  mergeDeepWith: function(merger) {
    for (var iters = [],
        $__8 = 1; $__8 < arguments.length; $__8++)
      iters[$__8 - 1] = arguments[$__8];
    return mergeIntoListWith(this, deepMerger(merger), iters);
  },
  setSize: function(size) {
    return setListBounds(this, 0, size);
  },
  slice: function(begin, end) {
    var size = this.size;
    if (wholeSlice(begin, end, size)) {
      return this;
    }
    return setListBounds(this, resolveBegin(begin, size), resolveEnd(end, size));
  },
  __iterator: function(type, reverse) {
    var index = 0;
    var values = iterateList(this, reverse);
    return new Iterator((function() {
      var value = values();
      return value === DONE ? iteratorDone() : iteratorValue(type, index++, value);
    }));
  },
  __iterate: function(fn, reverse) {
    var index = 0;
    var values = iterateList(this, reverse);
    var value;
    while ((value = values()) !== DONE) {
      if (fn(value, index++, this) === false) {
        break;
      }
    }
    return index;
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      this.__ownerID = ownerID;
      return this;
    }
    return makeList(this._origin, this._capacity, this._level, this._root, this._tail, ownerID, this.__hash);
  }
}, {of: function() {
    return this(arguments);
  }}, IndexedCollection);
function isList(maybeList) {
  return !!(maybeList && maybeList[IS_LIST_SENTINEL]);
}
List.isList = isList;
var IS_LIST_SENTINEL = '@@__IMMUTABLE_LIST__@@';
var ListPrototype = List.prototype;
ListPrototype[IS_LIST_SENTINEL] = true;
ListPrototype[DELETE] = ListPrototype.remove;
ListPrototype.setIn = MapPrototype.setIn;
ListPrototype.deleteIn = ListPrototype.removeIn = MapPrototype.removeIn;
ListPrototype.update = MapPrototype.update;
ListPrototype.updateIn = MapPrototype.updateIn;
ListPrototype.mergeIn = MapPrototype.mergeIn;
ListPrototype.mergeDeepIn = MapPrototype.mergeDeepIn;
ListPrototype.withMutations = MapPrototype.withMutations;
ListPrototype.asMutable = MapPrototype.asMutable;
ListPrototype.asImmutable = MapPrototype.asImmutable;
ListPrototype.wasAltered = MapPrototype.wasAltered;
var VNode = function VNode(array, ownerID) {
  this.array = array;
  this.ownerID = ownerID;
};
var $VNode = VNode;
($traceurRuntime.createClass)(VNode, {
  removeBefore: function(ownerID, level, index) {
    if (index === level ? 1 << level : 0 || this.array.length === 0) {
      return this;
    }
    var originIndex = (index >>> level) & MASK;
    if (originIndex >= this.array.length) {
      return new $VNode([], ownerID);
    }
    var removingFirst = originIndex === 0;
    var newChild;
    if (level > 0) {
      var oldChild = this.array[originIndex];
      newChild = oldChild && oldChild.removeBefore(ownerID, level - SHIFT, index);
      if (newChild === oldChild && removingFirst) {
        return this;
      }
    }
    if (removingFirst && !newChild) {
      return this;
    }
    var editable = editableVNode(this, ownerID);
    if (!removingFirst) {
      for (var ii = 0; ii < originIndex; ii++) {
        editable.array[ii] = undefined;
      }
    }
    if (newChild) {
      editable.array[originIndex] = newChild;
    }
    return editable;
  },
  removeAfter: function(ownerID, level, index) {
    if (index === level ? 1 << level : 0 || this.array.length === 0) {
      return this;
    }
    var sizeIndex = ((index - 1) >>> level) & MASK;
    if (sizeIndex >= this.array.length) {
      return this;
    }
    var removingLast = sizeIndex === this.array.length - 1;
    var newChild;
    if (level > 0) {
      var oldChild = this.array[sizeIndex];
      newChild = oldChild && oldChild.removeAfter(ownerID, level - SHIFT, index);
      if (newChild === oldChild && removingLast) {
        return this;
      }
    }
    if (removingLast && !newChild) {
      return this;
    }
    var editable = editableVNode(this, ownerID);
    if (!removingLast) {
      editable.array.pop();
    }
    if (newChild) {
      editable.array[sizeIndex] = newChild;
    }
    return editable;
  }
}, {});
var DONE = {};
function iterateList(list, reverse) {
  var left = list._origin;
  var right = list._capacity;
  var tailPos = getTailOffset(right);
  var tail = list._tail;
  return iterateNodeOrLeaf(list._root, list._level, 0);
  function iterateNodeOrLeaf(node, level, offset) {
    return level === 0 ? iterateLeaf(node, offset) : iterateNode(node, level, offset);
  }
  function iterateLeaf(node, offset) {
    var array = offset === tailPos ? tail && tail.array : node && node.array;
    var from = offset > left ? 0 : left - offset;
    var to = right - offset;
    if (to > SIZE) {
      to = SIZE;
    }
    return (function() {
      if (from === to) {
        return DONE;
      }
      var idx = reverse ? --to : from++;
      return array && array[idx];
    });
  }
  function iterateNode(node, level, offset) {
    var values;
    var array = node && node.array;
    var from = offset > left ? 0 : (left - offset) >> level;
    var to = ((right - offset) >> level) + 1;
    if (to > SIZE) {
      to = SIZE;
    }
    return (function() {
      do {
        if (values) {
          var value = values();
          if (value !== DONE) {
            return value;
          }
          values = null;
        }
        if (from === to) {
          return DONE;
        }
        var idx = reverse ? --to : from++;
        values = iterateNodeOrLeaf(array && array[idx], level - SHIFT, offset + (idx << level));
      } while (true);
    });
  }
}
function makeList(origin, capacity, level, root, tail, ownerID, hash) {
  var list = Object.create(ListPrototype);
  list.size = capacity - origin;
  list._origin = origin;
  list._capacity = capacity;
  list._level = level;
  list._root = root;
  list._tail = tail;
  list.__ownerID = ownerID;
  list.__hash = hash;
  list.__altered = false;
  return list;
}
var EMPTY_LIST;
function emptyList() {
  return EMPTY_LIST || (EMPTY_LIST = makeList(0, 0, SHIFT));
}
function updateList(list, index, value) {
  index = wrapIndex(list, index);
  if (index >= list.size || index < 0) {
    return list.withMutations((function(list) {
      index < 0 ? setListBounds(list, index).set(0, value) : setListBounds(list, 0, index + 1).set(index, value);
    }));
  }
  index += list._origin;
  var newTail = list._tail;
  var newRoot = list._root;
  var didAlter = MakeRef(DID_ALTER);
  if (index >= getTailOffset(list._capacity)) {
    newTail = updateVNode(newTail, list.__ownerID, 0, index, value, didAlter);
  } else {
    newRoot = updateVNode(newRoot, list.__ownerID, list._level, index, value, didAlter);
  }
  if (!didAlter.value) {
    return list;
  }
  if (list.__ownerID) {
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(list._origin, list._capacity, list._level, newRoot, newTail);
}
function updateVNode(node, ownerID, level, index, value, didAlter) {
  var idx = (index >>> level) & MASK;
  var nodeHas = node && idx < node.array.length;
  if (!nodeHas && value === undefined) {
    return node;
  }
  var newNode;
  if (level > 0) {
    var lowerNode = node && node.array[idx];
    var newLowerNode = updateVNode(lowerNode, ownerID, level - SHIFT, index, value, didAlter);
    if (newLowerNode === lowerNode) {
      return node;
    }
    newNode = editableVNode(node, ownerID);
    newNode.array[idx] = newLowerNode;
    return newNode;
  }
  if (nodeHas && node.array[idx] === value) {
    return node;
  }
  SetRef(didAlter);
  newNode = editableVNode(node, ownerID);
  if (value === undefined && idx === newNode.array.length - 1) {
    newNode.array.pop();
  } else {
    newNode.array[idx] = value;
  }
  return newNode;
}
function editableVNode(node, ownerID) {
  if (ownerID && node && ownerID === node.ownerID) {
    return node;
  }
  return new VNode(node ? node.array.slice() : [], ownerID);
}
function listNodeFor(list, rawIndex) {
  if (rawIndex >= getTailOffset(list._capacity)) {
    return list._tail;
  }
  if (rawIndex < 1 << (list._level + SHIFT)) {
    var node = list._root;
    var level = list._level;
    while (node && level > 0) {
      node = node.array[(rawIndex >>> level) & MASK];
      level -= SHIFT;
    }
    return node;
  }
}
function setListBounds(list, begin, end) {
  var owner = list.__ownerID || new OwnerID();
  var oldOrigin = list._origin;
  var oldCapacity = list._capacity;
  var newOrigin = oldOrigin + begin;
  var newCapacity = end === undefined ? oldCapacity : end < 0 ? oldCapacity + end : oldOrigin + end;
  if (newOrigin === oldOrigin && newCapacity === oldCapacity) {
    return list;
  }
  if (newOrigin >= newCapacity) {
    return list.clear();
  }
  var newLevel = list._level;
  var newRoot = list._root;
  var offsetShift = 0;
  while (newOrigin + offsetShift < 0) {
    newRoot = new VNode(newRoot && newRoot.array.length ? [undefined, newRoot] : [], owner);
    newLevel += SHIFT;
    offsetShift += 1 << newLevel;
  }
  if (offsetShift) {
    newOrigin += offsetShift;
    oldOrigin += offsetShift;
    newCapacity += offsetShift;
    oldCapacity += offsetShift;
  }
  var oldTailOffset = getTailOffset(oldCapacity);
  var newTailOffset = getTailOffset(newCapacity);
  while (newTailOffset >= 1 << (newLevel + SHIFT)) {
    newRoot = new VNode(newRoot && newRoot.array.length ? [newRoot] : [], owner);
    newLevel += SHIFT;
  }
  var oldTail = list._tail;
  var newTail = newTailOffset < oldTailOffset ? listNodeFor(list, newCapacity - 1) : newTailOffset > oldTailOffset ? new VNode([], owner) : oldTail;
  if (oldTail && newTailOffset > oldTailOffset && newOrigin < oldCapacity && oldTail.array.length) {
    newRoot = editableVNode(newRoot, owner);
    var node = newRoot;
    for (var level = newLevel; level > SHIFT; level -= SHIFT) {
      var idx = (oldTailOffset >>> level) & MASK;
      node = node.array[idx] = editableVNode(node.array[idx], owner);
    }
    node.array[(oldTailOffset >>> SHIFT) & MASK] = oldTail;
  }
  if (newCapacity < oldCapacity) {
    newTail = newTail && newTail.removeAfter(owner, 0, newCapacity);
  }
  if (newOrigin >= newTailOffset) {
    newOrigin -= newTailOffset;
    newCapacity -= newTailOffset;
    newLevel = SHIFT;
    newRoot = null;
    newTail = newTail && newTail.removeBefore(owner, 0, newOrigin);
  } else if (newOrigin > oldOrigin || newTailOffset < oldTailOffset) {
    offsetShift = 0;
    while (newRoot) {
      var beginIndex = (newOrigin >>> newLevel) & MASK;
      if (beginIndex !== (newTailOffset >>> newLevel) & MASK) {
        break;
      }
      if (beginIndex) {
        offsetShift += (1 << newLevel) * beginIndex;
      }
      newLevel -= SHIFT;
      newRoot = newRoot.array[beginIndex];
    }
    if (newRoot && newOrigin > oldOrigin) {
      newRoot = newRoot.removeBefore(owner, newLevel, newOrigin - offsetShift);
    }
    if (newRoot && newTailOffset < oldTailOffset) {
      newRoot = newRoot.removeAfter(owner, newLevel, newTailOffset - offsetShift);
    }
    if (offsetShift) {
      newOrigin -= offsetShift;
      newCapacity -= offsetShift;
    }
  }
  if (list.__ownerID) {
    list.size = newCapacity - newOrigin;
    list._origin = newOrigin;
    list._capacity = newCapacity;
    list._level = newLevel;
    list._root = newRoot;
    list._tail = newTail;
    list.__hash = undefined;
    list.__altered = true;
    return list;
  }
  return makeList(newOrigin, newCapacity, newLevel, newRoot, newTail);
}
function mergeIntoListWith(list, merger, iterables) {
  var iters = [];
  var maxSize = 0;
  for (var ii = 0; ii < iterables.length; ii++) {
    var value = iterables[ii];
    var iter = IndexedIterable(value);
    if (iter.size > maxSize) {
      maxSize = iter.size;
    }
    if (!isIterable(value)) {
      iter = iter.map((function(v) {
        return fromJS(v);
      }));
    }
    iters.push(iter);
  }
  if (maxSize > list.size) {
    list = list.setSize(maxSize);
  }
  return mergeIntoCollectionWith(list, merger, iters);
}
function getTailOffset(size) {
  return size < SIZE ? 0 : (((size - 1) >>> SHIFT) << SHIFT);
}
var OrderedMap = function OrderedMap(value) {
  return value === null || value === undefined ? emptyOrderedMap() : isOrderedMap(value) ? value : emptyOrderedMap().withMutations((function(map) {
    var iter = KeyedIterable(value);
    assertNotInfinite(iter.size);
    iter.forEach((function(v, k) {
      return map.set(k, v);
    }));
  }));
};
($traceurRuntime.createClass)(OrderedMap, {
  toString: function() {
    return this.__toString('OrderedMap {', '}');
  },
  get: function(k, notSetValue) {
    var index = this._map.get(k);
    return index !== undefined ? this._list.get(index)[1] : notSetValue;
  },
  clear: function() {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._map.clear();
      this._list.clear();
      return this;
    }
    return emptyOrderedMap();
  },
  set: function(k, v) {
    return updateOrderedMap(this, k, v);
  },
  remove: function(k) {
    return updateOrderedMap(this, k, NOT_SET);
  },
  wasAltered: function() {
    return this._map.wasAltered() || this._list.wasAltered();
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    return this._list.__iterate((function(entry) {
      return entry && fn(entry[1], entry[0], $__0);
    }), reverse);
  },
  __iterator: function(type, reverse) {
    return this._list.fromEntrySeq().__iterator(type, reverse);
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map.__ensureOwner(ownerID);
    var newList = this._list.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this._map = newMap;
      this._list = newList;
      return this;
    }
    return makeOrderedMap(newMap, newList, ownerID, this.__hash);
  }
}, {of: function() {
    return this(arguments);
  }}, Map);
function isOrderedMap(maybeOrderedMap) {
  return isMap(maybeOrderedMap) && isOrdered(maybeOrderedMap);
}
OrderedMap.isOrderedMap = isOrderedMap;
OrderedMap.prototype[IS_ORDERED_SENTINEL] = true;
OrderedMap.prototype[DELETE] = OrderedMap.prototype.remove;
function makeOrderedMap(map, list, ownerID, hash) {
  var omap = Object.create(OrderedMap.prototype);
  omap.size = map ? map.size : 0;
  omap._map = map;
  omap._list = list;
  omap.__ownerID = ownerID;
  omap.__hash = hash;
  return omap;
}
var EMPTY_ORDERED_MAP;
function emptyOrderedMap() {
  return EMPTY_ORDERED_MAP || (EMPTY_ORDERED_MAP = makeOrderedMap(emptyMap(), emptyList()));
}
function updateOrderedMap(omap, k, v) {
  var map = omap._map;
  var list = omap._list;
  var i = map.get(k);
  var has = i !== undefined;
  var newMap;
  var newList;
  if (v === NOT_SET) {
    if (!has) {
      return omap;
    }
    if (list.size >= SIZE && list.size >= map.size * 2) {
      newList = list.filter((function(entry, idx) {
        return entry !== undefined && i !== idx;
      }));
      newMap = newList.toKeyedSeq().map((function(entry) {
        return entry[0];
      })).flip().toMap();
      if (omap.__ownerID) {
        newMap.__ownerID = newList.__ownerID = omap.__ownerID;
      }
    } else {
      newMap = map.remove(k);
      newList = i === list.size - 1 ? list.pop() : list.set(i, undefined);
    }
  } else {
    if (has) {
      if (v === list.get(i)[1]) {
        return omap;
      }
      newMap = map;
      newList = list.set(i, [k, v]);
    } else {
      newMap = map.set(k, list.size);
      newList = list.set(list.size, [k, v]);
    }
  }
  if (omap.__ownerID) {
    omap.size = newMap.size;
    omap._map = newMap;
    omap._list = newList;
    omap.__hash = undefined;
    return omap;
  }
  return makeOrderedMap(newMap, newList);
}
var Stack = function Stack(value) {
  return value === null || value === undefined ? emptyStack() : isStack(value) ? value : emptyStack().unshiftAll(value);
};
var $Stack = Stack;
($traceurRuntime.createClass)(Stack, {
  toString: function() {
    return this.__toString('Stack [', ']');
  },
  get: function(index, notSetValue) {
    var head = this._head;
    while (head && index--) {
      head = head.next;
    }
    return head ? head.value : notSetValue;
  },
  peek: function() {
    return this._head && this._head.value;
  },
  push: function() {
    if (arguments.length === 0) {
      return this;
    }
    var newSize = this.size + arguments.length;
    var head = this._head;
    for (var ii = arguments.length - 1; ii >= 0; ii--) {
      head = {
        value: arguments[ii],
        next: head
      };
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  },
  pushAll: function(iter) {
    iter = IndexedIterable(iter);
    if (iter.size === 0) {
      return this;
    }
    assertNotInfinite(iter.size);
    var newSize = this.size;
    var head = this._head;
    iter.reverse().forEach((function(value) {
      newSize++;
      head = {
        value: value,
        next: head
      };
    }));
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  },
  pop: function() {
    return this.slice(1);
  },
  unshift: function() {
    return this.push.apply(this, arguments);
  },
  unshiftAll: function(iter) {
    return this.pushAll(iter);
  },
  shift: function() {
    return this.pop.apply(this, arguments);
  },
  clear: function() {
    if (this.size === 0) {
      return this;
    }
    if (this.__ownerID) {
      this.size = 0;
      this._head = undefined;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return emptyStack();
  },
  slice: function(begin, end) {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    var resolvedBegin = resolveBegin(begin, this.size);
    var resolvedEnd = resolveEnd(end, this.size);
    if (resolvedEnd !== this.size) {
      return $traceurRuntime.superCall(this, $Stack.prototype, "slice", [begin, end]);
    }
    var newSize = this.size - resolvedBegin;
    var head = this._head;
    while (resolvedBegin--) {
      head = head.next;
    }
    if (this.__ownerID) {
      this.size = newSize;
      this._head = head;
      this.__hash = undefined;
      this.__altered = true;
      return this;
    }
    return makeStack(newSize, head);
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    if (!ownerID) {
      this.__ownerID = ownerID;
      this.__altered = false;
      return this;
    }
    return makeStack(this.size, this._head, ownerID, this.__hash);
  },
  __iterate: function(fn, reverse) {
    if (reverse) {
      return this.toSeq().cacheResult.__iterate(fn, reverse);
    }
    var iterations = 0;
    var node = this._head;
    while (node) {
      if (fn(node.value, iterations++, this) === false) {
        break;
      }
      node = node.next;
    }
    return iterations;
  },
  __iterator: function(type, reverse) {
    if (reverse) {
      return this.toSeq().cacheResult().__iterator(type, reverse);
    }
    var iterations = 0;
    var node = this._head;
    return new Iterator((function() {
      if (node) {
        var value = node.value;
        node = node.next;
        return iteratorValue(type, iterations++, value);
      }
      return iteratorDone();
    }));
  }
}, {of: function() {
    return this(arguments);
  }}, IndexedCollection);
function isStack(maybeStack) {
  return !!(maybeStack && maybeStack[IS_STACK_SENTINEL]);
}
Stack.isStack = isStack;
var IS_STACK_SENTINEL = '@@__IMMUTABLE_STACK__@@';
var StackPrototype = Stack.prototype;
StackPrototype[IS_STACK_SENTINEL] = true;
StackPrototype.withMutations = MapPrototype.withMutations;
StackPrototype.asMutable = MapPrototype.asMutable;
StackPrototype.asImmutable = MapPrototype.asImmutable;
StackPrototype.wasAltered = MapPrototype.wasAltered;
function makeStack(size, head, ownerID, hash) {
  var map = Object.create(StackPrototype);
  map.size = size;
  map._head = head;
  map.__ownerID = ownerID;
  map.__hash = hash;
  map.__altered = false;
  return map;
}
var EMPTY_STACK;
function emptyStack() {
  return EMPTY_STACK || (EMPTY_STACK = makeStack(0));
}
var Set = function Set(value) {
  return value === null || value === undefined ? emptySet() : isSet(value) ? value : emptySet().withMutations((function(set) {
    var iter = SetIterable(value);
    assertNotInfinite(iter.size);
    iter.forEach((function(v) {
      return set.add(v);
    }));
  }));
};
($traceurRuntime.createClass)(Set, {
  toString: function() {
    return this.__toString('Set {', '}');
  },
  has: function(value) {
    return this._map.has(value);
  },
  add: function(value) {
    return updateSet(this, this._map.set(value, true));
  },
  remove: function(value) {
    return updateSet(this, this._map.remove(value));
  },
  clear: function() {
    return updateSet(this, this._map.clear());
  },
  union: function() {
    for (var iters = [],
        $__9 = 0; $__9 < arguments.length; $__9++)
      iters[$__9] = arguments[$__9];
    iters = iters.filter((function(x) {
      return x.size !== 0;
    }));
    if (iters.length === 0) {
      return this;
    }
    if (this.size === 0 && iters.length === 1) {
      return this.constructor(iters[0]);
    }
    return this.withMutations((function(set) {
      for (var ii = 0; ii < iters.length; ii++) {
        SetIterable(iters[ii]).forEach((function(value) {
          return set.add(value);
        }));
      }
    }));
  },
  intersect: function() {
    for (var iters = [],
        $__10 = 0; $__10 < arguments.length; $__10++)
      iters[$__10] = arguments[$__10];
    if (iters.length === 0) {
      return this;
    }
    iters = iters.map((function(iter) {
      return SetIterable(iter);
    }));
    var originalSet = this;
    return this.withMutations((function(set) {
      originalSet.forEach((function(value) {
        if (!iters.every((function(iter) {
          return iter.contains(value);
        }))) {
          set.remove(value);
        }
      }));
    }));
  },
  subtract: function() {
    for (var iters = [],
        $__11 = 0; $__11 < arguments.length; $__11++)
      iters[$__11] = arguments[$__11];
    if (iters.length === 0) {
      return this;
    }
    iters = iters.map((function(iter) {
      return SetIterable(iter);
    }));
    var originalSet = this;
    return this.withMutations((function(set) {
      originalSet.forEach((function(value) {
        if (iters.some((function(iter) {
          return iter.contains(value);
        }))) {
          set.remove(value);
        }
      }));
    }));
  },
  merge: function() {
    return this.union.apply(this, arguments);
  },
  mergeWith: function(merger) {
    for (var iters = [],
        $__12 = 1; $__12 < arguments.length; $__12++)
      iters[$__12 - 1] = arguments[$__12];
    return this.union.apply(this, iters);
  },
  sort: function(comparator) {
    return OrderedSet(sortFactory(this, comparator));
  },
  sortBy: function(mapper, comparator) {
    return OrderedSet(sortFactory(this, comparator, mapper));
  },
  wasAltered: function() {
    return this._map.wasAltered();
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    return this._map.__iterate((function(_, k) {
      return fn(k, k, $__0);
    }), reverse);
  },
  __iterator: function(type, reverse) {
    return this._map.map((function(_, k) {
      return k;
    })).__iterator(type, reverse);
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this._map = newMap;
      return this;
    }
    return this.__make(newMap, ownerID);
  }
}, {
  of: function() {
    return this(arguments);
  },
  fromKeys: function(value) {
    return this(KeyedIterable(value).keySeq());
  }
}, SetCollection);
function isSet(maybeSet) {
  return !!(maybeSet && maybeSet[IS_SET_SENTINEL]);
}
Set.isSet = isSet;
var IS_SET_SENTINEL = '@@__IMMUTABLE_SET__@@';
var SetPrototype = Set.prototype;
SetPrototype[IS_SET_SENTINEL] = true;
SetPrototype[DELETE] = SetPrototype.remove;
SetPrototype.mergeDeep = SetPrototype.merge;
SetPrototype.mergeDeepWith = SetPrototype.mergeWith;
SetPrototype.withMutations = MapPrototype.withMutations;
SetPrototype.asMutable = MapPrototype.asMutable;
SetPrototype.asImmutable = MapPrototype.asImmutable;
SetPrototype.__empty = emptySet;
SetPrototype.__make = makeSet;
function updateSet(set, newMap) {
  if (set.__ownerID) {
    set.size = newMap.size;
    set._map = newMap;
    return set;
  }
  return newMap === set._map ? set : newMap.size === 0 ? set.__empty() : set.__make(newMap);
}
function makeSet(map, ownerID) {
  var set = Object.create(SetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}
var EMPTY_SET;
function emptySet() {
  return EMPTY_SET || (EMPTY_SET = makeSet(emptyMap()));
}
var OrderedSet = function OrderedSet(value) {
  return value === null || value === undefined ? emptyOrderedSet() : isOrderedSet(value) ? value : emptyOrderedSet().withMutations((function(set) {
    var iter = SetIterable(value);
    assertNotInfinite(iter.size);
    iter.forEach((function(v) {
      return set.add(v);
    }));
  }));
};
($traceurRuntime.createClass)(OrderedSet, {toString: function() {
    return this.__toString('OrderedSet {', '}');
  }}, {
  of: function() {
    return this(arguments);
  },
  fromKeys: function(value) {
    return this(KeyedIterable(value).keySeq());
  }
}, Set);
function isOrderedSet(maybeOrderedSet) {
  return isSet(maybeOrderedSet) && isOrdered(maybeOrderedSet);
}
OrderedSet.isOrderedSet = isOrderedSet;
var OrderedSetPrototype = OrderedSet.prototype;
OrderedSetPrototype[IS_ORDERED_SENTINEL] = true;
OrderedSetPrototype.__empty = emptyOrderedSet;
OrderedSetPrototype.__make = makeOrderedSet;
function makeOrderedSet(map, ownerID) {
  var set = Object.create(OrderedSetPrototype);
  set.size = map ? map.size : 0;
  set._map = map;
  set.__ownerID = ownerID;
  return set;
}
var EMPTY_ORDERED_SET;
function emptyOrderedSet() {
  return EMPTY_ORDERED_SET || (EMPTY_ORDERED_SET = makeOrderedSet(emptyOrderedMap()));
}
var Record = function Record(defaultValues, name) {
  var RecordType = function Record(values) {
    if (!(this instanceof RecordType)) {
      return new RecordType(values);
    }
    this._map = Map(values);
  };
  var keys = Object.keys(defaultValues);
  var RecordTypePrototype = RecordType.prototype = Object.create(RecordPrototype);
  RecordTypePrototype.constructor = RecordType;
  name && (RecordTypePrototype._name = name);
  RecordTypePrototype._defaultValues = defaultValues;
  RecordTypePrototype._keys = keys;
  RecordTypePrototype.size = keys.length;
  try {
    keys.forEach((function(key) {
      Object.defineProperty(RecordType.prototype, key, {
        get: function() {
          return this.get(key);
        },
        set: function(value) {
          invariant(this.__ownerID, 'Cannot set on an immutable record.');
          this.set(key, value);
        }
      });
    }));
  } catch (error) {}
  return RecordType;
};
($traceurRuntime.createClass)(Record, {
  toString: function() {
    return this.__toString(recordName(this) + ' {', '}');
  },
  has: function(k) {
    return this._defaultValues.hasOwnProperty(k);
  },
  get: function(k, notSetValue) {
    if (!this.has(k)) {
      return notSetValue;
    }
    var defaultVal = this._defaultValues[k];
    return this._map ? this._map.get(k, defaultVal) : defaultVal;
  },
  clear: function() {
    if (this.__ownerID) {
      this._map && this._map.clear();
      return this;
    }
    var SuperRecord = Object.getPrototypeOf(this).constructor;
    return SuperRecord._empty || (SuperRecord._empty = makeRecord(this, emptyMap()));
  },
  set: function(k, v) {
    if (!this.has(k)) {
      throw new Error('Cannot set unknown key "' + k + '" on ' + recordName(this));
    }
    var newMap = this._map && this._map.set(k, v);
    if (this.__ownerID || newMap === this._map) {
      return this;
    }
    return makeRecord(this, newMap);
  },
  remove: function(k) {
    if (!this.has(k)) {
      return this;
    }
    var newMap = this._map && this._map.remove(k);
    if (this.__ownerID || newMap === this._map) {
      return this;
    }
    return makeRecord(this, newMap);
  },
  wasAltered: function() {
    return this._map.wasAltered();
  },
  __iterator: function(type, reverse) {
    var $__0 = this;
    return KeyedIterable(this._defaultValues).map((function(_, k) {
      return $__0.get(k);
    })).__iterator(type, reverse);
  },
  __iterate: function(fn, reverse) {
    var $__0 = this;
    return KeyedIterable(this._defaultValues).map((function(_, k) {
      return $__0.get(k);
    })).__iterate(fn, reverse);
  },
  __ensureOwner: function(ownerID) {
    if (ownerID === this.__ownerID) {
      return this;
    }
    var newMap = this._map && this._map.__ensureOwner(ownerID);
    if (!ownerID) {
      this.__ownerID = ownerID;
      this._map = newMap;
      return this;
    }
    return makeRecord(this, newMap, ownerID);
  }
}, {}, KeyedCollection);
var RecordPrototype = Record.prototype;
RecordPrototype[DELETE] = RecordPrototype.remove;
RecordPrototype.deleteIn = RecordPrototype.removeIn = MapPrototype.removeIn;
RecordPrototype.merge = MapPrototype.merge;
RecordPrototype.mergeWith = MapPrototype.mergeWith;
RecordPrototype.mergeIn = MapPrototype.mergeIn;
RecordPrototype.mergeDeep = MapPrototype.mergeDeep;
RecordPrototype.mergeDeepWith = MapPrototype.mergeDeepWith;
RecordPrototype.mergeDeepIn = MapPrototype.mergeDeepIn;
RecordPrototype.setIn = MapPrototype.setIn;
RecordPrototype.update = MapPrototype.update;
RecordPrototype.updateIn = MapPrototype.updateIn;
RecordPrototype.withMutations = MapPrototype.withMutations;
RecordPrototype.asMutable = MapPrototype.asMutable;
RecordPrototype.asImmutable = MapPrototype.asImmutable;
function makeRecord(likeRecord, map, ownerID) {
  var record = Object.create(Object.getPrototypeOf(likeRecord));
  record._map = map;
  record.__ownerID = ownerID;
  return record;
}
function recordName(record) {
  return record._name || record.constructor.name;
}
var Range = function Range(start, end, step) {
  if (!(this instanceof $Range)) {
    return new $Range(start, end, step);
  }
  invariant(step !== 0, 'Cannot step a Range by 0');
  start = start || 0;
  if (end === undefined) {
    end = Infinity;
  }
  if (start === end && __EMPTY_RANGE) {
    return __EMPTY_RANGE;
  }
  step = step === undefined ? 1 : Math.abs(step);
  if (end < start) {
    step = -step;
  }
  this._start = start;
  this._end = end;
  this._step = step;
  this.size = Math.max(0, Math.ceil((end - start) / step - 1) + 1);
};
var $Range = Range;
($traceurRuntime.createClass)(Range, {
  toString: function() {
    if (this.size === 0) {
      return 'Range []';
    }
    return 'Range [ ' + this._start + '...' + this._end + (this._step > 1 ? ' by ' + this._step : '') + ' ]';
  },
  get: function(index, notSetValue) {
    return this.has(index) ? this._start + wrapIndex(this, index) * this._step : notSetValue;
  },
  contains: function(searchValue) {
    var possibleIndex = (searchValue - this._start) / this._step;
    return possibleIndex >= 0 && possibleIndex < this.size && possibleIndex === Math.floor(possibleIndex);
  },
  slice: function(begin, end) {
    if (wholeSlice(begin, end, this.size)) {
      return this;
    }
    begin = resolveBegin(begin, this.size);
    end = resolveEnd(end, this.size);
    if (end <= begin) {
      return __EMPTY_RANGE;
    }
    return new $Range(this.get(begin, this._end), this.get(end, this._end), this._step);
  },
  indexOf: function(searchValue) {
    var offsetValue = searchValue - this._start;
    if (offsetValue % this._step === 0) {
      var index = offsetValue / this._step;
      if (index >= 0 && index < this.size) {
        return index;
      }
    }
    return -1;
  },
  lastIndexOf: function(searchValue) {
    return this.indexOf(searchValue);
  },
  take: function(amount) {
    return this.slice(0, Math.max(0, amount));
  },
  skip: function(amount) {
    return this.slice(Math.max(0, amount));
  },
  __iterate: function(fn, reverse) {
    var maxIndex = this.size - 1;
    var step = this._step;
    var value = reverse ? this._start + maxIndex * step : this._start;
    for (var ii = 0; ii <= maxIndex; ii++) {
      if (fn(value, ii, this) === false) {
        return ii + 1;
      }
      value += reverse ? -step : step;
    }
    return ii;
  },
  __iterator: function(type, reverse) {
    var maxIndex = this.size - 1;
    var step = this._step;
    var value = reverse ? this._start + maxIndex * step : this._start;
    var ii = 0;
    return new Iterator((function() {
      var v = value;
      value += reverse ? -step : step;
      return ii > maxIndex ? iteratorDone() : iteratorValue(type, ii++, v);
    }));
  },
  equals: function(other) {
    return other instanceof $Range ? this._start === other._start && this._end === other._end && this._step === other._step : deepEqual(this, other);
  }
}, {}, IndexedSeq);
var RangePrototype = Range.prototype;
RangePrototype.__toJS = RangePrototype.toArray;
RangePrototype.first = ListPrototype.first;
RangePrototype.last = ListPrototype.last;
var __EMPTY_RANGE = Range(0, 0);
var Repeat = function Repeat(value, times) {
  if (times <= 0 && EMPTY_REPEAT) {
    return EMPTY_REPEAT;
  }
  if (!(this instanceof $Repeat)) {
    return new $Repeat(value, times);
  }
  this._value = value;
  this.size = times === undefined ? Infinity : Math.max(0, times);
  if (this.size === 0) {
    EMPTY_REPEAT = this;
  }
};
var $Repeat = Repeat;
($traceurRuntime.createClass)(Repeat, {
  toString: function() {
    if (this.size === 0) {
      return 'Repeat []';
    }
    return 'Repeat [ ' + this._value + ' ' + this.size + ' times ]';
  },
  get: function(index, notSetValue) {
    return this.has(index) ? this._value : notSetValue;
  },
  contains: function(searchValue) {
    return is(this._value, searchValue);
  },
  slice: function(begin, end) {
    var size = this.size;
    return wholeSlice(begin, end, size) ? this : new $Repeat(this._value, resolveEnd(end, size) - resolveBegin(begin, size));
  },
  reverse: function() {
    return this;
  },
  indexOf: function(searchValue) {
    if (is(this._value, searchValue)) {
      return 0;
    }
    return -1;
  },
  lastIndexOf: function(searchValue) {
    if (is(this._value, searchValue)) {
      return this.size;
    }
    return -1;
  },
  __iterate: function(fn, reverse) {
    for (var ii = 0; ii < this.size; ii++) {
      if (fn(this._value, ii, this) === false) {
        return ii + 1;
      }
    }
    return ii;
  },
  __iterator: function(type, reverse) {
    var $__0 = this;
    var ii = 0;
    return new Iterator((function() {
      return ii < $__0.size ? iteratorValue(type, ii++, $__0._value) : iteratorDone();
    }));
  },
  equals: function(other) {
    return other instanceof $Repeat ? is(this._value, other._value) : deepEqual(other);
  }
}, {}, IndexedSeq);
var RepeatPrototype = Repeat.prototype;
RepeatPrototype.last = RepeatPrototype.first;
RepeatPrototype.has = RangePrototype.has;
RepeatPrototype.take = RangePrototype.take;
RepeatPrototype.skip = RangePrototype.skip;
RepeatPrototype.__toJS = RangePrototype.__toJS;
var EMPTY_REPEAT;
var Immutable = {
  Iterable: Iterable,
  Seq: Seq,
  Collection: Collection,
  Map: Map,
  OrderedMap: OrderedMap,
  List: List,
  Stack: Stack,
  Set: Set,
  OrderedSet: OrderedSet,
  Record: Record,
  Range: Range,
  Repeat: Repeat,
  is: is,
  fromJS: fromJS
};

  return Immutable;
}
typeof exports === 'object' ? module.exports = universalModule() :
  typeof define === 'function' && define.amd ? define(universalModule) :
    Immutable = universalModule();

},{}],35:[function(require,module,exports){
module.exports = function () {
    // see https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
    var origPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = function (_, stack) { return stack };
    var stack = (new Error()).stack;
    Error.prepareStackTrace = origPrepareStackTrace;
    return stack[2].getFileName();
};

},{}],36:[function(require,module,exports){
module.exports=[
    "assert",
    "buffer_ieee754",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "_debugger",
    "dgram",
    "dns",
    "domain",
    "events",
    "freelist",
    "fs",
    "http",
    "https",
    "_linklist",
    "module",
    "net",
    "os",
    "path",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "stream",
    "string_decoder",
    "sys",
    "timers",
    "tls",
    "tty",
    "url",
    "util",
    "vm",
    "zlib"
]

},{}],37:[function(require,module,exports){
module.exports = require('./core.json').reduce(function (acc, x) {
    acc[x] = true;
    return acc;
}, {});

},{"./core.json":36}],38:[function(require,module,exports){
(function (process){
var path = require('path');


module.exports = function (start, opts) {
    var modules = opts.moduleDirectory || 'node_modules';
    var prefix = '/';
    if (/^([A-Za-z]:)/.test(start)) {
        prefix = '';
    } else if (/^\\\\/.test(start)) {
        prefix = '\\\\';
    }
    var splitRe = process.platform === 'win32' ? /[\/\\]/ : /\/+/;
    var parts = start.split(splitRe);

    var dirs = [];
    for (var i = parts.length - 1; i >= 0; i--) {
        if (parts[i] === modules) continue;
        var dir = path.join(
            path.join.apply(path, parts.slice(0, i + 1)),
            modules
        );
        dirs.push(prefix + dir);
    }
    if(process.platform === 'win32'){
        dirs[dirs.length-1] = dirs[dirs.length-1].replace(":", ":\\");
    }
    return dirs.concat(opts.paths);
}
}).call(this,require('_process'))
},{"_process":29,"path":28}],39:[function(require,module,exports){
var core = require('./core');
var fs = require('fs');
var path = require('path');
var caller = require('./caller.js');
var nodeModulesPaths = require('./node-modules-paths.js');

module.exports = function (x, opts) {
    if (!opts) opts = {};
    var isFile = opts.isFile || function (file) {
        try { var stat = fs.statSync(file) }
        catch (err) { if (err && err.code === 'ENOENT') return false }
        return stat.isFile() || stat.isFIFO();
    };
    var readFileSync = opts.readFileSync || fs.readFileSync;
    
    var extensions = opts.extensions || [ '.js' ];
    var y = opts.basedir || path.dirname(caller());

    opts.paths = opts.paths || [];

    if (x.match(/^(?:\.\.?\/|\/|([A-Za-z]:)?\\)/)) {
        var m = loadAsFileSync(path.resolve(y, x))
            || loadAsDirectorySync(path.resolve(y, x));
        if (m) return m;
    } else {
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
    }
    
    if (core[x]) return x;
    
    throw new Error("Cannot find module '" + x + "' from '" + y + "'");
    
    function loadAsFileSync (x) {
        if (isFile(x)) {
            return x;
        }
        
        for (var i = 0; i < extensions.length; i++) {
            var file = x + extensions[i];
            if (isFile(file)) {
                return file;
            }
        }
    }
    
    function loadAsDirectorySync (x) {
        var pkgfile = path.join(x, '/package.json');
        if (isFile(pkgfile)) {
            var body = readFileSync(pkgfile, 'utf8');
            try {
                var pkg = JSON.parse(body);
                if (opts.packageFilter) {
                    pkg = opts.packageFilter(pkg, x);
                }
                
                if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                    var n = loadAsDirectorySync(path.resolve(x, pkg.main));
                    if (n) return n;
                }
            }
            catch (err) {}
        }
        
        return loadAsFileSync(path.join( x, '/index'));
    }
    
    function loadNodeModulesSync (x, start) {
        var dirs = nodeModulesPaths(start, opts);
        for (var i = 0; i < dirs.length; i++) {
            var dir = dirs[i];
            var m = loadAsFileSync(path.join( dir, '/', x));
            if (m) return m;
            var n = loadAsDirectorySync(path.join( dir, '/', x ));
            if (n) return n;
        }
    }
};

},{"./caller.js":35,"./core":37,"./node-modules-paths.js":38,"fs":25,"path":28}],40:[function(require,module,exports){
/*
 * Copyright 2009-2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE.txt or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
exports.SourceMapGenerator = require('./source-map/source-map-generator').SourceMapGenerator;
exports.SourceMapConsumer = require('./source-map/source-map-consumer').SourceMapConsumer;
exports.SourceNode = require('./source-map/source-node').SourceNode;

},{"./source-map/source-map-consumer":45,"./source-map/source-map-generator":46,"./source-map/source-node":47}],41:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');

  /**
   * A data structure which is a combination of an array and a set. Adding a new
   * member is O(1), testing for membership is O(1), and finding the index of an
   * element is O(1). Removing elements from the set is not supported. Only
   * strings are supported for membership.
   */
  function ArraySet() {
    this._array = [];
    this._set = {};
  }

  /**
   * Static method for creating ArraySet instances from an existing array.
   */
  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
    var set = new ArraySet();
    for (var i = 0, len = aArray.length; i < len; i++) {
      set.add(aArray[i], aAllowDuplicates);
    }
    return set;
  };

  /**
   * Add the given string to this set.
   *
   * @param String aStr
   */
  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
    var isDuplicate = this.has(aStr);
    var idx = this._array.length;
    if (!isDuplicate || aAllowDuplicates) {
      this._array.push(aStr);
    }
    if (!isDuplicate) {
      this._set[util.toSetString(aStr)] = idx;
    }
  };

  /**
   * Is the given string a member of this set?
   *
   * @param String aStr
   */
  ArraySet.prototype.has = function ArraySet_has(aStr) {
    return Object.prototype.hasOwnProperty.call(this._set,
                                                util.toSetString(aStr));
  };

  /**
   * What is the index of the given string in the array?
   *
   * @param String aStr
   */
  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
    if (this.has(aStr)) {
      return this._set[util.toSetString(aStr)];
    }
    throw new Error('"' + aStr + '" is not in the set.');
  };

  /**
   * What is the element at the given index?
   *
   * @param Number aIdx
   */
  ArraySet.prototype.at = function ArraySet_at(aIdx) {
    if (aIdx >= 0 && aIdx < this._array.length) {
      return this._array[aIdx];
    }
    throw new Error('No element indexed by ' + aIdx);
  };

  /**
   * Returns the array representation of this set (which has the proper indices
   * indicated by indexOf). Note that this is a copy of the internal array used
   * for storing the members so that no one can mess with internal state.
   */
  ArraySet.prototype.toArray = function ArraySet_toArray() {
    return this._array.slice();
  };

  exports.ArraySet = ArraySet;

});

},{"./util":48,"amdefine":49}],42:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 *
 * Based on the Base 64 VLQ implementation in Closure Compiler:
 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
 *
 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *  * Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above
 *    copyright notice, this list of conditions and the following
 *    disclaimer in the documentation and/or other materials provided
 *    with the distribution.
 *  * Neither the name of Google Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64 = require('./base64');

  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
  // length quantities we use in the source map spec, the first bit is the sign,
  // the next four bits are the actual value, and the 6th bit is the
  // continuation bit. The continuation bit tells us whether there are more
  // digits in this value following this digit.
  //
  //   Continuation
  //   |    Sign
  //   |    |
  //   V    V
  //   101011

  var VLQ_BASE_SHIFT = 5;

  // binary: 100000
  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

  // binary: 011111
  var VLQ_BASE_MASK = VLQ_BASE - 1;

  // binary: 100000
  var VLQ_CONTINUATION_BIT = VLQ_BASE;

  /**
   * Converts from a two-complement value to a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
   */
  function toVLQSigned(aValue) {
    return aValue < 0
      ? ((-aValue) << 1) + 1
      : (aValue << 1) + 0;
  }

  /**
   * Converts to a two-complement value from a value where the sign bit is
   * is placed in the least significant bit.  For example, as decimals:
   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
   */
  function fromVLQSigned(aValue) {
    var isNegative = (aValue & 1) === 1;
    var shifted = aValue >> 1;
    return isNegative
      ? -shifted
      : shifted;
  }

  /**
   * Returns the base 64 VLQ encoded value.
   */
  exports.encode = function base64VLQ_encode(aValue) {
    var encoded = "";
    var digit;

    var vlq = toVLQSigned(aValue);

    do {
      digit = vlq & VLQ_BASE_MASK;
      vlq >>>= VLQ_BASE_SHIFT;
      if (vlq > 0) {
        // There are still more digits in this value, so we must make sure the
        // continuation bit is marked.
        digit |= VLQ_CONTINUATION_BIT;
      }
      encoded += base64.encode(digit);
    } while (vlq > 0);

    return encoded;
  };

  /**
   * Decodes the next base 64 VLQ value from the given string and returns the
   * value and the rest of the string via the out parameter.
   */
  exports.decode = function base64VLQ_decode(aStr, aOutParam) {
    var i = 0;
    var strLen = aStr.length;
    var result = 0;
    var shift = 0;
    var continuation, digit;

    do {
      if (i >= strLen) {
        throw new Error("Expected more digits in base 64 VLQ value.");
      }
      digit = base64.decode(aStr.charAt(i++));
      continuation = !!(digit & VLQ_CONTINUATION_BIT);
      digit &= VLQ_BASE_MASK;
      result = result + (digit << shift);
      shift += VLQ_BASE_SHIFT;
    } while (continuation);

    aOutParam.value = fromVLQSigned(result);
    aOutParam.rest = aStr.slice(i);
  };

});

},{"./base64":43,"amdefine":49}],43:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var charToIntMap = {};
  var intToCharMap = {};

  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .split('')
    .forEach(function (ch, index) {
      charToIntMap[ch] = index;
      intToCharMap[index] = ch;
    });

  /**
   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
   */
  exports.encode = function base64_encode(aNumber) {
    if (aNumber in intToCharMap) {
      return intToCharMap[aNumber];
    }
    throw new TypeError("Must be between 0 and 63: " + aNumber);
  };

  /**
   * Decode a single base 64 digit to an integer.
   */
  exports.decode = function base64_decode(aChar) {
    if (aChar in charToIntMap) {
      return charToIntMap[aChar];
    }
    throw new TypeError("Not a valid base 64 digit: " + aChar);
  };

});

},{"amdefine":49}],44:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * Recursive implementation of binary search.
   *
   * @param aLow Indices here and lower do not contain the needle.
   * @param aHigh Indices here and higher do not contain the needle.
   * @param aNeedle The element being searched for.
   * @param aHaystack The non-empty array being searched.
   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
   */
  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
    // This function terminates when one of the following is true:
    //
    //   1. We find the exact element we are looking for.
    //
    //   2. We did not find the exact element, but we can return the index of
    //      the next closest element that is less than that element.
    //
    //   3. We did not find the exact element, and there is no next-closest
    //      element which is less than the one we are searching for, so we
    //      return -1.
    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
    var cmp = aCompare(aNeedle, aHaystack[mid], true);
    if (cmp === 0) {
      // Found the element we are looking for.
      return mid;
    }
    else if (cmp > 0) {
      // aHaystack[mid] is greater than our needle.
      if (aHigh - mid > 1) {
        // The element is in the upper half.
        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
      }
      // We did not find an exact match, return the next closest one
      // (termination case 2).
      return mid;
    }
    else {
      // aHaystack[mid] is less than our needle.
      if (mid - aLow > 1) {
        // The element is in the lower half.
        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
      }
      // The exact needle element was not found in this haystack. Determine if
      // we are in termination case (2) or (3) and return the appropriate thing.
      return aLow < 0 ? -1 : aLow;
    }
  }

  /**
   * This is an implementation of binary search which will always try and return
   * the index of next lowest value checked if there is no exact hit. This is
   * because mappings between original and generated line/col pairs are single
   * points, and there is an implicit region between each of them, so a miss
   * just means that you aren't on the very start of a region.
   *
   * @param aNeedle The element you are looking for.
   * @param aHaystack The array that is being searched.
   * @param aCompare A function which takes the needle and an element in the
   *     array and returns -1, 0, or 1 depending on whether the needle is less
   *     than, equal to, or greater than the element, respectively.
   */
  exports.search = function search(aNeedle, aHaystack, aCompare) {
    if (aHaystack.length === 0) {
      return -1;
    }
    return recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
  };

});

},{"amdefine":49}],45:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var util = require('./util');
  var binarySearch = require('./binary-search');
  var ArraySet = require('./array-set').ArraySet;
  var base64VLQ = require('./base64-vlq');

  /**
   * A SourceMapConsumer instance represents a parsed source map which we can
   * query for information about the original file positions by giving it a file
   * position in the generated source.
   *
   * The only parameter is the raw source map (either as a JSON string, or
   * already parsed to an object). According to the spec, source maps have the
   * following attributes:
   *
   *   - version: Which version of the source map spec this map is following.
   *   - sources: An array of URLs to the original source files.
   *   - names: An array of identifiers which can be referrenced by individual mappings.
   *   - sourceRoot: Optional. The URL root from which all sources are relative.
   *   - sourcesContent: Optional. An array of contents of the original source files.
   *   - mappings: A string of base64 VLQs which contain the actual mappings.
   *   - file: Optional. The generated file this source map is associated with.
   *
   * Here is an example source map, taken from the source map spec[0]:
   *
   *     {
   *       version : 3,
   *       file: "out.js",
   *       sourceRoot : "",
   *       sources: ["foo.js", "bar.js"],
   *       names: ["src", "maps", "are", "fun"],
   *       mappings: "AA,AB;;ABCDE;"
   *     }
   *
   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
   */
  function SourceMapConsumer(aSourceMap) {
    var sourceMap = aSourceMap;
    if (typeof aSourceMap === 'string') {
      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
    }

    var version = util.getArg(sourceMap, 'version');
    var sources = util.getArg(sourceMap, 'sources');
    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
    // requires the array) to play nice here.
    var names = util.getArg(sourceMap, 'names', []);
    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
    var mappings = util.getArg(sourceMap, 'mappings');
    var file = util.getArg(sourceMap, 'file', null);

    // Once again, Sass deviates from the spec and supplies the version as a
    // string rather than a number, so we use loose equality checking here.
    if (version != this._version) {
      throw new Error('Unsupported version: ' + version);
    }

    // Some source maps produce relative source paths like "./foo.js" instead of
    // "foo.js".  Normalize these first so that future comparisons will succeed.
    // See bugzil.la/1090768.
    sources = sources.map(util.normalize);

    // Pass `true` below to allow duplicate names and sources. While source maps
    // are intended to be compressed and deduplicated, the TypeScript compiler
    // sometimes generates source maps with duplicates in them. See Github issue
    // #72 and bugzil.la/889492.
    this._names = ArraySet.fromArray(names, true);
    this._sources = ArraySet.fromArray(sources, true);

    this.sourceRoot = sourceRoot;
    this.sourcesContent = sourcesContent;
    this._mappings = mappings;
    this.file = file;
  }

  /**
   * Create a SourceMapConsumer from a SourceMapGenerator.
   *
   * @param SourceMapGenerator aSourceMap
   *        The source map that will be consumed.
   * @returns SourceMapConsumer
   */
  SourceMapConsumer.fromSourceMap =
    function SourceMapConsumer_fromSourceMap(aSourceMap) {
      var smc = Object.create(SourceMapConsumer.prototype);

      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
      smc.sourceRoot = aSourceMap._sourceRoot;
      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
                                                              smc.sourceRoot);
      smc.file = aSourceMap._file;

      smc.__generatedMappings = aSourceMap._mappings.slice()
        .sort(util.compareByGeneratedPositions);
      smc.__originalMappings = aSourceMap._mappings.slice()
        .sort(util.compareByOriginalPositions);

      return smc;
    };

  /**
   * The version of the source mapping spec that we are consuming.
   */
  SourceMapConsumer.prototype._version = 3;

  /**
   * The list of original sources.
   */
  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
    get: function () {
      return this._sources.toArray().map(function (s) {
        return this.sourceRoot != null ? util.join(this.sourceRoot, s) : s;
      }, this);
    }
  });

  // `__generatedMappings` and `__originalMappings` are arrays that hold the
  // parsed mapping coordinates from the source map's "mappings" attribute. They
  // are lazily instantiated, accessed via the `_generatedMappings` and
  // `_originalMappings` getters respectively, and we only parse the mappings
  // and create these arrays once queried for a source location. We jump through
  // these hoops because there can be many thousands of mappings, and parsing
  // them is expensive, so we only want to do it if we must.
  //
  // Each object in the arrays is of the form:
  //
  //     {
  //       generatedLine: The line number in the generated code,
  //       generatedColumn: The column number in the generated code,
  //       source: The path to the original source file that generated this
  //               chunk of code,
  //       originalLine: The line number in the original source that
  //                     corresponds to this chunk of generated code,
  //       originalColumn: The column number in the original source that
  //                       corresponds to this chunk of generated code,
  //       name: The name of the original symbol which generated this chunk of
  //             code.
  //     }
  //
  // All properties except for `generatedLine` and `generatedColumn` can be
  // `null`.
  //
  // `_generatedMappings` is ordered by the generated positions.
  //
  // `_originalMappings` is ordered by the original positions.

  SourceMapConsumer.prototype.__generatedMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
    get: function () {
      if (!this.__generatedMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__generatedMappings;
    }
  });

  SourceMapConsumer.prototype.__originalMappings = null;
  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
    get: function () {
      if (!this.__originalMappings) {
        this.__generatedMappings = [];
        this.__originalMappings = [];
        this._parseMappings(this._mappings, this.sourceRoot);
      }

      return this.__originalMappings;
    }
  });

  SourceMapConsumer.prototype._nextCharIsMappingSeparator =
    function SourceMapConsumer_nextCharIsMappingSeparator(aStr) {
      var c = aStr.charAt(0);
      return c === ";" || c === ",";
    };

  /**
   * Parse the mappings in a string in to a data structure which we can easily
   * query (the ordered arrays in the `this.__generatedMappings` and
   * `this.__originalMappings` properties).
   */
  SourceMapConsumer.prototype._parseMappings =
    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
      var generatedLine = 1;
      var previousGeneratedColumn = 0;
      var previousOriginalLine = 0;
      var previousOriginalColumn = 0;
      var previousSource = 0;
      var previousName = 0;
      var str = aStr;
      var temp = {};
      var mapping;

      while (str.length > 0) {
        if (str.charAt(0) === ';') {
          generatedLine++;
          str = str.slice(1);
          previousGeneratedColumn = 0;
        }
        else if (str.charAt(0) === ',') {
          str = str.slice(1);
        }
        else {
          mapping = {};
          mapping.generatedLine = generatedLine;

          // Generated column.
          base64VLQ.decode(str, temp);
          mapping.generatedColumn = previousGeneratedColumn + temp.value;
          previousGeneratedColumn = mapping.generatedColumn;
          str = temp.rest;

          if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
            // Original source.
            base64VLQ.decode(str, temp);
            mapping.source = this._sources.at(previousSource + temp.value);
            previousSource += temp.value;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source, but no line and column');
            }

            // Original line.
            base64VLQ.decode(str, temp);
            mapping.originalLine = previousOriginalLine + temp.value;
            previousOriginalLine = mapping.originalLine;
            // Lines are stored 0-based
            mapping.originalLine += 1;
            str = temp.rest;
            if (str.length === 0 || this._nextCharIsMappingSeparator(str)) {
              throw new Error('Found a source and line, but no column');
            }

            // Original column.
            base64VLQ.decode(str, temp);
            mapping.originalColumn = previousOriginalColumn + temp.value;
            previousOriginalColumn = mapping.originalColumn;
            str = temp.rest;

            if (str.length > 0 && !this._nextCharIsMappingSeparator(str)) {
              // Original name.
              base64VLQ.decode(str, temp);
              mapping.name = this._names.at(previousName + temp.value);
              previousName += temp.value;
              str = temp.rest;
            }
          }

          this.__generatedMappings.push(mapping);
          if (typeof mapping.originalLine === 'number') {
            this.__originalMappings.push(mapping);
          }
        }
      }

      this.__generatedMappings.sort(util.compareByGeneratedPositions);
      this.__originalMappings.sort(util.compareByOriginalPositions);
    };

  /**
   * Find the mapping that best matches the hypothetical "needle" mapping that
   * we are searching for in the given "haystack" of mappings.
   */
  SourceMapConsumer.prototype._findMapping =
    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
                                           aColumnName, aComparator) {
      // To return the position we are searching for, we must first find the
      // mapping for the given position and then return the opposite position it
      // points to. Because the mappings are sorted, we can use binary search to
      // find the best mapping.

      if (aNeedle[aLineName] <= 0) {
        throw new TypeError('Line must be greater than or equal to 1, got '
                            + aNeedle[aLineName]);
      }
      if (aNeedle[aColumnName] < 0) {
        throw new TypeError('Column must be greater than or equal to 0, got '
                            + aNeedle[aColumnName]);
      }

      return binarySearch.search(aNeedle, aMappings, aComparator);
    };

  /**
   * Compute the last column for each generated mapping. The last column is
   * inclusive.
   */
  SourceMapConsumer.prototype.computeColumnSpans =
    function SourceMapConsumer_computeColumnSpans() {
      for (var index = 0; index < this._generatedMappings.length; ++index) {
        var mapping = this._generatedMappings[index];

        // Mappings do not contain a field for the last generated columnt. We
        // can come up with an optimistic estimate, however, by assuming that
        // mappings are contiguous (i.e. given two consecutive mappings, the
        // first mapping ends where the second one starts).
        if (index + 1 < this._generatedMappings.length) {
          var nextMapping = this._generatedMappings[index + 1];

          if (mapping.generatedLine === nextMapping.generatedLine) {
            mapping.lastGeneratedColumn = nextMapping.generatedColumn - 1;
            continue;
          }
        }

        // The last mapping for each line spans the entire line.
        mapping.lastGeneratedColumn = Infinity;
      }
    };

  /**
   * Returns the original source, line, and column information for the generated
   * source's line and column positions provided. The only argument is an object
   * with the following properties:
   *
   *   - line: The line number in the generated source.
   *   - column: The column number in the generated source.
   *
   * and an object is returned with the following properties:
   *
   *   - source: The original source file, or null.
   *   - line: The line number in the original source, or null.
   *   - column: The column number in the original source, or null.
   *   - name: The original identifier, or null.
   */
  SourceMapConsumer.prototype.originalPositionFor =
    function SourceMapConsumer_originalPositionFor(aArgs) {
      var needle = {
        generatedLine: util.getArg(aArgs, 'line'),
        generatedColumn: util.getArg(aArgs, 'column')
      };

      var index = this._findMapping(needle,
                                    this._generatedMappings,
                                    "generatedLine",
                                    "generatedColumn",
                                    util.compareByGeneratedPositions);

      if (index >= 0) {
        var mapping = this._generatedMappings[index];

        if (mapping.generatedLine === needle.generatedLine) {
          var source = util.getArg(mapping, 'source', null);
          if (source != null && this.sourceRoot != null) {
            source = util.join(this.sourceRoot, source);
          }
          return {
            source: source,
            line: util.getArg(mapping, 'originalLine', null),
            column: util.getArg(mapping, 'originalColumn', null),
            name: util.getArg(mapping, 'name', null)
          };
        }
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null
      };
    };

  /**
   * Returns the original source content. The only argument is the url of the
   * original source file. Returns null if no original source content is
   * availible.
   */
  SourceMapConsumer.prototype.sourceContentFor =
    function SourceMapConsumer_sourceContentFor(aSource) {
      if (!this.sourcesContent) {
        return null;
      }

      if (this.sourceRoot != null) {
        aSource = util.relative(this.sourceRoot, aSource);
      }

      if (this._sources.has(aSource)) {
        return this.sourcesContent[this._sources.indexOf(aSource)];
      }

      var url;
      if (this.sourceRoot != null
          && (url = util.urlParse(this.sourceRoot))) {
        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
        // many users. We can help them out when they expect file:// URIs to
        // behave like it would if they were running a local HTTP server. See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
        if (url.scheme == "file"
            && this._sources.has(fileUriAbsPath)) {
          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
        }

        if ((!url.path || url.path == "/")
            && this._sources.has("/" + aSource)) {
          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
        }
      }

      throw new Error('"' + aSource + '" is not in the SourceMap.');
    };

  /**
   * Returns the generated line and column information for the original source,
   * line, and column positions provided. The only argument is an object with
   * the following properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *   - column: The column number in the original source.
   *
   * and an object is returned with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.generatedPositionFor =
    function SourceMapConsumer_generatedPositionFor(aArgs) {
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: util.getArg(aArgs, 'column')
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);

      if (index >= 0) {
        var mapping = this._originalMappings[index];

        return {
          line: util.getArg(mapping, 'generatedLine', null),
          column: util.getArg(mapping, 'generatedColumn', null),
          lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
        };
      }

      return {
        line: null,
        column: null,
        lastColumn: null
      };
    };

  /**
   * Returns all generated line and column information for the original source
   * and line provided. The only argument is an object with the following
   * properties:
   *
   *   - source: The filename of the original source.
   *   - line: The line number in the original source.
   *
   * and an array of objects is returned, each with the following properties:
   *
   *   - line: The line number in the generated source, or null.
   *   - column: The column number in the generated source, or null.
   */
  SourceMapConsumer.prototype.allGeneratedPositionsFor =
    function SourceMapConsumer_allGeneratedPositionsFor(aArgs) {
      // When there is no exact match, SourceMapConsumer.prototype._findMapping
      // returns the index of the closest mapping less than the needle. By
      // setting needle.originalColumn to Infinity, we thus find the last
      // mapping for the given line, provided such a mapping exists.
      var needle = {
        source: util.getArg(aArgs, 'source'),
        originalLine: util.getArg(aArgs, 'line'),
        originalColumn: Infinity
      };

      if (this.sourceRoot != null) {
        needle.source = util.relative(this.sourceRoot, needle.source);
      }

      var mappings = [];

      var index = this._findMapping(needle,
                                    this._originalMappings,
                                    "originalLine",
                                    "originalColumn",
                                    util.compareByOriginalPositions);
      if (index >= 0) {
        var mapping = this._originalMappings[index];

        while (mapping && mapping.originalLine === needle.originalLine) {
          mappings.push({
            line: util.getArg(mapping, 'generatedLine', null),
            column: util.getArg(mapping, 'generatedColumn', null),
            lastColumn: util.getArg(mapping, 'lastGeneratedColumn', null)
          });

          mapping = this._originalMappings[--index];
        }
      }

      return mappings.reverse();
    };

  SourceMapConsumer.GENERATED_ORDER = 1;
  SourceMapConsumer.ORIGINAL_ORDER = 2;

  /**
   * Iterate over each mapping between an original source/line/column and a
   * generated line/column in this source map.
   *
   * @param Function aCallback
   *        The function that is called with each mapping.
   * @param Object aContext
   *        Optional. If specified, this object will be the value of `this` every
   *        time that `aCallback` is called.
   * @param aOrder
   *        Either `SourceMapConsumer.GENERATED_ORDER` or
   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
   *        iterate over the mappings sorted by the generated file's line/column
   *        order or the original's source/line/column order, respectively. Defaults to
   *        `SourceMapConsumer.GENERATED_ORDER`.
   */
  SourceMapConsumer.prototype.eachMapping =
    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
      var context = aContext || null;
      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

      var mappings;
      switch (order) {
      case SourceMapConsumer.GENERATED_ORDER:
        mappings = this._generatedMappings;
        break;
      case SourceMapConsumer.ORIGINAL_ORDER:
        mappings = this._originalMappings;
        break;
      default:
        throw new Error("Unknown order of iteration.");
      }

      var sourceRoot = this.sourceRoot;
      mappings.map(function (mapping) {
        var source = mapping.source;
        if (source != null && sourceRoot != null) {
          source = util.join(sourceRoot, source);
        }
        return {
          source: source,
          generatedLine: mapping.generatedLine,
          generatedColumn: mapping.generatedColumn,
          originalLine: mapping.originalLine,
          originalColumn: mapping.originalColumn,
          name: mapping.name
        };
      }).forEach(aCallback, context);
    };

  exports.SourceMapConsumer = SourceMapConsumer;

});

},{"./array-set":41,"./base64-vlq":42,"./binary-search":44,"./util":48,"amdefine":49}],46:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var base64VLQ = require('./base64-vlq');
  var util = require('./util');
  var ArraySet = require('./array-set').ArraySet;

  /**
   * An instance of the SourceMapGenerator represents a source map which is
   * being built incrementally. You may pass an object with the following
   * properties:
   *
   *   - file: The filename of the generated source.
   *   - sourceRoot: A root for all relative URLs in this source map.
   */
  function SourceMapGenerator(aArgs) {
    if (!aArgs) {
      aArgs = {};
    }
    this._file = util.getArg(aArgs, 'file', null);
    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
    this._sources = new ArraySet();
    this._names = new ArraySet();
    this._mappings = [];
    this._sourcesContents = null;
  }

  SourceMapGenerator.prototype._version = 3;

  /**
   * Creates a new SourceMapGenerator based on a SourceMapConsumer
   *
   * @param aSourceMapConsumer The SourceMap.
   */
  SourceMapGenerator.fromSourceMap =
    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
      var sourceRoot = aSourceMapConsumer.sourceRoot;
      var generator = new SourceMapGenerator({
        file: aSourceMapConsumer.file,
        sourceRoot: sourceRoot
      });
      aSourceMapConsumer.eachMapping(function (mapping) {
        var newMapping = {
          generated: {
            line: mapping.generatedLine,
            column: mapping.generatedColumn
          }
        };

        if (mapping.source != null) {
          newMapping.source = mapping.source;
          if (sourceRoot != null) {
            newMapping.source = util.relative(sourceRoot, newMapping.source);
          }

          newMapping.original = {
            line: mapping.originalLine,
            column: mapping.originalColumn
          };

          if (mapping.name != null) {
            newMapping.name = mapping.name;
          }
        }

        generator.addMapping(newMapping);
      });
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          generator.setSourceContent(sourceFile, content);
        }
      });
      return generator;
    };

  /**
   * Add a single mapping from original source line and column to the generated
   * source's line and column for this source map being created. The mapping
   * object should have the following properties:
   *
   *   - generated: An object with the generated line and column positions.
   *   - original: An object with the original line and column positions.
   *   - source: The original source file (relative to the sourceRoot).
   *   - name: An optional original token name for this mapping.
   */
  SourceMapGenerator.prototype.addMapping =
    function SourceMapGenerator_addMapping(aArgs) {
      var generated = util.getArg(aArgs, 'generated');
      var original = util.getArg(aArgs, 'original', null);
      var source = util.getArg(aArgs, 'source', null);
      var name = util.getArg(aArgs, 'name', null);

      this._validateMapping(generated, original, source, name);

      if (source != null && !this._sources.has(source)) {
        this._sources.add(source);
      }

      if (name != null && !this._names.has(name)) {
        this._names.add(name);
      }

      this._mappings.push({
        generatedLine: generated.line,
        generatedColumn: generated.column,
        originalLine: original != null && original.line,
        originalColumn: original != null && original.column,
        source: source,
        name: name
      });
    };

  /**
   * Set the source content for a source file.
   */
  SourceMapGenerator.prototype.setSourceContent =
    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
      var source = aSourceFile;
      if (this._sourceRoot != null) {
        source = util.relative(this._sourceRoot, source);
      }

      if (aSourceContent != null) {
        // Add the source content to the _sourcesContents map.
        // Create a new _sourcesContents map if the property is null.
        if (!this._sourcesContents) {
          this._sourcesContents = {};
        }
        this._sourcesContents[util.toSetString(source)] = aSourceContent;
      } else if (this._sourcesContents) {
        // Remove the source file from the _sourcesContents map.
        // If the _sourcesContents map is empty, set the property to null.
        delete this._sourcesContents[util.toSetString(source)];
        if (Object.keys(this._sourcesContents).length === 0) {
          this._sourcesContents = null;
        }
      }
    };

  /**
   * Applies the mappings of a sub-source-map for a specific source file to the
   * source map being generated. Each mapping to the supplied source file is
   * rewritten using the supplied source map. Note: The resolution for the
   * resulting mappings is the minimium of this map and the supplied map.
   *
   * @param aSourceMapConsumer The source map to be applied.
   * @param aSourceFile Optional. The filename of the source file.
   *        If omitted, SourceMapConsumer's file property will be used.
   * @param aSourceMapPath Optional. The dirname of the path to the source map
   *        to be applied. If relative, it is relative to the SourceMapConsumer.
   *        This parameter is needed when the two source maps aren't in the same
   *        directory, and the source map to be applied contains relative source
   *        paths. If so, those relative source paths need to be rewritten
   *        relative to the SourceMapGenerator.
   */
  SourceMapGenerator.prototype.applySourceMap =
    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile, aSourceMapPath) {
      var sourceFile = aSourceFile;
      // If aSourceFile is omitted, we will use the file property of the SourceMap
      if (aSourceFile == null) {
        if (aSourceMapConsumer.file == null) {
          throw new Error(
            'SourceMapGenerator.prototype.applySourceMap requires either an explicit source file, ' +
            'or the source map\'s "file" property. Both were omitted.'
          );
        }
        sourceFile = aSourceMapConsumer.file;
      }
      var sourceRoot = this._sourceRoot;
      // Make "sourceFile" relative if an absolute Url is passed.
      if (sourceRoot != null) {
        sourceFile = util.relative(sourceRoot, sourceFile);
      }
      // Applying the SourceMap can add and remove items from the sources and
      // the names array.
      var newSources = new ArraySet();
      var newNames = new ArraySet();

      // Find mappings for the "sourceFile"
      this._mappings.forEach(function (mapping) {
        if (mapping.source === sourceFile && mapping.originalLine != null) {
          // Check if it can be mapped by the source map, then update the mapping.
          var original = aSourceMapConsumer.originalPositionFor({
            line: mapping.originalLine,
            column: mapping.originalColumn
          });
          if (original.source != null) {
            // Copy mapping
            mapping.source = original.source;
            if (aSourceMapPath != null) {
              mapping.source = util.join(aSourceMapPath, mapping.source)
            }
            if (sourceRoot != null) {
              mapping.source = util.relative(sourceRoot, mapping.source);
            }
            mapping.originalLine = original.line;
            mapping.originalColumn = original.column;
            if (original.name != null) {
              mapping.name = original.name;
            }
          }
        }

        var source = mapping.source;
        if (source != null && !newSources.has(source)) {
          newSources.add(source);
        }

        var name = mapping.name;
        if (name != null && !newNames.has(name)) {
          newNames.add(name);
        }

      }, this);
      this._sources = newSources;
      this._names = newNames;

      // Copy sourcesContents of applied map.
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aSourceMapPath != null) {
            sourceFile = util.join(aSourceMapPath, sourceFile);
          }
          if (sourceRoot != null) {
            sourceFile = util.relative(sourceRoot, sourceFile);
          }
          this.setSourceContent(sourceFile, content);
        }
      }, this);
    };

  /**
   * A mapping can have one of the three levels of data:
   *
   *   1. Just the generated position.
   *   2. The Generated position, original position, and original source.
   *   3. Generated and original position, original source, as well as a name
   *      token.
   *
   * To maintain consistency, we validate that any new mapping being added falls
   * in to one of these categories.
   */
  SourceMapGenerator.prototype._validateMapping =
    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
                                                aName) {
      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
          && aGenerated.line > 0 && aGenerated.column >= 0
          && !aOriginal && !aSource && !aName) {
        // Case 1.
        return;
      }
      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
               && aGenerated.line > 0 && aGenerated.column >= 0
               && aOriginal.line > 0 && aOriginal.column >= 0
               && aSource) {
        // Cases 2 and 3.
        return;
      }
      else {
        throw new Error('Invalid mapping: ' + JSON.stringify({
          generated: aGenerated,
          source: aSource,
          original: aOriginal,
          name: aName
        }));
      }
    };

  /**
   * Serialize the accumulated mappings in to the stream of base 64 VLQs
   * specified by the source map format.
   */
  SourceMapGenerator.prototype._serializeMappings =
    function SourceMapGenerator_serializeMappings() {
      var previousGeneratedColumn = 0;
      var previousGeneratedLine = 1;
      var previousOriginalColumn = 0;
      var previousOriginalLine = 0;
      var previousName = 0;
      var previousSource = 0;
      var result = '';
      var mapping;

      // The mappings must be guaranteed to be in sorted order before we start
      // serializing them or else the generated line numbers (which are defined
      // via the ';' separators) will be all messed up. Note: it might be more
      // performant to maintain the sorting as we insert them, rather than as we
      // serialize them, but the big O is the same either way.
      this._mappings.sort(util.compareByGeneratedPositions);

      for (var i = 0, len = this._mappings.length; i < len; i++) {
        mapping = this._mappings[i];

        if (mapping.generatedLine !== previousGeneratedLine) {
          previousGeneratedColumn = 0;
          while (mapping.generatedLine !== previousGeneratedLine) {
            result += ';';
            previousGeneratedLine++;
          }
        }
        else {
          if (i > 0) {
            if (!util.compareByGeneratedPositions(mapping, this._mappings[i - 1])) {
              continue;
            }
            result += ',';
          }
        }

        result += base64VLQ.encode(mapping.generatedColumn
                                   - previousGeneratedColumn);
        previousGeneratedColumn = mapping.generatedColumn;

        if (mapping.source != null) {
          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
                                     - previousSource);
          previousSource = this._sources.indexOf(mapping.source);

          // lines are stored 0-based in SourceMap spec version 3
          result += base64VLQ.encode(mapping.originalLine - 1
                                     - previousOriginalLine);
          previousOriginalLine = mapping.originalLine - 1;

          result += base64VLQ.encode(mapping.originalColumn
                                     - previousOriginalColumn);
          previousOriginalColumn = mapping.originalColumn;

          if (mapping.name != null) {
            result += base64VLQ.encode(this._names.indexOf(mapping.name)
                                       - previousName);
            previousName = this._names.indexOf(mapping.name);
          }
        }
      }

      return result;
    };

  SourceMapGenerator.prototype._generateSourcesContent =
    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
      return aSources.map(function (source) {
        if (!this._sourcesContents) {
          return null;
        }
        if (aSourceRoot != null) {
          source = util.relative(aSourceRoot, source);
        }
        var key = util.toSetString(source);
        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
                                                    key)
          ? this._sourcesContents[key]
          : null;
      }, this);
    };

  /**
   * Externalize the source map.
   */
  SourceMapGenerator.prototype.toJSON =
    function SourceMapGenerator_toJSON() {
      var map = {
        version: this._version,
        sources: this._sources.toArray(),
        names: this._names.toArray(),
        mappings: this._serializeMappings()
      };
      if (this._file != null) {
        map.file = this._file;
      }
      if (this._sourceRoot != null) {
        map.sourceRoot = this._sourceRoot;
      }
      if (this._sourcesContents) {
        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
      }

      return map;
    };

  /**
   * Render the source map being generated to a string.
   */
  SourceMapGenerator.prototype.toString =
    function SourceMapGenerator_toString() {
      return JSON.stringify(this);
    };

  exports.SourceMapGenerator = SourceMapGenerator;

});

},{"./array-set":41,"./base64-vlq":42,"./util":48,"amdefine":49}],47:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  var SourceMapGenerator = require('./source-map-generator').SourceMapGenerator;
  var util = require('./util');

  // Matches a Windows-style `\r\n` newline or a `\n` newline used by all other
  // operating systems these days (capturing the result).
  var REGEX_NEWLINE = /(\r?\n)/;

  // Matches a Windows-style newline, or any character.
  var REGEX_CHARACTER = /\r\n|[\s\S]/g;

  /**
   * SourceNodes provide a way to abstract over interpolating/concatenating
   * snippets of generated JavaScript source code while maintaining the line and
   * column information associated with the original source code.
   *
   * @param aLine The original line number.
   * @param aColumn The original column number.
   * @param aSource The original source's filename.
   * @param aChunks Optional. An array of strings which are snippets of
   *        generated JS, or other SourceNodes.
   * @param aName The original identifier.
   */
  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
    this.children = [];
    this.sourceContents = {};
    this.line = aLine == null ? null : aLine;
    this.column = aColumn == null ? null : aColumn;
    this.source = aSource == null ? null : aSource;
    this.name = aName == null ? null : aName;
    if (aChunks != null) this.add(aChunks);
  }

  /**
   * Creates a SourceNode from generated code and a SourceMapConsumer.
   *
   * @param aGeneratedCode The generated code
   * @param aSourceMapConsumer The SourceMap for the generated code
   * @param aRelativePath Optional. The path that relative sources in the
   *        SourceMapConsumer should be relative to.
   */
  SourceNode.fromStringWithSourceMap =
    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer, aRelativePath) {
      // The SourceNode we want to fill with the generated code
      // and the SourceMap
      var node = new SourceNode();

      // All even indices of this array are one line of the generated code,
      // while all odd indices are the newlines between two adjacent lines
      // (since `REGEX_NEWLINE` captures its match).
      // Processed fragments are removed from this array, by calling `shiftNextLine`.
      var remainingLines = aGeneratedCode.split(REGEX_NEWLINE);
      var shiftNextLine = function() {
        var lineContents = remainingLines.shift();
        // The last line of a file might not have a newline.
        var newLine = remainingLines.shift() || "";
        return lineContents + newLine;
      };

      // We need to remember the position of "remainingLines"
      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

      // The generate SourceNodes we need a code range.
      // To extract it current and last mapping is used.
      // Here we store the last mapping.
      var lastMapping = null;

      aSourceMapConsumer.eachMapping(function (mapping) {
        if (lastMapping !== null) {
          // We add the code from "lastMapping" to "mapping":
          // First check if there is a new line in between.
          if (lastGeneratedLine < mapping.generatedLine) {
            var code = "";
            // Associate first line with "lastMapping"
            addMappingWithCode(lastMapping, shiftNextLine());
            lastGeneratedLine++;
            lastGeneratedColumn = 0;
            // The remaining code is added without mapping
          } else {
            // There is no new line in between.
            // Associate the code between "lastGeneratedColumn" and
            // "mapping.generatedColumn" with "lastMapping"
            var nextLine = remainingLines[0];
            var code = nextLine.substr(0, mapping.generatedColumn -
                                          lastGeneratedColumn);
            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
                                                lastGeneratedColumn);
            lastGeneratedColumn = mapping.generatedColumn;
            addMappingWithCode(lastMapping, code);
            // No more remaining code, continue
            lastMapping = mapping;
            return;
          }
        }
        // We add the generated code until the first mapping
        // to the SourceNode without any mapping.
        // Each line is added as separate string.
        while (lastGeneratedLine < mapping.generatedLine) {
          node.add(shiftNextLine());
          lastGeneratedLine++;
        }
        if (lastGeneratedColumn < mapping.generatedColumn) {
          var nextLine = remainingLines[0];
          node.add(nextLine.substr(0, mapping.generatedColumn));
          remainingLines[0] = nextLine.substr(mapping.generatedColumn);
          lastGeneratedColumn = mapping.generatedColumn;
        }
        lastMapping = mapping;
      }, this);
      // We have processed all mappings.
      if (remainingLines.length > 0) {
        if (lastMapping) {
          // Associate the remaining code in the current line with "lastMapping"
          addMappingWithCode(lastMapping, shiftNextLine());
        }
        // and add the remaining lines without any mapping
        node.add(remainingLines.join(""));
      }

      // Copy sourcesContent into SourceNode
      aSourceMapConsumer.sources.forEach(function (sourceFile) {
        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
        if (content != null) {
          if (aRelativePath != null) {
            sourceFile = util.join(aRelativePath, sourceFile);
          }
          node.setSourceContent(sourceFile, content);
        }
      });

      return node;

      function addMappingWithCode(mapping, code) {
        if (mapping === null || mapping.source === undefined) {
          node.add(code);
        } else {
          var source = aRelativePath
            ? util.join(aRelativePath, mapping.source)
            : mapping.source;
          node.add(new SourceNode(mapping.originalLine,
                                  mapping.originalColumn,
                                  source,
                                  code,
                                  mapping.name));
        }
      }
    };

  /**
   * Add a chunk of generated JS to this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.add = function SourceNode_add(aChunk) {
    if (Array.isArray(aChunk)) {
      aChunk.forEach(function (chunk) {
        this.add(chunk);
      }, this);
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      if (aChunk) {
        this.children.push(aChunk);
      }
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Add a chunk of generated JS to the beginning of this source node.
   *
   * @param aChunk A string snippet of generated JS code, another instance of
   *        SourceNode, or an array where each member is one of those things.
   */
  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
    if (Array.isArray(aChunk)) {
      for (var i = aChunk.length-1; i >= 0; i--) {
        this.prepend(aChunk[i]);
      }
    }
    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
      this.children.unshift(aChunk);
    }
    else {
      throw new TypeError(
        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
      );
    }
    return this;
  };

  /**
   * Walk over the tree of JS snippets in this node and its children. The
   * walking function is called once for each snippet of JS and is passed that
   * snippet and the its original associated source's line/column location.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
    var chunk;
    for (var i = 0, len = this.children.length; i < len; i++) {
      chunk = this.children[i];
      if (chunk instanceof SourceNode) {
        chunk.walk(aFn);
      }
      else {
        if (chunk !== '') {
          aFn(chunk, { source: this.source,
                       line: this.line,
                       column: this.column,
                       name: this.name });
        }
      }
    }
  };

  /**
   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
   * each of `this.children`.
   *
   * @param aSep The separator.
   */
  SourceNode.prototype.join = function SourceNode_join(aSep) {
    var newChildren;
    var i;
    var len = this.children.length;
    if (len > 0) {
      newChildren = [];
      for (i = 0; i < len-1; i++) {
        newChildren.push(this.children[i]);
        newChildren.push(aSep);
      }
      newChildren.push(this.children[i]);
      this.children = newChildren;
    }
    return this;
  };

  /**
   * Call String.prototype.replace on the very right-most source snippet. Useful
   * for trimming whitespace from the end of a source node, etc.
   *
   * @param aPattern The pattern to replace.
   * @param aReplacement The thing to replace the pattern with.
   */
  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
    var lastChild = this.children[this.children.length - 1];
    if (lastChild instanceof SourceNode) {
      lastChild.replaceRight(aPattern, aReplacement);
    }
    else if (typeof lastChild === 'string') {
      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
    }
    else {
      this.children.push(''.replace(aPattern, aReplacement));
    }
    return this;
  };

  /**
   * Set the source content for a source file. This will be added to the SourceMapGenerator
   * in the sourcesContent field.
   *
   * @param aSourceFile The filename of the source file
   * @param aSourceContent The content of the source file
   */
  SourceNode.prototype.setSourceContent =
    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
    };

  /**
   * Walk over the tree of SourceNodes. The walking function is called for each
   * source file content and is passed the filename and source content.
   *
   * @param aFn The traversal function.
   */
  SourceNode.prototype.walkSourceContents =
    function SourceNode_walkSourceContents(aFn) {
      for (var i = 0, len = this.children.length; i < len; i++) {
        if (this.children[i] instanceof SourceNode) {
          this.children[i].walkSourceContents(aFn);
        }
      }

      var sources = Object.keys(this.sourceContents);
      for (var i = 0, len = sources.length; i < len; i++) {
        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
      }
    };

  /**
   * Return the string representation of this source node. Walks over the tree
   * and concatenates all the various snippets together to one string.
   */
  SourceNode.prototype.toString = function SourceNode_toString() {
    var str = "";
    this.walk(function (chunk) {
      str += chunk;
    });
    return str;
  };

  /**
   * Returns the string representation of this source node along with a source
   * map.
   */
  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
    var generated = {
      code: "",
      line: 1,
      column: 0
    };
    var map = new SourceMapGenerator(aArgs);
    var sourceMappingActive = false;
    var lastOriginalSource = null;
    var lastOriginalLine = null;
    var lastOriginalColumn = null;
    var lastOriginalName = null;
    this.walk(function (chunk, original) {
      generated.code += chunk;
      if (original.source !== null
          && original.line !== null
          && original.column !== null) {
        if(lastOriginalSource !== original.source
           || lastOriginalLine !== original.line
           || lastOriginalColumn !== original.column
           || lastOriginalName !== original.name) {
          map.addMapping({
            source: original.source,
            original: {
              line: original.line,
              column: original.column
            },
            generated: {
              line: generated.line,
              column: generated.column
            },
            name: original.name
          });
        }
        lastOriginalSource = original.source;
        lastOriginalLine = original.line;
        lastOriginalColumn = original.column;
        lastOriginalName = original.name;
        sourceMappingActive = true;
      } else if (sourceMappingActive) {
        map.addMapping({
          generated: {
            line: generated.line,
            column: generated.column
          }
        });
        lastOriginalSource = null;
        sourceMappingActive = false;
      }
      chunk.match(REGEX_CHARACTER).forEach(function (ch, idx, array) {
        if (REGEX_NEWLINE.test(ch)) {
          generated.line++;
          generated.column = 0;
          // Mappings end at eol
          if (idx + 1 === array.length) {
            lastOriginalSource = null;
            sourceMappingActive = false;
          } else if (sourceMappingActive) {
            map.addMapping({
              source: original.source,
              original: {
                line: original.line,
                column: original.column
              },
              generated: {
                line: generated.line,
                column: generated.column
              },
              name: original.name
            });
          }
        } else {
          generated.column += ch.length;
        }
      });
    });
    this.walkSourceContents(function (sourceFile, sourceContent) {
      map.setSourceContent(sourceFile, sourceContent);
    });

    return { code: generated.code, map: map };
  };

  exports.SourceNode = SourceNode;

});

},{"./source-map-generator":46,"./util":48,"amdefine":49}],48:[function(require,module,exports){
/* -*- Mode: js; js-indent-level: 2; -*- */
/*
 * Copyright 2011 Mozilla Foundation and contributors
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */
if (typeof define !== 'function') {
    var define = require('amdefine')(module, require);
}
define(function (require, exports, module) {

  /**
   * This is a helper function for getting values from parameter/options
   * objects.
   *
   * @param args The object we are extracting values from
   * @param name The name of the property we are getting.
   * @param defaultValue An optional value to return if the property is missing
   * from the object. If this is not specified and the property is missing, an
   * error will be thrown.
   */
  function getArg(aArgs, aName, aDefaultValue) {
    if (aName in aArgs) {
      return aArgs[aName];
    } else if (arguments.length === 3) {
      return aDefaultValue;
    } else {
      throw new Error('"' + aName + '" is a required argument.');
    }
  }
  exports.getArg = getArg;

  var urlRegexp = /^(?:([\w+\-.]+):)?\/\/(?:(\w+:\w+)@)?([\w.]*)(?::(\d+))?(\S*)$/;
  var dataUrlRegexp = /^data:.+\,.+$/;

  function urlParse(aUrl) {
    var match = aUrl.match(urlRegexp);
    if (!match) {
      return null;
    }
    return {
      scheme: match[1],
      auth: match[2],
      host: match[3],
      port: match[4],
      path: match[5]
    };
  }
  exports.urlParse = urlParse;

  function urlGenerate(aParsedUrl) {
    var url = '';
    if (aParsedUrl.scheme) {
      url += aParsedUrl.scheme + ':';
    }
    url += '//';
    if (aParsedUrl.auth) {
      url += aParsedUrl.auth + '@';
    }
    if (aParsedUrl.host) {
      url += aParsedUrl.host;
    }
    if (aParsedUrl.port) {
      url += ":" + aParsedUrl.port
    }
    if (aParsedUrl.path) {
      url += aParsedUrl.path;
    }
    return url;
  }
  exports.urlGenerate = urlGenerate;

  /**
   * Normalizes a path, or the path portion of a URL:
   *
   * - Replaces consequtive slashes with one slash.
   * - Removes unnecessary '.' parts.
   * - Removes unnecessary '<dir>/..' parts.
   *
   * Based on code in the Node.js 'path' core module.
   *
   * @param aPath The path or url to normalize.
   */
  function normalize(aPath) {
    var path = aPath;
    var url = urlParse(aPath);
    if (url) {
      if (!url.path) {
        return aPath;
      }
      path = url.path;
    }
    var isAbsolute = (path.charAt(0) === '/');

    var parts = path.split(/\/+/);
    for (var part, up = 0, i = parts.length - 1; i >= 0; i--) {
      part = parts[i];
      if (part === '.') {
        parts.splice(i, 1);
      } else if (part === '..') {
        up++;
      } else if (up > 0) {
        if (part === '') {
          // The first part is blank if the path is absolute. Trying to go
          // above the root is a no-op. Therefore we can remove all '..' parts
          // directly after the root.
          parts.splice(i + 1, up);
          up = 0;
        } else {
          parts.splice(i, 2);
          up--;
        }
      }
    }
    path = parts.join('/');

    if (path === '') {
      path = isAbsolute ? '/' : '.';
    }

    if (url) {
      url.path = path;
      return urlGenerate(url);
    }
    return path;
  }
  exports.normalize = normalize;

  /**
   * Joins two paths/URLs.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be joined with the root.
   *
   * - If aPath is a URL or a data URI, aPath is returned, unless aPath is a
   *   scheme-relative URL: Then the scheme of aRoot, if any, is prepended
   *   first.
   * - Otherwise aPath is a path. If aRoot is a URL, then its path portion
   *   is updated with the result and aRoot is returned. Otherwise the result
   *   is returned.
   *   - If aPath is absolute, the result is aPath.
   *   - Otherwise the two paths are joined with a slash.
   * - Joining for example 'http://' and 'www.example.com' is also supported.
   */
  function join(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }
    if (aPath === "") {
      aPath = ".";
    }
    var aPathUrl = urlParse(aPath);
    var aRootUrl = urlParse(aRoot);
    if (aRootUrl) {
      aRoot = aRootUrl.path || '/';
    }

    // `join(foo, '//www.example.org')`
    if (aPathUrl && !aPathUrl.scheme) {
      if (aRootUrl) {
        aPathUrl.scheme = aRootUrl.scheme;
      }
      return urlGenerate(aPathUrl);
    }

    if (aPathUrl || aPath.match(dataUrlRegexp)) {
      return aPath;
    }

    // `join('http://', 'www.example.com')`
    if (aRootUrl && !aRootUrl.host && !aRootUrl.path) {
      aRootUrl.host = aPath;
      return urlGenerate(aRootUrl);
    }

    var joined = aPath.charAt(0) === '/'
      ? aPath
      : normalize(aRoot.replace(/\/+$/, '') + '/' + aPath);

    if (aRootUrl) {
      aRootUrl.path = joined;
      return urlGenerate(aRootUrl);
    }
    return joined;
  }
  exports.join = join;

  /**
   * Make a path relative to a URL or another path.
   *
   * @param aRoot The root path or URL.
   * @param aPath The path or URL to be made relative to aRoot.
   */
  function relative(aRoot, aPath) {
    if (aRoot === "") {
      aRoot = ".";
    }

    aRoot = aRoot.replace(/\/$/, '');

    // XXX: It is possible to remove this block, and the tests still pass!
    var url = urlParse(aRoot);
    if (aPath.charAt(0) == "/" && url && url.path == "/") {
      return aPath.slice(1);
    }

    return aPath.indexOf(aRoot + '/') === 0
      ? aPath.substr(aRoot.length + 1)
      : aPath;
  }
  exports.relative = relative;

  /**
   * Because behavior goes wacky when you set `__proto__` on objects, we
   * have to prefix all the strings in our set with an arbitrary character.
   *
   * See https://github.com/mozilla/source-map/pull/31 and
   * https://github.com/mozilla/source-map/issues/30
   *
   * @param String aStr
   */
  function toSetString(aStr) {
    return '$' + aStr;
  }
  exports.toSetString = toSetString;

  function fromSetString(aStr) {
    return aStr.substr(1);
  }
  exports.fromSetString = fromSetString;

  function strcmp(aStr1, aStr2) {
    var s1 = aStr1 || "";
    var s2 = aStr2 || "";
    return (s1 > s2) - (s1 < s2);
  }

  /**
   * Comparator between two mappings where the original positions are compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same original source/line/column, but different generated
   * line and column the same. Useful when searching for a mapping with a
   * stubbed out mapping.
   */
  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
    var cmp;

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp || onlyCompareOriginal) {
      return cmp;
    }

    cmp = strcmp(mappingA.name, mappingB.name);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    return mappingA.generatedColumn - mappingB.generatedColumn;
  };
  exports.compareByOriginalPositions = compareByOriginalPositions;

  /**
   * Comparator between two mappings where the generated positions are
   * compared.
   *
   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
   * mappings with the same generated line and column, but different
   * source/name/original line and column the same. Useful when searching for a
   * mapping with a stubbed out mapping.
   */
  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
    var cmp;

    cmp = mappingA.generatedLine - mappingB.generatedLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
    if (cmp || onlyCompareGenerated) {
      return cmp;
    }

    cmp = strcmp(mappingA.source, mappingB.source);
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalLine - mappingB.originalLine;
    if (cmp) {
      return cmp;
    }

    cmp = mappingA.originalColumn - mappingB.originalColumn;
    if (cmp) {
      return cmp;
    }

    return strcmp(mappingA.name, mappingB.name);
  };
  exports.compareByGeneratedPositions = compareByGeneratedPositions;

});

},{"amdefine":49}],49:[function(require,module,exports){
(function (process,__filename){
/** vim: et:ts=4:sw=4:sts=4
 * @license amdefine 0.1.0 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/amdefine for details
 */

/*jslint node: true */
/*global module, process */
'use strict';

/**
 * Creates a define for node.
 * @param {Object} module the "module" object that is defined by Node for the
 * current module.
 * @param {Function} [requireFn]. Node's require function for the current module.
 * It only needs to be passed in Node versions before 0.5, when module.require
 * did not exist.
 * @returns {Function} a define function that is usable for the current node
 * module.
 */
function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = require('path'),
        makeRequire, stringRequire;

    /**
     * Trims the . and .. from an array of path segments.
     * It will keep a leading path segment if a .. will become
     * the first path segment, to help with module name lookups,
     * which act like paths, but can be remapped. But the end result,
     * all paths that use this function should look normalized.
     * NOTE: this method MODIFIES the input array.
     * @param {Array} ary the array of path segments.
     */
    function trimDots(ary) {
        var i, part;
        for (i = 0; ary[i]; i+= 1) {
            part = ary[i];
            if (part === '.') {
                ary.splice(i, 1);
                i -= 1;
            } else if (part === '..') {
                if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                    //End of the line. Keep at least one non-dot
                    //path segment at the front so it can be mapped
                    //correctly to disk. Otherwise, there is likely
                    //no path mapping for a path starting with '..'.
                    //This can still fail, but catches the most reasonable
                    //uses of ..
                    break;
                } else if (i > 0) {
                    ary.splice(i - 1, 2);
                    i -= 2;
                }
            }
        }
    }

    function normalize(name, baseName) {
        var baseParts;

        //Adjust any relative paths.
        if (name && name.charAt(0) === '.') {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                baseParts = baseName.split('/');
                baseParts = baseParts.slice(0, baseParts.length - 1);
                baseParts = baseParts.concat(name.split('/'));
                trimDots(baseParts);
                name = baseParts.join('/');
            }
        }

        return name;
    }

    /**
     * Create the normalize() function passed to a loader plugin's
     * normalize method.
     */
    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(id) {
        function load(value) {
            loaderCache[id] = value;
        }

        load.fromText = function (id, text) {
            //This one is difficult because the text can/probably uses
            //define, and any relative paths and requires should be relative
            //to that id was it would be found on disk. But this would require
            //bootstrapping a module/require fairly deeply from node core.
            //Not sure how best to go about that yet.
            throw new Error('amdefine does not implement load.fromText');
        };

        return load;
    }

    makeRequire = function (systemRequire, exports, module, relId) {
        function amdRequire(deps, callback) {
            if (typeof deps === 'string') {
                //Synchronous, single module require('')
                return stringRequire(systemRequire, exports, module, deps, relId);
            } else {
                //Array of dependencies with a callback.

                //Convert the dependencies to modules.
                deps = deps.map(function (depName) {
                    return stringRequire(systemRequire, exports, module, depName, relId);
                });

                //Wait for next tick to call back the require call.
                process.nextTick(function () {
                    callback.apply(null, deps);
                });
            }
        }

        amdRequire.toUrl = function (filePath) {
            if (filePath.indexOf('.') === 0) {
                return normalize(filePath, path.dirname(module.filename));
            } else {
                return filePath;
            }
        };

        return amdRequire;
    };

    //Favor explicit value, passed in if the module wants to support Node 0.4.
    requireFn = requireFn || function req() {
        return module.require.apply(module, arguments);
    };

    function runFactory(id, deps, factory) {
        var r, e, m, result;

        if (id) {
            e = loaderCache[id] = {};
            m = {
                id: id,
                uri: __filename,
                exports: e
            };
            r = makeRequire(requireFn, e, m, id);
        } else {
            //Only support one define call per file
            if (alreadyCalled) {
                throw new Error('amdefine with no module ID cannot be called more than once per file.');
            }
            alreadyCalled = true;

            //Use the real variables from node
            //Use module.exports for exports, since
            //the exports in here is amdefine exports.
            e = module.exports;
            m = module;
            r = makeRequire(requireFn, e, m, module.id);
        }

        //If there are dependencies, they are strings, so need
        //to convert them to dependency values.
        if (deps) {
            deps = deps.map(function (depName) {
                return r(depName);
            });
        }

        //Call the factory with the right dependencies.
        if (typeof factory === 'function') {
            result = factory.apply(m.exports, deps);
        } else {
            result = factory;
        }

        if (result !== undefined) {
            m.exports = result;
            if (id) {
                loaderCache[id] = m.exports;
            }
        }
    }

    stringRequire = function (systemRequire, exports, module, id, relId) {
        //Split the ID by a ! so that
        var index = id.indexOf('!'),
            originalId = id,
            prefix, plugin;

        if (index === -1) {
            id = normalize(id, relId);

            //Straight module lookup. If it is one of the special dependencies,
            //deal with it, otherwise, delegate to node.
            if (id === 'require') {
                return makeRequire(systemRequire, exports, module, relId);
            } else if (id === 'exports') {
                return exports;
            } else if (id === 'module') {
                return module;
            } else if (loaderCache.hasOwnProperty(id)) {
                return loaderCache[id];
            } else if (defineCache[id]) {
                runFactory.apply(null, defineCache[id]);
                return loaderCache[id];
            } else {
                if(systemRequire) {
                    return systemRequire(originalId);
                } else {
                    throw new Error('No module with ID: ' + id);
                }
            }
        } else {
            //There is a plugin in play.
            prefix = id.substring(0, index);
            id = id.substring(index + 1, id.length);

            plugin = stringRequire(systemRequire, exports, module, prefix, relId);

            if (plugin.normalize) {
                id = plugin.normalize(id, makeNormalize(relId));
            } else {
                //Normalize the ID normally.
                id = normalize(id, relId);
            }

            if (loaderCache[id]) {
                return loaderCache[id];
            } else {
                plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});

                return loaderCache[id];
            }
        }
    };

    //Create a define function specific to the module asking for amdefine.
    function define(id, deps, factory) {
        if (Array.isArray(id)) {
            factory = deps;
            deps = id;
            id = undefined;
        } else if (typeof id !== 'string') {
            factory = id;
            id = deps = undefined;
        }

        if (deps && !Array.isArray(deps)) {
            factory = deps;
            deps = undefined;
        }

        if (!deps) {
            deps = ['require', 'exports', 'module'];
        }

        //Set up properties for this module. If an ID, then use
        //internal cache. If no ID, then use the external variables
        //for this node module.
        if (id) {
            //Put the module in deep freeze until there is a
            //require call for it.
            defineCache[id] = [id, deps, factory];
        } else {
            runFactory(id, deps, factory);
        }
    }

    //define.require, which has access to all the values in the
    //cache. Useful for AMD modules that all have IDs in the file,
    //but need to finally export a value to node based on one of those
    //IDs.
    define.require = function (id) {
        if (loaderCache[id]) {
            return loaderCache[id];
        }

        if (defineCache[id]) {
            runFactory.apply(null, defineCache[id]);
            return loaderCache[id];
        }
    };

    define.amd = {};

    return define;
}

module.exports = amdefine;

}).call(this,require('_process'),"/node_modules/source-map/node_modules/amdefine/amdefine.js")
},{"_process":29,"path":28}],50:[function(require,module,exports){
//     Underscore.js 1.3.3
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.3.3';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (_.has(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0]) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      rand = Math.floor(Math.random() * (index + 1));
      shuffled[index] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, val, context) {
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      if (a === void 0) return 1;
      if (b === void 0) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(obj) {
    if (!obj)                                     return [];
    if (_.isArray(obj))                           return slice.call(obj);
    if (_.isArguments(obj))                       return slice.call(obj);
    if (obj.toArray && _.isFunction(obj.toArray)) return obj.toArray();
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.isArray(obj) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var results = [];
    // The `isSorted` flag is irrelevant if the array only contains two elements.
    if (array.length < 3) isSorted = true;
    _.reduce(initial, function (memo, value, index) {
      if (isSorted ? _.last(memo) !== value || !memo.length : !_.include(memo, value)) {
        memo.push(value);
        results.push(array[index]);
      }
      return memo;
    }, []);
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1), true);
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more, result;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        result = func.apply(context, args);
      }
      whenDone();
      throttling = true;
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      if (immediate && !timeout) func.apply(context, args);
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var result = {};
    each(_.flatten(slice.call(arguments, 1)), function(key) {
      if (key in obj) result[key] = obj[key];
    });
    return result;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return _.isNumber(obj) && isFinite(obj);
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Has own property?
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // If the value of the named property is a function then invoke it;
  // otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return null;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    '\\': '\\',
    "'": "'",
    'r': '\r',
    'n': '\n',
    't': '\t',
    'u2028': '\u2028',
    'u2029': '\u2029'
  };

  for (var p in escapes) escapes[escapes[p]] = p;
  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
  var unescaper = /\\(\\|'|r|n|t|u2028|u2029)/g;

  // Within an interpolation, evaluation, or escaping, remove HTML escaping
  // that had been previously added.
  var unescape = function(code) {
    return code.replace(unescaper, function(match, escape) {
      return escapes[escape];
    });
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    settings = _.defaults(settings || {}, _.templateSettings);

    // Compile the template source, taking care to escape characters that
    // cannot be included in a string literal and then unescape them in code
    // blocks.
    var source = "__p+='" + text
      .replace(escaper, function(match) {
        return '\\' + escapes[match];
      })
      .replace(settings.escape || noMatch, function(match, code) {
        return "'+\n_.escape(" + unescape(code) + ")+\n'";
      })
      .replace(settings.interpolate || noMatch, function(match, code) {
        return "'+\n(" + unescape(code) + ")+\n'";
      })
      .replace(settings.evaluate || noMatch, function(match, code) {
        return "';\n" + unescape(code) + "\n;__p+='";
      }) + "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __p='';" +
      "var print=function(){__p+=Array.prototype.join.call(arguments, '')};\n" +
      source + "return __p;\n";

    var render = new Function(settings.variable || 'obj', '_', source);
    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for build time
    // precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' +
      source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);

},{}]},{},[5]);
