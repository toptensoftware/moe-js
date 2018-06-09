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
	this.templates = {};
	this.currentModel = null;
	this.currentContext = null;
	this.shouldPassLocals = false;
}

MoeEngine.prototype.express(app)
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
					// Handle {{#each <controlVal> in <expr>}}
					//   (vs) {{#each <expr>}}
					var exprParts = expr.split(/[\s\t]+/);
					var itemName = "item";
					if (exprParts.length > 2 && exprParts[1] == 'in')
					{
						expr = filters.slice(2).join(' ');
						itemName = exprParts[0];
					}

					blockTypeStack.push("each");
					parts.push("${helpers.each(scope, ");
					parts.push(expr);
					parts.push(`, function(scope, ${itemName}) { return \``);
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
			parts.push('${helpers.partial(model, context, scope, ');
			parts.push(directive.substr(1));
			parts.push(')}');
		}
		else
		{
			// Encoded string output
			parts.push("${helpers.encode(");
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

	// Compile it
	var finalCode;
	finalCode  = `var scope = null;\n`;
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

		};
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

//////////////////////////////////////////////////////////////////////////////////
// Exports

module.exports = new MoeEngine();
module.exports.Engine = MoeEngine;

