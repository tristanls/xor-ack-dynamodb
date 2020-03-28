/*

index.js

The MIT License (MIT)

Copyright (c) 2020 Tristan Slominski

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/
"use strict";

class BufferLengthsUnequal extends Error
{
    constructor(message)
    {
        super("Buffer lengths are not equal");
        this.code = "BufferLengthsUnequal";
    }
}

class LessThanTwoBuffers extends Error
{
    constructor()
    {
        super("At least two buffers expected");
        this.code = "LessThanTwoBuffers";
    }
}

class StaleLocalData extends Error
{
    constructor()
    {
        super("Stale local data");
        this.code = "StaleLocalData";
    }
}

class TagExists extends Error
{
    constructor(tag)
    {
        super(`"${tag}" already exists`);
        this.code = "TagExists";
        this.tag = tag;
    }
}

class TagNotFound extends Error
{
    constructor(tag)
    {
        super(`"${tag}" does not exist`);
        this.code = "TagNotFound";
        this.tag = tag;
    }
}

class ZeroBufferNoOp extends Error
{
    constructor()
    {
        super("Buffer is all zeros");
        this.code = "ZeroBufferNoOp";
    }
}

module.exports =
{
    BufferLengthsUnequal,
    LessThanTwoBuffers,
    StaleLocalData,
    TagExists,
    TagNotFound,
    ZeroBufferNoOp
};
