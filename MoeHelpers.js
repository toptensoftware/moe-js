import { isObject, isIterable, isGeneratorFunction } from "./utils.js";

export class MoeHelpers
{
    constructor(moe)
    {
        this.moe = moe;
    }

    encode(str) 
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
    each(outerScope, iter, cbItem, cbEmpty)
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
    async eachAsync(outerScope, iter, cbItem, cbEmpty)
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
    with(expr, cbItem, cbElse)
    {
        if (expr)
            cbItem(expr);
        else if (cbElse)
            cbElse();
    }

    // Helper to iterate an iterable or call an alternate if iterable is empty
    async withAsync(expr, cbItem, cbElse)
    {
        if (expr)
            await cbItem(expr);
        else if (cbElse)
            await cbElse();
    }

    // Render a partial (Sync version)
    partialSync(model, context, scope, name, subModel)
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
    async partialAsync(model, context, scope, name, subModel)
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

