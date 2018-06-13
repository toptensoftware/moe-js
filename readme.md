## Welcome to Moe.JS

Moe.JS is a simple, but fast and flexible templating engine for JavaScript.

* Mustache/Handlebars inspired format
* Compiles templates to ES6 template literals for super fast execution
* Support for partials
* Support for external helper functions
* Support for embedded code blocks
* Built-in Express integration including support for outer "layouts"
* Built-in template file cache
* Simple to use

## Basic Usage

Before executing a template, you must first compile it.  

```Javascript
// Import moe
const moe = require('moe-js');

// Compile a template from a string
var template = moe.compile("<h1>{{model.title}}</h1>");
```

Or compile from a file (the template will be cached so subsequent calls will re-use the same template)

```Javascript
moe.compileFile("myTemplate.moe", "UTF8", function(err, template) {

});
```

Or, do it synchronously

```Javascript
var template = moe.compileFileSync("mytemplate.moe", "UTF8");
```

Once you have a template, you can execute it:

```Javascript
var html = template({ name: "Hello, from Moe.JS"});
assert(html == "<h1>Hello, from Moe.JS</h1>")
```

## Template Language

Moe.JS templates are similar to Mustache/Handlebars templates, but there are some important differences.  The
following shows how to write Moe.JS template.

### Use `{{}}` to Embed Expressions

Moe.JS uses `{{` and `}}` to delimit expressions:

```html
<p>10 + 20 = {{ 10 + 20 }}</p>
```

Any valid JavaScript expression can be used:

```html
<p>sin(0.5) = {{ Math.sin(0.5) }}</p>
```

### Escaped vs Non-Escaped Output

Double braces causse the rendered text to be HTML encoded:

```html
<p>{{"<blah>"}}<p>
```

Would result in:

```html
<p>&lt;blah&gt;</p>
```

Use triple braces to suppress encoding:

```html
<p>{{{"<br/>"}}}</p>
```

Would result in:

```html
<p><br/></p>
```

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

(Unlike Mustache, `{{title}}` won't work, you must specify `model.`")

### Conditional Execution

The `{{#if}}` / `{{#else}}` / `{{/if}}` directives are used to conditionally include sections:

```html
{{#if model.quantity == 0}}
<p>OUT OF STOCK</p>
{{/if}}
```

Else blocks can be marked as `{{#else}}` or `{{else}}` (for Mustache compatibility)

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


### Rendering Collections

To loop over a collection of items, use the `{{#each}}` directive and the special variable `item`:

```html
{{#each ["apples", "pears", "bananas"]}}
<p>{{item}}</p>
{{/each}}
```

You can also specify a variable name for the item. This can be handy when working with nested loops.

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

Partials let you embed the contents of another template inside this template:

Invoke the UserDetails template, passing the current model as the model for the template.

```html
{{> "UserDetails" }}
```

Note that unlike Mustache/Handlebars, the name of the partial template must be quoted because it's a JavaScript expression.  This also means you can dynamically synthesize the name of the partial to invoke:

```html
{{> "UserDetails_" + model.role }}
```

Inside an `{{#each}}` block, the current loop item is passed as the model, so in this case the current user would be passed as the model to the partial template:

```html
{{#each u in model.Users}}
{{> "UserDetails" }}
{{/each}}
```

You can also, pass an explicit object as the model to the partial template:

```html
{{> "UserDetails", model.user}}
```

## API Reference

When you import Moe.JS, the returned object is the default instance of the MoeEngine class.  

```Javascript
    const moe = require('moe-js');
```

Although rarely necessary, you can create additional MoeEngine instances as follows:

```Javascript
    const moe = require('moe-js');
    const moe2 = new moe.MoeEngine();
```

### moe.compile

The `compile` function takes template string and compiles it to a function that can be invoked to
render the template output:

``` Javascript
function moe.compile(templateScript)
```

* `templateScript` is a string containing the template to be compiled

The returned function is of the following form:

```Javascript
function template(model [, context])
```

* `model` is the data to be passed to the model
* `context` is an optional object that will be passed to the template and to any partials

### moe.compileFile

The `compileFile` function loads a template from text file, compiles it using the `moe.compile` function and
stores the result in an internal cache.

```Javascript
function moe.compileFile(filename, encoding, callback)
```

* `filename` is the file to compile.  If the file doesn't have an extension ".moe" will be automatically appended.
* `encoding` the text encoding of the format (typical 'UTF8')
* `callback` a function that will be called when the template has been compiled

The callback function is a typical Node style callback:

```Javascript
function callback(err, template)
```

### moe.compileFileSync

Synchronous version of the `moe.compileFile` function:

```Javascript
function moe.compileFileSync(filename, encoding)
```

* `filename` is the file to compile
* `encoding` the text encoding of the format (typical 'UTF8')
* returns the compiled template, or throws an exception


### moe.discardTemplateCache

Discards the contents of the internal template cache.  Call this function if any of the template
files have changed to force those templates to be re-read and re-compiled next time they're referenced.

```Javascript
function moe.discardTemplateCache()
```

### moe.helpers

A set of functions and objects that are available to template scripts.  See below...

## Helper Functions

You can write helper functions to be used in your templates by either declaring them inside the template using `{{#code}}` blocks (as described above), or by attaching functions to the `moe.helpers` object:

```Javascript
var moe = require('moe-je');
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


## Express Integration

You can use Moe.JS as a view engine in Express:

```Javascript
const moe = require('moe-js');

// Use Moe.JS for '.moe' view templates
app.engine('moe', moe.express(app));

// Where to look for views
app.set('views', path.join(__dirname, 'views'));

// Default view engine to use when render call doesn't include file extension
app.set('view engine', 'moe');
```

### Outer Layout

When using Moe.JS with Express, you can specify an outer layout file into which the internal view
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

These hooks are used by Moe.JS's Express integration to look for partials in the views subfolder and to 
merge models with local settings.

```Javascript
var context = 
{
    // Special member '$moe' provides hooks for partial processing
    $moe: 
    {
        // Map a partial name to an actual file path    
        resolvePartialPath: function(partialTemplateName) {
            // Return the full path to the template file to use
            return path.join("./views/partialViews", partialTemplateName);
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
        }
    }  
};

var template = moe.compile(templateText);
var model = { }
var text = template(mode, context);     // NB: passing the context object

```

