import path from "node:path";
import fs from "node:fs";

export class MoeExpressHooks
{
    constructor(moe, app, options)
    {
        this.moe = moe;
        this.app = app;
        this.options = options;
    }

    // Called when a model is being passed to a partial.  Decorate
    // the model by adding in the express locals and settings etc...
    decoratePartialModel(model)
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
            Object.assign(temp, this.app.locals);
        }

        // Merge request locals
        if (this.options._locals)
        {
            Object.assign(temp, this.options._locals);
            temp._locals = this.options._locals;
        }

        // Merge the new model
        Object.assign(temp, model);	

        // Done
        return temp;
    }

    resolveViewPath(name, viewFolders)
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
            if (fs.existsSync(file))
            {
                return file;
            }
        }

        throw new Error(`Can't find template "${name}" on path ${viewFolders.join(", ")}`);
    }

    resolvePartialPath(name)
    {
        // Get view folder search path
        let viewFolders = this.options.settings.partialViews ? this.options.settings.partialViews : this.options.settings.views;
        return this.resolveViewPath(name, viewFolders);	
    }


    // Express middleware to render a view
    static ExpressMiddleware(moe, app)
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
}

