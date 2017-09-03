const fs = require('fs');
const path = require('path');

//////////////////////////////////////////////////////////////////////////////////
// MoeHelpers - functions used internally by generated template scripts

function MoeHelpers(moe)
{
	this.moe = moe;
}

// Helper to encode html entities
MoeHelpers.prototype.encode = function(str) 
{
	return (""+str).replace(/["'&<>]/, function(x) {
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
		items: [],
		index: -1,
	};

	if (iter)
	{
		// Get all items into an array
		for (var i of iter) 
		{
			scope.items.push(i);
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

// Render a partial
MoeHelpers.prototype.partial = function(oldModel, scope, context, name, model)
{
	// Resolve model
	if (!model && scope)
		model = scope.item;
	if (!model)
		model = oldModel;

	if (context.$moe)
	{
		// Decorate the model? (used by express binding to attach
		// 		locals back onto the sub-model)
		if (context.$moe.decoratePartialModel && model !== oldModel)
		{
			model = context.$moe.decoratePartialModel(model);
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
	return template(model, context);
}



//////////////////////////////////////////////////////////////////////////////////
// MoeEngine - actual Moe template engine

function MoeEngine() 
{
	this.helpers = new MoeHelpers(this);
	this.globals = {};
	this.templates = {};
	this.__express = middleware.bind(this);
	this.express = this.__express;
	this.currentModel = null;
	this.currentContext = null;
	this.shouldPassLocals = false;
}

// Compile a string template, returns a function
// Anything attached to this.helpers will be made available as globals
// to the template
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
			(blockType == 'code' ? code : parts).push(template.substr(lastIndex, tag.index - lastIndex));
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

		// Remove braces
		if (directive.endsWith("}}}"))
			throw new Error("Misformed tag at ", tag.index);
		directive = directive.substr(2, directive.length - 4).trim();

		// Allow handlebars style {{else}}
		if (directive == "else")
			directive = "#else";

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

			// Work out the expected closing tag type
			var expectedCloseTag = blockType;
			if (expectedCloseTag == "ifelse")
				expectedCloseTag = "if";
			if (expectedCloseTag == "eachelse")
				expectedCloseTag = "each";

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

				case "if":
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

			// Split into directive and expression
			var dirType = directive.substr(1).split(' ')[0];
			var expr = directive.substr(dirType.length + 2);

			// Handle enter block
			switch (dirType)
			{
				case "code":
					blockTypeStack.push("code");
					break;

				case "if":
					blockTypeStack.push("if");
					parts.push("${(function() { if (");
					parts.push(expr);
					parts.push(") { return `");
					break;

				case "each":
					blockTypeStack.push("each");
					parts.push("${$.each(scope, ");
					parts.push(expr);
					parts.push(", function(scope, item) { return `");
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
					else
						throw new Error(`Unexpected else directive`);
					break;

				default:
					throw new Error(`Unknown directive "${directive}"`);
			}
		}
		else if (directive[0] == '>')
		{
			// Invoke partial
			parts.push('${$.partial(model, scope, context, ');
			parts.push(directive.substr(1));
			parts.push(')}');
		}
		else
		{
			// Encoded string output
			parts.push("${$.encode(");
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
		}
	}

	// Check all blocks closed
	if (blockTypeStack.length > 1)
		throw new Error(`Missing closing tag: {{/${blockTypeStack[blockTypeStack.length-1]}))`);

	// Trailing text
	parts.push(template.substr(lastIndex, template.length - lastIndex));

	// Take all helpers.globals and map them to local variables is the
	// template closure.  For function bind them to the helpers
	var globals = Object.keys(this.globals).map(function(x) {
		if (typeof(this.globals[x]) === 'function')
			return `var ${x} = $.moe.globals.${x}.bind($.moe);`
		else
			return `var ${x} = $.moe.globals.${x};`
	}.bind(this));

	// Join all everything
	var finalCode = `${globals.join('\n')}\n`;
	finalCode += `return function(model, context) {\n`;
	finalCode += `var scope = null;\n`;
	finalCode += `${code.join("")}\n`;
	finalCode += `return \`${parts.join("")}\`\n`;
	finalCode += `}\n`;

	// Create a closure to wrap the template and the globals
	var compiled = Function(['$'], finalCode);
	var compiledFn = compiled(this.helpers);

	// Stub function to setup model etc...
	var fn = function(model, context)
	{
		// Store model while we process the template
		// (in case helpers want to get to it)
		var oldModel = this.currentModel;
		var oldContext = this.currentContext;
		try
		{
			this.currentModel = model;
			this.currentContext = context;
			return compiledFn(model, context);
		}
		finally
		{
			this.currentModel = oldModel;
			this.currentContext = oldContext;
		}
	}.bind(this);

	// Store the implementation (handy to for debug to see the actual implementation)
	// eg:
	//   var template = moe("template text");
	//   console.log(template.impl.toString());
	fn.impl = compiled;

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
		cb(null, this.templates[filename]);
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

MoeEngine.prototype.passLocalsToPartials = function(app)
{
	this.shouldPassLocals = true;
	this.app = app;
}


//////////////////////////////////////////////////////////////////////////////////
// Express integration

function MoeExpressHooks(moe, options)
{
	this.moe = moe;
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
	if (this.moe.app)
	{
		merge(temp, this.moe.app.locals);
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
				return this.moe.templates[file];
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
function middleware(filename, options, cb)
{
	// Don't cache templates during development
	if (!options.cache)
	{
		this.discardTemplateCache();
	}

	// Setup hooks to resolve partial paths and decorate
	// sub-models before passing to partials
	var context = {
		$moe: new MoeExpressHooks(this, options),
	};

	// Compile and run!
	this.compileFile(filename, 'UTF8', function(err, template) {

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
		this.compileFile(layoutFile, 'UTF8', function(err, templateLayout) {

			// Error
			if (err)
				return cb(err);

			// Attach the body to the options object
			options.body = body;

			// Run the layout
			cb(null, templateLayout(options, context));

		});

	}.bind(this));
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



//////////////////////////////////////////////////////////////////////////////////
// Exports

module.exports = new MoeEngine();
module.exports.Engine = MoeEngine;

