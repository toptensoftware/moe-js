'use strict'

const fs = require('fs');
const path = require('path');
var Tokenizer = require('./tokenizer').Tokenizer;


//////////////////////////////////////////////////////////////////////////////////
// Tokenizer 


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
			for (scope.index = 0; scope.index<scope.items.length; scope.index++)
			{
				scope.first = scope.index == 0;
				scope.last = scope.index == scope.items.length-1;
				scope.item = scope.items[scope.index];
				cbItem(scope, scope.item);
			}
			return;
		}
	}

	if (cbEmpty)
		return cbEmpty(scope);
}

// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.with = function(expr, cbItem, cbElse)
{
	if (expr)
		cbItem(expr);
	else if (cbElse)
		cbElse();
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

//////////////////////////////////////////////////////////////////////////////////
// MoeEngine - Moe template engine

function MoeEngine() 
{
	this.helpers = new MoeHelpers(this);
	this.asyncTemplates = {};
	this.syncTemplates = {};
	this.shouldPassLocals = false;
}

MoeEngine.prototype.express = function(app)
{
	return ExpressMiddleware(this, app);
}

// Compile a string template, returns a function(model, context)
MoeEngine.prototype.compile = function(template, options)
{
	var parts = "";
	var code = "";
	var blockTypeStack = [ "none" ];

	options = normalizeOptions(options);

	for (var token of Tokenizer.tokenize(template))
	{
		// Get the current block type
		var blockType = blockTypeStack[blockTypeStack.length-1];

		// If it's a closing directive, check it matches
		if (token.kind[0] == '/')
		{
			// Work out the expected closing tag type
			var expectedCloseTag = blockType;
			if (expectedCloseTag == "ifelse")
				expectedCloseTag = "if";
			if (expectedCloseTag == "eachelse")
				expectedCloseTag = "each";
			if (expectedCloseTag == "withelse")
				expectedCloseTag = "with";

			// Check block type matches
			if (token.kind != "/" + expectedCloseTag)
			{
				throw new Error(`Closing tag mismatch.  Expected {{/${expectedCloseTag}}} found {{${token.kind}}`);
			}
		}
		

		switch (token.kind)
		{
			case "literal":
				parts += `$buf += ${JSON.stringify(token.text)};\n`;
				break;

			case ">":
				// Invoke partial
				parts += `$buf += helpers.partial(model, context, scope, ${token.expression});\n`;
				break;

			case "{{}}":
				// Encoded string output
				parts += `$buf += $encode(${token.expression});\n`;
				break;

			case "{{{}}}":
				parts += `$buf += ${token.expression};\n`;
				break;

			case "#code":
				code += token.text;
				break;

			case "#if":
				blockTypeStack.push("if");
				parts += `if (${token.expression}) {\n`;
				break;

			case "/if":
				parts += "}\n";
				blockTypeStack.pop();
				break;

			case "#unless":
				blockTypeStack.push("unless");
				parts += `if (!(${token.expression})) {\n`;
				break;

			case "/unless":
				parts += "}\n";
				blockTypeStack.pop();
				break;

			case "#each":
				// Handle {{#each <controlVal> in <expr>}}
				//   (vs) {{#each <expr>}}
				var exprParts = token.expression.split(/[\s\t]+/);
				var itemName = "item";
				if (exprParts.length > 2 && exprParts[1] == 'in')
				{
					token.expression  = exprParts.slice(2).join(' ');
					itemName = exprParts[0];
				}

				blockTypeStack.push("each");
				parts += `helpers.each(scope, ${token.expression}, function(scope, ${itemName}) {\n`;
				break;

			case "/each":
				parts += `});\n`;
				blockTypeStack.pop();
				break;

			case "#with":
				// Handle {{#with <controlVal> as <expr>}}
				//   (vs) {{#with <expr>}}
				var exprParts = token.expression.split(/[\s\t]+/);
				var itemName = "item";
				if (exprParts.length > 2 && exprParts[1] == 'as')
				{
					token.expression  = exprParts.slice(2).join(' ');
					itemName = exprParts[0];
				}

				blockTypeStack.push("with");
				parts += `helpers.with(${token.expression}, function(${itemName}) { `;
				break;
				
			case "/with":
				parts += "});";
				blockTypeStack.pop();
				break;

			case "#else":
				if (blockType == "if")
				{
					blockTypeStack[blockTypeStack.length -1 ] = "ifelse";
					parts += "} else {\n";
				}
				else if (blockType == "each")
				{
					blockTypeStack[blockTypeStack.length -1 ] = "eachelse";
					parts += "}, function(item) {\n";
				}
				else if (blockType == "with")
				{
					blockTypeStack[blockTypeStack.length -1 ] = "withelse";
					parts += `}, function(scope) {\n`;
				}
				else
					throw new Error(`Unexpected else directive`);
				break;

			case "#elseif":
				if (blockType == "if")
				{
					parts += `} else if (${token.expression}) {\n`;
				}
				else
					throw new Error(`Unexpected elseif directive`);
				break;

			default:
				throw new Error(`Unknown directive "${token.kind}"`);
		}

			
	}

	// Check all blocks closed
	if (blockTypeStack.length > 1)
		throw new Error(`Missing closing tag: {{/${blockTypeStack[blockTypeStack.length-1]}))`);

	// Compile it
	var finalCode;
	finalCode = `var scope = null;\n`;
	finalCode += `var $encode = helpers.encode;\n`;
	finalCode += `var $buf = "";\n`;
	finalCode += code;
	finalCode += "\n";
	finalCode += parts;
	finalCode += "\n";
	finalCode += `return $buf;`;

//console.log(finalCode);

	var fn;
	var compiledFn;

	if (!options.asyncTemplate)
	{
		compiledFn = Function(['helpers', 'model', 'context'], finalCode);

		// Stub function to pass in helpers
		fn = (model, context) => 
		{
			return compiledFn(this.helpers, model, context);
		};
	}
	else
	{
		let AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
		compiledFn = new AsyncFunction(['helpers', 'model', 'context'], finalCode);

		// Stub function to pass in helpers
		fn = async (model, context) =>
		{
			return await compiledFn(this.helpers, model, context);
		};
	}

	// Store the implementation function (handy to for debug to see the actual implementation)
	// eg:
	//   var template = moe.compileFileSync("template.moe");
	//   console.log(template.impl.toString());
	fn.impl = compiledFn;
	fn.isAsync = options.asyncTemplate;

	return fn;
}

// Discard all templates.  Call if templates
// are known to have changed or if new global helpers
// have been registered
MoeEngine.prototype.discardTemplateCache = function()
{
	this.syncTemplates = {};
	this.asyncTemplates = {};
}

function normalizeOptions(options)
{
	if (options === undefined)
	{
		options = {};
	}

	if (typeof options === "boolean")
	{
		options = {
			asyncTemplate: options,
		}
	}

	if (typeof options === "string")
	{
		options = {
			encoding: options,
		}
	}

	return merge({
		encoding: "UTF8",
		asyncTemplate: false,
	}, options)
}

// Compile a file (async)
MoeEngine.prototype.compileFile = function(filename, options, cb)
{
	// Qualify with extension
	if (path.extname(filename).length == 0)
	{
		filename += ".moe";
	}

	// Normalize options
	options = normalizeOptions(options);

	// Check cache
	var cache = options.asyncTemplates ? this.asyncTemplates : this.syncTemplates;
	var template = cache[filename];

	if (template)
	{
		setImmediate(function() {
			cb(null, template);
		});
	}
	else
	{
		fs.readFile(filename, options.encoding, function(err, text) {

			if (err)
				return cb(err);

			try
			{
				var compiled = this.compile(text);
				cache[filename] = compiled;
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
MoeEngine.prototype.compileFileSync = function(filename, options)
{
	// Qualify with extension
	if (path.extname(filename).length == 0)
	{
		filename += ".moe";
	}

	// Normalize options
	options = normalizeOptions(options);

	var cache = options.asyncTemplates ? this.asyncTemplates : this.syncTemplates;
	var template = cache[filename];

	// Already compiled?
	if (template)
		return template;

	// Compile it
	var text = fs.readFileSync(filename, options.encoding);
	var compiled = this.compile(text, options);
	cache[filename] = compiled;
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

