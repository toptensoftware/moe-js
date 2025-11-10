export function isObject(val)
{
	return val != null && typeof val === 'object' && Array.isArray(val) === false
}

export function isIterable(val)
{
	return val != null && typeof val[Symbol.iterator] === 'function';
}

const GeneratorFunction = (function*(){}).constructor

export function isGeneratorFunction(val)
{
	return val instanceof GeneratorFunction
}

