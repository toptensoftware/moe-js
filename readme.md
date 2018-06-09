# Welcome to Moe.JS

Moe.JS is a simple, but fast and flexible templating engine for JavaScript.

* Mustache/Handlebars inspired format
* Compiles templates to ES6 template literals for super fast execution
* Support for partials and outer layouts
* Support for external helper functions
* Support for embedded code blocks
* Built-in Express integration
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

## Express Integration

You can use Moe.JS as a view engine in Express:

```Javascript
const moe = require('moe-js');
app.engine('moe', moe.express);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'moe');
```

Now any view file with a `.moe` file extension will be rendered using Moe.JS.

## Template Language

Moe.JS templates are similar to Mustache/Handlebars templates, but there are some important differences.  The
follow shows how to write Moe.JS template.

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

Use of double braces will cause the rendered text to be HTML encoded:

```html
<p>{{"<blah>"}}<p>
```

Would result in:

```html
<p>&lt;blah&gt;</p>
```

Use triple braces to suppress escaping text:

```html
<p>{{{"<br/>"}}}</p>
```

Would result in:

```html
<p><br/></p>
```

### The Special `model` Variable 

Data passed to the template is available as the `model` variable inside the template:

eg: Suppose the template was invoked like so:

```Javascript
    template({ title: "This is the title" });
```

Then the title property would be accessed as follows:

```html
    <h1>{{model.title}}</h1>
```

(Unlike Mustache, `{{title}}` won't work - you must specify `model.``")

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

### Rendering Collections

To loop over a collection of items, use the `{{$each}}` directive and the special variable `item`:

```html
{{#each ["apples", "pears", "bananas"]}}
<p>{{item}}</p>
{{/each}}
```

You can also specify a variable name for the item. This can be handy when working with nested loops.

```html
{{#each u in Users}}
{{#each r in u.roles}}
<p>Name: {{u.name}} Role: {{r}}</p>
{{/each}}
{{/each}}
```

Inside the each statement, a special variable `scope` is also available:

```Javascript
{
    index: 0,             // The index of the currently rendering item
    item: 'Apples',       // The currently rendering item
    items: ['Apples'],    // An array of all items being iterated
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

{{FormatPrice(23.99)}}
```

### Partials

Partials let you embed the contents of another template inside this template:

Invoke the UserDetails template, passing the current model as the model for the template.

```html
{{> "UserDetails" }}
```

Note that unlike Mustache/Handlebars, the name of the partial template must be quoted because it's a JavaScript expression.  This also means you can do things like this which would render different templates for different user roles:

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
