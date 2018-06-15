
class TokenError extends Error
{
	constructor(message, position)
	{
		super(message)
		this.position = position;
	}
}

class Tokenizer
{
    static isLineSpace(ch)
    {
        return ch == ' ' || ch == '\t';
    }

    static isWhiteSpace(ch)
    {
        return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
    }

    static skipLineSpace(s, p)
    {
        while (Tokenizer.isLineSpace(s[p]))
            p++;
        return p;
    }

    static skipLineTail(s, pIn)
    {
        let p = Tokenizer.skipLineSpace(s, pIn);
        if (!s[p] || s[p] == '\r' || s[p] == '\n')
        {
            if (s[p] == '\r')
                p++;
            if (s[p] == '\n')
                p++;
            return p;
        }
        return pIn;
    }

    static skipWhiteSpace(s, p)
    {
        while (Tokenizer.isWhiteSpace(s[p]))
            p++;
        return p;
    }

    static isIdentifierChar(ch)
    {
        return (ch >= 'a' && ch <='z') || (ch >= 'A' && ch<='Z') || (ch >= '0' && ch <='9') || ch == '_' || ch == '$';
    }

    static readIdentifier(s, p)
    {
        let pStart = p;
        while (Tokenizer.isIdentifierChar(s[p]))
            p++;
        return s.substr(pStart, p-pStart);
    }

    static skipString(s, p)
    {
        let chKind = s[p];
        p++;

        while (s[p] != chKind)
        {
            // New lines not allowed
            if (s[p] == '\r' || s[p] == '\n' || !s[p])
                throw new TokenError("Unterminated string literal", p);

            // Skip escaped characters
            if (s[p] == '\\')
                p++;
            p++;
        }

        p++;
        return p;
    }

    static skipTemplateString(s, p)
    {
        p++;

        while (s[p] != '`')
        {
            // EOF?
            if (!s[p])
                throw new TokenError("Unterminated string literal", p);

            // template literal expression?
            if (s[p] == '$' && s[p+1] == '{')
            {
                p+=2;
                p = Tokenizer.skipJavaScript(s, p);
                if (s[p] != '}')
                    throw new TokenError("Syntax error in template literal", p);
                p++;
                continue;
            }

            // Skip escaped characters
            if (s[p] == '\\')
                p++;
            p++;
        }

        p++;
        return p;
    }

    static skipJavaScript(s, p)
    {
        while (s[p])
        {
            p = Tokenizer.skipWhiteSpace(s, p);
            switch (s[p])
            {
                case '}':
                case ')':
                case ']':
                    return p;

                case '{':
                    p++;
                    p = Tokenizer.skipJavaScript(s, p);
                    p = Tokenizer.skipWhiteSpace(s, p);
                    if (s[p] != '}')
                        throw new TokenError("Unmatched closing brace in expression", p);
                    p++;
                    break;

                case '(':
                    p++;
                    p = Tokenizer.skipJavaScript(s, p);
                    p = Tokenizer.skipWhiteSpace(s, p);
                    if (s[p] != ')')
                        throw new TokenError("Unmatched closing parentheses in expression", p);
                    p++;
                    break;

                case '[':
                    p++;
                    p = Tokenizer.skipJavaScript(s, p);
                    p = Tokenizer.skipWhiteSpace(s, p);
                    if (s[p] != ']')
                        throw new TokenError("Unmatched closing square bracket in expression", p);
                    p++;
                    break;

                case '\'':
                case '\"':
                    p = Tokenizer.skipString(s, p);
                    break;
                
                case '`':
                    p = Tokenizer.skipTemplateString(s, p);
                    break;

                default:
                    p++;
            }
        }

        return p;
    }

    // Expand pStart and pEnd to consume surrounding white space
    // but only if that white space extends to the start and end of the line
    static consumeLineSpace(s, pStartIn, pEndIn)
    {
        // Skip preceding line space
        let pStart = pStartIn;
        while (pStart > 0 && Tokenizer.isLineSpace(s[pStart-1]))
            pStart--;

        // Did we reach the start of the line?
        if (pStart == 0 || s[pStart-1] == '\r' || s[pStart-1] == '\n')
        {
            // Yes
            
            // Skip trailing line space
            let pEnd = Tokenizer.skipLineSpace(s, pEndIn);

            // End if line found?
            if (!s[pEnd] || s[pEnd] == '\r' || s[pEnd] == '\n')
            {
                // Yes, skip it
                if (s[pEnd] == '\r')
                    pEnd++;
                if (s[pEnd] == '\n')
                    pEnd++;

                // Return the expanded range
                return [pStart, pEnd];
            }
        }

        // Can't extend
        return [pStartIn, pEndIn];
    }


    static *tokenize(strIn)
    {
        // We can save a lot of boundary checks by null terminating
        let s = strIn;
        let p = 0;

        while (s[p])
        {
            let rem = s.substr(p);

            // Find the next open brace
            let tokenPos = s.indexOf("{{", p);
            let originalTokenPos = tokenPos;

            // No more, return the trail text
            if (tokenPos < 0)
            {
                if (s.length > p)
                {
                    yield {
                        kind: "literal",
                        text: s.substr(p, s.length - p),
                        offset: p,
                    }
                }
                return;
            }

            // Comment?
            if (s.substr(tokenPos+2, 3) == "!--")
            {
                // Find the end delimiter
                let endPos = s.indexOf("--}}", tokenPos);
                if (endPos < 0)
                    throw new TokenError("Unclosed comment", tokenPos);

                // Skip closing delimiter
                endPos += 4;

                // Expand range to consume surrounding line space
                [tokenPos, endPos] = Tokenizer.consumeLineSpace(s, tokenPos, endPos);

                // Yield preceding literal text
                if (tokenPos > p)
                {
                    yield {
                        kind: "literal",
                        text: s.substr(p, tokenPos - p),
                        offset: p,
                    }
                }

                // Move current position
                p = endPos;
                continue;
            }

            // What kind of token are we dealing with
            let mode = 2;					// number of braces, or zero for comment
            let close;						// end of token
            if (s[tokenPos+2] == '{')
            {
                if (s[tokenPos+3] == '{')
                {
                    // Raw text {{{{ }}}}
                    let endPos = s.indexOf("}}}}", tokenPos);
                    if (endPos < 0)
                        throw new TokenError("Unclosed raw block", tokenPos);

                    // Greedy consume extra braces as part of the raw text
                    while (s[endPos + 4] == '}')
                        endPos++;

                    // Yield the preceding text
                    if (tokenPos > p)
                    {
                        yield {
                            kind: "literal",
                            text: s.substr(p, tokenPos - p),
                            offset: p,
                        }
                    }

                    // Yield the raw text
                    if (endPos - (tokenPos + 4) > 0)
                    {
                        yield {
                            kind: "literal",
                            text: s.substr(tokenPos + 4, endPos - (tokenPos + 4)),
                            offset: p,
                        }
                    }

                    // Handled
                    p = endPos + 4;
                    continue;
                }
                else
                {
                    close = "}}}";
                    mode = 3;
                }
            }
            else
            {
                close = "}}";
                mode = 2;
            }

            let directiveKind = "";			// "#" or "/"
            let directive = "";
            let trimBefore = false;
            let trimAfter = false;
            let innerPos = tokenPos + mode;

            // Handle {~...} for trim before
            if (s[innerPos] == '~')
            {
                innerPos++;
                trimBefore = true;
            }

            // Handle directives
            if (mode == 2)
            {
                if (s[innerPos] == '#' || s[innerPos] == '/')
                {
                    // Handle {{#...}} and {{/...}}
                    directiveKind = s[innerPos];
                    innerPos++;
                    directive = Tokenizer.readIdentifier(s, innerPos);
                    innerPos += directive.length;
                }
                else if (s[innerPos] == '^')
                {
                    // Handle {{^}} and {{^if }}
                    directiveKind = "#";
                    innerPos++;
                    if (Tokenizer.readIdentifier(s, innerPos) == 'if')
                    {
                        directive = "elseif";
                        innerPos += 2;
                    }
                    else
                    {
                        directive = "else";
                    }
                }
                else
                {
                    // Handle {{else}} and {{elseif}} (without #'s)
                    let id = Tokenizer.readIdentifier(s, innerPos); 
                    if (id == "else" || id == "elseif")
                    {
                        directiveKind = "#";
                        directive = id;
                        innerPos += id.length;
                    }
                }
            }

            // Skip expression
            let innerEndPos = Tokenizer.skipJavaScript(s, innerPos);

            // Check the end dilimiter matches
            if (s.substr(innerEndPos, mode) != close)
                throw new TokenError(`Misformed directive, expected ${close}`, endPos)

            // Calculate outer end pos
            let endPos = innerEndPos + mode;

            // Strip of trailing ~
            if (s[innerEndPos-1] == '~')
            {
                trimAfter = true;
                innerEndPos--;
            }

            // Trimming before/after line/white space
            if (trimBefore)
            {
                while (tokenPos > p && Tokenizer.isWhiteSpace(s[tokenPos-1]))
                    tokenPos--;
            }
            if (trimAfter)
            {
                while (Tokenizer.isWhiteSpace(s[endPos]))
                    endPos++;
            }
            if (!trimBefore && !trimAfter && mode == 2)
            {
                [tokenPos, endPos] = Tokenizer.consumeLineSpace(s, tokenPos, endPos);
            }

            // Yield preceding text
            if (tokenPos > p)
            {
                yield {
                    kind: "literal",
                    text: s.substr(p, tokenPos - p),
                    offset: p,
                }
            }

            // Yield the token
            if (directiveKind == '#')
            {
                if (directive == "code")
                {
                    // Find the closing token
                    let closeToken = s.indexOf("{{/code}}", endPos);;
                    if (closeToken < 0)
                        throw new TokenError("Unclosed #code block", tokenPos);

                    // Send it
                    yield {
                        kind: "#code",
                        text: s.substr(endPos, closeToken - endPos),
                        offset: originalTokenPos,
                    }

                    // Skip the close token
                    let endPos = Tokenizer.skipLineTail(s, closeToken + 9);
                }
                else
                {
                    yield {
                        kind: "#" + directive,
                        expression: s.substr(innerPos, innerEndPos - innerPos).trim(),
                        offset: originalTokenPos,
                    }
                }
            }
            else if (directiveKind == '/')
            {
                yield {
                    kind: "/" + directive,
                    offset: originalTokenPos,
                }
            }
            else if (mode == 2)
            {
                let expression = s.substr(innerPos, innerEndPos - innerPos).trim();
                if (expression[0] == '>')
                {
                    yield {
                        kind: ">",
                        expression: expression.substr(1).trim(),
                        offset: originalTokenPos,
                    }
                }
                else
                {
                    yield {
                        kind: "{{}}",
                        expression: expression,
                        offset: originalTokenPos,
                    }
                }
            }
            else if (mode == 3)
            {
                yield {
                    kind: "{{{}}}",
                    expression: s.substr(innerPos, innerEndPos - innerPos).trim(),
                    offset: originalTokenPos,
                }
            }
            else
            {
                throw Error("Internal error");
            }

            // Moving on!
            p = endPos;
        }
    }
}

module.exports = {
    TokenError: TokenError,
    Tokenizer: Tokenizer,
}