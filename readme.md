## Welcome to Moe-js

"Moe-js" is a simple, fast, flexible, modern, async enabled, Handlebars inspired templating engine for JavaScript.

* Mustache/Handlebars inspired format
* Support for in-template JavaScript expressions
* Support for embedded code blocks
* Support for external helper functions
* Support for partials
* Support for async templates (use await inside template)
* Built-in Express integration including support for outer "layouts"
* Built-in template file cache
* Simple to use
* No dependencies

## Background

Moe-js was born out of desire to get around some of the limitations of Handlebars, while still 
providing a similar template syntax.  In particular, Moe-js is intended to address Handlebars'
awkward helper methods and the lack of support for even simple expressions within the template. 
Moe-js provides a way to "power-up" an existing set of Handlebars templates without having to 
rewrite them from scratch.

With Moe-js, you get a similar syntax but all the power of JavaScript within the template.  Unlike
Handlebars which is language agnostic, Moe-js is closely tied to the JavaScript language (which is 
why it has "js" in it's name).

Moe-js doesn't claim to be compatible with Handlebars but the syntax is very similar and existing
templates can be converted fairly easily (certainly more easily than switching to a completely 
different view engine).


## Using Moe-js with Express

You can use Moe-js as a view engine in Express:

```Javascript
const moe = require('moe-js');

// Use moe-js for '.moe' view templates
app.engine('moe', moe.express(app));

// Where to look for views
app.set('views', path.join(__dirname, 'views'));

// Default view engine to use when render call doesn't include file extension
app.set('view engine', 'moe');
```

### Outer Layout

When using Moe-js with Express, you can specify an outer layout file into which the internal view
is wrapped.

The name of the layout is determined in the following way:

1. The `model.layout` property
2. The `app.locals.layout` property
3. Defaults to "layout"

To suppress the use of a layout set the property to `false`.  Layout files are searched for in the same
directory as other views.

On rendering the layout, the originally passed model will be decorated with a new property `body` containing
the rendered content of the inner view.  

A simple minimal layout might look like this:

```html
<html>
<head>
</head>
<body>
{{{ model.body }}}
</body>
</html>
```

### Support for Async

Moe-js's Express middleware compiles view templates as async templates, so you can use `await` in your views!


## Using Moe-js Directly

Before executing a template, you must first compile it.  

```Javascript
// Import moe
const moe = require('moe-js');

// Compile a template from a string
let template = moe.compile("<h1>{{model.title}}</h1>");
```

Or compile from a file (the template will be cached so subsequent calls will re-use the same template)

```Javascript
moe.compileFile("myTemplate.moe", "UTF8", function(err, template) {

});
```

Or, do it synchronously

```Javascript
let template = moe.compileFileSync("mytemplate.moe", "UTF8");
```

Or, using async/await:

```Javascript
let template = await moe.compileFileAsync("mytemplate.moe", "UTF8");
```

Once you have a template, you can execute it:

```Javascript
let html = template({ name: "Hello, from Moe-js"});
assert(html == "<h1>Hello, from Moe-js</h1>")
```

## Async Templates

By default, templates are compiled to be executed synchronously, but Moe-js can also build
an async template function that returns a Promise.  This lets you use `await` statements within the
template itself.  To compile an async template, pass either `true` or `{ asyncTemplate: true }` as 
the second parameter to any of the compile functions.

```Javascript
// Compile an async template (Note use of "await model.promise")
let template = moe.compile(`Promise result:  {{await model.promise}}`, {
    asyncTemplate: true     // Indicates we want an async template
});

// Create a simple promise that delivers a string
let promise = new Promise((resolve, reject) => {
    setTimeout(() => resolve("Hello"), 1000);
});

// Execute the template (Note use of "await" on the template function)
let result = await template({
    promise: promise,
});

assert(result == "Promise result: Hello");
```

Note: don't confuse async templates with the `moe.compileFileAsync` function:

* `moe.compileFileAsync` returns a promise for the compiled template function. 
* `options.asyncTemplate` allow the use of `await` within the template itself.

## Template Language

Moe-js templates are similar to Handlebars templates, but there are some important differences.  The
following shows how to write Moe-js templates.

### Use `{{}}` to Embed Expressions

Use `{{` and `}}` to delimit expressions:

```html
<p>10 + 20 = {{ 10 + 20 }}</p>
```

Any valid JavaScript expression can be used:

```html
<p>sin(0.5) = {{ Math.sin(0.5) }}</p>
```

### Escaped vs Non-Escaped Output

Double braces cause the rendered text to be HTML encoded:

```html
<p>{{"<blah>"}}<p>
```

Results in:

```html
<p>&lt;blah&gt;</p>
```

Use triple braces to suppress encoding:

```html
<p>{{{"<br/>"}}}</p>
```

Results in:

```html
<p><br/></p>
```

### Comments

You can embed comments as follows:

```html
{{!-- This is a comment --}}
```

Note: comment blocks can be used to surround other Moe-js directives - ie: they're
an effective way to "comment out" entire sections of a template. (Although comments
can't be nested)

### The Special `model` Variable 

Data passed to the template is available as the special `model` variable inside the template:

eg: Suppose the template was invoked like so:

```Javascript
    template({ title: "This is the title" });
```

Inside the template, the model properties would be accessed as follows:

```html
    <h1>{{model.title}}</h1>
```

(Unlike Handlebars, `{{title}}` won't work, you must specify `{{model.title}}`)

### Conditional Execution

The `{{#if}}` / `{{#else}}` / `{{/if}}` directives are used to conditionally include sections:

```html
{{#if model.quantity == 0}}
<p>OUT OF STOCK</p>
{{/if}}
```

Else blocks can be marked as `{{#else}}` or `{{else}}` (for Handlebars compatibility)

```html
{{#if model.quantity == 0}}
<p>OUT OF STOCK</p>
{{#else}}
<P>IN STOCK</P>
{{/if}}
```

There's also an `{{#elseif}}` directive:

```html
{{#if model.quantity == 0}}
<p>OUT OF STOCK</p>
{{#elseif model.quantity < 3}}
<p>ALMOST OUT OF STOCK</p>
{{#else}}
<P>IN STOCK</P>
{{/if}}
```

As an alternative for `{{#else}}` and `{{#elseif}}` you can use `{{^}}` and `{{^if}}`:

```html
{{#if model.quantity == 0}}
<p>OUT OF STOCK</p>
{{^if model.quantity < 3}}
<p>ALMOST OUT OF STOCK</p>
{{^}}
<P>IN STOCK</P>
{{/if}}
```

Moe-js doesn't really need an `{{#unless}}` block (because it's easy to just use `{{#if !(expr)}}`) but
includes one anyway:

```html
{{#unless model.newUser}}
<p>User ID: {{model.user.id}}</p>
{{/unless}}
```

An `{{#unless}}` block can't have an `{{#else}}` block.


### Rendering Collections

To loop over a collection of items, use the `{{#each}}` directive and the special loop variable `item`:

```html
{{#each ["apples", "pears", "bananas"]}}
<p>{{item}}</p>
{{/each}}
```

You can also specify a name for the loop variable. This can be handy when working with nested loops.

```html
{{#each u in model.Users}}
{{#each r in u.roles}}
<p>Name: {{u.name}} Role: {{r}}</p>
{{/each}}
{{/each}}
```

When iterating over an object, the loop variable has two properties `.key` and `.value`:

```html
{{#each fruit in { "apples": "red", "bananas": "yellow" } }}
<p>Fruit: {{fruit.key}} Color: {{fruit.value}}
{{/each}}
<p>
```

Inside the `{{#each}}` statement, a special variable `scope` is also available:

```Javascript
{
    index: 0,             // The index of the currently rendering item
    item: 'Apples',       // The currently rendering item
    items: [              // An array of all items being iterated
        'Apples',
        'Pears',
        'Bananas',
    ],    
    first: true,          // True if the current item is the first item
    last: true,           // True if the current item is the last item
    outer: {}             // Reference to the next outer loop scope (if nested looping)
}
```

This lets you do things like:

```html
{{#each User}}
{{#if scope.first}}<hr />{{/if}}
<p>item.name</p>
{{#if scope.last}}<p> -- END -- </p>{{/if}}
{{/each}}
```

You can also do odd/even rendering with `{{#if item.index % 2}}` etc...

`{{#each}}` blocks can also have an `{{#else}}` clause that will be rendered if the collection is empty:

```html
{{#each model.user}}
<p>item.name</p>
{{#else}}
<p>No Users Found :(</p>
{{/each}}
```

### With Blocks

`{{#with}}` blocks can be used to evaluate an expression and then generate a template block
using the result of the expression.

If not specified, the expression gets assigned to a variable named `item`:

```html
{{#with model.user.post[33].comments[1]}}
<p>{{item.text}}</p>
<p>Posted at: {{item.time}}</p>
{{/with}}
```

To specify the name of the variable inside use `as`, like so:

```html
{{#with comment as model.user.post[33].comments[1]}}
<p>{{comment.text}}</p>
<p>Posted at: {{comment.time}}</p>
{{/with}}
```

The contents of a `{{#with}}` block only render if the expression evaluates to a "truthy" value, and
they can have an optional `{{#else}}` block:

```html
{{#with comment as model.user.post[33].comments[1]}}
<p>{{comment.text}}</p>
<p>Posted at: {{comment.time}}</p>
{{#else}}
<p>No Comment</p>
{{/with}}
```


### Code Blocks

Code blocks let you define local helper functions:

```html
{{#code}}
function FormatPrice(val)
{
    if (val == 0)
        return "-";
    else
        return "$" + val.toFixed(2);
}
{{/code}}

<p>Item Price: {{FormatPrice(23.99)}}</p>
```

### Partials

Partials let you embed the contents of another template inside this template.

For example, this will invoke the "UserDetails" template, passing the current model as the model for the template.

```html
{{> "UserDetails" }}
```

Note that unlike Handlebars, the name of the partial template must be quoted because it's a JavaScript expression - which 
also means can dynamically synthesize the name of the partial to invoke:

```html
{{> "UserDetails_" + model.role }}
```

When invoking a partial from within an `{{#each}}` block, the current loop item is passed as the partial's model. In this
example, the current user would be passed as the model to the partial template:

```html
{{#each u in model.Users}}
{{> "UserDetails" }}
{{/each}}
```

You can also, pass an explicit object to the partial template:

```html
{{> "UserDetails", model.user}}
```

### Raw Text

Raw text can be embedded in a template using `{{{{ }}}}`:

```html
<pre>
{{{{<h1>{{model.title}}</h1>    
<p>This is an example Moe-js template</p>}}}}
</pre>
```

Note how the `{{model.title}}` directive was ignored and passed through:

```html
<pre>
<h1>{{model.title}}</h1>
<p>This is an example Moe-js template</p>
</pre>
```

### White Space Control

You can strip out whitespace between Moe-js directives and other parts of the template by placing a `~`
character inside the start or end of any `{{ }}` or `{{{ }}}` directive.

A `~` at the start of a directive means to strip out any whitespace before the directive (including spaces,
tabs, line feeds and carriage returns).  A `~` at the end of a directive causes whitespace after the directive
to be stripped.

```html
    {{#if model.inStock~}}
    IN STOCK
    {{~^~}}
    OUT OF STOCK
    {{~/if}}
```

is equivalent to:

```html
    {{#if model.inStock}}IN STOCK{{^}}OUT OF STOCK{{/if}}
```

Note too that Moe-js will automatically remove line space around control directives that are 
on a line by themselves:

```html
<div>
    {{#if model.inStock}}
    IN STOCK
    {{^}}
    OUT OF STOCK
    {{/if}}
<div>
```

Produces:

```
<div>
    IN STOCK
<div>
```


### Escaping Braces

Moe-js doesn't provide any support for escaping braces outside of directives.  Instead, just use a simple
expression:

```html
{{"{{"}} This is double braced }}
```

Produces:

```html
{{ This is double braced }}
```

Single braces don't usually need to be escaped, unless they're immediately before a Moe-js directive:

```html
{{"{"}}{{model.title}}{{"}"}}
```

Produces:

```html
{TheTitle}
```

alternatively your could include spaces to separate the braces and then use `~` to strip it out:

```html
{ {{~model.title~}} }
```

## API Reference

When you import moe-js, the returned object is the default instance of the MoeEngine class.  

```Javascript
    const moe = require('moe-js');
```

Although rarely necessary, you can create additional MoeEngine instances as follows:

```Javascript
    const moe = require('moe-js');
    const moe2 = new moe.MoeEngine();
```

### moe.compile

The `compile` function takes a template string and compiles it to a function that can be invoked to
render the template output:

``` Javascript
function moe.compile(templateScript. [options])
```

* `templateScript` -  a string containing the template to be compiled
* `options` - optional compile options (see below)

The returned function is of the following form:

```Javascript
function template(model [, context])
```

* `model` - the data to be passed to the model
* `context` - an optional object that will be passed to the template and to any partials

### moe.compileFile

The `compileFile` function loads a template from text file, compiles it using the `moe.compile` function and
stores the result in an internal cache.

`compileFile` first tries to load from a file exactly as specified by `filename`.  If the file doesn't exist
and the filename doesn't end with ".moe" then ".moe" is appended to the filename and tried again.

```Javascript
function moe.compileFile(filename, options, callback)
```

* `filename` - the file to compile
* `options` - compile options (see below)
* `callback` - function that will be called when the template has been compiled

The callback function is a typical Node style callback:

```Javascript
function callback(err, template)
```

### moe.compileFileSync

Synchronous version of the `moe.compileFile` function:

```Javascript
function moe.compileFileSync(filename, options)
```

* `filename` is the file to compile
* `options` - optional compile options (see below)
* returns the compiled template, or throws an exception


### moe.compileFileAsync

Promise version of the `moe.compileFile` function:

```Javascript
async function moe.compileFileAsync(filename, options)
```

* `filename` is the file to compile
* `options` - optional compile options (see below)
* returns a Promise for the compiled template, or throws an exception


### moe.discardTemplateCache

Discards the contents of the internal template cache.  Call this function if any of the template
files have changed to force those templates to be re-read and re-compiled next time they're referenced.

```Javascript
function moe.discardTemplateCache()
```

### moe.helpers

A set of functions and objects that are available to template scripts.  See below...

## Compile Options

Each of the compile methods has an `options` parameter which accepts an object with the following
members:

```Javascript
{
    encoding: "UTF8",       // File encoding for compileFile* functions
    asyncTemplate: false,   // Whether to compile a sync or async template function
}
```

The values shown above are the default values used if not explicitly specified.

You can also pass a boolean value which will set the `asyncTemplate` option, or a string which
will set the `encoding` option.  eg:

```Javascript
    // compile an async template
    moe.compile('...', true);                       

    // compile a UTF16 template file
    moe.compileFileSync("template.moe", "UTF16");

    // compile an async UTF16 template file
    moe.compileFileSync("template.moe", {
        encoding: "UTF16",
        asyncTemplate: true
    });
```


## Helper Functions

You can write helper functions to be used in your templates by either declaring them inside the template using `{{#code}}` blocks (as described above), or by attaching functions to the `moe.helpers` object:

```Javascript
const moe = require('moe-js');
moe.helpers.FormatPrice = function (val)
{
    if (val == 0)
        return "-";
    else
        return "$" + val.toFixed(2);
}
```

You can then reference these helper function in your template as follows:

```html
<p>Price: {{helpers.FormatPrice(item.price)}}</p>
```

Note that you should NOT replace the existing `.helpers` instance - it contains internal helper
functions used by the generated template function.

## Security Considerations

Since Moe.JS allows the execution of arbitrary JavaScript code it should only be used in situations where
the template scripts of a trusted origin.

You should never allow an end user to upload a Moe.JS template and then execute it on your server.

eg: Suppose you're developing mailing list software, you shouldn't use Moe.JS as the template format
for email templates.

While Moe.JS provides a reasonably sandboxed environment that doesn't allow access to the file system, 
databases etc..., it's by no means secure and doesn't provide protection from attacks or accidental end
user mistakes such as infinite loop, stack overflows, allocating excessive memeory etc...


## Converting Handlebar Templates to Moe-js

As mentioned above, Moe-js doesn't claim to be compatible with Handlebars but does
have a similar syntax which lends it to easy conversion of existing templates to Moe-js.

This section explains common things to watch out for if you're porting existing Handlebars
templates.

### Use The `model.` Variable To Access Passed Data

This is probably the biggest impact on existing templates.  Unlike Handlebars which automatically
maps referenced variables to the current scope, Moe-js doesn't provide this - primarily because
under the covers this is straight JavaScript code.

While this is inconvenient for porting templates, it does make the templates more explicit, 
faster and facilitates the use of any JavaScript expression.

```
{{title}}           <- Handlebars
{{model.title}}     <- Moe-js
```

### Rewrite Helper Functions

Helper functions are implemented differently in Moe-js.   See above for how to write Moe-js helpers.

Don't forget you can also use in-template `{{#code}}` blocks for one off helpers.

### Quote Referenced Partials

Moe-js's partial directive expects a JavaScript expression which means the referenced template
name must be quoted:

```
{{> partial}}       <- Handlebars
{{> "partial"}}     <- Moe-js
```

### Replace Shorthand Comments

Handlebars allows two kinds of comments `{{!-- --}}` and `{{! }}`.  Moe-js only 
supports the first format, since the second format might be a valid JavaScript expression (not operator).

```
{{!-- Comment  --}} <- Handlebars or Moe-js
{{! Comment }}      <- Handlebars only
```

### Replace Handlebars Style Paths

Handlebars uses "paths" (eg: `.`,  `..` etc...) to reference the current and outer scopes.  These don't 
exist in Moe-js because expressions are plain JavaScript.

In Moe-js, these paths generally aren't required since you can name loop variables explicitly and you
can always get back to the root `model` object.

### Fixed Escaped Braces

Moe-js doesn't support escaping braces with a backslash.  Replace with a JavaScript Expression:

```
\{{{model.title}}       <- Handlebars
{{'{'}}{{model.title}}  <- Moe-js
{ {{~model.title}}      <- Moe-js or Handlebars
```

## Internals

### The Context Object

In addition to the `.model` object that is used to pass data to a template, there is a second special object called the `.context`.  Unlike the model object which can change between templates and partials, the context object remains the same
across all templates used.

The context object is optional and if used should be passed as the second parameter to the compiled template function (see example below)

### Partial Template Resolution and Model Decoration Hooks

By default when a partial template is referenced, the file is loaded directly from the current directory.  Since most
integrations will want to look for partials in a particular location, the context object can contain a special `$moe` 
member variable that can provide functions used to resolve the partial location and to decorate the partials model object
before the partial is rendered.

These hooks are used by Moe-js's Express integration to look for partials in the views subfolder and to 
merge models with local settings.

Each function can be supplied in a Sync and optionally an Async version.  The async versions will only be called
if the template was compiled as an async template and if not present the sync version will be used as a fallback.

```Javascript
let context = 
{
    // Special member '$moe' provides hooks for partial processing
    $moe: 
    {
        // Map a partial name to an actual file path    
        resolvePartialPath: function(partialTemplateName) {
            // Return the full path to the template file to use
            return path.join("./views/partialViews", partialTemplateName);
        },

        resolvePartialPathAsync: async function(partialTemplteName) {
            // Async version of above.  Only called on async templates
            // and will fall back to sync version if not present
        },

        // Provides an opportunity to "decorate" the a model object before it's
        // passed to a partial.
        decoratePartialModel: function(model) {
            // Return either the original object modified, or a new object
            // merged with the original model.
            return merge({
                "someCustomSettingsForThePartial": "Whatever",
                "somethingElse": 99
            }, model);
        },

        decoratePartialModelAsync: async function(model) {
            // Async version of above.  Only called on async templates
            // and will fall back to sync version if not present
        },
    }  
};

let template = moe.compile(templateText);
let model = { }
let text = template(mode, context);     // NB: passing the context object

```

