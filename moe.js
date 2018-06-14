'use strict'

const fs = require('fs');
const path = require('path');


//////////////////////////////////////////////////////////////////////////////////
// Tokenizer 

class TokenError
{
	constructor(message, position)
	{
		this.message = message;
		this.position = position;
	}
}

function isLineSpace(ch)
{
	return ch == ' ' || ch == '\t';
}

function isWhiteSpace(ch)
{
	return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
}

function skipLinespace(s, p)
{
	while (isLineSpace(s[p]))
		p++;
	return p;
}

function skipWhitespace(s, p)
{
	while (isLineSpace(s[p]))
		p++;
	return p;
}

// Expand pStart and pEnd to consume surrounding white space
// but only if that white space extends to the start and end of the line
function consumeLineSpace(s, pStartIn, pEndIn)
{
	// Skip preceding line space
	var pStart = pStartIn;
	while (pStart > 0 && isLineSpace(s[pStart-1]))
		pStart--;

	// Did we reach the start of the line?
	if (pStart == 0 || s[pStart-1] == '\r' || s[pStart-1] == '\n')
	{
		// Yes
		
		// Skip trailing line space
		pEnd = pEndIn;
		while (isLineSpace[pEnd])
			pEnd++;

		// End if line found?
		if (s[pEnd] == '\0' || s[pEnd] == '\r' || s[pEnd] == '\n')
		{
			// Yes, skip it
			if (s[pEnd] == '\r')
				pEnd++;
			if (s[pEnd] == '\n')
				pEnd++;

			// Return the expanded range
			return [pStart, pEnd];
		}
	}

	// Can't extend
	return [pStartIn, pEndIn];

}

function isIdentifierChar(ch)
{
	return (ch >= 'a' && ch <='z') || (ch >= 'A' && ch<='Z') || (ch >= '0' && ch <='9') || ch == '_' || ch == '$';
}

function readIdentifer(s, p)
{
	var pStart = p;
	while (isIdentifierChar(s[p]))
		p++;
	return s.substr(pStart, p-pStart);
}

function skipString(s, p)
{
	var chKind = s[p];
	p++;

	while (s[p] != chKind)
	{
		// template literal expression?
		if (chKind == '`' && s[p] == '$' && s[p+1] == '{')
		{
			p+=2;
			p = skipJavaScript(s, p);
			if (s[p] != '}')
				throw new TokenError("Syntax error in template literal", p);
			p++;
			continue;
		}

		// Skip escaped characters
		if (s[p] == '\\')
			p++;
		p++;
	}

	p++;
	return p;
}

function skipJavaScript(s, p)
{
	while (true)
	{
		p = skipWhitespace(s, p);
		switch (s[p])
		{
			case '}':
				return p;

			case '{':
				p++;
				p = skipJavascript(s, p);
				p = skipWhitespace(s, p);
				if (s[p] != '}')
					throw new TokenError("Unmatched closing brace in expression", p);
				p++;
				break;

			case '(':
				p++;
				p = skipJavascript(s, p);
				p = skipWhitespace(s, p);
				if (s[p] != ')')
					throw new TokenError("Unmatched closing parentheses in expression", p);
				p++;
				break;

			case '[':
				p++;
				p = skipJavascript(s, p);
				p = skipWhitespace(s, p);
				if (s[p] != ']')
					throw new TokenError("Unmatched closing square bracket in expression", p);
				p++;
				break;

			case '\'':
			case '\"':
			case '`':
				p = skipString(s, p);
				break;
			
			default:
				p++;
		}
	}
}

function* tokenize(strIn)
{
	// We can save a lot of boundary checks by null terminating
	var s = strIn + "\0";
	var p = 0;

	while (s[p] != '\0')
	{
		// Find the next open brace
		var tokenPos = s.indexOf("{{", p);

		// No more, return the trail text
		if (tokenPos < 0)
		{
			yield {
				kind: "literal",
				text: s.substr(p, tokenPos - p),
			}
			return;
		}

		// Comment?
		if (s.substr(tokenPos+2, 3) == "!--")
		{
			// Find the end delimiter
			var endPos = s.indexOf("--}}", tokenPos);
			if (endPos < 0)
				throw new TokenError("Unclosed comment", tokenPos);

			// Skip closing delimiter
			endPos += 4;

			// Expand range to consume surrounding line space
			[tokenPos, endPos] = consumeLineSpace(s, tokenPos, endPos);

			// Yield preceding literal text
			yield {
				kind: "literal",
				text: s.substr(p, tokenPos - p),
			}

			// Move current position
			p = endPos;
			continue;
		}

		// What kind of token are we dealing with
		var mode = 2;					// number of braces, or zero for comment
		var close;						// end of token
		if (s[tokenPos+2] == '{')
		{
			if (s[tokenPos+3] == '{')
			{
				// Raw text {{{{ }}}}
				var endPos = s.indexOf("}}}}", tokenPos);
				if (endPos < 0)
					throw new TokenError("Unclosed raw block", tokenPos);

				// Greedy consume extra braces as part of the raw text
				while (s[endPos + 4] == '}')
					endPos++;

				// Yield the preceding text
				yield {
					kind: "literal",
					text: s.substr(p, tokenPos - p),
				}

				// Yield the raw text
				yield {
					kind: "literal",
					text: s.substr(tokenPos + 4, endPos - (tokenPos + 4)),
				}

				// Handled
				p = endPos + 4;
				continue;
			}
			else
			{
				close = "}}}";
				mode = 3;
			}
		}
		else
		{
			close = "}}";
			mode = 2;
		}

		var directiveKind = "";			// "#" or "/"
		var directive = "";
		var trimBefore = 0;
		var trimAfter = 0;
		var innerPos = tokenPos + mode;

		// Handle {~...} for trim before
		if (s[innerPos] == '~')
		{
			innerPos++;
			trimBefore = true;
		}

		// Handle directives
		if (mode == 2)
		{
			if (s[innerPos] == '#' || s[innerPos] == '/')
			{
				// Handle {{#...}} and {{/...}}
				directiveKind = s[innerPos];
				innerPos++;
				directive = readIdentifier(s, innerPos);
				innerPos += directive.length;
			}
			else if (s[innerPos] == '^')
			{
				// Handle {{^}} and {{^if }}
				directiveKind = "#";
				innerPos++;
				if (readIdentifer(s, innerPos) == 'if')
				{
					directive = "elseif";
					innerPos += 2;
				}
				else
				{
					directive = "if";
				}
			}
			else
			{
				// Handle {{else}} and {{elseif}} (without #'s)
				var id = readIndentifier(s, innerPos); 
				if (id == "else" || id == "elseif")
				{
					directiveKind = "#";
					directive = id;
					innerPos += id.length;
				}
			}
		}

		// Skip expression
		var innerEndPos = skipJavaScript(s, p);

		// Check the end dilimiter matches
		if (s.substr(innerEndPos, mode) != close)
			throw new TokenError(`Misformed directive, expected ${close}`, endPos)

		// Calculate outer end pos
		var endPos = innerEndPos + mode;

		// Strip of trailing ~
		if (s[endPos-1] == '~')
		{
			trimAfter = 1;
			innerEndPos--;
		}

		// Trimming before/after line/white space
		if (trimBefore)
		{
			while (tokenPos > p && isWhiteSpace(s[tokenPos-1]))
				tokenPos--;
		}
		if (trimAfter)
		{
			while (isWhiteSpace(endPos))
				endPos++;
		}
		if (!trimBefore && !trimAfter && mode == 2)
		{
			[tokenPos, endPos] = consumeLineSpace(tokenPos, endPos);
		}

		// Yield preceding text
		yield {
			kind: "literal",
			text: s.substr(p, tokenPos),
		}

		// Yield the token
		if (directiveKind == '#')
		{
			yield {
				kind: "directive",
				directive: directive,
				expression: s.substr(innerPos, innerEndPos - innerPos).trim(),
			}
		}
		else if (directiveKind == '/')
		{
			yield {
				kind: "closeDirective",
				directive: directive,
			}
		}
		else if (mode == 2)
		{
			yield {
				kind: "encodedExpression",
				expression: s.substr(innerPos, innerEndPos - innerPos).trim(),
			}
		}
		else if (mode == 3)
		{
			yield {
				kind: "rawExpression",
				expression: s.substr(innerPos, innerEndPos - innerPos).trim(),
			}
		}
		else
		{
			throw Error("Internal error");
		}

		// Moving on!
		p = endPos;
	}
}

//////////////////////////////////////////////////////////////////////////////////
// MoeHelpers - functions used internally by generated template scripts

function MoeHelpers(moe)
{
	this.moe = moe;
}

// Helper to encode html entities
MoeHelpers.prototype.encode = function(str) 
{
	if (str === null || str === undefined)
		return "";
	return (""+str).replace(/["'&<>]/g, function(x) {
	    switch (x) 
	    {
	      case '\"': return '&quot;';
	      case '&': return '&amp;';
	      case '\'':return '&#39;';
	      case '<': return '&lt;';
	      case '>': return'&gt;';
	    }
	});
}



// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.each = function(outerScope, iter, cbItem, cbEmpty)
{
	var scope = {
		outer: outerScope,
		index: -1,
	};

	if (iter)
	{
		// Get all items into an array
		if (isIterable(iter))
		{
			scope.items = Array.isArray(iter) ? iter : Array.from(iter);
		}
		else if (isObject(iter))
		{
			scope.items = Object.keys(iter).map(k => { return { key:k, value:iter[k] } } )
		}
		else if (isGeneratorFunction(iter))
		{
			scope.items = [];
			for (var i of iter())
				scope.items.push(i);
		}
		else
		{
			scope.items = [iter];
		}

		// If any items process them
		if (scope.items.length)
		{
			var parts = [];
			for (scope.index = 0; scope.index<scope.items.length; scope.index++)
			{
				scope.first = scope.index == 0;
				scope.last = scope.index == scope.items.length-1;
				scope.item = scope.items[scope.index];
				parts.push(cbItem(scope, scope.item));
			}
			return parts.join('');
		}
	}

	return cbEmpty(scope, undefined);
}

// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.with = function(expr, cbItem, cbElse)
{
	if (expr)
		return cbItem(expr);
	else if (cbElse)
		return cbElse();
}


// Render a partial
MoeHelpers.prototype.partial = function(model, context, scope, name, subModel)
{
	// Resolve subModel
	if (!subModel && scope)
		subModel = scope.item;
	if (!subModel)
		subModel = model;

	// Call hooks
	if (context.$moe)
	{
		// Decorate the subModel? (used by express binding to attach
		// 		locals back onto the sub-subModel)
		if (context.$moe.decoratePartialModel && subModel !== model)
		{
			subModel = context.$moe.decoratePartialModel(subModel);
		}

		// Resolve the partial path?
		if (context.$moe.resolvePartialPath)
		{
			name = context.$moe.resolvePartialPath(name);
		}
	}

	// Load the template
	var template = this.moe.compileFileSync(name);

	// Invoke it
	return template(subModel, context);
}


function rollbackLeadingWhiteSpace(parts)
{
	if (parts.length == 0)
		return;

	var lastPart = parts[parts.length-1];

	var pos = lastPart.length;
	while (pos > 0)
	{
		if (lastPart[pos-1] == ' ' || lastPart[pos-1] == '\t')
			pos--;
		else if (lastPart[pos-1] == '\r' || lastPart[pos-1] == '\n')
			break;
		else
			return;
	}

	parts[parts.length-1] = lastPart.substr(0, pos);
}

//////////////////////////////////////////////////////////////////////////////////
// MoeEngine - Moe template engine

function MoeEngine() 
{
	this.helpers = new MoeHelpers(this);
	this.templates = {};
	this.currentModel = null;
	this.currentContext = null;
	this.shouldPassLocals = false;
}

MoeEngine.prototype.express = function(app)
{
	return ExpressMiddleware(this, app);
}

// Compile a string template, returns a function(model, context)
MoeEngine.prototype.compile = function(template)
{
	var re = /({{{?).*?(}}}?)/g;
	var parts = [];
	var code = [];
	var lastIndex = 0;
	var blockTypeStack = [ "none" ];

	var tag;
	while (tag = re.exec(template))
	{
		// Get the current block type
		var blockType = blockTypeStack[blockTypeStack.length-1];

		// Consume text before directive
		if (tag.index > lastIndex)
		{
			switch (blockType)
			{
				case 'code':
					code.push(template.substr(lastIndex, tag.index - lastIndex));
					break;

				case 'comment':
					// Discard comments
					break;
					
				default:
					parts.push(template.substr(lastIndex, tag.index - lastIndex));
					break;
			}
		}

		// Update current position
		lastIndex = re.lastIndex;

		// Get the directive
		var directive = tag[0];

		// Triple braces?
		if (directive.startsWith("{{{"))
		{
			if (!directive.endsWith("}}}"))
				throw new Error(`Misformed tag at ${tag.index}`);

			// Unencoded
			parts.push("${");
			parts.push(directive.substr(3, directive.length - 6));
			parts.push("}");
			continue;
		}

		// Comment
		if (directive.startsWith("{{!--") && directive.endsWith("--}}"))
		{
			if (template[lastIndex] == '\r')
				lastIndex++;
			if (template[lastIndex] == '\n')
				lastIndex++;
			re.lastIndex = lastIndex;
			rollbackLeadingWhiteSpace(parts);
			continue;
		}

		// Remove braces
		if (directive.endsWith("}}}"))
			throw new Error("Misformed tag at ", tag.index);
		directive = directive.substr(2, directive.length - 4).trim();

		// Allow handlebars style {{else}}
		if (directive == "else" || directive == "^")
			directive = "#else";
		if (directive.startsWith("elseif "))
			directive = "#" + directive;
		if (directive.startsWith("^if "))
			directive = "#elseif " + directive.substr(4);

		// Closing tag?
		if (directive[0]=='/')
		{
			var closeTag = directive.substr(1).trim();

			// Inside code block, only {{/code}} should do anything
			if (blockType == "code" && closeTag != "code")
			{
				code.push(tag[0]);
				continue;
			}

			// Inside comment block, only {{/code}} should do anything
			if (blockType == "comment" && closeTag != "comment")
			{
				continue;
			}

			// Work out the expected closing tag type
			var expectedCloseTag = blockType;
			if (expectedCloseTag == "ifelse")
				expectedCloseTag = "if";
			if (expectedCloseTag == "eachelse")
				expectedCloseTag = "each";
			if (expectedCloseTag == "withelse")
				expectedCloseTag = "with";

			// Check block type matches
			if (closeTag != expectedCloseTag)
			{
				throw new Error(`Closing tag mismatch.  Expected {{/${expectedCloseTag}}} found {{${directive}}`);
			}

			// Handle end of block
			switch (blockType)
			{
				case "code":
					// nop
					break;

				case "comment":
					// nop
					break;

				case "if":
				case "unless":
					parts.push("`; } else return ''; })()}");
					break;

				case "ifelse":
					parts.push("`; }})()}");
					break;

				case "each":
					parts.push("`;}, function(scope, item) { return ''; })}");
					break;

				case "eachelse":
					parts.push("`;})}");
					break;

				case "with":
				case "withelse":
					parts.push("`;})}");
					break;
				}

			// Pop stack
			blockTypeStack.pop();
		}
		else if (directive[0]=='#')
		{
			// Inside code block, only {{/code}} should do anything
			if (blockType == "code")
			{
				code.push(tag[0]);
				continue;
			}
			if (blockType == "comment")
			{
				continue;
			}

			// Split into directive and expression
			var dirType = directive.substr(1).split(' ')[0];
			var expr = directive.substr(dirType.length + 2);

			// Handle enter block
			switch (dirType)
			{
				case "code":
					blockTypeStack.push("code");
					break;

				case "comment":
					blockTypeStack.push("comment");
					break;

				case "if":
					blockTypeStack.push("if");
					parts.push("${(function() { if (");
					parts.push(expr);
					parts.push(") { return `");
					break;

				case "unless":
					blockTypeStack.push("unless");
					parts.push("${(function() { if (!(");
					parts.push(expr);
					parts.push(")) { return `");
					break;

				case "each":
					// Handle {{#each <controlVal> in <expr>}}
					//   (vs) {{#each <expr>}}
					var exprParts = expr.split(/[\s\t]+/);
					var itemName = "item";
					if (exprParts.length > 2 && exprParts[1] == 'in')
					{
						expr = exprParts.slice(2).join(' ');
						itemName = exprParts[0];
					}

					blockTypeStack.push("each");
					parts.push("${helpers.each(scope, ");
					parts.push(expr);
					parts.push(`, function(scope, ${itemName}) { return \``);
					break;

				case "with":
					// Handle {{#with <controlVal> as <expr>}}
					//   (vs) {{#with <expr>}}
					var exprParts = expr.split(/[\s\t]+/);
					var itemName = "item";
					if (exprParts.length > 2 && exprParts[1] == 'as')
					{
						expr = exprParts.slice(2).join(' ');
						itemName = exprParts[0];
					}

					blockTypeStack.push("with");
					parts.push("${helpers.with(");
					parts.push(expr);
					parts.push(`, function(${itemName}) { return \``);
					break;
					

				case "else":
					if (blockType == "if")
					{
						blockTypeStack[blockTypeStack.length -1 ] = "ifelse";
						parts.push("`; } else { return `");
					}
					else if (blockType == "each")
					{
						blockTypeStack[blockTypeStack.length -1 ] = "eachelse";
						parts.push("`;}, function(item) { return `");
					}
					else if (blockType == "with")
					{
						blockTypeStack[blockTypeStack.length -1 ] = "withelse";
						parts.push("`;}, function() { return `");
					}
					else
						throw new Error(`Unexpected else directive`);
					break;

				case "elseif":
					if (blockType == "if")
					{
						parts.push("`; } else if (")
						parts.push(expr)
						parts.push(") { return `");
					}
					else
						throw new Error(`Unexpected elseif directive`);
					break;

				default:
					throw new Error(`Unknown directive "${directive}"`);
			}
		}
		else if (directive[0] == '>')
		{
			// Invoke partial
			parts.push('${helpers.partial(model, context, scope, ');
			parts.push(directive.substr(1));
			parts.push(')}');
		}
		else
		{
			// Encoded string output
			parts.push("${$encode(");
			parts.push(directive);
			parts.push(")}");
		}

		// For block statements skip trailing carriage return (nicer whitespace in output)
		if (directive[0] == '#' || directive[0] == '/')
		{
			if (template[lastIndex] == '\r')
				lastIndex++;
			if (template[lastIndex] == '\n')
				lastIndex++;
			re.lastIndex = lastIndex;
			rollbackLeadingWhiteSpace(parts);
		}
	}

	// Check all blocks closed
	if (blockTypeStack.length > 1)
		throw new Error(`Missing closing tag: {{/${blockTypeStack[blockTypeStack.length-1]}))`);

	// Trailing text
	parts.push(template.substr(lastIndex, template.length - lastIndex));

	// Compile it
	var finalCode;
	finalCode  = `var scope = null;\n`;
	finalCode += `var $encode = helpers.encode;\n`;
	finalCode += `${code.join("")}\n`;
	finalCode += `return \`${parts.join("")}\`\n`;
	var compiledFn = Function(['helpers', 'model', 'context'], finalCode);

	// Stub function to setup model etc...
	var fn = function(model, context)
	{
		// Store model and context while we process the template
		// (in case helpers want to get to it)
		var oldModel = this.currentModel;
		var oldContext = this.currentContext;
		try
		{
			this.currentModel = model;
			this.currentContext = context;
			return compiledFn(this.helpers, model, context);
		}
		finally
		{
			this.currentModel = oldModel;
			this.currentContext = oldContext;
		}
	}.bind(this);

	// Store the implementation function (handy to for debug to see the actual implementation)
	// eg:
	//   var template = moe.compileFileSync("template.moe");
	//   console.log(template.impl.toString());
	fn.impl = compiledFn;

	return fn;
}

// Discard all templates.  Call if templates
// are known to have changed or if new global helpers
// have been registered
MoeEngine.prototype.discardTemplateCache = function()
{
	this.templates = {};
}

// Compile a file (async)
MoeEngine.prototype.compileFile = function(filename, encoding, cb)
{
	// Qualify with extension
	if (path.extname(filename).length == 0)
	{
		filename += ".moe";
	}

	// Already compiled?
	if (this.templates[filename])
	{
		setImmediate(function() {
			cb(null, this.templates[filename]);
		}.bind(this));
	}
	else
	{
		fs.readFile(filename, encoding ? encoding : 'UTF8', function(err, text) {

			if (err)
				return cb(err);

			try
			{
				var compiled = this.compile(text);
				this.templates[filename] = compiled;
				cb(null, compiled);
			}
			catch (err)
			{
				cb(err);
			}

		}.bind(this));
	}
}

// Compile and cache a file (sync)
MoeEngine.prototype.compileFileSync = function(filename, encoding)
{
	// Qualify with extension
	if (path.extname(filename).length == 0)
	{
		filename += ".moe";
	}

	// Already compiled?
	if (this.templates[filename])
		return this.templates[filename];

	// Compile it
	var text = fs.readFileSync(filename, encoding ? encoding : 'UTF8');
	var compiled = this.compile(text);
	this.templates[filename] = compiled;
	return compiled;
}


//////////////////////////////////////////////////////////////////////////////////
// Express integration

function MoeExpressHooks(moe, app, options)
{
	this.moe = moe;
	this.app = app;
	this.options = options;
}

// Called when a model is being passed to a partial.  Decorate
// the model by adding in the express locals and settings etc...
MoeExpressHooks.prototype.decoratePartialModel = function(model)
{
	if (!this.moe.shouldPassLocals)
		return model;

	// Copy settings
	var temp = {
		settings: this.options.settings,
		cache: this.options.cache,
	};

	// Merge app locals
	if (this.app)
	{
		merge(temp, this.app.locals);
	}

	// Merge request locals
	if (this.options._locals)
	{
		merge(temp, this.options._locals);
		temp._locals = this.options._locals;
	}

	// Merge the new model
	merge(temp, model);	

	// Done
	return temp;
}

MoeExpressHooks.prototype.resolveViewPath = function(name, viewFolders)
{
	// Qualify with extension
	if (path.extname(name).length == 0)
	{
		name += ".moe";
	}

	if (!Array.isArray(viewFolders))
		viewFolders = [ viewFolders ];

	// Check the cache first
	if (this.options.cache)
	{
		for (var i=0; i<viewFolders.length; i++)
		{
			var file = path.resolve(viewFolders[i], name);
			if (this.moe.templates[file])
				return file;
		}
	}

	// Try to find file
	for (var i=0; i<viewFolders.length; i++)
	{
		var file = path.resolve(viewFolders[i], name);
		try
		{
			if (fs.existsSync(file))
			{
				return file;
			}
		}
		catch(err)
		{
			// Ignore
		}
	}

	throw new Error(`Can't find partial "${name}" on path ${viewFolders.join(", ")}`);
}

MoeExpressHooks.prototype.resolvePartialPath = function(name)
{
	// Get view folder search path
	var viewFolders = this.options.settings.partialViews ? this.options.settings.partialViews : this.options.settings.views;
	return this.resolveViewPath(name, viewFolders);	
}


// Express middleware to render a view
function ExpressMiddleware(moe, app)
{
	return function middleware(filename, options, cb)
	{
		// Don't cache templates during development
		if (!options.cache)
		{
			moe.discardTemplateCache();
		}

		// Setup hooks to resolve partial paths and decorate
		// sub-models before passing to partials
		var context = {
			$moe: new MoeExpressHooks(moe, app, options),
		};

		// Compile and run!
		moe.compileFile(filename, 'UTF8', function(err, template) {

			// Error
			if (err)
				return cb(err);	

			// Process the body
			var body = template(options, context);

			// Work out the layout file
			var layout = options.layout;
			if (layout === undefined && options.settings && options.settings['view options'])
				layout = options.settings['view options'].layout;
			if (layout === undefined)
				layout = "layout";

			// No layout?
			if (!layout)
				return cb(null, body);

			// Find the layout file
			var layoutFile = context.$moe.resolveViewPath(layout, options.settings.views);
			moe.compileFile(layoutFile, 'UTF8', function(err, templateLayout) {

				// Error
				if (err)
					return cb(err);

				// Pass on the inner body
				options.body = body;

				// Run the layout
				cb(null, templateLayout(options, context));

			});

		});
	}
}



//////////////////////////////////////////////////////////////////////////////////
// Utils

function merge(a, b)
{
	if (a && b) 
	{
		for (var key in b) 
		{
			a[key] = b[key];
		}
	}
	return a;
}

function isObject(val)
{
	return val != null && typeof val === 'object' && Array.isArray(val) === false
}

function isIterable(val)
{
	return val != null && typeof val[Symbol.iterator] === 'function';
}

const GeneratorFunction = (function*(){}).constructor

function isGeneratorFunction(val)
{
	return val instanceof GeneratorFunction
}

//////////////////////////////////////////////////////////////////////////////////
// Exports

module.exports = new MoeEngine();
module.exports.Engine = MoeEngine;

