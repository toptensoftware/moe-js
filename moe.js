'use strict'

const fs = require('fs');
const path = require('path');
const Tokenizer = require('./tokenizer').Tokenizer;


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

function buildEachScope(outerScope, iter)
{
	let scope = {
		outer: outerScope,
		index: -1,
		items: [],
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
			for (let i of iter())
				scope.items.push(i);
		}
		else
		{
			scope.items = [iter];
		}
	}

	return scope;

}
// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.each = function(outerScope, iter, cbItem, cbEmpty)
{
	let scope = buildEachScope(outerScope, iter);
	if (scope.items.length)
	{
		for (scope.index = 0; scope.index<scope.items.length; scope.index++)
		{
			scope.first = scope.index == 0;
			scope.last = scope.index == scope.items.length-1;
			scope.item = scope.items[scope.index];
			cbItem(scope, scope.item);
		}
	}
	else if (cbEmpty)
	{
		cbEmpty(scope);
	}
}

// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.eachAsync = async function(outerScope, iter, cbItem, cbEmpty)
{
	let scope = buildEachScope(outerScope, iter);
	if (scope.items.length)
	{
		for (scope.index = 0; scope.index<scope.items.length; scope.index++)
		{
			scope.first = scope.index == 0;
			scope.last = scope.index == scope.items.length-1;
			scope.item = scope.items[scope.index];
			await cbItem(scope, scope.item);
		}
	}
	else if (cbEmpty)
	{
		await cbEmpty(scope);
	}
}

// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.with = function(expr, cbItem, cbElse)
{
	if (expr)
		cbItem(expr);
	else if (cbElse)
		cbElse();
}

// Helper to iterate an iterable or call an alternate if iterable is empty
MoeHelpers.prototype.withAsync = async function(expr, cbItem, cbElse)
{
	if (expr)
		await cbItem(expr);
	else if (cbElse)
		await cbElse();
}

// Render a partial (Sync version)
MoeHelpers.prototype.partialSync = function(model, context, scope, name, subModel)
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
	let template = this.moe.compileFileSync(name);

	// Invoke it
	return template(subModel, context);
}

// Render a partial (Async version)
MoeHelpers.prototype.partialAsync = async function(model, context, scope, name, subModel)
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
		if (subModel !== model)
		{
			// Try async decorate first
			if (context.$moe.decoratePartialModelAsync)
			{
				subModel = await context.$moe.decoratePartialModelAsync(subModel);
			}
			else if (context.$moe.decoratePartialModel)
			{
				subModel = context.$moe.decoratePartialModel(subModel);
			}
		}

		// Resolve the partial path?
		if (context.$moe.resolvePartialPathAsync)
		{
			name = await context.$moe.resolvePartialPathAsync(name);
		}
		else if (context.$moe.resolvePartialPath)
		{
			name = context.$moe.resolvePartialPath(name);
		}
	}

	// Load the template
	let template = await this.moe.compileFileAsync(name, { asyncTemplate: true });

	// Invoke it
	return await template(subModel, context);
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
	let parts = "";
	let blockTypeStack = [ "none" ];

	options = normalizeOptions(options);

	for (let token of Tokenizer.tokenize(template))
	{
		// Get the current block type
		let blockType = blockTypeStack[blockTypeStack.length-1];

		// If it's a closing directive, check it matches
		if (token.kind[0] == '/')
		{
			// Work out the expected closing tag type
			let expectedCloseTag = blockType;
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
				if (options.asyncTemplate)
				{
					parts += `$buf += await helpers.partialAsync(model, context, scope, ${token.expression});\n`;
				}
				else
				{
					parts += `$buf += helpers.partialSync(model, context, scope, ${token.expression});\n`;
				}
				break;

			case "{{}}":
				// Encoded string output
				parts += `$buf += $encode(${token.expression});\n`;
				break;

			case "{{{}}}":
				parts += `$buf += ${token.expression};\n`;
				break;

			case "#code":
				parts += token.text;
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
			{
				// Handle {{#each <controlVal> in <expr>}}
				//   (vs) {{#each <expr>}}
				let exprParts = token.expression.split(/[\s\t]+/);
				let itemName = "item";
				if (exprParts.length > 2 && exprParts[1] == 'in')
				{
					token.expression  = exprParts.slice(2).join(' ');
					itemName = exprParts[0];
				}

				blockTypeStack.push("each");
				if (options.asyncTemplate)
				{
					parts += `await helpers.eachAsync(scope, ${token.expression}, async function(scope, ${itemName}) {\n`;
				}
				else
				{
					parts += `helpers.each(scope, ${token.expression}, function(scope, ${itemName}) {\n`;
				}
				break;
			}

			case "/each":
				parts += `});\n`;
				blockTypeStack.pop();
				break;

			case "#with":
			{
				// Handle {{#with <controlVal> as <expr>}}
				//   (vs) {{#with <expr>}}
				let exprParts = token.expression.split(/[\s\t]+/);
				let itemName = "item";
				if (exprParts.length > 2 && exprParts[1] == 'as')
				{
					token.expression  = exprParts.slice(2).join(' ');
					itemName = exprParts[0];
				}

				blockTypeStack.push("with");
				if (options.asyncTemplate)
				{
					parts += `await helpers.withAsync(${token.expression}, async function(${itemName}) { `;
				}
				else
				{
					parts += `helpers.with(${token.expression}, function(${itemName}) { `;
				}
				break;
			}
			
			case "/with":
				parts += "});";
				blockTypeStack.pop();
				break;

			case "#capture":
				blockTypeStack.push("capture");
				if (options.asyncTemplate)
				{
					parts += `${token.expression} = await (async function() { let $buf=""; \n`;
				}
				else
				{
					parts += `${token.expression} = (function() { let $buf=""; \n`;
				}

			case "/capture":
				parts += "return $buf; })();\n";
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
					if (options.asyncTemplate)
						parts += "}, async function(item) {\n";
					else
						parts += "}, function(item) {\n";
				}
				else if (blockType == "with")
				{
					blockTypeStack[blockTypeStack.length -1 ] = "withelse";
					if (options.asyncTemplate)
						parts += `}, async function(scope) {\n`;
					else
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
	let finalCode;
	finalCode = `let scope = null;\n`;
	finalCode += `let $encode = helpers.encode;\n`;
	finalCode += `let $buf = "";\n`;
	finalCode += `let inner = context.inner;\n`;
	finalCode += parts;
	finalCode += "\n";
	finalCode += `return $buf;`;

//console.log(finalCode);

	let fn;
	let compiledFn;

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
	//   let template = moe.compileFileSync("template.moe");
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
	// Normalize options
	options = normalizeOptions(options);

	// If not found with default name, try again with .moe
	let hasExtension = filename.toLowerCase().endsWith('.moe');
	if (hasExtension)
	{
		filename = filename.substr(0, filename.length - 4);
		hasExtension = false;
	}

	// Check cache
	let cache = options.asyncTemplate ? this.asyncTemplates : this.syncTemplates;
	let template = cache[filename];

	// Found in cache?
	if (template)
	{
		setImmediate(function() {
			cb(null, template);
		});
		return;
	}

	const compileAndCache = (text) =>
	{
		try
		{
			let compiled = this.compile(text, options);
			cache[filename] = compiled;
			cb(null, compiled);
		}
		catch (err)
		{
			cb(err);
		}
	}

	// Read the file
	fs.readFile(filename, options.encoding, (err, text) => {

		// Loaded? compile it
		if (!err)
		{
			return compileAndCache(text);
		}

		// If filename has extension or some other error beside not found, then fail now
		if (err.code != "ENOENT" || hasExtension)
		{
			return cb(err);
		}

		// Try with .moe added
		filename += '.moe';
		fs.readFile(filename, options.encoding, (err, text) => {
			if (err)
				cb(err);
			else
				compileAndCache(text);
		});

	});
}

// Compile a file (async)
MoeEngine.prototype.compileFileAsync = function(filename, options, cb)
{
	return new Promise((resolve, reject) =>{
		this.compileFile(filename, options, function(err, result) {
			if (err)
				reject(err);
			else
				resolve(result);
		});
	});
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

	let cache = options.asyncTemplate ? this.asyncTemplates : this.syncTemplates;
	let template = cache[filename];

	// Already compiled?
	if (template)
		return template;

	// Compile it
	let text = fs.readFileSync(filename, options.encoding);
	let compiled = this.compile(text, options);
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
	let temp = {
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
		for (let i=0; i<viewFolders.length; i++)
		{
			let file = path.resolve(viewFolders[i], name);
			if (this.moe.asyncTemplates[file] || this.moe.syncTemplates[file])
				return file;
		}
	}

	// Try to find file
	for (let i=0; i<viewFolders.length; i++)
	{
		let file = path.resolve(viewFolders[i], name);
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

	throw new Error(`Can't find template "${name}" on path ${viewFolders.join(", ")}`);
}

MoeExpressHooks.prototype.resolvePartialPath = function(name)
{
	// Get view folder search path
	let viewFolders = this.options.settings.partialViews ? this.options.settings.partialViews : this.options.settings.views;
	return this.resolveViewPath(name, viewFolders);	
}


// Express middleware to render a view
function ExpressMiddleware(moe, app)
{
	return function middleware(filename, options, cb)
	{
		Promise.resolve((async () =>  {

			// Don't cache templates during development
			if (!options.cache)
			{
				moe.discardTemplateCache();
			}

			// Setup hooks to resolve partial paths and decorate
			// sub-models before passing to partials
			let context = {
				$moe: new MoeExpressHooks(moe, app, options),
			};

			// Compile and run!
			let template = await moe.compileFileAsync(filename, { asyncTemplate: true });

			// Process the body
			let body = await template(options, context);

			// Work out the layout file
			let layout = options.layout;
			if (layout === undefined && options.settings && options.settings['view options'])
				layout = options.settings['view options'].layout;
			if (layout === undefined)
				layout = "layout";

			// No layout?
			if (!layout)
				return body;

			// Find the layout file
			let layoutFile = context.$moe.resolveViewPath(layout, options.settings.views);
			let templateLayout = await moe.compileFileAsync (layoutFile, { asyncTemplate: true });

			// Pass on the inner body
			context.inner = {
				body: body
			};

			return await templateLayout(options, context);

		})()).then(x=>cb(null, x)).catch(cb);
	}
}



//////////////////////////////////////////////////////////////////////////////////
// Utils

function merge(a, b)
{
	if (a && b) 
	{
		for (let key in b) 
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

