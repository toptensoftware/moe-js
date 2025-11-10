import fs from 'fs';
import path from 'path';
import { Tokenizer } from './tokenizer.js';
import { MoeHelpers } from "./MoeHelpers.js";
import { MoeExpressHooks } from "./MoeExpressHooks.js";


export class MoeEngine
{
	constructor()
	{
		this.helpers = new MoeHelpers(this);
		this.asyncTemplates = {};
		this.syncTemplates = {};
		this.shouldPassLocals = false;
	}

	express(app)
	{
		return MoeExpressHooks.ExpressMiddleware(this, app);
	}

	// Compile a string template, returns a function(model, context)
	compile(template, options)
	{
		let parts = "";
		let blockTypeStack = [ "none" ];

		options = this.#normalizeOptions(options);

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
					break;

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
		finalCode += `let inner = context ? context.inner : null;\n`;
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
	discardTemplateCache()
	{
		this.syncTemplates = {};
		this.asyncTemplates = {};
	}

	#normalizeOptions(options)
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

		return Object.assign({
			encoding: "UTF8",
			asyncTemplate: false,
		}, options)
	}

	// Compile a file (async)
	compileFile(filename, options, cb)
	{
		// Normalize options
		options = this.#normalizeOptions(options);

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
	compileFileAsync(filename, options, cb)
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
	compileFileSync(filename, options)
	{
		// Qualify with extension
		if (path.extname(filename).length == 0)
		{
			filename += ".moe";
		}

		// Normalize options
		options = this.#normalizeOptions(options);

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

}

