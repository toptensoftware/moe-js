import path from "node:path";
import fs from "node:fs";
import moe from "./index.js";
import { fileURLToPath } from 'node:url';
import { clargs, showPackageVersion, showArgs } from "@toptensoftware/clargs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function showVersion()
{
    showPackageVersion(path.join(__dirname, "package.json"));
}

function showHelp()
{
    showVersion();
    console.log("");
    console.log("usage: moe-js [options...] files\n");
    showArgs({
        "files": "one .moe file, and optional .json files",
        "key=value": "direct variable assignments",
        "-o,--output": "Output file (default=stdout)",
        "-h,--help": "Show this help",
        "-v,--version": "Show version information",
    });
}


let moeFile = null;
let outFile = null;
let model = {};
let args = clargs();
while (args.next())
{
    switch (args.name)
    {
        case "v":
        case "version":
            showVersion();
            process.exit(0);
            break;

        case "h": 
        case "help":
            // -h or --help
            showHelp();
            process.exit(0);
            break;

        case "o":
        case "output":
            outFile = args.readValue();
            break;

        case null:
            let parts = args.readValue().split("=");
            if (parts.length ==  2)
            {
                // Variable assignment
                model[parts[0]] = parts[1];
            }
            else
            {
                let ext = path.extname(parts[0]);
                switch (ext)
                {
                    case ".json":
                        // JSON model
                        let json = JSON.parse(fs.readFileSync(parts[0], "utf8"));
                        Object.assign(model, json);
                        break;

                    case ".moe":
                        // Moe file
                        if (moeFile == null)
                            moeFile = parts[0];
                        else
                            throw new Error("Multiple .moe files specified");
                        break;
                }
            }
            break;

        default:
            throw new Error(`unknown arg: ${args.name}`);        
    }
}

if (!moeFile)
    throw new Error("No .moe file specified");

// Compile and execute
let template = moe.compileFileSync(moeFile);
let result = template(model);

// Write output
if (outFile)
    fs.writeFileSync(outFile, result, "utf8");
else
    process.stdout.write(result);